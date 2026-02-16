/**
 * HTTP Response Builder Helpers
 *
 * Utility functions for constructing consistent HTTP responses.
 * All responses use JSON format with appropriate status codes.
 *
 * JSON-RPC error codes (from spec):
 * -32700: Parse error (invalid JSON)
 * -32600: Invalid request (malformed JSON-RPC)
 * -32601: Method not found
 * -32602: Invalid params
 * -32603: Internal error
 * -32000 to -32099: Server error (custom)
 */

import { ServerResponse } from "http";

/**
 * Send JSON response
 */
export function jsonResponse(res: ServerResponse, statusCode: number, data: any): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Send JSON-RPC error response
 */
export function jsonRpcError(res: ServerResponse, code: number, message: string, id?: string | number): void {
  jsonResponse(res, 200, {
    jsonrpc: "2.0",
    error: { code, message },
    id: id || null,
  });
}

/**
 * Send 401 unauthorized response
 */
export function unauthorizedResponse(res: ServerResponse, message: string): void {
  jsonResponse(res, 401, { error: message });
}

/**
 * Send 500 internal error response
 */
export function internalErrorResponse(res: ServerResponse, message: string): void {
  jsonResponse(res, 500, { error: message });
}
