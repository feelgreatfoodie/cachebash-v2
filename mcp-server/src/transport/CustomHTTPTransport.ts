/**
 * Custom HTTP Transport for MCP Server
 *
 * Implements the Transport interface with relaxed Accept header validation
 * to work with Claude Code's buggy client (missing Accept header).
 *
 * Architecture:
 * - POST: JSON-RPC message processing (JSON responses only)
 * - GET: SKIPPED in v1 (SSE streaming deferred to future)
 * - DELETE: Session cleanup
 * - Firestore-backed session storage (Cloud Run scales to zero)
 */

import { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from './SessionManager.js';
import { TransportConfig, ParsedRequest, TransportResponse, SessionInfo } from './types.js';
import { parseJsonBody, isInitializeRequest } from './MessageParser.js';
import {
  jsonResponse,
  jsonRpcError,
  unauthorizedResponse,
  notAcceptableResponse,
  internalErrorResponse,
} from './ResponseBuilder.js';
import { validateRequestHeaders } from '../security/dns-rebinding.js';

/**
 * CustomHTTPTransport - MCP transport with relaxed header validation
 */
export class CustomHTTPTransport implements Transport {
  private config: TransportConfig;
  private sessionManager: SessionManager;
  private pendingResponses: Map<string, JSONRPCMessage[]> = new Map();
  public sessionId?: string;

  // Transport callbacks
  public onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;

  constructor(config: TransportConfig) {
    this.config = config;
    this.sessionManager = new SessionManager(config.sessionTimeout);
  }

  /**
   * Start the transport (no-op for HTTP)
   */
  async start(): Promise<void> {
    console.log('[CustomHTTPTransport] Transport started');
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    console.log('[CustomHTTPTransport] Transport closed');
    this.onclose?.();
  }

  /**
   * Send a message back to the client
   */
  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    if (!this.sessionId) {
      throw new Error('Cannot send message: no active session');
    }

    // Store response to be sent in HTTP response
    if (!this.pendingResponses.has(this.sessionId)) {
      this.pendingResponses.set(this.sessionId, []);
    }
    this.pendingResponses.get(this.sessionId)!.push(message);

    console.log('[CustomHTTPTransport] Message queued for session', this.sessionId);
  }

  /**
   * Set the protocol version (called after initialize)
   */
  setProtocolVersion(version: string): void {
    console.log('[CustomHTTPTransport] Protocol version set:', version);
    // Store in session if we have one
    if (this.sessionId) {
      // Note: This is synchronous, but setProtocolVersion in SessionManager is async
      // We'll need to handle this carefully in handleRequest
    }
  }

  /**
   * Extract error message from unknown error type
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Main entry point - handle an HTTP request
   */
  async handleRequest(
    request: Request,
    authContext?: { apiKey: string; userId: string }
  ): Promise<Response> {
    try {
      // Parse request
      const parsed = await this.parseRequest(request);

      // Validate headers (DNS rebinding protection, Accept header)
      const headerValidation = this.validateHeaders(parsed);
      if (!headerValidation.valid) {
        return this.createResponse(headerValidation.response!);
      }

      // Route by HTTP method
      switch (parsed.method) {
        case 'POST':
          return await this.handlePost(parsed, authContext);
        case 'GET':
          // SSE streaming - deferred to v2
          return this.createResponse(
            jsonRpcError(-32601, 'GET method not supported in v1 (SSE deferred)', null)
          );
        case 'DELETE':
          return await this.handleDelete(parsed, authContext);
        default:
          return this.createResponse(
            jsonRpcError(-32601, `Method not allowed: ${parsed.method}`, null)
          );
      }
    } catch (error) {
      console.error('[CustomHTTPTransport] Request handling error:', error);
      return this.createResponse(internalErrorResponse(this.getErrorMessage(error)));
    }
  }

  /**
   * Parse HTTP request into structured data
   */
  private async parseRequest(request: Request): Promise<ParsedRequest> {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    let body: any;
    if (request.method === 'POST') {
      const text = await request.text();
      body = text ? text : null;
    }

    return {
      method: request.method,
      sessionId: headers['mcp-session-id'],
      contentType: headers['content-type'],
      accept: headers['accept'],
      host: headers['host'],
      origin: headers['origin'],
      body,
      headers,
    };
  }

  /**
   * Validate request headers
   */
  private validateHeaders(parsed: ParsedRequest): { valid: boolean; response?: TransportResponse } {
    // DNS rebinding protection (if enabled)
    if (this.config.enableDnsRebindingProtection) {
      const dnsValidation = validateRequestHeaders(
        parsed.host,
        parsed.origin,
        this.config.allowedOrigins
      );
      if (!dnsValidation.valid) {
        return {
          valid: false,
          response: unauthorizedResponse(dnsValidation.error!),
        };
      }
    }

    // Accept header validation (lenient mode by default)
    if (parsed.method === 'POST') {
      if (this.config.strictAcceptHeader) {
        // Strict mode: require BOTH application/json AND text/event-stream
        if (!parsed.accept?.includes('application/json') || !parsed.accept?.includes('text/event-stream')) {
          return {
            valid: false,
            response: notAcceptableResponse(
              'Not Acceptable: Client must accept both application/json and text/event-stream'
            ),
          };
        }
      } else {
        // Lenient mode: Accept header optional (allows Claude Code)
        if (parsed.accept) {
          // If present, must include at least one valid type
          if (!parsed.accept.includes('application/json') && !parsed.accept.includes('text/event-stream')) {
            return {
              valid: false,
              response: notAcceptableResponse(
                'Not Acceptable: Accept header must include application/json or text/event-stream'
              ),
            };
          }
          // Log spec-compliant clients
          if (parsed.accept.includes('application/json') && parsed.accept.includes('text/event-stream')) {
            console.log('[CustomHTTPTransport] Client sent proper Accept header - spec compliant');
          }
        } else {
          // No Accept header - log for monitoring
          console.warn('[CustomHTTPTransport] Client missing Accept header - lenient mode allows this');
        }
      }

      // Content-Type validation
      if (!parsed.contentType?.includes('application/json')) {
        return {
          valid: false,
          response: jsonRpcError(-32600, 'Invalid Request: Content-Type must be application/json', null),
        };
      }
    }

    return { valid: true };
  }

  /**
   * Handle POST request (JSON-RPC message processing)
   */
  private async handlePost(
    parsed: ParsedRequest,
    authContext?: { apiKey: string; userId: string }
  ): Promise<Response> {
    if (!authContext) {
      return this.createResponse(unauthorizedResponse('Missing authentication'));
    }

    // Parse JSON-RPC message
    const parseResult = parseJsonBody(parsed.body);
    if (!parseResult.success) {
      return this.createResponse(
        jsonRpcError(parseResult.error!.code, parseResult.error!.message, null, parseResult.error!.data)
      );
    }

    const message = parseResult.message!;
    const messages = Array.isArray(message) ? message : [message];

    // Check if this is an initialize request
    const hasInitialize = messages.some(m => isInitializeRequest(m));

    // Session handling
    let session: SessionInfo;

    if (hasInitialize) {
      // Initialize request - create new session
      if (parsed.sessionId) {
        return this.createResponse(
          jsonRpcError(-32600, 'Invalid Request: Initialize request must not include Mcp-Session-Id', null)
        );
      }

      session = await this.sessionManager.createSession(authContext.userId, authContext);
      this.sessionId = session.sessionId;
      console.log('[CustomHTTPTransport] New session created:', this.sessionId);
    } else {
      // Non-initialize request - validate existing session
      if (!parsed.sessionId) {
        return this.createResponse(
          jsonRpcError(-32600, 'Invalid Request: Mcp-Session-Id header is required', null)
        );
      }

      const validation = await this.sessionManager.validateSession(parsed.sessionId, authContext.userId);
      if (!validation.valid) {
        return this.createResponse(
          jsonRpcError(-32001, `Session error: ${validation.error}`, null)
        );
      }

      session = validation.session!;
      this.sessionId = session.sessionId;
    }

    // Process messages
    try {
      // Clear pending responses for this session
      this.pendingResponses.delete(this.sessionId);

      // Emit messages to MCP server via onmessage callback
      for (const msg of messages) {
        if (this.onmessage) {
          // Note: MessageExtraInfo doesn't have authInfo field in SDK 1.25.3
          // The auth context is passed separately to handleRequest
          this.onmessage(msg);
        }
      }

      // Wait briefly for responses to be queued via send()
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get queued responses
      const responses = this.pendingResponses.get(this.sessionId) || [];
      this.pendingResponses.delete(this.sessionId);

      // Return response(s)
      if (responses.length === 0) {
        // No response - this might be notifications
        // Return 204 No Content with empty body
        return new Response(null, {
          status: 204,
          headers: {
            'Mcp-Session-Id': this.sessionId,
          },
        });
      } else if (responses.length === 1) {
        return this.createResponse(jsonResponse(responses[0], 200, this.sessionId));
      } else {
        // Batch response
        return this.createResponse(jsonResponse(responses, 200, this.sessionId));
      }
    } catch (error) {
      console.error('[CustomHTTPTransport] Error processing messages:', error);
      return this.createResponse(internalErrorResponse(this.getErrorMessage(error)));
    }
  }

  /**
   * Handle DELETE request (session cleanup)
   */
  private async handleDelete(
    parsed: ParsedRequest,
    authContext?: { apiKey: string; userId: string }
  ): Promise<Response> {
    if (!authContext) {
      return this.createResponse(unauthorizedResponse('Missing authentication'));
    }

    if (!parsed.sessionId) {
      return this.createResponse(
        jsonRpcError(-32600, 'Invalid Request: Mcp-Session-Id header is required', null)
      );
    }

    try {
      await this.sessionManager.deleteSession(parsed.sessionId, authContext.userId);
      // Return simple 200 OK with empty response
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('[CustomHTTPTransport] Error deleting session:', error);
      return this.createResponse(internalErrorResponse(this.getErrorMessage(error)));
    }
  }

  /**
   * Convert TransportResponse to Web API Response
   */
  private createResponse(transportResponse: TransportResponse): Response {
    const { status, headers, body } = transportResponse;

    return new Response(body, {
      status,
      headers,
    });
  }
}
