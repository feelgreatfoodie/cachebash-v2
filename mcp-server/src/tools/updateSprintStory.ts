import { getFirestore } from "../firebase/client.js";
import * as admin from "firebase-admin";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { UpdateSprintStorySchema } from "../validation/validators.js";

/**
 * Update a story's progress within a sprint.
 * Called by subagents or orchestrator to report progress.
 *
 * Also syncs the wave's session state based on story progress.
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
  const storiesCollection = db.collection(
    `users/${auth.userId}/sprints/${args.sprintId}/stories`
  );

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
      const sprintData = sprintDoc.data()!;
      const storyWave = storyData.wave || 1;

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

      return {
        success: true,
        updates: updateData,
        storyWave,
        waveSessionIds: sprintData.waveSessionIds || {},
        projectName: sprintData.projectName,
      };
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

    // Sync wave session (fast path — onStoryUpdate Cloud Function is the safety net)
    const waveSessionId = result.waveSessionIds?.[String(result.storyWave)];
    if (waveSessionId) {
      await syncWaveSession(
        db,
        auth.userId,
        args.sprintId,
        result.storyWave,
        waveSessionId,
        result.projectName,
        storiesCollection
      );
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

/**
 * Sync the wave's session based on current story states.
 */
async function syncWaveSession(
  db: admin.firestore.Firestore,
  userId: string,
  sprintId: string,
  wave: number,
  sessionId: string,
  projectName: string,
  storiesCollection: admin.firestore.CollectionReference
): Promise<void> {
  try {
    // Get all stories in this wave
    const waveStoriesSnapshot = await storiesCollection
      .where("wave", "==", wave)
      .get();

    if (waveStoriesSnapshot.empty) return;

    const stories = waveStoriesSnapshot.docs.map((doc) => doc.data());

    // Calculate wave status
    const activeStories = stories.filter((s) => s.status === "active");
    const completedStories = stories.filter(
      (s) => s.status === "complete" || s.status === "failed" || s.status === "skipped"
    );
    const queuedStories = stories.filter((s) => s.status === "queued");

    // Determine wave session state
    let sessionState: string;
    let sessionStatus: string;

    if (completedStories.length === stories.length) {
      // All stories done
      sessionState = "complete";
      const failedCount = stories.filter((s) => s.status === "failed").length;
      const skippedCount = stories.filter((s) => s.status === "skipped").length;
      if (failedCount > 0) {
        sessionStatus = `Complete (${failedCount} failed)`;
      } else if (skippedCount > 0) {
        sessionStatus = `Complete (${skippedCount} skipped)`;
      } else {
        sessionStatus = "All stories complete";
      }
    } else if (activeStories.length > 0) {
      // Stories in progress
      sessionState = "working";
      const activeIds = activeStories.map((s) => s.id).join(", ");
      const currentAction = activeStories[0]?.currentAction;
      sessionStatus = currentAction
        ? `${activeIds}: ${currentAction}`
        : `Working on ${activeIds}`;
    } else if (queuedStories.length === stories.length) {
      // All queued (wave not started yet)
      sessionState = "pinned";
      sessionStatus = "Queued";
    } else {
      // Mixed state (some done, some queued, none active)
      sessionState = "blocked";
      sessionStatus = `${completedStories.length}/${stories.length} complete`;
    }

    // Calculate progress (average of story progress)
    const totalProgress = stories.reduce((sum, s) => sum + (s.progress || 0), 0);
    const avgProgress = Math.round(totalProgress / stories.length);

    // Update session
    const sessionRef = db.doc(`users/${userId}/sessions/${sessionId}`);
    await sessionRef.update({
      state: sessionState,
      status: sessionStatus.substring(0, 200), // Truncate for safety
      progress: avgProgress,
      lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Non-fatal - log but don't fail the main operation
    console.error("[syncWaveSession] Failed to sync wave session:", error);
  }
}
