import { getFirestore } from "../firebase/client.js";
import * as admin from "firebase-admin";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { UpdateSprintStorySchema } from "../validation/validators.js";

/**
 * Update a story's progress within a sprint.
 * Called by subagents or orchestrator to report progress.
 */
export async function updateSprintStory(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = UpdateSprintStorySchema.parse(rawArgs);
  const db = getFirestore();

  const storyRef = db.doc(
    `users/${auth.userId}/sprints/${args.sprintId}/stories/${args.storyId}`
  );
  const sprintRef = db.doc(`users/${auth.userId}/sprints/${args.sprintId}`);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const storyDoc = await transaction.get(storyRef);
      const sprintDoc = await transaction.get(sprintRef);

      if (!sprintDoc.exists) {
        return { error: "Sprint not found" };
      }

      if (!storyDoc.exists) {
        return { error: "Story not found" };
      }

      const storyData = storyDoc.data()!;
      const updateData: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Apply updates
      if (args.status !== undefined) {
        updateData.status = args.status;

        // Track timing
        if (args.status === "active" && storyData.status !== "active") {
          updateData.startedAt = admin.firestore.FieldValue.serverTimestamp();
        } else if (
          (args.status === "complete" || args.status === "failed" || args.status === "skipped") &&
          storyData.status === "active"
        ) {
          updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
          // Calculate duration if we have startedAt
          if (storyData.startedAt) {
            const startTime = storyData.startedAt.toDate?.()?.getTime() || Date.now();
            updateData.duration = Math.round((Date.now() - startTime) / 1000);
          }
        }
      }

      if (args.progress !== undefined) {
        updateData.progress = args.progress;
      }

      if (args.currentAction !== undefined) {
        updateData.currentAction = args.currentAction;
      }

      if (args.model !== undefined) {
        updateData.model = args.model;
      }

      transaction.update(storyRef, updateData);

      // Also update sprint's updatedAt
      transaction.update(sprintRef, {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, updates: updateData };
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
            storyId: args.storyId,
            message: `Story ${args.storyId} updated`,
          }),
        },
      ],
    };
  } catch (error) {
    console.error("[updateSprintStory] Failed:", error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Failed to update story: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    };
  }
}
