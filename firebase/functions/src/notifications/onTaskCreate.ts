/**
 * Task Creation Notification
 *
 * Sends push notifications when new tasks arrive in a user's queue.
 *
 * Task types have different urgency levels:
 * - "question": High priority — requires immediate user input
 * - "task": Normal priority — standard work item
 * - "scheduled": Low priority — background job
 *
 * The notification includes deep link data so the mobile app can navigate
 * directly to the task detail view when the user taps the notification.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const onTaskCreate = functions.firestore
  .document('users/{userId}/tasks/{taskId}')
  .onCreate(async (snapshot, context) => {
    const db = admin.firestore();
    const messaging = admin.messaging();

    const userId = context.params.userId;
    const taskId = context.params.taskId;
    const task = snapshot.data();

    // Check if user has task notifications enabled
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.notifications?.tasks) {
      console.log(`Task notifications disabled for user ${userId}`);
      return;
    }

    // Query all registered devices for this user
    const devicesSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('devices')
      .get();

    if (devicesSnapshot.empty) {
      console.log(`No devices registered for user ${userId}`);
      return;
    }

    // Build notification payload based on task type
    const isQuestion = task.type === 'question';
    const priority = isQuestion ? 'high' : 'normal';

    const notification: admin.messaging.Notification = {
      title: isQuestion ? 'Question Waiting' : 'New Task',
      body: task.title || 'A new task has been assigned'
    };

    // Data payload for deep linking in the mobile app
    const data = {
      type: 'task_created',
      taskId,
      taskType: task.type || 'task',
      target: task.target || 'all',
      priority
    };

    // Send to all registered devices
    const tokens = devicesSnapshot.docs.map(doc => doc.data().token);

    try {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification,
        data,
        android: {
          priority: priority === 'high' ? 'high' : 'normal'
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              sound: priority === 'high' ? 'default' : undefined
            }
          }
        }
      });

      console.log(`Sent task notification to ${response.successCount}/${tokens.length} devices`);

      // Clean up invalid tokens
      const failedTokens = response.responses
        .map((resp, idx) => resp.success ? null : tokens[idx])
        .filter(token => token !== null);

      if (failedTokens.length > 0) {
        console.log(`Removing ${failedTokens.length} invalid device tokens`);
        const batch = db.batch();

        for (const token of failedTokens) {
          const deviceQuery = await db
            .collection('users')
            .doc(userId)
            .collection('devices')
            .where('token', '==', token)
            .limit(1)
            .get();

          deviceQuery.docs.forEach(doc => batch.delete(doc.ref));
        }

        await batch.commit();
      }
    } catch (error) {
      console.error('Error sending task notification:', error);
    }
  });
