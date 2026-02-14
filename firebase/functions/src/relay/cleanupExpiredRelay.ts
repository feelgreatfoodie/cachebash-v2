/**
 * Cloud Function to cleanup expired relay messages (24h TTL)
 *
 * Runs every hour via Cloud Scheduler.
 * Deletes relay messages older than 24 hours.
 * Uses collection group query for scalability.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// 24 hours TTL
const RELAY_TTL_MS = 24 * 60 * 60 * 1000;

export const cleanupExpiredRelay = functions.pubsub
  .schedule("every 1 hours")
  .onRun(async () => {
    const db = admin.firestore();
    const cutoff = Date.now() - RELAY_TTL_MS;

    console.log(
      `[cleanupExpiredRelay] Deleting relay messages older than ${new Date(cutoff).toISOString()}`
    );

    try {
      const expiredSnapshot = await db
        .collectionGroup("relay")
        .where("createdAt", "<", new Date(cutoff))
        .limit(500)
        .get();

      if (expiredSnapshot.empty) {
        console.log("[cleanupExpiredRelay] No expired relay messages found");
        return { deleted: 0 };
      }

      const batch = db.batch();
      for (const doc of expiredSnapshot.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();

      console.log(`[cleanupExpiredRelay] Deleted ${expiredSnapshot.size} expired relay messages`);
      return { deleted: expiredSnapshot.size };
    } catch (error) {
      console.error("[cleanupExpiredRelay] Error during cleanup:", error);
      throw error;
    }
  });
