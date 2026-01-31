import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Triggered when a new message is created in the unified messages collection.
 * Sends push notification to all user devices for toUser messages (questions).
 */
export const onMessageCreate = functions.firestore
  .document("users/{userId}/messages/{messageId}")
  .onCreate(async (snapshot, context) => {
    const { userId, messageId } = context.params;
    const message = snapshot.data();

    // Only send notifications for toUser messages (questions from Claude)
    if (message.direction !== "to_user") {
      functions.logger.info(
        `Skipping notification for ${message.direction} message ${messageId}`
      );
      return;
    }

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

      // Get message content for notification body
      // Use 'preview' field (unencrypted) if available, otherwise fall back to content/question
      // Note: content may be encrypted, so preview is preferred for readability
      const messageContent = message.preview || message.content || message.question || "New message";

      // Build notification payload
      const notification: admin.messaging.Notification = {
        title: "Claude needs your input",
        body: truncate(messageContent, 100),
      };

      // Set priority based on message priority
      const android: admin.messaging.AndroidConfig = {
        priority: message.priority === "high" ? "high" : "normal",
        notification: {
          channelId: "questions",
          priority: message.priority === "high" ? "max" : "default",
        },
      };

      // Query actual pending message count for badge
      const pendingCountResult = await db
        .collection(`users/${userId}/messages`)
        .where("direction", "==", "to_user")
        .where("status", "==", "pending")
        .count()
        .get();
      const badgeCount = pendingCountResult.data().count;

      const apns: admin.messaging.ApnsConfig = {
        payload: {
          aps: {
            alert: notification,
            sound: "default",
            badge: badgeCount,
          },
        },
        headers: {
          "apns-priority": message.priority === "high" ? "10" : "5",
        },
      };

      // Data payload for deep linking
      const data = {
        type: "message",
        messageId,
        direction: message.direction,
        priority: message.priority || "normal",
        // Keep questionId for backward compatibility
        questionId: messageId,
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
        `Sent notifications for message ${messageId}: ${response.successCount} success, ${response.failureCount} failures`
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
        `Failed to send notifications for message ${messageId}`,
        error
      );
      throw error;
    }
  });

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}
