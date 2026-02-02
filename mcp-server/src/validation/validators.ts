import { z } from "zod";

/**
 * Input validation schemas for MCP tool arguments.
 * All tool handlers should validate args through these schemas before processing.
 */

export const AskQuestionSchema = z.object({
  question: z.string().min(1, "Question cannot be empty").max(2000, "Question too long (max 2000 chars)"),
  options: z.array(z.string().max(100, "Option too long (max 100 chars)")).max(5, "Too many options (max 5)").optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  context: z.string().max(500, "Context too long (max 500 chars)").optional(),
  projectId: z.string().max(100).optional(),
  encrypt: z.boolean().default(true),
  threadId: z.string().max(100).optional(),
  inReplyTo: z.string().max(100).optional(),
});

export const GetResponseSchema = z.object({
  questionId: z.string().min(1, "Question ID required"),
});

export const UpdateStatusSchema = z.object({
  status: z.string().min(1, "Status required").max(200, "Status too long (max 200 chars)"),
  progress: z.number().min(0).max(100).optional(),
  state: z.enum(["working", "blocked", "complete", "pinned"]).default("working"),
  sessionId: z.string().max(100).optional(),
  projectName: z.string().max(100).optional(),
});

export const PinTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID required").max(100),
  questionId: z.string().min(1, "Question ID required").max(100),
  context: z.string().min(1, "Context required").max(2000, "Context too long (max 2000 chars)"),
});

export const ResumeTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID required").max(100),
});

export const GetInterruptsSchema = z.object({
  sessionId: z.string().min(1, "Session ID required").max(100),
  markAsRead: z.boolean().default(true),
});

export const GetPendingTasksSchema = z.object({
  status: z.enum(["pending", "in_progress", "all"]).default("pending"),
  limit: z.number().int().min(1).max(50).default(10),
});

export const ClaimTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID required"),
  sessionId: z.string().max(100).optional(),
});

export const CompleteTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID required"),
});

export const SendAlertSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(2000, "Message too long (max 2000 chars)"),
  alertType: z.enum(["error", "warning", "success", "info"]).default("info"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  context: z.string().max(500, "Context too long (max 500 chars)").optional(),
  sessionId: z.string().max(100).optional(),
});

export const SendHeartbeatSchema = z.object({
  taskId: z.string().min(1, "Task ID required"),
  status: z.string().max(200, "Status too long (max 200 chars)").optional(),
  progress: z.number().min(0).max(100).optional(),
});

export type AskQuestionArgs = z.infer<typeof AskQuestionSchema>;
export type GetResponseArgs = z.infer<typeof GetResponseSchema>;
export type UpdateStatusArgs = z.infer<typeof UpdateStatusSchema>;
export type PinTaskArgs = z.infer<typeof PinTaskSchema>;
export type ResumeTaskArgs = z.infer<typeof ResumeTaskSchema>;
export type GetInterruptsArgs = z.infer<typeof GetInterruptsSchema>;
export type GetPendingTasksArgs = z.infer<typeof GetPendingTasksSchema>;
export type ClaimTaskArgs = z.infer<typeof ClaimTaskSchema>;
export type CompleteTaskArgs = z.infer<typeof CompleteTaskSchema>;
export type SendAlertArgs = z.infer<typeof SendAlertSchema>;
export type SendHeartbeatArgs = z.infer<typeof SendHeartbeatSchema>;
