/**
 * Transport layer types for CustomHTTPTransport
 */

import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Session information stored in Firestore
 */
export interface SessionInfo {
  sessionId: string;
  userId: string;
  authContext?: {
    apiKey: string;
    userId: string;
  };
  lastActivity: number; // timestamp
  protocolVersion?: string;
  createdAt: number; // timestamp
}

/**
 * Configuration for CustomHTTPTransport
 */
export interface TransportConfig {
  sessionTimeout: number; // milliseconds
  enableDnsRebindingProtection: boolean;
  allowedOrigins?: string[];
  strictAcceptHeader?: boolean; // Default false (lenient for Claude Code)
}

/**
 * Parsed HTTP request with extracted data
 */
export interface ParsedRequest {
  method: string; // HTTP method (GET, POST, DELETE)
  sessionId?: string; // From Mcp-Session-Id header
  contentType?: string;
  accept?: string;
  host?: string;
  origin?: string;
  body?: any; // Parsed JSON body
  headers: Record<string, string>;
}

/**
 * SSE stream management (for future GET support)
 */
export interface SSEStream {
  sessionId: string;
  controller: ReadableStreamDefaultController;
  lastEventId?: string;
}

/**
 * Transport response format
 */
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body?: string | ReadableStream;
}

/**
 * Session validation result
 */
export interface SessionValidation {
  valid: boolean;
  session?: SessionInfo;
  error?: string;
}

/**
 * Message parsing result
 */
export interface ParseResult {
  success: boolean;
  message?: JSONRPCMessage | JSONRPCMessage[];
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
