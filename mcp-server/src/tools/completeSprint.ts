import { getFirestore } from "../firebase/client.js";
import * as admin from "firebase-admin";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { CompleteSprintSchema } from "../validation/validators.js";

/**
 * Mark a sprint as complete.
 * Called by orchestrator when all stories are done or sprint is stopped.
 */
export async function completeSprint(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = CompleteSprintSchema.parse(rawArgs);
  const db = getFirestore();

  const sprintRef = db.doc(`users/${auth.userId}/sprints/${args.sprintId}`);
  const storiesPath = `users/${auth.userId}/sprints/${args.sprintId}/stories`;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const sprintDoc = await transaction.get(sprintRef);

      if (!sprintDoc.exists) {
        return { error: "Sprint not found" };
      }

      const sprintData = sprintDoc.data()!;

      // Get all stories to calculate summary if not provided
      const storiesSnapshot = await transaction.get(db.collection(storiesPath));

      let summary = args.summary;
      if (!summary) {
        let completed = 0;
        let failed = 0;
        let skipped = 0;

        storiesSnapshot.docs.forEach((doc) => {
          const status = doc.data().status;
          if (status === "complete") completed++;
          else if (status === "failed") failed++;
          else if (status === "skipped") skipped++;
        });

        const startedAt = sprintData.startedAt?.toDate?.()?.getTime() || Date.now();
        const duration = Math.round((Date.now() - startedAt) / 1000);

        summary = { completed, failed, skipped, duration };
      }

      // Update sprint status
      transaction.update(sprintRef, {
        status: "complete",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        summary,
      });

      return { summary, storyCount: storiesSnapshot.size };
    });

    if ("error" in result) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: result.error,
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            sprintId: args.sprintId,
            summary: result.summary,
            totalStories: result.storyCount,
            message: `Sprint completed: ${result.summary.completed} done, ${result.summary.failed} failed, ${result.summary.skipped} skipped`,
          }),
        },
      ],
    };
  } catch (error) {
    console.error("[completeSprint] Failed:", error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Failed to complete sprint: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    };
  }
}
