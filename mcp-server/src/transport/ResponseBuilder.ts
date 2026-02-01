/**
 * HTTP response construction for CustomHTTPTransport
 */

import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { TransportResponse } from './types.js';

/**
 * Add standard security headers to response
 */
export function addSecurityHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    ...headers,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}

/**
 * Create a JSON response
 */
export function jsonResponse(
  body: JSONRPCMessage | JSONRPCMessage[] | { error: any },
  status: number = 200,
  sessionId?: string
): TransportResponse {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  return {
    status,
    headers: addSecurityHeaders(headers),
    body: JSON.stringify(body),
  };
}

/**
 * Create a JSON-RPC error response
 */
export function jsonRpcError(
  code: number,
  message: string,
  id: string | number | null = null,
  data?: any
): TransportResponse {
  const errorBody = {
    jsonrpc: '2.0' as const,
    id,
    error: {
      code,
      message,
      ...(data && { data }),
    },
  };

  return jsonResponse(errorBody, getHttpStatusForJsonRpcError(code));
}

/**
 * Map JSON-RPC error codes to HTTP status codes
 */
function getHttpStatusForJsonRpcError(code: number): number {
  switch (code) {
    case -32700: // Parse error
      return 400;
    case -32600: // Invalid Request
      return 400;
    case -32601: // Method not found
      return 404;
    case -32602: // Invalid params
      return 400;
    case -32603: // Internal error
      return 500;
    default:
      return 500;
  }
}

/**
 * Create an SSE event stream response (for future GET support)
 */
export function sseStream(sessionId: string): TransportResponse {
  const stream = new ReadableStream({
    start(controller) {
      // Send initial comment to establish connection
      controller.enqueue(new TextEncoder().encode(': connected\n\n'));
    },
  });

  return {
    status: 200,
    headers: addSecurityHeaders({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering in nginx
      'Mcp-Session-Id': sessionId,
    }),
    body: stream,
  };
}

/**
 * Create an SSE event message
 */
export function formatSseEvent(
  data: JSONRPCMessage,
  eventId?: string
): string {
  let event = '';
  if (eventId) {
    event += `id: ${eventId}\n`;
  }
  event += `data: ${JSON.stringify(data)}\n\n`;
  return event;
}

/**
 * Create a 401 Unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): TransportResponse {
  return {
    status: 401,
    headers: addSecurityHeaders({
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer',
    }),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32000,
        message,
      },
    }),
  };
}

/**
 * Create a 404 Not Found response
 */
export function notFoundResponse(message: string = 'Not Found'): TransportResponse {
  return jsonRpcError(-32601, message, null);
}

/**
 * Create a 406 Not Acceptable response
 */
export function notAcceptableResponse(message: string): TransportResponse {
  return {
    status: 406,
    headers: addSecurityHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32000,
        message,
      },
    }),
  };
}

/**
 * Create a 500 Internal Server Error response
 */
export function internalErrorResponse(message: string = 'Internal Server Error'): TransportResponse {
  return jsonRpcError(-32603, message, null);
}
