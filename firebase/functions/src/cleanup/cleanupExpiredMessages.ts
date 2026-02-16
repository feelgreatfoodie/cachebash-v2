/**
 * Expired Message Cleanup
 *
 * Runs every hour to delete expired relay messages.
 *
 * Messages in the relay queue have a TTL (time-to-live) to prevent
 * unbounded growth. Old messages that were never processed or acknowledged
 * eventually expire and are deleted.
 *
 * Each message has an expiresAt timestamp (typically 24 hours from creation).
 * This job queries messages past their expiration and batch-deletes them.
 *
 * Batch operations are limited to 500 writes per batch for Firestore efficiency.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const cleanupExpiredMessages = functions.pubsub
  .schedule('every 60 minutes')
  .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    // Query all user relay queues
    const usersSnapshot = await db.collection('users').get();

    let totalDeleted = 0;

    for (const userDoc of usersSnapshot.docs) {
      const relayRef = userDoc.ref.collection('relay');

      // Find expired messages
      const expiredSnapshot = await relayRef
        .where('expiresAt', '<', now)
        .limit(500)  // Batch limit
        .get();

      if (expiredSnapshot.empty) {
        continue;
      }

      // Delete in batch
      const batch = db.batch();

      for (const messageDoc of expiredSnapshot.docs) {
        batch.delete(messageDoc.ref);
      }

      await batch.commit();
      totalDeleted += expiredSnapshot.size;

      console.log(`Deleted ${expiredSnapshot.size} expired messages for user ${userDoc.id}`);
    }

    console.log(`Total messages deleted: ${totalDeleted}`);
    return null;
  });
