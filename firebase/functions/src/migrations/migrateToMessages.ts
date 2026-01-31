import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

interface MigrationResult {
  userId: string;
  questionsMigrated: number;
  tasksMigrated: number;
  errors: string[];
}

/**
 * Migrate a user's questions and tasks to the unified messages collection.
 * This is a one-time migration function that can be called per user.
 */
export const migrateUserToMessages = onCall<{ userId?: string }>(
  async (request) => {
    // Require authenticated user
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    // Allow migrating own data, or specify userId if admin
    const userId = request.data.userId || request.auth.uid;

    // For now, only allow users to migrate their own data
    if (userId !== request.auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "Can only migrate your own data"
      );
    }

    const result: MigrationResult = {
      userId,
      questionsMigrated: 0,
      tasksMigrated: 0,
      errors: [],
    };

    try {
      // Migrate questions
      const questionsSnapshot = await db
        .collection(`users/${userId}/questions`)
        .get();

      for (const doc of questionsSnapshot.docs) {
        try {
          const data = doc.data();

          // Check if already migrated (message with same ID exists)
          const existingMessage = await db
            .doc(`users/${userId}/messages/${doc.id}`)
            .get();

          if (existingMessage.exists) {
            continue; // Skip already migrated
          }

          // Transform to message format
          const messageData: Record<string, unknown> = {
            direction: "to_user",
            content: data.question || "",
            context: data.context || null,
            options: data.options || null,
            response: data.response || null,
            answeredAt: data.answeredAt || null,
            priority: data.priority || "normal",
            status: data.status || "pending",
            createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            projectId: data.projectId || null,
            archived: data.archived || false,
            deletedAt: data.deletedAt || null,
            encrypted: data.encrypted || false,
            responseEncrypted: data.responseEncrypted || false,
            // Legacy reference
            _migratedFrom: "questions",
            _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          await db.doc(`users/${userId}/messages/${doc.id}`).set(messageData);
          result.questionsMigrated++;
        } catch (error) {
          result.errors.push(
            `Question ${doc.id}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }

      // Migrate tasks
      const tasksSnapshot = await db.collection(`users/${userId}/tasks`).get();

      for (const doc of tasksSnapshot.docs) {
        try {
          const data = doc.data();

          // Check if already migrated
          const existingMessage = await db
            .doc(`users/${userId}/messages/${doc.id}`)
            .get();

          if (existingMessage.exists) {
            continue; // Skip already migrated
          }

          // Transform to message format
          const messageData: Record<string, unknown> = {
            direction: "to_claude",
            title: data.title || null,
            content: data.instructions || "",
            action: data.action || "queue",
            startedAt: data.startedAt || null,
            completedAt: data.completedAt || null,
            sessionId: data.sessionId || null,
            priority: data.priority || "normal",
            status: data.status || "pending",
            createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            projectId: data.projectId || null,
            archived: false,
            deletedAt: null,
            encrypted: data.encrypted || false,
            // Legacy reference
            _migratedFrom: "tasks",
            _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          await db.doc(`users/${userId}/messages/${doc.id}`).set(messageData);
          result.tasksMigrated++;
        } catch (error) {
          result.errors.push(
            `Task ${doc.id}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }

      return {
        success: true,
        ...result,
        message: `Migrated ${result.questionsMigrated} questions and ${result.tasksMigrated} tasks`,
      };
    } catch (error) {
      throw new HttpsError(
        "internal",
        `Migration failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
);

/**
 * Batch migrate all users (admin only - for background processing).
 * This is a scheduled or manually triggered function.
 */
export const migrateAllUsersToMessages = onCall(async (request) => {
  // This would require admin privileges
  // For now, return info about how to use the per-user migration
  return {
    success: false,
    message:
      "Batch migration not implemented. Use migrateUserToMessages for per-user migration.",
  };
});
