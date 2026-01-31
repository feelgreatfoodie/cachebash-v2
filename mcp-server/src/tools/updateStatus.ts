import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { UpdateStatusSchema } from "../validation/validators.js";

/**
 * Update the current working status visible in the app
 */
export async function updateStatus(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = UpdateStatusSchema.parse(rawArgs);
  const db = getFirestore();

  // Use provided sessionId or generate one based on current timestamp
  const sessionId = args.sessionId || `session_${Date.now()}`;
  const timestamp = serverTimestamp();

  const sessionData: Record<string, unknown> = {
    name: args.status,
    status: args.status,
    state: args.state || "working",
    progress: args.progress ?? null,
    lastUpdate: timestamp,
    archived: false,
  };

  // Only include projectName if provided (allows setting once and keeping it)
  if (args.projectName) {
    sessionData.projectName = args.projectName;
  }

  // Update or create session document
  await db
    .doc(`users/${auth.userId}/sessions/${sessionId}`)
    .set(sessionData, { merge: true });

  // Add status update to history subcollection
  await db
    .collection(`users/${auth.userId}/sessions/${sessionId}/updates`)
    .add({
      status: args.status,
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
          message: `Status updated: "${args.status}"`,
        }),
      },
    ],
  };
}
