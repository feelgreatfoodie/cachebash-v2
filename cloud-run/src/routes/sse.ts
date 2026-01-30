import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { logger } from "../lib/logger";
import { handleToolCall, toolDefinitions } from "../mcp/protocol";
import { ToolResponse } from "../mcp/types";

const router = Router();

// Track active SSE connections
interface SSEConnection {
  id: string;
  userId: string;
  response: Response;
  lastEventId: number;
  connectedAt: Date;
}

const activeConnections = new Map<string, SSEConnection>();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL_MS = 30000;

export function sendSSEEvent(
  res: Response,
  eventId: number,
  eventType: string,
  data: unknown
): void {
  res.write(`id: ${eventId}\n`);
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function broadcastToUser(userId: string, eventType: string, data: unknown): void {
  for (const conn of activeConnections.values()) {
    if (conn.userId === userId) {
      conn.lastEventId++;
      sendSSEEvent(conn.response, conn.lastEventId, eventType, data);
    }
  }
}

export function getConnectionCount(userId?: string): number {
  if (userId === undefined) {
    return activeConnections.size;
  }
  let count = 0;
  for (const conn of activeConnections.values()) {
    if (conn.userId === userId) {
      count++;
    }
  }
  return count;
}

export function closeAllConnections(reason: string): void {
  for (const conn of activeConnections.values()) {
    conn.lastEventId++;
    sendSSEEvent(conn.response, conn.lastEventId, "server-event", {
      type: reason,
      message: "Server is shutting down. Please reconnect.",
    });
    conn.response.end();
  }
  activeConnections.clear();
}

router.get("/sse", authMiddleware, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const connectionId = uuidv4();
  const userId = authReq.auth.userId;

  // Parse Last-Event-ID for reconnection
  const lastEventIdHeader = req.headers["last-event-id"];
  let lastEventId = 0;
  if (typeof lastEventIdHeader === "string") {
    const parsed = parseInt(lastEventIdHeader, 10);
    if (!isNaN(parsed)) {
      lastEventId = parsed;
    }
  }

  logger.info("SSE connection opened", {
    connectionId,
    userId,
    lastEventId,
    action: "sse_connect",
  });

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();

  // Store connection
  const connection: SSEConnection = {
    id: connectionId,
    userId,
    response: res,
    lastEventId,
    connectedAt: new Date(),
  };
  activeConnections.set(connectionId, connection);

  // Send initial connected event
  connection.lastEventId++;
  sendSSEEvent(res, connection.lastEventId, "connected", {
    connectionId,
    userId,
    reconnected: lastEventId > 0,
  });

  // Set up heartbeat
  const heartbeatInterval = setInterval(() => {
    if (activeConnections.has(connectionId)) {
      const conn = activeConnections.get(connectionId);
      if (conn !== undefined) {
        conn.lastEventId++;
        sendSSEEvent(conn.response, conn.lastEventId, "heartbeat", {
          timestamp: new Date().toISOString(),
        });
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Handle client disconnect
  req.on("close", () => {
    clearInterval(heartbeatInterval);
    activeConnections.delete(connectionId);

    logger.info("SSE connection closed", {
      connectionId,
      userId,
      action: "sse_disconnect",
    });
  });

  // Handle errors
  req.on("error", (error) => {
    clearInterval(heartbeatInterval);
    activeConnections.delete(connectionId);

    logger.error("SSE connection error", {
      connectionId,
      userId,
      error: error.message,
      action: "sse_error",
    });
  });
});

// POST /messages - Handle MCP protocol messages
router.post("/messages", authMiddleware, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.auth.userId;

  const body = req.body as Record<string, unknown>;
  const method = body.method as string;

  logger.info("MCP message received", {
    userId,
    method,
    action: "mcp_message",
  });

  // Handle initialize request (required by MCP protocol)
  if (method === "initialize") {
    res.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "cachebash-mcp",
          version: "1.0.0",
        },
      },
    });
    return;
  }

  // Handle notifications/initialized (client acknowledgment)
  if (method === "notifications/initialized") {
    // No response needed for notifications
    res.status(204).send();
    return;
  }

  // Handle ping
  if (method === "ping") {
    res.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {},
    });
    return;
  }

  // Handle list_tools request
  if (method === "tools/list") {
    res.json({
      jsonrpc: "2.0",
      id: body.id,
      result: { tools: toolDefinitions },
    });
    return;
  }

  // Handle tool calls asynchronously
  handleToolCall({ userId, apiKey: authReq.auth.apiKey }, body)
    .then((response: ToolResponse) => {
      // Also broadcast the response to any active SSE connections for this user
      broadcastToUser(userId, "tool-response", response);
      res.json(response);
    })
    .catch((error: unknown) => {
      logger.error("MCP message handler error", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        action: "mcp_message_error",
      });
      res.status(500).json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: { code: -32603, message: "Internal error" },
      });
    });
});

export { router as sseRouter, activeConnections };
