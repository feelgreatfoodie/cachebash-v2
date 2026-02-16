/**
 * Task Type Definitions
 *
 * Tasks are the core work unit in the dispatch system. Three task types:
 *
 * 1. "task" - Standard work items with instructions and lifecycle
 * 2. "question" - Synchronous questions to human operators, expecting a response
 * 3. "scheduled" - Autonomous scheduled work triggered by time or conditions
 *
 * Priority levels control queue ordering:
 * - "high": interrupts, blocking issues, user-facing failures
 * - "normal": standard work, most tasks fall here
 * - "low": cleanup, optimization, nice-to-have improvements
 *
 * Action levels control dispatch timing:
 * - "interrupt": stop current work immediately, handle now
 * - "parallel": spin up separate worker, run concurrently
 * - "queue": add to queue, process after current task
 * - "backlog": low priority queue, process when idle
 */

export type TaskType = "task" | "question" | "scheduled";

export type TaskPriority = "low" | "normal" | "high";

export type TaskAction = "interrupt" | "parallel" | "queue" | "backlog";

export type TaskStatus = "created" | "active" | "blocked" | "completing" | "done" | "failed" | "archived";

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  instructions?: string;
  priority: TaskPriority;
  action: TaskAction;
  status: TaskStatus;
  source: string; // Agent ID who created this task
  target: string; // Agent ID who should handle this task, or "all" for broadcast
  createdAt: Date;
  updatedAt: Date;
  claimedAt?: Date;
  claimedBy?: string;
  completedAt?: Date;
  expiresAt?: Date;

  // Question-specific fields
  question?: string;
  options?: string[];
  answer?: string;
  answeredAt?: Date;

  // Scheduled task fields
  scheduled?: {
    triggerAt: Date;
    triggerCondition?: string;
    recurring?: boolean;
    interval?: number; // milliseconds
  };

  // Metadata
  context?: string;
  threadId?: string;
  replyTo?: string; // Task ID this responds to
  projectId?: string;
}
