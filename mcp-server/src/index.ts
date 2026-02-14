#!/usr/bin/env node

import http from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CustomHTTPTransport } from "./transport/CustomHTTPTransport.js";

import { initializeFirebase } from "./firebase/client.js";
import {
  validateApiKey,
  type AuthContext,
} from "./auth/apiKeyValidator.js";
import { askQuestion } from "./tools/askQuestion.js";
import { getResponse } from "./tools/getResponse.js";
import { updateStatus } from "./tools/updateStatus.js";
import { pinTask, resumeTask } from "./tools/pinTask.js";
import { getInterrupts } from "./tools/getInterrupts.js";
import { getPendingTasks, claimTask, completeTask } from "./tools/getTasks.js";
import { createSession } from "./tools/createSession.js";
import { listSessions } from "./tools/listSessions.js";
import { sendAlert } from "./tools/sendAlert.js";
import { sendHeartbeat } from "./tools/sendHeartbeat.js";
import { createSprint } from "./tools/createSprint.js";
import { updateSprintStory } from "./tools/updateSprintStory.js";
import { addStoryToSprint } from "./tools/addStoryToSprint.js";
import { completeSprint } from "./tools/completeSprint.js";
import { sendMessage } from "./tools/sendMessage.js";
import { createTask } from "./tools/createTask.js";
import { checkRateLimit, checkAuthRateLimit, checkIsoRateLimit, cleanupRateLimits, getRateLimitResetIn } from "./middleware/rateLimiter.js";
import { generateCorrelationId, createAuditLogger } from "./logging/auditLogger.js";
import { createIsoServer, setIsoSessionAuth, cleanupIsoSessions } from "./iso/isoServer.js";

// Session timeout (60 minutes of inactivity) - aligned with SessionManager
const SESSION_TIMEOUT_MS = 60 * 60 * 1000;

// Store per-session auth context with activity tracking
interface SessionInfo {
  authContext: AuthContext;
  lastActivity: number;
}
const sessions = new Map<string, SessionInfo>();

// Legacy compatibility - also expose as sessionAuthContexts
const sessionAuthContexts = {
  get: (sessionId: string) => sessions.get(sessionId)?.authContext,
  set: (sessionId: string, auth: AuthContext) => {
    sessions.set(sessionId, { authContext: auth, lastActivity: Date.now() });
  },
};

// Tool handlers mapped by name
const toolHandlers: Record<string, (auth: AuthContext, args: any) => Promise<any>> = {
  ask_question: askQuestion,
  get_response: getResponse,
  update_status: updateStatus,
  pin_task: pinTask,
  resume_task: resumeTask,
  get_interrupts: getInterrupts,
  get_pending_tasks: getPendingTasks,
  claim_task: claimTask,
  complete_task: completeTask,
  create_session: createSession,
  list_sessions: listSessions,
  send_alert: sendAlert,
  send_heartbeat: sendHeartbeat,
  create_sprint: createSprint,
  update_sprint_story: updateSprintStory,
  add_story_to_sprint: addStoryToSprint,
  complete_sprint: completeSprint,
  send_message: sendMessage,
  create_task: createTask,
};

// Helper to extract Bearer token from Authorization header
function extractBearerToken(authHeader: string | undefined): string | null {
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

// Helper to send JSON response
function sendJson(res: http.ServerResponse, status: number, data: object): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// Convert Node.js IncomingMessage to Web API Request
async function nodeRequestToWebRequest(req: http.IncomingMessage): Promise<Request> {
  // Check if socket is TLS
  const protocol = (req.socket as any).encrypted ? 'https' : 'http';
  const host = req.headers.host || 'localhost';
  const url = `${protocol}://${host}${req.url}`;

  // Collect body chunks
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : null;

  // Convert headers
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v));
      } else {
        headers.append(key, value);
      }
    }
  }

  return new Request(url, {
    method: req.method || 'GET',
    headers,
    body,
  });
}

// Convert Web API Response to Node.js ServerResponse
async function webResponseToNodeResponse(
  webResponse: Response,
  nodeResponse: http.ServerResponse
): Promise<void> {
  // Set status
  nodeResponse.statusCode = webResponse.status;

  // Set headers
  webResponse.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });

  // Send body
  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        nodeResponse.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  nodeResponse.end();
}

