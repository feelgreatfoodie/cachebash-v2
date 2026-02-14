import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Triggered when a sprint story is updated.
 * Automatically syncs the wave's session state based on story progress.
 *
 * This ensures wave sessions stay in sync even when subagents
 * don't call update_sprint_story MCP tool directly.
 *
 * Data flow: story update → this trigger → wave session update
 *   → onSessionUpdate trigger → FCM push notification
 */
export const onStoryUpdate = functions.firestore
  .document("users/{userId}/sprints/{sprintId}/stories/{storyId}")
  .onUpdate(async (change, context) => {
    const { userId, sprintId, storyId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    // Skip if no meaningful change
    if (
      before.status === after.status &&
      before.progress === after.progress &&
      before.currentAction === after.currentAction
    ) {
      functions.logger.debug(
        `No meaningful change for story ${storyId} in sprint ${sprintId}`
      );
      return;
    }

    try {
      // Get sprint to find wave session ID
      const sprintDoc = await db
        .doc(`users/${userId}/sprints/${sprintId}`)
        .get();

      if (!sprintDoc.exists) {
        functions.logger.warn(
          `Sprint ${sprintId} not found for story update`
        );
        return;
      }

      const sprintData = sprintDoc.data()!;
      const waveSessionIds: Record<string, string> =
        sprintData.waveSessionIds || {};
      const storyWave: number = after.wave || 1;
      const waveSessionId = waveSessionIds[String(storyWave)];

      if (!waveSessionId) {
        functions.logger.warn(
          `No wave session for wave ${storyWave} in sprint ${sprintId}`
        );
        return;
      }

      // Get all stories in this wave
      const waveStoriesSnapshot = await db
        .collection(`users/${userId}/sprints/${sprintId}/stories`)
        .where("wave", "==", storyWave)
        .get();

      if (waveStoriesSnapshot.empty) return;

      const stories = waveStoriesSnapshot.docs.map((doc) => doc.data());

      // Calculate wave status — mirrors syncWaveSession() in
      // mcp-server/src/tools/updateSprintStory.ts:156-232
      const activeStories = stories.filter((s) => s.status === "active");
      const completedStories = stories.filter(
        (s) =>
          s.status === "complete" ||
          s.status === "failed" ||
          s.status === "skipped"
      );
      const queuedStories = stories.filter((s) => s.status === "queued");

      let sessionState: string;
      let sessionStatus: string;

      if (completedStories.length === stories.length) {
        sessionState = "complete";
        const failedCount = stories.filter(
          (s) => s.status === "failed"
        ).length;
        const skippedCount = stories.filter(
          (s) => s.status === "skipped"
        ).length;
        if (failedCount > 0) {
          sessionStatus = `Complete (${failedCount} failed)`;
        } else if (skippedCount > 0) {
          sessionStatus = `Complete (${skippedCount} skipped)`;
        } else {
          sessionStatus = "All stories complete";
        }
      } else if (activeStories.length > 0) {
        sessionState = "working";
        const activeIds = activeStories.map((s) => s.id).join(", ");
        const currentAction = activeStories[0]?.currentAction;
        sessionStatus = currentAction
          ? `${activeIds}: ${currentAction}`
          : `Working on ${activeIds}`;
      } else if (queuedStories.length === stories.length) {
        sessionState = "pinned";
        sessionStatus = "Queued";
      } else {
        sessionState = "blocked";
        sessionStatus = `${completedStories.length}/${stories.length} complete`;
      }

      // Calculate progress (average of story progress)
      const totalProgress = stories.reduce(
        (sum, s) => sum + (s.progress || 0),
        0
      );
      const avgProgress = Math.round(totalProgress / stories.length);

      // Update wave session
      await db.doc(`users/${userId}/sessions/${waveSessionId}`).update({
        state: sessionState,
        status: sessionStatus.substring(0, 200),
        progress: avgProgress,
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(
        `Synced wave ${storyWave} session for sprint ${sprintId}: ` +
          `${sessionState} - ${sessionStatus} (${avgProgress}%)`
      );
    } catch (error) {
      // Non-fatal — log but don't throw to avoid retries
      functions.logger.error(
        `Failed to sync wave session for story ${storyId} in sprint ${sprintId}`,
        error
      );
    }
  });
