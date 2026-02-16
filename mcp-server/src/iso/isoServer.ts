/**
 * ISO MCP Server — Scoped endpoint for claude.ai desktop connector.
 *
 * Creates a separate MCP Server instance with only whitelisted tools.
 * Auth is via ?token= query param instead of Bearer header.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CustomHTTPTransport } from "../transport/CustomHTTPTransport.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { getPendingTasks, claimTask, completeTask } from "../tools/getTasks.js";
import { getInterrupts } from "../tools/getInterrupts.js";
import { updateStatus } from "../tools/updateStatus.js";
import { sendMessage } from "../tools/sendMessage.js";
import { createTask } from "../tools/createTask.js";
import { checkRateLimit, getRateLimitResetIn } from "../middleware/rateLimiter.js";
import { generateCorrelationId, createAuditLogger } from "../logging/auditLogger.js";

// Whitelisted tools for ISO endpoint
const ISO_TOOL_HANDLERS: Record<string, (auth: AuthContext, args: any) => Promise<any>> = {
  get_pending_tasks: getPendingTasks,
  get_interrupts: getInterrupts,
  update_status: updateStatus,
  send_message: sendMessage,
  create_task: createTask,
  claim_task: claimTask,
  complete_task: completeTask,
};

// ISO tool definitions for ListTools
const ISO_TOOL_DEFINITIONS = [
  {
    name: "get_pending_tasks",
    description: "Get tasks created for programs to work on",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "in_progress", "all"],
          description: "Filter by task status",
          default: "pending",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 50,
          description: "Maximum number of tasks to return",
          default: 10,
        },
        target: {
          type: "string",
          description: "Filter tasks by target program ID. Tasks with a target only appear when caller's target matches.",
          maxLength: 100,
        },
      },
    },
  },
  {
    name: "get_interrupts",
    description: "Check for pending messages from programs",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "ID of the session to check for interrupts",
        },
        markAsRead: {
          type: "boolean",
          description: "Whether to mark interrupts as read after retrieving",
          default: true,
        },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "update_status",
    description: "Update ISO's working status visible in the app",
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
        projectName: {
          type: "string",
          description: "Project/repo name",
          maxLength: 100,
        },
      },
      required: ["status"],
    },
  },
  {
    name: "send_message",
    description: "Send a message or instruction to a running program. Message relay v0.2 — requires source, target, and message_type.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The message to send",
          maxLength: 2000,
        },
        source: {
          type: "string",
          description: "Identifier of sending program (e.g., agent-1, agent-2, user)",
          maxLength: 100,
        },
        target: {
          type: "string",
          description: "Identifier of intended recipient, or 'all' for broadcast",
          maxLength: 100,
        },
        message_type: {
          type: "string",
          enum: ["PING", "PONG", "DIRECTIVE", "STATUS", "ACK", "QUERY", "RESULT"],
          description: "Message relay v0.2 message type",
        },
        priority: {
          type: "string",
          enum: ["low", "normal", "high"],
          description: "Notification priority",
          default: "normal",
        },
        action: {
          type: "string",
          enum: ["interrupt", "sprint", "parallel", "queue", "backlog"],
          description: "Action level for the program",
          default: "queue",
        },
        context: {
          type: "string",
          description: "Context about the message",
          maxLength: 500,
        },
        sessionId: {
          type: "string",
          description: "Target session ID",
        },
        reply_to: {
          type: "string",
          description: "Message ID this is responding to (for threading)",
        },
      },
      required: ["message", "source", "target", "message_type"],
    },
  },
  {
    name: "create_task",
    description: "Create a new task for a program to work on",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title",
          maxLength: 200,
        },
        instructions: {
          type: "string",
          description: "Detailed instructions for the task",
          maxLength: 4000,
        },
        priority: {
          type: "string",
          enum: ["low", "normal", "high"],
          description: "Task priority",
          default: "normal",
        },
        action: {
          type: "string",
          enum: ["interrupt", "sprint", "parallel", "queue", "backlog"],
          description: "Action level — how urgently the program should handle this",
          default: "queue",
        },
        projectId: {
          type: "string",
          description: "Optional project ID to associate with",
        },
        target: {
          type: "string",
          description: "Target program ID (e.g., 'agent-1', 'agent-2'). If set, only that program sees the task when filtering by target.",
          maxLength: 100,
        },
        source: {
          type: "string",
          description: "Source agent ID (e.g., 'agent-1', 'agent-2'). Defaults to 'iso' if not specified.",
          maxLength: 100,
        },
      },
      required: ["title"],
    },
  },
  {
    name: "claim_task",
    description: "Claim a pending task to start working on it",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "ID of the task to claim",
        },
        sessionId: {
          type: "string",
          description: "Optional session ID to associate with this task",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as complete when finished",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "ID of the task to complete",
        },
      },
      required: ["taskId"],
    },
  },
];

// Per-session auth context for ISO (same pattern as main server)
const isoSessions = new Map<string, { authContext: AuthContext; lastActivity: number }>();

const isoSessionAuthContexts = {
  get: (sessionId: string) => isoSessions.get(sessionId)?.authContext,
  set: (sessionId: string, auth: AuthContext) => {
    isoSessions.set(sessionId, { authContext: auth, lastActivity: Date.now() });
  },
};

/**
 * Create and configure the ISO MCP server.
 * Returns the transport for routing requests.
 */
