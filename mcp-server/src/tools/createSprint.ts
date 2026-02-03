import { getFirestore } from "../firebase/client.js";
import * as admin from "firebase-admin";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { CreateSprintSchema } from "../validation/validators.js";

/**
 * Create a new sprint to track parallel story execution.
 * The orchestrator calls this when starting a new sprint.
 */
export async function createSprint(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = CreateSprintSchema.parse(rawArgs);
  const db = getFirestore();

  const sprintId = `sprint_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const sprintsPath = `users/${auth.userId}/sprints`;
  const storiesPath = `${sprintsPath}/${sprintId}/stories`;

  // Calculate total waves from stories
  const maxWave = Math.max(...args.stories.map((s) => s.wave || 1));

  const sprintData = {
    projectName: args.projectName,
    branch: args.branch,
    status: "running" as const,
    currentWave: 1,
    totalWaves: maxWave,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    sessionId: args.sessionId || null,
    config: {
      orchestratorModel: args.config?.orchestratorModel || "opus",
      subagentModel: args.config?.subagentModel || "sonnet",
      maxConcurrent: args.config?.maxConcurrent || 3,
    },
  };

  try {
    // Use batch write for atomicity
    const batch = db.batch();

    // Create sprint document
    const sprintRef = db.doc(`${sprintsPath}/${sprintId}`);
    batch.set(sprintRef, sprintData);

    // Create story documents
    for (const story of args.stories) {
      const storyRef = db.doc(`${storiesPath}/${story.id}`);
      batch.set(storyRef, {
        id: story.id,
        title: story.title,
        status: story.status || "queued",
        wave: story.wave || 1,
        progress: story.progress || 0,
        currentAction: story.currentAction || null,
        dependencies: story.dependencies || [],
        complexity: story.complexity || "normal",
        model: story.model || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            sprintId,
            projectName: args.projectName,
            branch: args.branch,
            storyCount: args.stories.length,
            totalWaves: maxWave,
            message: `Sprint created with ${args.stories.length} stories across ${maxWave} wave(s)`,
          }),
        },
      ],
    };
  } catch (error) {
    console.error("[createSprint] Failed:", error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Failed to create sprint: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    };
  }
}
