import { logger } from "../lib/logger";
import {
  ToolCallSchema,
  ToolCallRequest,
  ToolResponse,
  MCPErrorCode,
  AskQuestionSchema,
  GetResponseSchema,
  UpdateStatusSchema,
  PinTaskSchema,
  ResumeTaskSchema,
} from "./types";
import {
  askQuestion,
  getResponse,
  updateStatus,
  pinTask,
  resumeTask,
} from "./tools";

function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): ToolResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? 0,
    error: { code, message, data },
  };
}

function createSuccessResponse(
  id: string | number,
  content: Array<{ type: "text"; text: string }>,
  isError?: boolean
): ToolResponse {
  return {
    jsonrpc: "2.0",
    id,
    result: { content, isError },
  };
}

export async function handleToolCall(
  userId: string,
  rawRequest: unknown
): Promise<ToolResponse> {
  const startTime = Date.now();

  // Parse the request
  const parseResult = ToolCallSchema.safeParse(rawRequest);
  if (!parseResult.success) {
    logger.warn("Invalid tool call request", {
      userId,
      errors: parseResult.error.errors,
      action: "mcp_parse_error",
    });
    return createErrorResponse(
      null,
      MCPErrorCode.InvalidRequest,
      "Invalid request format",
      parseResult.error.errors
    );
  }

  const request: ToolCallRequest = parseResult.data;
  const { name, arguments: args } = request.params;

  logger.info("Processing tool call", {
    userId,
    tool: name,
    requestId: request.id,
    action: "mcp_tool_call",
  });

  try {
    let result;

    switch (name) {
      case "ask_question": {
        const inputResult = AskQuestionSchema.safeParse(args);
        if (!inputResult.success) {
          return createErrorResponse(
            request.id,
            MCPErrorCode.InvalidParams,
            "Invalid parameters for ask_question",
            inputResult.error.errors
          );
        }
        result = await askQuestion(userId, inputResult.data);
        break;
      }

      case "get_response": {
        const inputResult = GetResponseSchema.safeParse(args);
        if (!inputResult.success) {
          return createErrorResponse(
            request.id,
            MCPErrorCode.InvalidParams,
            "Invalid parameters for get_response",
            inputResult.error.errors
          );
        }
        result = await getResponse(userId, inputResult.data);
        break;
      }

      case "update_status": {
        const inputResult = UpdateStatusSchema.safeParse(args);
        if (!inputResult.success) {
          return createErrorResponse(
            request.id,
            MCPErrorCode.InvalidParams,
            "Invalid parameters for update_status",
            inputResult.error.errors
          );
        }
        result = await updateStatus(userId, inputResult.data);
        break;
      }

      case "pin_task": {
        const inputResult = PinTaskSchema.safeParse(args);
        if (!inputResult.success) {
          return createErrorResponse(
            request.id,
            MCPErrorCode.InvalidParams,
            "Invalid parameters for pin_task",
            inputResult.error.errors
          );
        }
        result = await pinTask(userId, inputResult.data);
        break;
      }

      case "resume_task": {
        const inputResult = ResumeTaskSchema.safeParse(args);
        if (!inputResult.success) {
          return createErrorResponse(
            request.id,
            MCPErrorCode.InvalidParams,
            "Invalid parameters for resume_task",
            inputResult.error.errors
          );
        }
        result = await resumeTask(userId, inputResult.data);
        break;
      }

      default:
        logger.warn("Unknown tool", {
          userId,
          tool: name,
          action: "mcp_unknown_tool",
        });
        return createErrorResponse(
          request.id,
          MCPErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }

    const duration_ms = Date.now() - startTime;
    logger.info("Tool call completed", {
      userId,
      tool: name,
      requestId: request.id,
      duration_ms,
      isError: result.isError,
      action: "mcp_tool_complete",
    });

    return createSuccessResponse(request.id, result.content, result.isError);
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    logger.error("Tool call failed", {
      userId,
      tool: name,
      requestId: request.id,
      duration_ms,
      error: error instanceof Error ? error.message : String(error),
      action: "mcp_tool_error",
    });

    return createErrorResponse(
      request.id,
      MCPErrorCode.InternalError,
      "Internal error processing tool call"
    );
  }
}

// Tool definitions for MCP list_tools
export const toolDefinitions = [
  {
    name: "ask_question",
    description: "Send a question to the user's mobile device and wait for a response",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user",
          maxLength: 2000,
        },
        options: {
          type: "array",
          items: { type: "string", maxLength: 100 },
          maxItems: 5,
          description: "Optional multiple choice options",
        },
        priority: {
          type: "string",
          enum: ["low", "normal", "high"],
          description: "Notification priority level",
          default: "normal",
        },
        context: {
          type: "string",
          description: "Context about what you're working on",
          maxLength: 500,
        },
        projectId: {
          type: "string",
          description: "Optional project ID to group questions",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "get_response",
    description: "Check if the user has responded to a question",
    inputSchema: {
      type: "object",
      properties: {
        questionId: {
          type: "string",
          description: "The ID of the question to check",
        },
      },
      required: ["questionId"],
    },
  },
  {
    name: "update_status",
    description: "Update the current working status visible in the app",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Status message to display",
          maxLength: 200,
        },
        progress: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "Progress percentage (0-100)",
        },
        state: {
          type: "string",
          enum: ["working", "blocked", "complete", "pinned"],
          description: "Current state",
          default: "working",
        },
        sessionId: {
          type: "string",
          description: "Optional session ID to update",
        },
      },
      required: ["status"],
    },
  },
  {
    name: "pin_task",
    description: "Pin the current task to resume later when user responds",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Unique identifier for this task",
        },
        questionId: {
          type: "string",
          description: "ID of the question waiting for response",
        },
        context: {
          type: "string",
          description: "Summary of current state to resume from",
          maxLength: 2000,
        },
      },
      required: ["taskId", "questionId", "context"],
    },
  },
  {
    name: "resume_task",
    description: "Resume a previously pinned task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "ID of the task to resume",
        },
      },
      required: ["taskId"],
    },
  },
];
