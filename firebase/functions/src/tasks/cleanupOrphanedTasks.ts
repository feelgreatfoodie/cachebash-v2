/**
 * Cloud Function to cleanup orphaned tasks (in_progress without heartbeat)
 *
 * Runs every 5 minutes via Cloud Scheduler
 * Uses collection group query for scalability (single query across ALL users)
 * Reverts tasks where lastHeartbeat < now - 30 minutes back to pending
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// 30 minutes without heartbeat = orphaned
const ORPHAN_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Scheduled function to cleanup orphaned tasks across all users
 * Uses collection group query - O(orphaned) not O(users)
 */
export const cleanupOrphanedTasks = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const staleThreshold = now - ORPHAN_THRESHOLD_MS;

    console.log(
      `[cleanupOrphanedTasks] Looking for in_progress tasks with lastHeartbeat < ${new Date(
        staleThreshold
      ).toISOString()}`
    );

    try {
      // SCALABLE: Single collection group query across ALL users' messages
      // This scales to 10,000+ users without iterating through each user
      const orphanedSnapshot = await db
        .collectionGroup("messages")
        .where("direction", "==", "to_claude")
        .where("status", "==", "in_progress")
        .where("lastHeartbeat", "<", staleThreshold)
        .limit(500) // Process in batches to stay under function limits
        .get();

      if (orphanedSnapshot.empty) {
        console.log("[cleanupOrphanedTasks] No orphaned tasks found");
        return { reverted: 0 };
      }

      // Reset orphaned tasks to pending
      const batch = db.batch();
      const revertedTasks: string[] = [];

      for (const doc of orphanedSnapshot.docs) {
        batch.update(doc.ref, {
          status: "pending",
          sessionId: null,
          startedAt: null,
          lastHeartbeat: null,
          revertedAt: admin.firestore.FieldValue.serverTimestamp(),
          revertReason: "heartbeat_timeout",
        });
        revertedTasks.push(doc.id);
      }

      await batch.commit();

      console.log(
        `[cleanupOrphanedTasks] Reverted ${revertedTasks.length} orphaned tasks:`,
        revertedTasks
      );

      return { reverted: revertedTasks.length };
    } catch (error) {
      console.error("[cleanupOrphanedTasks] Error during cleanup:", error);
      throw error;
    }
  });

/**
 * Also check legacy /tasks collection for orphans
 */
export const cleanupOrphanedLegacyTasks = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const staleThreshold = now - ORPHAN_THRESHOLD_MS;

    console.log("[cleanupOrphanedLegacyTasks] Checking legacy tasks collection");

    try {
      // Query legacy tasks collection group
      const orphanedSnapshot = await db
        .collectionGroup("tasks")
        .where("status", "==", "in_progress")
        .where("lastHeartbeat", "<", staleThreshold)
        .limit(500)
        .get();

      if (orphanedSnapshot.empty) {
        console.log("[cleanupOrphanedLegacyTasks] No orphaned legacy tasks found");
        return { reverted: 0 };
      }

      const batch = db.batch();
      let count = 0;

      for (const doc of orphanedSnapshot.docs) {
        batch.update(doc.ref, {
          status: "pending",
          sessionId: null,
          startedAt: null,
          lastHeartbeat: null,
          revertedAt: admin.firestore.FieldValue.serverTimestamp(),
          revertReason: "heartbeat_timeout",
        });
        count++;
      }

      await batch.commit();

      console.log(`[cleanupOrphanedLegacyTasks] Reverted ${count} orphaned legacy tasks`);

      return { reverted: count };
    } catch (error) {
      console.error("[cleanupOrphanedLegacyTasks] Error during cleanup:", error);
      throw error;
    }
  });
