/**
 * Expired Session Cleanup
 *
 * Runs every 30 minutes to archive stale agent sessions.
 *
 * Sessions have a heartbeat mechanism — agents call update_session with
 * lastHeartbeat: true every 10-15 minutes during long-running work.
 * If the heartbeat stops, the session is likely crashed or disconnected.
 *
 * After 65 minutes without a heartbeat (4+ missed intervals), we mark the
 * session as archived. This prevents the UI from showing zombie sessions
 * as "active" when the agent has actually stopped.
 *
 * Pinned sessions are exempt — they're intentionally persistent across
 * agent restarts (e.g., paused work waiting for user input).
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const cleanupExpiredSessions = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const db = admin.firestore();

    // Calculate staleness threshold: 65 minutes ago
    const staleThreshold = admin.firestore.Timestamp.fromMillis(
      Date.now() - 65 * 60 * 1000
    );

    // Query all user sessions
    const usersSnapshot = await db.collection('users').get();

    let totalArchived = 0;

    for (const userDoc of usersSnapshot.docs) {
      const sessionsRef = userDoc.ref.collection('sessions');

      // Find sessions with stale heartbeats that aren't pinned
      const staleSnapshot = await sessionsRef
        .where('lastHeartbeat', '<', staleThreshold)
        .where('state', '!=', 'pinned')
        .where('archived', '==', false)
        .get();

      if (staleSnapshot.empty) {
        continue;
      }

      // Archive stale sessions in batch
      const batch = db.batch();

      for (const sessionDoc of staleSnapshot.docs) {
        batch.update(sessionDoc.ref, {
          archived: true,
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          archivedReason: 'stale_heartbeat'
        });
      }

      await batch.commit();
      totalArchived += staleSnapshot.size;

      console.log(`Archived ${staleSnapshot.size} stale sessions for user ${userDoc.id}`);
    }

    console.log(`Total sessions archived: ${totalArchived}`);
    return null;
  });
