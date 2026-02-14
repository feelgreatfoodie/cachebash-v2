import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Triggered when a dream session is updated.
 * Sends push notification on terminal status transitions:
 * → completed, failed, killed
 */
export const onDreamSessionUpdate = functions.firestore
  .document("users/{userId}/dream_sessions/{dreamId}")
  .onUpdate(async (change, context) => {
    const { userId, dreamId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    // Only fire on terminal status transitions
    if (before.status === after.status) {
      return;
    }

    const terminalStatuses = ["completed", "failed", "killed"];
    if (!terminalStatuses.includes(after.status)) {
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

      const agent = after.agent || "Agent";

      let title: string;
      let body: string;

      switch (after.status) {
        case "completed": {
          title = "Dream Complete";
          const preview = after.morning_report
            ? after.morning_report.substring(0, 100).replace(/[\r\n]+/g, " ")
            : "Check the morning report for details.";
          body = `${agent}: ${preview}`;
          break;
        }
        case "failed":
          title = "Dream Failed";
          body = `${agent} encountered an error. ${after.outcome || "Check logs for details."}`;
          break;
        case "killed":
          title = "Dream Stopped";
          body = `${agent} was stopped by user.`;
          break;
        default:
          return;
      }

      const notification: admin.messaging.Notification = { title, body };

      const android: admin.messaging.AndroidConfig = {
        priority: "high",
        notification: {
          channelId: "dreams",
          priority: "high",
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
          "apns-priority": "10",
        },
      };

      const data = {
        type: "dream_update",
        dreamId,
        status: after.status,
        agent: after.agent || "",
      };

      const response = await messaging.sendEachForMulticast({
        tokens,
        notification,
        android,
        apns,
        data,
      });

      functions.logger.info(
        `Dream ${dreamId} → ${after.status}: ${response.successCount} sent, ${response.failureCount} failed`
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
        `Failed to send dream notification for ${dreamId}`,
        error
      );
      throw error;
    }
  });