async function main() {
  // Initialize Firebase Admin SDK
  initializeFirebase();

  // Create MCP server
  const server = new Server(
    {
      name: "cachebash",
      version: "1.0.1",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "ask_question",
          description:
            "Send a question to the user's mobile device and wait for a response",
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
                description: "Optional multiple choice options",
                maxItems: 5,
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
              threadId: {
                type: "string",
                description: "Optional thread ID to group related messages into a conversation",
              },
              inReplyTo: {
                type: "string",
                description: "Optional message ID this is replying to (creates a linked thread)",
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
              projectName: {
                type: "string",
                description: "Project/repo name for this session (e.g., 'CacheBash')",
                maxLength: 100,
              },
            },
            required: ["status"],
          },
        },
        {
          name: "pin_task",
          description:
            "Pin the current task to resume later when user responds",
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
        {
          name: "get_interrupts",
          description:
            "Check for messages sent from the mobile app to the current session",
          inputSchema: {
            type: "object",
            properties: {
              sessionId: {
                type: "string",
                description: "ID of the session to check for interrupts",
              },
              markAsRead: {
                type: "boolean",
                description:
                  "Whether to mark interrupts as read after retrieving",
                default: true,
              },
            },
            required: ["sessionId"],
          },
        },
        {
          name: "get_pending_tasks",
          description:
            "Get tasks created by the user in the mobile app for Claude to work on",
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
                description: "Filter tasks by target program ID. Tasks with a target only appear when caller's target matches. Tasks with no target are always visible.",
                maxLength: 100,
              },
            },
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
        {
          name: "create_session",
          description: "Create a new session to track work progress",
          inputSchema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Name/description of the session",
                maxLength: 200,
              },
              status: {
                type: "string",
                description: "Initial status message",
                maxLength: 200,
              },
              state: {
                type: "string",
                enum: ["working", "blocked", "complete", "pinned"],
                description: "Initial state",
                default: "working",
              },
              progress: {
                type: "number",
                minimum: 0,
                maximum: 100,
                description: "Initial progress percentage",
              },
              projectName: {
                type: "string",
                description: "Project/repo name",
                maxLength: 100,
              },
            },
            required: ["name"],
          },
        },
        {
          name: "list_sessions",
          description: "List active sessions for the authenticated user",
          inputSchema: {
            type: "object",
            properties: {
              state: {
                type: "string",
                enum: ["working", "blocked", "pinned", "complete", "all"],
                description: "Filter by session state",
                default: "all",
              },
              limit: {
                type: "number",
                minimum: 1,
                maximum: 50,
                description: "Maximum number of sessions to return",
                default: 10,
              },
              includeArchived: {
                type: "boolean",
                description: "Include archived sessions",
                default: false,
              },
            },
          },
        },
        {
          name: "send_alert",
          description:
            "Send an alert notification to the user's mobile device. Alerts are one-way notifications (error, warning, success, info) that don't require a response.",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The alert message to send",
                maxLength: 2000,
              },
              alertType: {
                type: "string",
                enum: ["error", "warning", "success", "info"],
                description: "Type of alert",
                default: "info",
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
              sessionId: {
                type: "string",
                description: "Optional session ID to associate with this alert",
              },
            },
            required: ["message"],
          },
        },
        {
          name: "send_heartbeat",
          description:
            "Send a heartbeat for a task you're working on. Prevents task from being marked as orphaned. Call every 10-15 minutes during long-running tasks.",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "ID of the task to send heartbeat for",
              },
              status: {
                type: "string",
                description: "Optional status update message",
                maxLength: 200,
              },
              progress: {
                type: "number",
                minimum: 0,
                maximum: 100,
                description: "Optional progress percentage (0-100)",
              },
            },
            required: ["taskId"],
          },
        },
        {
          name: "create_sprint",
          description:
            "Create a new sprint to track parallel story execution. Called by the orchestrator when starting a new sprint.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: {
                type: "string",
                description: "Project/repo name",
                maxLength: 100,
              },
              branch: {
                type: "string",
                description: "Git branch for this sprint",
                maxLength: 100,
              },
              stories: {
                type: "array",
                description: "Array of stories to include in the sprint",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Story ID (e.g., US-001)" },
                    title: { type: "string", description: "Story title" },
                    wave: { type: "number", description: "Wave number (1-based)" },
                    dependencies: { type: "array", items: { type: "string" }, description: "IDs of blocking stories" },
                    complexity: { type: "string", enum: ["normal", "high"], description: "Story complexity" },
                  },
                  required: ["id", "title"],
                },
              },
              config: {
                type: "object",
                description: "Sprint configuration",
                properties: {
                  orchestratorModel: { type: "string", description: "Model for orchestrator" },
                  subagentModel: { type: "string", description: "Model for subagents" },
                  maxConcurrent: { type: "number", description: "Max parallel subagents" },
                },
              },
              sessionId: {
                type: "string",
                description: "Optional session ID to associate with sprint",
              },
            },
            required: ["projectName", "branch", "stories"],
          },
        },
        {
          name: "update_sprint_story",
          description:
            "Update a story's progress within a sprint. Called by subagents or orchestrator to report progress.",
          inputSchema: {
            type: "object",
            properties: {
              sprintId: {
                type: "string",
                description: "ID of the sprint",
              },
              storyId: {
                type: "string",
                description: "ID of the story to update",
              },
              status: {
                type: "string",
                enum: ["queued", "active", "complete", "failed", "skipped"],
                description: "New status for the story",
              },
              progress: {
                type: "number",
                minimum: 0,
                maximum: 100,
                description: "Progress percentage (0-100)",
              },
              currentAction: {
                type: "string",
                description: "Current action being performed (e.g., 'Running tests (2/4)')",
                maxLength: 200,
              },
              model: {
                type: "string",
                description: "Model being used for this story",
              },
            },
            required: ["sprintId", "storyId"],
          },
        },
        {
          name: "add_story_to_sprint",
          description:
            "Add a new story to a running sprint. Enables dynamic sprint insertion from mobile app or orchestrator.",
          inputSchema: {
            type: "object",
            properties: {
              sprintId: {
                type: "string",
                description: "ID of the sprint to add story to",
              },
              story: {
                type: "object",
                description: "Story to add",
                properties: {
                  id: { type: "string", description: "Story ID" },
                  title: { type: "string", description: "Story title" },
                  dependencies: { type: "array", items: { type: "string" }, description: "IDs of blocking stories" },
                  complexity: { type: "string", enum: ["normal", "high"], description: "Story complexity" },
                },
                required: ["id", "title"],
              },
              insertionMode: {
                type: "string",
                enum: ["current_wave", "next_wave", "backlog"],
                description: "Where to insert the story",
                default: "next_wave",
              },
            },
            required: ["sprintId", "story"],
          },
        },
        {
          name: "complete_sprint",
          description:
            "Mark a sprint as complete. Called by orchestrator when all stories are done or sprint is stopped.",
          inputSchema: {
            type: "object",
            properties: {
              sprintId: {
                type: "string",
                description: "ID of the sprint to complete",
              },
              summary: {
                type: "object",
                description: "Optional summary of sprint results",
                properties: {
                  completed: { type: "number", description: "Number of completed stories" },
                  failed: { type: "number", description: "Number of failed stories" },
                  skipped: { type: "number", description: "Number of skipped stories" },
                  duration: { type: "number", description: "Total duration in seconds" },
                },
              },
            },
            required: ["sprintId"],
          },
        },
        {
          name: "send_message",
          description:
            "Send a message or instruction to another program or session. Grid Relay v0.2 — requires source, target, and message_type.",
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
                description: "Identifier of sending program (e.g., basher, desktop-iso, mobile-iso, flynn)",
                maxLength: 100,
              },
              target: {
                type: "string",
                description: "Identifier of intended recipient, or 'all' for broadcast",
                maxLength: 100,
              },
              message_type: {
                type: "string",
                enum: ["PING", "PONG", "HANDSHAKE", "DIRECTIVE", "STATUS", "ACK", "QUERY", "RESULT"],
                description: "Grid Relay v0.2 message type",
              },
              priority: {
                type: "string",
                enum: ["low", "normal", "high"],
                description: "Notification priority level",
                default: "normal",
              },
              action: {
                type: "string",
                enum: ["interrupt", "sprint", "parallel", "queue", "backlog"],
                description: "Action level for the recipient",
                default: "queue",
              },
              context: {
                type: "string",
                description: "Context about the message",
                maxLength: 500,
              },
              sessionId: {
                type: "string",
                description: "Target session ID (routes to get_interrupts for that session)",
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
          description:
            "Create a new task for another program to work on. Appears in get_pending_tasks for the target.",
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
                description: "Action level - how urgently the target should handle this",
                default: "queue",
              },
              projectId: {
                type: "string",
                description: "Optional project ID to associate with",
              },
              target: {
                type: "string",
                description: "Target program ID (e.g., 'basher', 'iso'). If set, only that program sees the task when filtering by target.",
                maxLength: 100,
              },
              source: {
                type: "string",
                description: "Source program ID (e.g., 'iso', 'basher'). Defaults to 'iso' if not specified.",
                maxLength: 100,
              },
            },
            required: ["title"],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const sessionId = extra?.sessionId;
    const authContext = sessionId ? sessionAuthContexts.get(sessionId) : null;
    const correlationId = generateCorrelationId();
    const startTime = Date.now();

    if (!authContext) {
      return {
        content: [{ type: "text", text: "Error: Not authenticated. Please ensure Authorization header is set." }],
        isError: true,
      };
    }

    const audit = createAuditLogger(correlationId, authContext.userId);

    // Update session activity
    if (sessionId && sessions.has(sessionId)) {
      sessions.get(sessionId)!.lastActivity = Date.now();
    }

    // Check rate limit
    if (!checkRateLimit(authContext.userId, name)) {
      const resetIn = Math.ceil(getRateLimitResetIn(authContext.userId, name) / 1000);
      audit.error(name, "RATE_LIMIT_EXCEEDED", { tool: name });
      return {
        content: [{ type: "text", text: `Rate limit exceeded for ${name}. Try again in ${resetIn} seconds.` }],
        isError: true,
      };
    }

    const handler = toolHandlers[name];
    if (!handler) {
      audit.error(name, "UNKNOWN_TOOL", { tool: name });
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await handler(authContext, args);
      const durationMs = Date.now() - startTime;
      audit.log(name, { tool: name, durationMs });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      audit.error(name, error instanceof Error ? error.name : "UNKNOWN_ERROR", {
        tool: name,
        durationMs,
      });
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // Create custom HTTP transport with relaxed header validation
  const transport = new CustomHTTPTransport({
    sessionTimeout: SESSION_TIMEOUT_MS,
    enableDnsRebindingProtection: false, // Disabled by default
    strictAcceptHeader: false, // Lenient mode - allows Claude Code without Accept header
    responseQueueTimeout: 2000, // 2 second max wait for responses
  });

  // Connect server to transport
  await server.connect(transport);

  // Initialize ISO MCP server (separate instance with whitelisted tools only)
  const { transport: isoTransportInstance } = await createIsoServer();
  let isoTransport: typeof isoTransportInstance | null = isoTransportInstance;
  console.log("[ISO] ISO MCP server initialized with whitelisted tools");

  // Create HTTP server
  const httpServer = http.createServer(async (req, res) => {
    // Log request details
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[${requestId}] ${req.method} ${req.url}`);
    console.log(`[${requestId}] Headers:`, JSON.stringify(req.headers, null, 2));
    const requestStartTime = Date.now();

    // Wrap response.end to log response
    const originalEnd = res.end.bind(res);
    res.end = function(...args: any[]) {
      const duration = Date.now() - requestStartTime;
      console.log(`[${requestId}] Response: ${res.statusCode} (${duration}ms)`);
      console.log(`[${requestId}] Response Headers:`, res.getHeaders());
      return originalEnd(...args);
    } as any;

    // CORS headers
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Mcp-Session-Id"
    );
    // ISO endpoints get permissive CORS (set per-route below)
    // Main MCP endpoints use minimal CORS

    // Handle preflight
    if (req.method === "OPTIONS") {
      // Allow CORS preflight for ISO endpoints
      if (req.url?.startsWith("/v1/iso/")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
      }
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint (required by Cloud Run)
    if (req.url === "/v1/health" || req.url === "/health") {
      try {
        // Test Firestore connectivity
        const { getFirestore } = await import("./firebase/client.js");
        const db = getFirestore();
        const testDoc = await db.collection('health_check').doc('ping').get();

        return sendJson(res, 200, {
          status: "ok",
          version: "1.0.1",
          firestore: "connected",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[Health Check] Firestore connectivity issue:', error);
        // Return 200 with degraded status instead of failing
        return sendJson(res, 200, {
          status: "degraded",
          version: "1.0.1",
          firestore: "error",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Interrupt peek endpoint — lightweight REST for hooks (no MCP session needed)
    // Optional ?sessionId=X filters by target field (only returns messages for that program)
    if (req.url?.startsWith("/v1/interrupts/peek") && req.method === "GET") {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!checkAuthRateLimit(clientIp)) {
        return sendJson(res, 429, { error: "Too many requests" });
      }

      const apiKey = extractBearerToken(req.headers.authorization);
      if (!apiKey) {
        return sendJson(res, 401, { error: "Missing API key" });
      }

      try {
        const authContext = await validateApiKey(apiKey);
        if (!authContext) {
          return sendJson(res, 401, { error: "Invalid API key" });
        }

        // Parse optional sessionId query param for target filtering
        const peekUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const filterSessionId = peekUrl.searchParams.get("sessionId");

        const { getFirestore } = await import("./firebase/client.js");
        const db = getFirestore();

        const snapshot = await db
          .collection(`users/${authContext.userId}/messages`)
          .where("direction", "==", "to_claude")
          .where("status", "==", "pending")
          .orderBy("createdAt", "asc")
          .limit(20) // fetch more, filter in memory by target
          .get();

        if (snapshot.empty) {
          return sendJson(res, 200, { hasInterrupts: false, count: 0 });
        }

        // Filter by target: only return messages targeted at this session or with no target
        const interrupts = snapshot.docs
          .filter((doc) => {
            if (!filterSessionId) return true; // no filter, return all
            const target = doc.data().target;
            return !target || target === filterSessionId;
          })
          .slice(0, 5)
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              message: data.content,
              action: data.action || "queue",
              priority: data.priority || "normal",
              target: data.target || null,
              createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
            };
          });

        if (interrupts.length === 0) {
          return sendJson(res, 200, { hasInterrupts: false, count: 0 });
        }

        return sendJson(res, 200, {
          hasInterrupts: true,
          count: interrupts.length,
          interrupts,
        });
      } catch (error) {
        console.error("[interrupts/peek] Error:", error);
        return sendJson(res, 500, { error: "Internal server error" });
      }
    }

    // Debug endpoints - only available when explicitly opted in
    if (process.env.NODE_ENV === "development") {
      // Debug auth endpoint
      if (req.url === "/v1/debug/auth") {
        const apiKey = extractBearerToken(req.headers.authorization);
        if (!apiKey) {
          return sendJson(res, 401, { error: "Missing Authorization header", hint: "Use: Authorization: Bearer YOUR_API_KEY" });
        }
        try {
          const authContext = await validateApiKey(apiKey);
          if (authContext) {
            return sendJson(res, 200, { success: true, userId: authContext.userId, message: "API key is valid" });
          }
          return sendJson(res, 401, { success: false, error: "Invalid API key", hint: "Regenerate key in app and update claude mcp add command" });
        } catch (error) {
          return sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      // Debug messages endpoint - list messages for authenticated user
      if (req.url === "/v1/debug/messages") {
        const apiKey = extractBearerToken(req.headers.authorization);
        if (!apiKey) {
          return sendJson(res, 401, { error: "Missing Authorization header" });
        }
        try {
          const authContext = await validateApiKey(apiKey);
          if (!authContext) {
            return sendJson(res, 401, { error: "Invalid API key" });
          }
          const { getFirestore } = await import("./firebase/client.js");
          const db = getFirestore();
          const messagesRef = db.collection(`users/${authContext.userId}/messages`);
          const snapshot = await messagesRef.orderBy("createdAt", "desc").limit(10).get();
          const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
          }));
          return sendJson(res, 200, {
            userId: authContext.userId,
            path: `users/${authContext.userId}/messages`,
            count: messages.length,
            messages,
          });
        } catch (error) {
          return sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown error" });
        }
      }
    }

    // --- ISO MCP Connector (authless via ?token= query param) ---
    if (req.url?.startsWith("/v1/iso/")) {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

      // Rate limit: 30 req/min per IP
      if (!checkIsoRateLimit(clientIp)) {
        console.log(`[ISO] Rate limited: ${clientIp}`);
        return sendJson(res, 429, { error: "Too many requests" });
      }

      // CORS for browser-based connectors (claude.ai)
      res.setHeader("Access-Control-Allow-Origin", "*");

      // Parse URL and extract token
      const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = parsedUrl.pathname;

      // ISO health check
      if (pathname === "/v1/iso/health") {
        console.log(`[ISO] Health check from ${clientIp}`);
        return sendJson(res, 200, {
          status: "ok",
          endpoint: "iso",
          version: "1.0.0",
          timestamp: new Date().toISOString(),
        });
      }

      // ISO MCP endpoint
      if (pathname === "/v1/iso/mcp") {
        const token = parsedUrl.searchParams.get("token");
        if (!token) {
          console.log(`[ISO] Missing token from ${clientIp}`);
          return sendJson(res, 401, {
            error: "Missing token",
            hint: "Add ?token=YOUR_API_KEY to the connector URL",
          });
        }

        // Validate API key from query param
        const authContext = await validateApiKey(token);
        if (!authContext) {
          console.log(`[ISO] Invalid token from ${clientIp}`);
          return sendJson(res, 401, {
            error: "Invalid token",
            hint: "Regenerate API key in the CacheBash app",
          });
        }

        console.log(`[ISO] Authenticated: user=${authContext.userId} ip=${clientIp}`);

        // Store auth context for MCP session
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (sessionId) {
          setIsoSessionAuth(sessionId, authContext);
        }

        try {
          const webRequest = await nodeRequestToWebRequest(req);
          const webResponse = await isoTransport!.handleRequest(webRequest, authContext);
          await webResponseToNodeResponse(webResponse, res);
        } catch (error) {
          console.error("[ISO] Transport error:", error);
          if (!res.headersSent) {
            sendJson(res, 500, { error: "Internal server error" });
          }
        }
        return;
      }

      return sendJson(res, 404, { error: "Not found", hint: "ISO MCP endpoint is at /v1/iso/mcp" });
    }

    // MCP endpoints - require authentication (no env fallback for security)
    if (req.url?.startsWith("/v1/mcp") || req.url?.startsWith("/mcp")) {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!checkAuthRateLimit(clientIp)) {
        return sendJson(res, 429, { error: "Too many requests" });
      }

      const apiKey = extractBearerToken(req.headers.authorization);
      if (!apiKey) {
        return sendJson(res, 401, { error: "Missing API key", hint: "Set Authorization: Bearer YOUR_API_KEY header" });
      }

      const authContext = await validateApiKey(apiKey);
      if (!authContext) {
        return sendJson(res, 401, { error: "Invalid API key", hint: "Regenerate key in app and update claude mcp add command" });
      }

      // Store auth context for this session
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId) {
        sessionAuthContexts.set(sessionId, authContext);
      }

      try {
        // Convert Node.js request to Web API Request
        const webRequest = await nodeRequestToWebRequest(req);

        // Handle request with custom transport (passes auth context)
        const webResponse = await transport.handleRequest(webRequest, authContext);

        // Validate response has JSON content type
        const contentType = webResponse.headers.get('Content-Type');
        if (!contentType?.includes('application/json')) {
          console.error('[CRITICAL] Non-JSON response detected!', {
            status: webResponse.status,
            contentType,
            headers: Object.fromEntries(webResponse.headers.entries()),
          });
        }

        // Convert Web API Response to Node.js response
        await webResponseToNodeResponse(webResponse, res);
      } catch (error) {
        console.error("MCP transport error:", error);
        if (!res.headersSent) {
          sendJson(res, 500, { error: "Internal server error" });
        }
      }
      return;
    }

    // 404 for unknown routes
    sendJson(res, 404, { error: "Not found", hint: "MCP endpoint is at /v1/mcp" });
  });

  // Start listening
  const PORT = parseInt(process.env.PORT || "8080", 10);
  httpServer.listen(PORT, () => {
    console.log(`CacheBash MCP server listening on port ${PORT}`);
  });

  // Cleanup expired sessions and rate limits every 5 minutes
  setInterval(() => {
    const now = Date.now();
    let cleanedSessions = 0;

    for (const [sessionId, info] of sessions.entries()) {
      if (now - info.lastActivity > SESSION_TIMEOUT_MS) {
        sessions.delete(sessionId);
        cleanedSessions++;
      }
    }

    const cleanedIsoSessions = cleanupIsoSessions(SESSION_TIMEOUT_MS);

    if (cleanedSessions > 0 || cleanedIsoSessions > 0) {
      console.log(`[Sessions] Cleaned up ${cleanedSessions} main + ${cleanedIsoSessions} ISO inactive sessions`);
    }

    cleanupRateLimits();
  }, 5 * 60 * 1000);

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down...");
    httpServer.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
