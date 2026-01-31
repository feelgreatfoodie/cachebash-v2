import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";

interface UpdateStatusArgs {
  status: string;
  progress?: number;
  state?: "working" | "blocked" | "complete" | "pinned";
  sessionId?: string;
}

/**
 * Update the current working status visible in the app
 */
export async function updateStatus(
  auth: AuthContext,
  args: UpdateStatusArgs
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const db = getFirestore();

  // Use provided sessionId or generate one based on current timestamp
  const sessionId = args.sessionId || `session_${Date.now()}`;

  const sessionData = {
    name: args.status,
    status: args.status,
    state: args.state || "working",
    progress: args.progress ?? null,
    lastUpdate: serverTimestamp(),
    archived: false,
  };

  // Update or create session document
  await db
    .doc(`users/${auth.userId}/sessions/${sessionId}`)
    .set(sessionData, { merge: true });

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
