import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Migrate session interrupts to messages collection
 *
 * This migration converts old interrupt documents stored in
 * /users/{userId}/sessions/{sessionId}/interrupts/{interruptId}
 * to the new unified messages collection at
 * /users/{userId}/messages/{messageId}
 *
 * Usage: Call this function once per user via HTTP callable
 */
export const migrateInterruptsToMessages = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '1GB',
  })
  .https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to run migration'
      );
    }

    const db = admin.firestore();
    const userId = context.auth.uid;

    console.log(`[Migration] Starting interrupt migration for user ${userId}`);

    try {
      // Get all sessions for this user
      const sessionsSnapshot = await db
        .collection(`users/${userId}/sessions`)
        .get();

      let migratedCount = 0;
      let errorCount = 0;

      // Process each session
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionId = sessionDoc.id;

        try {
          // Get all interrupts for this session
          const interruptsSnapshot = await db
            .collection(`users/${userId}/sessions/${sessionId}/interrupts`)
            .get();

          if (interruptsSnapshot.empty) {
            continue;
          }

          console.log(
            `[Migration] Found ${interruptsSnapshot.size} interrupts for session ${sessionId}`
          );

          // Create a message for each interrupt
          for (const interruptDoc of interruptsSnapshot.docs) {
            const interrupt = interruptDoc.data();

            try {
              // Create new message document
              await db.collection(`users/${userId}/messages`).add({
                direction: 'to_claude',
                content: interrupt.message || '',
                title: 'Session reply',
                sessionId: sessionId,
                priority: 'high',
                status: interrupt.status === 'read' ? 'in_progress' : 'pending',
                action: 'interrupt',
                createdAt: interrupt.createdAt || admin.firestore.FieldValue.serverTimestamp(),
                archived: false,
                deletedAt: null,
                encrypted: false,
              });

              migratedCount++;
            } catch (error) {
              console.error(
                `[Migration] Error migrating interrupt ${interruptDoc.id}:`,
                error
              );
              errorCount++;
            }
          }

          // Optional: Delete old interrupt documents after successful migration
          // Uncomment if you want to clean up old data
          /*
          const batch = db.batch();
          interruptsSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          */
        } catch (error) {
          console.error(
            `[Migration] Error processing session ${sessionId}:`,
            error
          );
          errorCount++;
        }
      }

      console.log(
        `[Migration] Completed for user ${userId}: ${migratedCount} migrated, ${errorCount} errors`
      );

      return {
        success: true,
        migratedCount,
        errorCount,
        userId,
      };
    } catch (error) {
      console.error(`[Migration] Fatal error for user ${userId}:`, error);
      throw new functions.https.HttpsError(
        'internal',
        'Migration failed',
        error
      );
    }
  });
