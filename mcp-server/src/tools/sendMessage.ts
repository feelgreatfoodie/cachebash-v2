import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { SendMessageSchema } from "../validation/validators.js";

/**
 * Send a message/instruction to a running program (Claude Code session).
 * Writes to /messages with direction: "to_claude".
 *
 * This is the MCP equivalent of sending an interrupt from the mobile app.
 * Used by ISO (claude.ai) to communicate with CLI programs.
 */
export async function sendMessage(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = SendMessageSchema.parse(rawArgs);
  const db = getFirestore();

  const preview = args.message.length > 50
    ? args.message.substring(0, 47) + "..."
    : args.message;

  const messageData: Record<string, unknown> = {
    direction: "to_claude",
    content: args.message,
    preview,
    priority: args.priority || "normal",
    action: args.action || "queue",
    status: "pending",
    context: args.context || null,
    sessionId: args.sessionId || null,
    source: "iso",
    createdAt: serverTimestamp(),
    archived: false,
    deletedAt: null,
    encrypted: false,
  };

  const ref = await db
    .collection(`users/${auth.userId}/messages`)
    .add(messageData);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          messageId: ref.id,
          action: args.action || "queue",
          message: `Message sent. ID: "${ref.id}"`,
        }),
      },
    ],
  };
}
