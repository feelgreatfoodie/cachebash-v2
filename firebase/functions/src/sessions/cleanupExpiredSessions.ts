/**
 * Cloud Function to cleanup expired MCP sessions
 *
 * Runs every 5 minutes via Cloud Scheduler
 * Deletes sessions where lastActivity < now - 60 minutes
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// 65 minutes - 5 minute grace period to avoid race with heartbeat
const SESSION_TIMEOUT = 65 * 60 * 1000;

/**
 * Scheduled function to cleanup expired sessions across all users
 */
export const cleanupExpiredSessions = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = Date.now();
    const expiryThreshold = now - SESSION_TIMEOUT;

    console.log(
      `[cleanupExpiredSessions] Starting cleanup for sessions older than ${new Date(
        expiryThreshold
      ).toISOString()}`
    );

    try {
      // Get all users
      const usersSnapshot = await db.collection("users").listDocuments();

      let totalDeleted = 0;

      // Process each user's sessions
      for (const userRef of usersSnapshot) {
        const sessionsRef = userRef.collection("mcp_sessions");

        // Find expired sessions
        const expiredSnapshot = await sessionsRef
          .where("lastActivity", "<", expiryThreshold)
          .get();

        if (expiredSnapshot.empty) {
          continue;
        }

        // Delete in batch
        const batch = db.batch();
        expiredSnapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });

        await batch.commit();

        totalDeleted += expiredSnapshot.size;
        console.log(
          `[cleanupExpiredSessions] Deleted ${expiredSnapshot.size} expired sessions for user ${userRef.id}`
        );
      }

      console.log(
        `[cleanupExpiredSessions] Cleanup complete. Total deleted: ${totalDeleted}`
      );

      return { deleted: totalDeleted };
    } catch (error) {
      console.error(
        "[cleanupExpiredSessions] Error during cleanup:",
        error
      );
      throw error;
    }
  });
