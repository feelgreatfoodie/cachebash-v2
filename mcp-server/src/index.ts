#!/usr/bin/env node

import http from "http";
import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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
import { checkRateLimit, cleanupRateLimits, getRateLimitResetIn } from "./middleware/rateLimiter.js";
import { generateCorrelationId, createAuditLogger } from "./logging/auditLogger.js";

// Session timeout (30 minutes of inactivity)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

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

async function main() {
  // Initialize Firebase Admin SDK
  initializeFirebase();

  // Create MCP server
  const server = new Server(
    {
      name: "cachebash",
      version: "1.0.0",
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

  // Create HTTP transport for Cloud Run
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  // Connect server to transport
  await server.connect(transport);

  // Create HTTP server
  const httpServer = http.createServer(async (req, res) => {
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
      return sendJson(res, 200, { status: "ok", version: "1.0.0" });
    }

    // Debug endpoints - only available in development
    if (process.env.NODE_ENV !== "production") {
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

      // WORKAROUND: Claude Code v2.0.71+ doesn't send the required Accept header
      // The MCP spec requires "Accept: application/json, text/event-stream" for POST requests
      // but Claude Code's HTTP client has a bug where it doesn't send this header.
      // See: https://github.com/anthropics/claude-code/issues/15523
      //
      // Hono's getRequestListener() reads from req.rawHeaders (array) directly, not req.headers (object).
      // We must modify the rawHeaders array to inject the Accept header if missing.
      // rawHeaders format: ['Header1', 'value1', 'Header2', 'value2', ...]
      if (req.method === "POST" && Array.isArray(req.rawHeaders)) {
        // Check if Accept header already exists (case-insensitive)
        let hasAcceptHeader = false;
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          const headerName = req.rawHeaders[i];
          if (headerName?.toLowerCase() === "accept") {
            hasAcceptHeader = true;
            break;
          }
        }

        // If missing, append Accept header to rawHeaders array
        if (!hasAcceptHeader) {
          req.rawHeaders.push("Accept", "application/json, text/event-stream");
        }
      }

      try {
        await transport.handleRequest(req, res);
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
