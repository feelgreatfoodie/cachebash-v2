import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
const messaging = admin.messaging();

// Rate limiting: max notifications per user per hour
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// In-memory rate limit tracking (resets on function cold start)
const notificationCounts = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if a user has exceeded their notification rate limit.
 * Returns true if rate limited (should not send).
 */
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const record = notificationCounts.get(userId);

  if (!record || now >= record.resetAt) {
    notificationCounts.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return true;
  }

  record.count++;
  return false;
}

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

    // Check rate limit
    if (isRateLimited(userId)) {
      functions.logger.warn(
        `Rate limit exceeded for user, skipping notification for message ${messageId}`
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

      // Error codes that indicate the token should be removed
      const invalidTokenErrors = [
        "messaging/invalid-registration-token",
        "messaging/registration-token-not-registered",
        "messaging/invalid-argument",
        "messaging/mismatched-credential",
      ];

      // Log errors and clean up invalid tokens
      const tokensToRemove: string[] = [];
      response.responses.forEach((result, index) => {
        if (!result.success) {
          const error = result.error;
          // Don't log token content - security best practice
          functions.logger.error(
            `FCM send failed for token [REDACTED]`,
            { code: error?.code, errorType: error?.message?.split(":")[0] }
          );
          if (error?.code && invalidTokenErrors.includes(error.code)) {
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
