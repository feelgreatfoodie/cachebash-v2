import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
const messaging = admin.messaging();

// Rate limit: track session updates per user
const rateLimitWindow = 60 * 60 * 1000; // 1 hour
const maxUpdatesPerWindow = 20; // Max 20 session update notifications per hour

/**
 * Triggered when a session is updated.
 * Sends push notification to user devices for meaningful state changes.
 */
export const onSessionUpdate = functions.firestore
  .document("users/{userId}/sessions/{sessionId}")
  .onUpdate(async (change, context) => {
    const { userId, sessionId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    // Skip if no meaningful change (state and status unchanged)
    if (before.state === after.state && before.status === after.status) {
      functions.logger.debug(`No meaningful change for session ${sessionId}`);
      return;
    }

    // Skip archived sessions
    if (after.archived) {
      return;
    }

    try {
      // Check user notification preferences
      const userDoc = await db.doc(`users/${userId}`).get();
      const userData = userDoc.data();
      const prefs = userData?.notificationPreferences;

      // If sessionUpdates is explicitly disabled, skip
      if (prefs?.sessionUpdates === false) {
        functions.logger.info(
          `Session update notifications disabled for user ${userId}`
        );
        return;
      }

      // Rate limit check
      const now = Date.now();
      const rateLimitRef = db.doc(`users/${userId}/rateLimits/sessionUpdates`);
      const rateLimitDoc = await rateLimitRef.get();
      const rateLimitData = rateLimitDoc.data();

      if (rateLimitData) {
        const windowStart = rateLimitData.windowStart?.toMillis() || 0;
        const count = rateLimitData.count || 0;

        if (now - windowStart < rateLimitWindow && count >= maxUpdatesPerWindow) {
          functions.logger.warn(
            `Rate limit exceeded for session updates: user ${userId}`
          );
          return;
        }

        // Update rate limit
        if (now - windowStart >= rateLimitWindow) {
          // Reset window
          await rateLimitRef.set({
            windowStart: admin.firestore.Timestamp.now(),
            count: 1,
          });
        } else {
          // Increment count
          await rateLimitRef.update({
            count: admin.firestore.FieldValue.increment(1),
          });
        }
      } else {
        // Initialize rate limit
        await rateLimitRef.set({
          windowStart: admin.firestore.Timestamp.now(),
          count: 1,
        });
      }

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

      // Build notification based on state change
      const sessionName = after.name || "Session";
      // Sanitize and truncate status text (max 50 chars)
      const statusText = sanitize(after.status || "Status updated", 50);

      let title: string;
      let body: string;

      switch (after.state) {
        case "complete":
          title = `${sessionName} Complete`;
          body = statusText;
          break;
        case "blocked":
          title = `${sessionName} Blocked`;
          body = statusText;
          break;
        case "pinned":
          title = `${sessionName} Paused`;
          body = "Waiting for your response";
          break;
        default:
          title = sessionName;
          body = statusText;
      }

      const notification: admin.messaging.Notification = { title, body };

      // Normal priority for session updates (not as urgent as questions)
      const android: admin.messaging.AndroidConfig = {
        priority: "normal",
        notification: {
          channelId: "sessions",
          priority: "default",
        },
      };

      const apns: admin.messaging.ApnsConfig = {
        payload: {
          aps: {
            alert: notification,
            sound: "default",
          },
        },
        headers: {
          "apns-priority": "5", // Normal priority
        },
      };

      // Data payload for deep linking
      const data = {
        type: "session_update",
        sessionId,
        state: after.state || "working",
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
        `Sent session update notifications for ${sessionId}: ${response.successCount} success, ${response.failureCount} failures`
      );

      // Clean up invalid tokens
      const tokensToRemove: string[] = [];
      response.responses.forEach((result, index) => {
        if (!result.success) {
          const error = result.error;
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
        `Failed to send session update notification for ${sessionId}`,
        error
      );
      throw error;
    }
  });

/**
 * Sanitize and truncate text for safe display in notifications
 */
function sanitize(text: string, maxLength: number): string {
  // Remove any potentially dangerous characters
  const sanitized = text
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/[\r\n]+/g, " ") // Replace newlines with spaces
    .trim();

  if (sanitized.length <= maxLength) return sanitized;
  return sanitized.substring(0, maxLength - 3) + "...";
}
