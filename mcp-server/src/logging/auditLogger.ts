import { randomUUID } from "crypto";

/**
 * Audit event for logging sensitive operations.
 * All fields are designed to be safe for logging (no sensitive data).
 */
export interface AuditEvent {
  /** ISO timestamp of the event */
  timestamp: string;
  /** Unique ID for tracing related operations */
  correlationId: string;
  /** User ID (from auth context) */
  userId: string;
  /** Action performed (e.g., "ask_question", "claim_task") */
  action: string;
  /** Tool name if applicable */
  tool?: string;
  /** Type of resource affected */
  resourceType?: string;
  /** ID of the affected resource (question ID, task ID, etc.) */
  resourceId?: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error code if failed */
  errorCode?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Additional metadata (must not contain sensitive data) */
  metadata?: Record<string, unknown>;
}

/**
 * Generate a new correlation ID for request tracing.
 * Use this at the start of a request to track all related operations.
 *
 * @returns A unique UUID v4 string
 *
 * @example
 * const correlationId = generateCorrelationId();
 * // Pass correlationId through all function calls
 * logAuditEvent({ correlationId, ... });
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Log an audit event as structured JSON.
 * In production, these logs can be collected by Cloud Logging for analysis.
 *
 * @param event - The audit event to log (timestamp is auto-added)
 *
 * @example
 * logAuditEvent({
 *   correlationId: "abc-123",
 *   userId: "user123",
 *   action: "ask_question",
 *   tool: "ask_question",
 *   resourceType: "question",
 *   resourceId: "q456",
 *   success: true,
 *   durationMs: 150,
 * });
 */
export function logAuditEvent(event: Omit<AuditEvent, "timestamp">): void {
  const fullEvent: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // Output as structured JSON for log aggregation
  // In production, Cloud Logging will parse this automatically
  console.log(JSON.stringify(fullEvent));
}

/**
 * Create an audit logger scoped to a specific correlation ID and user.
 * Useful for logging multiple events within a single request.
 *
 * @param correlationId - The correlation ID for this request
 * @param userId - The authenticated user's ID
 * @returns Object with convenience methods for logging
 *
 * @example
 * const audit = createAuditLogger(correlationId, auth.userId);
 * audit.log("ask_question", { tool: "ask_question", success: true });
 * audit.error("ask_question", "VALIDATION_ERROR", { tool: "ask_question" });
 */
export function createAuditLogger(correlationId: string, userId: string) {
  return {
    /**
     * Log a successful operation
     */
    log(action: string, details: Partial<Omit<AuditEvent, "timestamp" | "correlationId" | "userId" | "action">> = {}) {
      logAuditEvent({
        correlationId,
        userId,
        action,
        success: true,
        ...details,
      });
    },

    /**
     * Log a failed operation
     */
    error(action: string, errorCode: string, details: Partial<Omit<AuditEvent, "timestamp" | "correlationId" | "userId" | "action" | "success" | "errorCode">> = {}) {
      logAuditEvent({
        correlationId,
        userId,
        action,
        success: false,
        errorCode,
        ...details,
      });
    },
  };
}
