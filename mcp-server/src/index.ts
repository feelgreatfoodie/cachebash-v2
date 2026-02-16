/**
 * MCP Server Entry Point
 *
 * This server provides async task dispatch for AI agent networks using the Model Context Protocol.
 * Two transport layers:
 *   1. MCP-native JSON-RPC over HTTP (primary)
 *   2. REST API fallback for environments without MCP client support
 *
 * Design decisions:
 * - Custom HTTP transport instead of stdio: agents run in diverse environments (cloud functions,
 *   containers, serverless), stdio doesn't fit. HTTP gives us auth, multiplexing, and observability.
 * - Session-based connections: MCP spec requires session continuity, but HTTP is stateless. We track
 *   sessions with 30min timeout to balance resource cleanup with agent reconnection tolerance.
 * - Bearer token auth: API keys hashed with SHA-256, looked up in Firestore. Hash on every request
 *   keeps the attack surface minimal (no in-memory session cache to breach).
 */

import http from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { HttpTransport } from "./transport/HttpTransport.js";
import { SessionManager } from "./transport/SessionManager.js";
import { handleRestRequest } from "./transport/rest.js";
import { validateApiKey } from "./auth/apiKeyValidator.js";
import { toolRegistry } from "./tools.js";
import { jsonResponse } from "./transport/ResponseBuilder.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Session manager tracks active MCP connections
const sessionManager = new SessionManager(SESSION_TIMEOUT_MS);

// MCP server instance
const mcpServer = new Server(
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

// Register all tools from the tool registry
for (const [toolName, { handler, schema }] of Object.entries(toolRegistry)) {
  mcpServer.setRequestHandler({ method: "tools/call", params: { name: toolName } } as any, async (request: any) => {
    // Extract auth context from session
    const sessionId = request.params?._meta?.sessionId;
    if (!sessionId) {
      throw new Error("Missing session ID in tool call");
    }

    const session = sessionManager.getSession(sessionId);
    if (!session?.authContext) {
      throw new Error("Unauthorized: invalid or expired session");
    }

    // Call the tool handler with auth context and arguments
    return handler(session.authContext, request.params.arguments || {});
  });
}

// List available tools
mcpServer.setRequestHandler({ method: "tools/list" } as any, async () => {
  return {
    tools: Object.entries(toolRegistry).map(([name, { schema }]) => ({
      name,
      description: schema.description,
      inputSchema: schema.inputSchema,
    })),
  };
});

// HTTP server handles both MCP and REST requests
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  // Health check endpoint
  if (req.method === "GET" && url.pathname === "/v1/health") {
    jsonResponse(res, 200, { status: "ok", timestamp: new Date().toISOString() });
    return;
  }

  // MCP endpoint: /v1/mcp
  if (url.pathname === "/v1/mcp") {
    // Auth validation
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing or invalid Authorization header" }));
      return;
    }

    const apiKey = authHeader.substring(7);
    const authContext = await validateApiKey(apiKey);
    if (!authContext) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid API key" }));
      return;
    }

    // Create custom HTTP transport for this request
    const transport = new HttpTransport(req, res, sessionManager, authContext);

    // Connect MCP server to this transport
    await mcpServer.connect(transport);
    return;
  }

  // REST API fallback: /v1/*
  if (url.pathname.startsWith("/v1/")) {
    await handleRestRequest(req, res, validateApiKey);
    return;
  }

  // Not found
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`CacheBash MCP server listening on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/v1/mcp`);
  console.log(`REST API: http://localhost:${PORT}/v1/*`);
  console.log(`Health check: http://localhost:${PORT}/v1/health`);
});
