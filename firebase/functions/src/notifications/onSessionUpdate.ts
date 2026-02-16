/**
 * Session Update Notification
 *
 * Sends push notifications when agent session state changes.
 *
 * Sessions track active agent execution contexts. Each session has:
 * - state: "working" | "blocked" | "done" | "pinned"
 * - lastHeartbeat: Timestamp of last activity (updated every ~15 min)
 * - status: Human-readable description of current work
 *
 * We notify users when sessions become "blocked" (needs intervention) or "done"
 * (work complete). We skip notifications for heartbeat-only updates to avoid spam.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const onSessionUpdate = functions.firestore
  .document('users/{userId}/sessions/{sessionId}')
  .onUpdate(async (change, context) => {
    const db = admin.firestore();
    const messaging = admin.messaging();

    const userId = context.params.userId;
    const sessionId = context.params.sessionId;

    const before = change.before.data();
    const after = change.after.data();

    // Skip if state didn't change (heartbeat-only update)
    if (before.state === after.state) {
      return;
    }

    // Only notify on blocked or done states
    const notifyStates = ['blocked', 'done'];
    if (!notifyStates.includes(after.state)) {
      return;
    }

    // Check if user has session notifications enabled
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.notifications?.sessions) {
      console.log(`Session notifications disabled for user ${userId}`);
      return;
    }

    // Query all registered devices
    const devicesSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('devices')
      .get();

    if (devicesSnapshot.empty) {
      console.log(`No devices registered for user ${userId}`);
      return;
    }

    // Build notification payload
    const stateLabels: Record<string, string> = {
      blocked: 'Blocked',
      done: 'Complete'
    };

    const notification: admin.messaging.Notification = {
      title: `Session ${stateLabels[after.state]}`,
      body: `${after.name || 'Agent session'}: ${after.status || after.state}`
    };

    // Data payload for deep linking
    const data = {
      type: 'session_updated',
      sessionId,
      state: after.state,
      agentId: after.agentId || ''
    };

    const tokens = devicesSnapshot.docs.map(doc => doc.data().token);

    try {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification,
        data,
        android: {
          priority: after.state === 'blocked' ? 'high' : 'normal'
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              sound: after.state === 'blocked' ? 'default' : undefined
            }
          }
        }
      });

      console.log(`Sent session notification to ${response.successCount}/${tokens.length} devices`);
    } catch (error) {
      console.error('Error sending session notification:', error);
    }
  });
