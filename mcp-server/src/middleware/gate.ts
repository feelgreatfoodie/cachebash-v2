/**
 * Audit and Correlation Middleware
 *
 * Two responsibilities:
 *
 * 1. Correlation IDs: every request gets a unique ID for tracing across logs
 *    - UUID v4 format: 8-4-4-4-12 hex digits
 *    - Passed through all log messages for a request
 *    - Makes debugging distributed systems possible (find all logs for one request)
 *
 * 2. Source verification: ensure the authenticated agent matches the claimed source
 *    - Prevents agent A from impersonating agent B
 *    - Checks that message.source === authContext.agentId
 *    - Blocks spoofing attempts before they reach the handler
 *
 * Why correlation IDs:
 * - Multi-agent system: one user request might trigger 5 agents
 * - Without correlation: logs are interleaved chaos
 * - With correlation: filter logs by ID, see the full request flow
 *
 * Audit log format (for observability):
 * {
 *   timestamp: "2025-01-15T10:30:00Z",
 *   correlationId: "abc-123-def",
 *   userId: "user_xyz",
 *   agentId: "agent_foo",
 *   action: "create_task",
 *   result: "success",
 *   duration: 45  // milliseconds
 * }
 */

import crypto from "crypto";
import { AuthContext } from "../auth/apiKeyValidator.js";

/**
 * Generate a correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Create an audit logger with correlation tracking
 */
export function createAuditLogger(correlationId: string, auth: AuthContext) {
  return {
    log: (action: string, details: any) => {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          correlationId,
          userId: auth.userId,
          agentId: auth.agentId,
          action,
          details,
        })
      );
    },
    error: (action: string, error: any) => {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          correlationId,
          userId: auth.userId,
          agentId: auth.agentId,
          action,
          error: error.message || String(error),
        })
      );
    },
  };
}

/**
 * Verify that source identity matches auth context
 * Prevents agents from impersonating each other
 */
export function verifySource(auth: AuthContext, claimedSource: string): boolean {
  return auth.agentId === claimedSource;
}
