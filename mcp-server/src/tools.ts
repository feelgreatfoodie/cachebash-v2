/**
 * Tool Registry
 *
 * Maps MCP tool names to handler functions and JSON Schema definitions.
 * This registry is consumed by the MCP server to expose tools to clients.
 *
 * Each tool has:
 * - handler: async function that implements the tool logic
 * - schema: JSON Schema describing inputs (for MCP tools/list response)
 *
 * Handler signature: (auth: AuthContext, args: any) => Promise<ToolResult>
 * ToolResult format: { content: [{ type: "text", text: string }] }
 */

import { AuthContext } from "./auth/apiKeyValidator.js";
import {
  getTasksHandler,
  createTaskHandler,
  claimTaskHandler,
  completeTaskHandler,
} from "./modules/tasks.js";
import {
  sendMessageHandler,
  getMessagesHandler,
} from "./modules/messages.js";
import {
  createSessionHandler,
  updateSessionHandler,
  listSessionsHandler,
} from "./modules/sessions.js";
import {
  askQuestionHandler,
  getResponseHandler,
  sendAlertHandler,
} from "./modules/questions.js";

export interface ToolSchema {
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolDefinition {
  handler: (auth: AuthContext, args: any) => Promise<any>;
  schema: ToolSchema;
}

export const toolRegistry: Record<string, ToolDefinition> = {
  get_tasks: {
    handler: getTasksHandler,
    schema: {
      description: "Get tasks filtered by status, type, or target agent",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["created", "active", "all"],
            description: "Filter by lifecycle status (default: created)",
          },
          type: {
            type: "string",
            enum: ["task", "question", "scheduled", "all"],
            description: "Filter by task type (default: all)",
          },
          target: {
            type: "string",
            description: "Filter by target agent ID",
          },
          limit: {
            type: "number",
            description: "Maximum number of tasks to return (default: 10, max: 50)",
            minimum: 1,
            maximum: 50,
          },
        },
      },
    },
  },

  create_task: {
    handler: createTaskHandler,
    schema: {
      description: "Create a new task for an agent to work on",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Task title (max 200 chars)",
            maxLength: 200,
          },
          instructions: {
            type: "string",
            description: "Detailed task instructions (max 4000 chars)",
            maxLength: 4000,
          },
          target: {
            type: "string",
            description: "Target agent ID or 'all' for broadcast",
            maxLength: 100,
          },
          type: {
            type: "string",
            enum: ["task", "question", "scheduled"],
            description: "Task type (default: task)",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Priority level (default: normal)",
          },
          action: {
            type: "string",
            enum: ["interrupt", "parallel", "queue", "backlog"],
            description: "Dispatch action (default: queue)",
          },
          ttl: {
            type: "number",
            description: "Time-to-live in seconds before task expires",
          },
          context: {
            type: "string",
            description: "Additional context for the task",
            maxLength: 500,
          },
          threadId: {
            type: "string",
            description: "Thread ID for grouping related tasks",
          },
          replyTo: {
            type: "string",
            description: "Task ID this responds to",
          },
          projectId: {
            type: "string",
            description: "Project ID for task tracking",
          },
        },
        required: ["title", "target"],
      },
    },
  },

  claim_task: {
    handler: claimTaskHandler,
    schema: {
      description: "Claim a task to start working on it (atomic, prevents double-claim)",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "Task ID to claim",
          },
          sessionId: {
            type: "string",
            description: "Session ID claiming this task",
          },
        },
        required: ["taskId"],
      },
    },
  },

  complete_task: {
    handler: completeTaskHandler,
    schema: {
      description: "Mark a task as complete",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "Task ID to complete",
          },
        },
        required: ["taskId"],
      },
    },
  },

  send_message: {
    handler: sendMessageHandler,
    schema: {
      description: "Send a message to another agent",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Source agent ID (must match authenticated agent)",
            maxLength: 100,
          },
          target: {
            type: "string",
            description: "Target agent ID or 'all' for broadcast",
            maxLength: 100,
          },
          message: {
            type: "string",
            description: "Message content",
            maxLength: 2000,
          },
          messageType: {
            type: "string",
            enum: ["PING", "PONG", "STATUS", "QUERY", "RESULT", "DIRECTIVE", "ACK"],
            description: "Message type",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Priority level (default: normal)",
          },
          context: {
            type: "string",
            description: "Additional context",
            maxLength: 500,
          },
          threadId: {
            type: "string",
            description: "Thread ID for grouping messages",
          },
          replyTo: {
            type: "string",
            description: "Message ID this responds to",
          },
          ttl: {
            type: "number",
            description: "Time-to-live in seconds (default: 86400 = 24 hours)",
          },
        },
        required: ["source", "target", "message", "messageType"],
      },
    },
  },

  get_messages: {
    handler: getMessagesHandler,
    schema: {
      description: "Get pending messages for the authenticated agent",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: {
            type: "string",
            description: "Session ID requesting messages",
          },
          messageType: {
            type: "string",
            enum: ["PING", "PONG", "STATUS", "QUERY", "RESULT", "DIRECTIVE", "ACK"],
            description: "Filter by message type",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Filter by priority level",
          },
          markAsRead: {
            type: "boolean",
            description: "Mark messages as delivered (default: true)",
          },
        },
        required: ["sessionId"],
      },
    },
  },

  create_session: {
    handler: createSessionHandler,
    schema: {
      description: "Create or update a work session",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Session name",
            maxLength: 200,
          },
          sessionId: {
            type: "string",
            description: "Custom session ID (upserts if exists)",
            maxLength: 100,
          },
          agentId: {
            type: "string",
            description: "Agent ID for this session",
            maxLength: 50,
          },
          state: {
            type: "string",
            enum: ["working", "blocked", "complete", "pinned"],
            description: "Session state (default: working)",
          },
          status: {
            type: "string",
            description: "Status message",
            maxLength: 200,
          },
          progress: {
            type: "number",
            description: "Progress percentage (0-100)",
            minimum: 0,
            maximum: 100,
          },
          projectName: {
            type: "string",
            description: "Project name for tracking",
            maxLength: 100,
          },
        },
        required: ["name"],
      },
    },
  },

  update_session: {
    handler: updateSessionHandler,
    schema: {
      description: "Update session status and progress",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Status message",
            maxLength: 200,
          },
          sessionId: {
            type: "string",
            description: "Session ID to update",
          },
          state: {
            type: "string",
            enum: ["working", "blocked", "complete", "pinned"],
            description: "Session state",
          },
          progress: {
            type: "number",
            description: "Progress percentage (0-100)",
            minimum: 0,
            maximum: 100,
          },
          projectName: {
            type: "string",
            description: "Project name",
            maxLength: 100,
          },
          lastHeartbeat: {
            type: "boolean",
            description: "Update heartbeat timestamp",
          },
        },
        required: ["status"],
      },
    },
  },

  list_sessions: {
    handler: listSessionsHandler,
    schema: {
      description: "List sessions for the authenticated user",
      inputSchema: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["working", "blocked", "pinned", "complete", "all"],
            description: "Filter by state (default: all)",
          },
          agentId: {
            type: "string",
            description: "Filter by agent ID",
            maxLength: 50,
          },
          includeArchived: {
            type: "boolean",
            description: "Include archived sessions (default: false)",
          },
          limit: {
            type: "number",
            description: "Maximum sessions to return (default: 10, max: 50)",
            minimum: 1,
            maximum: 50,
          },
        },
      },
    },
  },

  ask_question: {
    handler: askQuestionHandler,
    schema: {
      description: "Ask a question to the human operator (mobile notification)",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "Question text",
            maxLength: 2000,
          },
          options: {
            type: "array",
            items: { type: "string", maxLength: 100 },
            description: "Answer options (max 5)",
            maxItems: 5,
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Priority level (default: normal)",
          },
          context: {
            type: "string",
            description: "Context for the question",
            maxLength: 500,
          },
          threadId: {
            type: "string",
            description: "Thread ID for grouping",
          },
          projectId: {
            type: "string",
            description: "Project ID",
          },
        },
        required: ["question"],
      },
    },
  },

  get_response: {
    handler: getResponseHandler,
    schema: {
      description: "Check if a question has been answered",
      inputSchema: {
        type: "object",
        properties: {
          questionId: {
            type: "string",
            description: "Question task ID",
          },
        },
        required: ["questionId"],
      },
    },
  },

  send_alert: {
    handler: sendAlertHandler,
    schema: {
      description: "Send a one-way alert notification (no response expected)",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Alert message",
            maxLength: 2000,
          },
          alertType: {
            type: "string",
            enum: ["error", "warning", "success", "info"],
            description: "Alert severity (default: info)",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Priority level (default: normal)",
          },
          context: {
            type: "string",
            description: "Context for the alert",
            maxLength: 500,
          },
          sessionId: {
            type: "string",
            description: "Session ID sending the alert",
          },
        },
        required: ["message"],
      },
    },
  },
};
