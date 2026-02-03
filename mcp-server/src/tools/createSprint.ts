import { getFirestore } from "../firebase/client.js";
import * as admin from "firebase-admin";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { CreateSprintSchema } from "../validation/validators.js";

/**
 * Create a new sprint to track parallel story execution.
 * The orchestrator calls this when starting a new sprint.
 *
 * Creates one session per wave for progress tracking in the Sessions list.
 */
export async function createSprint(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = CreateSprintSchema.parse(rawArgs);
  const db = getFirestore();

  const sprintId = `sprint_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const sprintsPath = `users/${auth.userId}/sprints`;
  const sessionsPath = `users/${auth.userId}/sessions`;
  const storiesPath = `${sprintsPath}/${sprintId}/stories`;

  // Calculate total waves from stories
  const maxWave = Math.max(...args.stories.map((s) => s.wave || 1));

  // Get unique waves sorted
  const waves = [...new Set(args.stories.map((s) => s.wave || 1))].sort(
    (a, b) => a - b
  );

  // Create wave session IDs
  const waveSessionIds: Record<string, string> = {};

  try {
    // Use batch write for atomicity
    const batch = db.batch();

    // Create session for each wave
    for (const wave of waves) {
      const waveStories = args.stories.filter((s) => (s.wave || 1) === wave);
      const storyIds = waveStories.map((s) => s.id).join(", ");
      const paddedWave = String(wave).padStart(3, "0");

      const sessionRef = db.collection(sessionsPath).doc();
      waveSessionIds[String(wave)] = sessionRef.id;

      batch.set(sessionRef, {
        name: `${args.projectName} - Wave ${paddedWave}`,
        status: wave === 1 ? "Starting..." : "Queued",
        state: wave === 1 ? "working" : "pinned",
        progress: 0,
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        archived: false,
        projectName: args.projectName,
        sprintId,
        waveNumber: wave,
        storyIds: waveStories.map((s) => s.id),
      });
    }

    // Create sprint document with wave session mapping
    const sprintRef = db.doc(`${sprintsPath}/${sprintId}`);
    batch.set(sprintRef, {
      projectName: args.projectName,
      branch: args.branch,
      status: "running" as const,
      currentWave: 1,
      totalWaves: maxWave,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionId: args.sessionId || null, // Legacy field for backwards compat
      waveSessionIds, // New: maps wave number to session ID
      config: {
        orchestratorModel: args.config?.orchestratorModel || "opus",
        subagentModel: args.config?.subagentModel || "sonnet",
        maxConcurrent: args.config?.maxConcurrent || 3,
      },
    });

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
            waveSessionIds,
            message: `Sprint created with ${args.stories.length} stories across ${maxWave} wave(s). Created ${waves.length} wave sessions.`,
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
