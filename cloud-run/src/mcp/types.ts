import { z } from "zod";

// Tool input schemas
export const AskQuestionSchema = z.object({
  question: z.string().min(1).max(2000),
  options: z.array(z.string().max(100)).max(5).optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  context: z.string().max(500).optional(),
  projectId: z.string().optional(),
});

export const GetResponseSchema = z.object({
  questionId: z.string().min(1),
});

export const UpdateStatusSchema = z.object({
  status: z.string().min(1).max(200),
  progress: z.number().min(0).max(100).optional(),
  state: z.enum(["working", "blocked", "complete", "pinned"]).default("working"),
  sessionId: z.string().optional(),
});

export const PinTaskSchema = z.object({
  taskId: z.string().min(1),
  questionId: z.string().min(1),
  context: z.string().min(1).max(2000),
});

export const ResumeTaskSchema = z.object({
  taskId: z.string().min(1),
});

// Tool call request
export const ToolCallSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.literal("tools/call"),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

// Type exports
export type AskQuestionInput = z.infer<typeof AskQuestionSchema>;
export type GetResponseInput = z.infer<typeof GetResponseSchema>;
export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>;
export type PinTaskInput = z.infer<typeof PinTaskSchema>;
export type ResumeTaskInput = z.infer<typeof ResumeTaskSchema>;
export type ToolCallRequest = z.infer<typeof ToolCallSchema>;

// Tool response
export interface ToolResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP error codes
export const MCPErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;
