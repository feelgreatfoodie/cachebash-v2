/**
 * HTTP Transport for MCP Protocol
 *
 * MCP is designed for stdio transport, but that doesn't fit cloud/containerized agents.
 * This transport implements MCP over HTTP with these adaptations:
 *
 * 1. Session management: MCP assumes a persistent connection, HTTP is stateless.
 *    Solution: session IDs in Mcp-Session-Id header, 30min timeout.
 *
 * 2. Request-response pairing: MCP uses JSON-RPC with request/response correlation.
 *    Solution: store responses in a queue per session, client polls for results.
 *
 * 3. Initialize handshake: MCP requires "initialize" message before any tools.
 *    Solution: detect initialize in message parser, create session on first request.
 *
 * HTTP methods:
 * - POST: send MCP message (initialize, tool calls, etc.)
 * - DELETE: close session explicitly
 *
 * Headers:
 * - Content-Type: application/json (required)
 * - Mcp-Session-Id: session identifier (required after initialize)
 * - Authorization: Bearer <token> (required for auth)
 */

import { IncomingMessage, ServerResponse } from "http";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SessionManager } from "./SessionManager.js";
import { parseJsonBody, isInitializeRequest } from "./MessageParser.js";
import { jsonResponse, jsonRpcError, unauthorizedResponse, internalErrorResponse } from "./ResponseBuilder.js";
import { AuthContext } from "../auth/apiKeyValidator.js";

export class HttpTransport implements Transport {
  private sessionId?: string;
  private responseQueue: any[] = [];
  private closeCallback?: () => void;

  constructor(
    private req: IncomingMessage,
    private res: ServerResponse,
    private sessionManager: SessionManager,
    private authContext: AuthContext
  ) {}

  /**
   * Start the transport (called by MCP server)
   */
  async start(): Promise<void> {
    // Parse request body
    const message = await parseJsonBody(this.req);

    // Handle initialize request
    if (isInitializeRequest(message)) {
      this.sessionId = this.sessionManager.createSession(this.authContext);

      // Return session ID in response header
      this.res.setHeader("Mcp-Session-Id", this.sessionId);
      this.res.setHeader("Content-Type", "application/json");
    } else {
      // Validate existing session
      const sessionId = this.req.headers["mcp-session-id"] as string;
      if (!sessionId || !this.sessionManager.validateSession(sessionId)) {
        unauthorizedResponse(this.res, "Invalid or expired session");
        return;
      }
      this.sessionId = sessionId;
    }

    // Emit message to MCP server
    if (this.onmessage) {
      this.onmessage(message);
    }
  }

  /**
   * Send a message (response from MCP server)
   */
  async send(message: any): Promise<void> {
    this.responseQueue.push(message);

    // If this is the final response for the request, send it now
    if (message.result !== undefined || message.error !== undefined) {
      this.flush();
    }
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    if (this.sessionId) {
      this.sessionManager.deleteSession(this.sessionId);
    }

    if (this.closeCallback) {
      this.closeCallback();
    }
  }

  /**
   * Flush response queue to HTTP response
   */
  private flush(): void {
    if (this.responseQueue.length === 0) {
      return;
    }

    // For HTTP, we send the first response and discard the rest
    // (HTTP is request-response, can't send multiple responses)
    const response = this.responseQueue[0];
    jsonResponse(this.res, 200, response);
    this.responseQueue = [];
  }

  // Transport interface properties
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: any) => void;
}
