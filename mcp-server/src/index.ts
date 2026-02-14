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
import { checkRateLimit, cleanupRateLimits, getRateLimitResetIn } from "./middleware/rateLimiter.js";
import { generateCorrelationId, createAuditLogger } from "./logging/auditLogger.js";

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

    // Minimal CORS - MCP clients don't need browser CORS
    // Only allow specific headers needed for MCP protocol
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Mcp-Session-Id"
    );

    // Handle preflight (no origin = no CORS response)
    if (req.method === "OPTIONS") {
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
    if (req.url === "/v1/interrupts/peek" && req.method === "GET") {
      const apiKey = extractBearerToken(req.headers.authorization);
      if (!apiKey) {
        return sendJson(res, 401, { error: "Missing API key" });
      }

      try {
        const authContext = await validateApiKey(apiKey);
        if (!authContext) {
          return sendJson(res, 401, { error: "Invalid API key" });
        }

        const { getFirestore } = await import("./firebase/client.js");
        const db = getFirestore();

        const snapshot = await db
          .collection(`users/${authContext.userId}/messages`)
          .where("direction", "==", "to_claude")
          .where("status", "==", "pending")
          .orderBy("createdAt", "asc")
          .limit(5)
          .get();

        if (snapshot.empty) {
          return sendJson(res, 200, { hasInterrupts: false, count: 0 });
        }

        const interrupts = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            message: data.content,
            action: data.action || "queue",
            priority: data.priority || "normal",
            createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          };
        });

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

    // MCP endpoints - require authentication (no env fallback for security)
    if (req.url?.startsWith("/v1/mcp") || req.url?.startsWith("/mcp")) {
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

    if (cleanedSessions > 0) {
      console.log(`[Sessions] Cleaned up ${cleanedSessions} inactive sessions`);
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
