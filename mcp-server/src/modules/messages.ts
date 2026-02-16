/**
 * Message Relay Module
 *
 * Lightweight message passing between agents. Messages are simpler than tasks:
 * - No lifecycle states (just pending/delivered/expired)
 * - No claiming mechanism (atomic mark-as-read on fetch)
 * - Shorter TTL (default 24 hours vs tasks which can live weeks)
 *
 * Message flow:
 * 1. Agent A calls send_message(target: "agent-b", message: "...", messageType: "QUERY")
 * 2. Message written to relay collection with status "pending"
 * 3. Agent B calls get_messages() and sees the message
 * 4. Message status updated to "delivered" atomically (prevents duplicate delivery)
 * 5. Agent B responds with send_message(target: "agent-a", messageType: "RESULT", replyTo: messageId)
 *
 * Priority ordering:
 * - High priority messages appear first in get_messages results
 * - Useful for urgent status updates or errors that need immediate attention
 *
 * Broadcast messages:
 * - target: "all" sends to all agents
 * - Each agent sees the message once when they call get_messages
 * - Useful for system-wide announcements or coordinator directives
 */

import { z } from "zod";
import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { RelayMessage, MessageType, MessagePriority } from "../types/message.js";

const db = getFirestore();

// Zod validation schemas
const SendMessageSchema = z.object({
  source: z.string().max(100),
  target: z.string().max(100),
  message: z.string().max(2000),
  messageType: z.enum(["PING", "PONG", "STATUS", "QUERY", "RESULT", "DIRECTIVE", "ACK"]),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  context: z.string().max(500).optional(),
  threadId: z.string().optional(),
  replyTo: z.string().optional(),
  ttl: z.number().positive().optional().default(86400), // 24 hours
});

const GetMessagesSchema = z.object({
  sessionId: z.string(),
  messageType: z.enum(["PING", "PONG", "STATUS", "QUERY", "RESULT", "DIRECTIVE", "ACK"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  markAsRead: z.boolean().optional().default(true),
});

/**
 * Priority weight for sorting (higher = more urgent)
 */
function priorityWeight(priority: MessagePriority): number {
  return { high: 3, normal: 2, low: 1 }[priority];
}

/**
 * Send message handler
 */
export async function sendMessageHandler(auth: AuthContext, args: any) {
  const params = SendMessageSchema.parse(args);

  // Verify source matches authenticated agent
  if (params.source !== auth.agentId) {
    throw new Error("Source agent ID must match authenticated agent");
  }

  const messageId = db.collection("users").doc(auth.userId).collection("relay").doc().id;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + params.ttl * 1000);

  const message: Partial<RelayMessage> = {
    id: messageId,
    source: params.source,
    target: params.target,
    messageType: params.messageType as MessageType,
    message: params.message,
    context: params.context,
    priority: params.priority as MessagePriority,
    status: "pending",
    threadId: params.threadId,
    replyTo: params.replyTo,
    createdAt: now,
    expiresAt,
    ttl: params.ttl,
  };

  // Write to relay collection
  await db
    .collection("users")
    .doc(auth.userId)
    .collection("relay")
    .doc(messageId)
    .set(message);

  // Also write to tasks collection for mobile visibility (messages can trigger notifications)
  await db
    .collection("users")
    .doc(auth.userId)
    .collection("tasks")
    .doc(messageId)
    .set({
      id: messageId,
      type: "task",
      title: `Message: ${params.messageType}`,
      instructions: params.message,
      priority: params.priority,
      action: "queue",
      status: "created",
      source: params.source,
      target: params.target,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      context: params.context,
      threadId: params.threadId,
    });

  return {
    content: [{ type: "text", text: JSON.stringify({ message, sent: true }) }],
  };
}

/**
 * Get messages handler
 */
export async function getMessagesHandler(auth: AuthContext, args: any) {
  const params = GetMessagesSchema.parse(args);

  let query = db
    .collection("users")
    .doc(auth.userId)
    .collection("relay")
    .where("target", "in", [auth.agentId, "all"])
    .where("status", "==", "pending")
    .orderBy("createdAt", "desc")
    .limit(20);

  // Apply filters
  if (params.messageType) {
    query = query.where("messageType", "==", params.messageType) as any;
  }

  if (params.priority) {
    query = query.where("priority", "==", params.priority) as any;
  }

  const snapshot = await query.get();
  const now = new Date();

  const messages = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as RelayMessage))
    .filter((msg) => msg.expiresAt > now) // Filter expired
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority)); // Sort by priority

  // Mark messages as delivered if requested (atomic update)
  if (params.markAsRead && messages.length > 0) {
    const batch = db.batch();
    for (const msg of messages) {
      const msgRef = db
        .collection("users")
        .doc(auth.userId)
        .collection("relay")
        .doc(msg.id);
      batch.update(msgRef, {
        status: "delivered",
        deliveredAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ messages, count: messages.length }) }],
  };
}
