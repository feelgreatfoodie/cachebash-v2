import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { SendMessageSchema } from "../validation/validators.js";

/**
 * Send a message/instruction to a running program (Claude Code session).
 * Grid Relay v0.2 — requires source, target, message_type.
 *
 * Writes to:
 *   /users/{uid}/messages — control plane (Flutter app visibility, push notifications)
 *   /users/{uid}/relay    — data plane (inter-program mesh, 24h TTL auto-expiry)
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

  const now = serverTimestamp();

  // Control plane message (for Flutter app, push notifications)
  const messageData: Record<string, unknown> = {
    direction: "to_claude",
    content: args.message,
    preview,
    source: args.source,
    target: args.target,
    message_type: args.message_type,
    priority: args.priority || "normal",
    action: args.action || "queue",
    status: "pending",
    context: args.context || null,
    sessionId: args.sessionId || null,
    reply_to: args.reply_to || null,
    createdAt: now,
    archived: false,
    deletedAt: null,
    encrypted: false,
  };

  // Data plane message (inter-program relay, 24h TTL)
  const relayData: Record<string, unknown> = {
    source: args.source,
    target: args.target,
    message_type: args.message_type,
    payload: args.message,
    priority: args.priority || "normal",
    action: args.action || "queue",
    reply_to: args.reply_to || null,
    sessionId: args.sessionId || null,
    status: "pending",
    createdAt: now,
  };

  // Write to both collections
  const [messageRef] = await Promise.all([
    db.collection(`users/${auth.userId}/messages`).add(messageData),
    db.collection(`users/${auth.userId}/relay`).add(relayData),
  ]);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          messageId: messageRef.id,
          action: args.action || "queue",
          relay: true,
          message: `Message sent. ID: "${messageRef.id}"`,
        }),
      },
    ],
  };
}
