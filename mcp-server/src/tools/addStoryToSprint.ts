import { getFirestore } from "../firebase/client.js";
import * as admin from "firebase-admin";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { AddStoryToSprintSchema } from "../validation/validators.js";

/**
 * Add a new story to a running sprint.
 * Enables dynamic sprint insertion from mobile app.
 */
export async function addStoryToSprint(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = AddStoryToSprintSchema.parse(rawArgs);
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

      if (sprintData.status !== "running" && sprintData.status !== "paused") {
        return { error: `Cannot add story to ${sprintData.status} sprint` };
      }

      // Check if story ID already exists
      const existingStoryRef = db.doc(`${storiesPath}/${args.story.id}`);
      const existingStory = await transaction.get(existingStoryRef);
      if (existingStory.exists) {
        return { error: `Story ${args.story.id} already exists in sprint` };
      }

      // Determine wave based on insertion mode
      let wave: number;
      let position: string;

      switch (args.insertionMode) {
        case "current_wave":
          wave = sprintData.currentWave;
          position = "current wave";
          break;
        case "next_wave":
          wave = sprintData.currentWave + 1;
          position = "next wave";
          break;
        case "backlog":
          wave = sprintData.totalWaves + 1;
          position = "backlog";
          break;
        default:
          wave = sprintData.currentWave + 1;
          position = "next wave";
      }

      // Create story document
      const storyRef = db.doc(`${storiesPath}/${args.story.id}`);
      transaction.set(storyRef, {
        id: args.story.id,
        title: args.story.title,
        status: "queued",
        wave,
        progress: 0,
        currentAction: null,
        dependencies: args.story.dependencies || [],
        complexity: args.story.complexity || "normal",
        model: args.story.model || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        addedDynamically: true,
      });

      // Update sprint's totalWaves if needed
      const updateData: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (wave > sprintData.totalWaves) {
        updateData.totalWaves = wave;
      }

      transaction.update(sprintRef, updateData);

      return { wave, position };
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
            storyId: args.story.id,
            wave: result.wave,
            position: result.position,
            message: `Story ${args.story.id} added to ${result.position} (wave ${result.wave})`,
          }),
        },
      ],
    };
  } catch (error) {
    console.error("[addStoryToSprint] Failed:", error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Failed to add story: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    };
  }
}
