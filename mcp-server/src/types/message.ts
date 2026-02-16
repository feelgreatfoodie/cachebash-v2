/**
 * Message Type Definitions
 *
 * Messages are lightweight, short-lived communication between agents. Unlike tasks,
 * messages don't have full lifecycle management — they're read once and marked delivered.
 *
 * Message types follow a request-response pattern:
 *
 * - PING/PONG: health checks, "are you alive?"
 * - QUERY/RESULT: request data, get response
 * - STATUS: one-way status updates, no response expected
 * - DIRECTIVE: command from coordinator to worker
 * - ACK: acknowledgment of received message
 *
 * TTL (time-to-live) controls message expiration:
 * - Default 24 hours for most messages
 * - Shorter (5-15 min) for ephemeral status updates
 * - Longer (7 days) for important directives that might be read late
 *
 * Why separate messages from tasks:
 * - Tasks are heavyweight: lifecycle, retries, persistence, audit trail
 * - Messages are lightweight: send and forget, minimal overhead
 * - Different access patterns: tasks are polled, messages are pushed (via webhook when available)
 */

export type MessageType = "PING" | "PONG" | "STATUS" | "QUERY" | "RESULT" | "DIRECTIVE" | "ACK";

export type MessagePriority = "low" | "normal" | "high";

export type MessageStatus = "pending" | "delivered" | "failed" | "expired";

export interface RelayMessage {
  id: string;
  source: string; // Sending agent ID
  target: string; // Receiving agent ID or "all"
  messageType: MessageType;
  message: string;
  context?: string;
  priority: MessagePriority;
  status: MessageStatus;
  threadId?: string;
  replyTo?: string; // Message ID this responds to

  // Lifecycle timestamps
  createdAt: Date;
  deliveredAt?: Date;
  expiresAt: Date; // Computed from TTL at creation

  // TTL in seconds (default 86400 = 24 hours)
  ttl: number;
}
