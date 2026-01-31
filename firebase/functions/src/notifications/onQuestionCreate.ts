import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Triggered when a new question is created.
 * Sends push notification to all user devices.
 */
export const onQuestionCreate = functions.firestore
  .document("users/{userId}/questions/{questionId}")
  .onCreate(async (snapshot, context) => {
    const { userId, questionId } = context.params;
    const question = snapshot.data();

    try {
      // Get all device tokens for this user
      const devicesSnapshot = await db
        .collection(`users/${userId}/devices`)
        .get();

      if (devicesSnapshot.empty) {
        functions.logger.warn(`No devices registered for user ${userId}`);
        return;
      }

      const tokens: string[] = [];
      devicesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.fcmToken) {
          tokens.push(data.fcmToken);
        }
      });

      if (tokens.length === 0) {
        functions.logger.warn(`No FCM tokens found for user ${userId}`);
        return;
      }

      // Build notification payload
      // Use 'preview' field (unencrypted) if available, otherwise fall back to question
      // Note: question field may be encrypted, so preview is preferred for readability
      const questionText = question.preview || question.question || "New question";
      const notification: admin.messaging.Notification = {
        title: "Claude needs your input",
        body: truncate(questionText, 100),
      };

      // Set priority based on question priority
      const android: admin.messaging.AndroidConfig = {
        priority: question.priority === "high" ? "high" : "normal",
        notification: {
          channelId: "questions",
          priority: question.priority === "high" ? "max" : "default",
        },
      };

      const apns: admin.messaging.ApnsConfig = {
        payload: {
          aps: {
            alert: notification,
            sound: "default",
            badge: 1,
          },
        },
        headers: {
          "apns-priority": question.priority === "high" ? "10" : "5",
        },
      };

      // Data payload for deep linking
      const data = {
        type: "question",
        questionId,
        priority: question.priority || "normal",
      };

      // Send to all devices
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification,
        android,
        apns,
        data,
      });

      functions.logger.info(
        `Sent notifications for question ${questionId}: ${response.successCount} success, ${response.failureCount} failures`
      );

      // Log errors and clean up invalid tokens
      const tokensToRemove: string[] = [];
      response.responses.forEach((result, index) => {
        if (!result.success) {
          const error = result.error;
          functions.logger.error(
            `FCM send failed for token ${tokens[index].substring(0, 20)}...`,
            { code: error?.code, message: error?.message }
          );
          if (
            error?.code === "messaging/invalid-registration-token" ||
            error?.code === "messaging/registration-token-not-registered"
          ) {
            tokensToRemove.push(tokens[index]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        const batch = db.batch();
        devicesSnapshot.forEach((doc) => {
          const data = doc.data();
          if (tokensToRemove.includes(data.fcmToken)) {
            batch.delete(doc.ref);
          }
        });
        await batch.commit();
        functions.logger.info(`Removed ${tokensToRemove.length} invalid tokens`);
      }
    } catch (error) {
      functions.logger.error(
        `Failed to send notifications for question ${questionId}`,
        error
      );
      throw error;
    }
  });

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}