export async function createIsoServer(): Promise<{
  transport: CustomHTTPTransport;
  sessions: typeof isoSessions;
}> {
  const server = new Server(
    { name: "cachebash-iso", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // Register whitelisted tools only
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ISO_TOOL_DEFINITIONS,
  }));

  // Handle tool calls with auth from session
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const sessionId = extra?.sessionId;
    const authContext = sessionId ? isoSessionAuthContexts.get(sessionId) : null;
    const correlationId = generateCorrelationId();
    const startTime = Date.now();

    if (!authContext) {
      return {
        content: [{ type: "text", text: "Error: Not authenticated. Ensure ?token= is set in the connector URL." }],
        isError: true,
      };
    }

    const audit = createAuditLogger(correlationId, authContext.userId);

    // Update session activity
    if (sessionId && isoSessions.has(sessionId)) {
      isoSessions.get(sessionId)!.lastActivity = Date.now();
    }

    // Check rate limit (reuse existing per-user-tool limiter)
    if (!checkRateLimit(authContext.userId, name)) {
      const resetIn = Math.ceil(getRateLimitResetIn(authContext.userId, name) / 1000);
      audit.error(name, "RATE_LIMIT_EXCEEDED", { tool: name, metadata: { source: "iso" } });
      return {
        content: [{ type: "text", text: `Rate limit exceeded for ${name}. Try again in ${resetIn} seconds.` }],
        isError: true,
      };
    }

    // Block non-whitelisted tools
    const handler = ISO_TOOL_HANDLERS[name];
    if (!handler) {
      audit.error(name, "TOOL_NOT_ALLOWED", { tool: name, metadata: { source: "iso" } });
      return {
        content: [{ type: "text", text: `Tool "${name}" is not available on the ISO endpoint.` }],
        isError: true,
      };
    }

    try {
      const result = await handler(authContext, args);
      const durationMs = Date.now() - startTime;
      audit.log(name, { tool: name, durationMs, metadata: { source: "iso" } });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      audit.error(name, error instanceof Error ? error.name : "UNKNOWN_ERROR", {
        tool: name,
        durationMs,
        metadata: { source: "iso" },
      });
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // Create transport
  const transport = new CustomHTTPTransport({
    sessionTimeout: 60 * 60 * 1000,
    enableDnsRebindingProtection: false,
    strictAcceptHeader: false,
    responseQueueTimeout: 2000,
  });

  await server.connect(transport);

  return { transport, sessions: isoSessions };
}

/**
 * Store auth context for an ISO session.
 */
export function setIsoSessionAuth(sessionId: string, auth: AuthContext): void {
  isoSessionAuthContexts.set(sessionId, auth);
}

/**
 * Clean up expired ISO sessions. Call periodically.
 */
export function cleanupIsoSessions(timeoutMs: number): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [sessionId, info] of isoSessions.entries()) {
    if (now - info.lastActivity > timeoutMs) {
      isoSessions.delete(sessionId);
      cleaned++;
    }
  }
  return cleaned;
}
