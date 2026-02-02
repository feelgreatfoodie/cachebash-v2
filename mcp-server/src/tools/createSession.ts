import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { z } from "zod";

const CreateSessionSchema = z.object({
  name: z.string().max(200),
  status: z.string().max(200).optional(),
  state: z.enum(["working", "blocked", "complete", "pinned"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  projectName: z.string().max(100).optional(),
});

/**
 * Create a new session
 */
export async function createSession(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = CreateSessionSchema.parse(rawArgs);
  const db = getFirestore();

  const sessionId = `session_${Date.now()}`;
  const timestamp = serverTimestamp();

  const sessionData: Record<string, unknown> = {
    name: args.name,
    status: args.status || args.name,
    state: args.state || "working",
    progress: args.progress ?? null,
    lastUpdate: timestamp,
    archived: false,
  };

  if (args.projectName) {
    sessionData.projectName = args.projectName;
  }

  await db
    .doc(`users/${auth.userId}/sessions/${sessionId}`)
    .set(sessionData);

  // Add initial status update to history
  await db
    .collection(`users/${auth.userId}/sessions/${sessionId}/updates`)
    .add({
      status: args.status || args.name,
      state: args.state || "working",
      progress: args.progress ?? null,
      createdAt: timestamp,
    });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          sessionId,
          message: `Session created: "${args.name}"`,
        }),
      },
    ],
  };
}
