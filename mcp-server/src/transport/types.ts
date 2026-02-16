/**
 * Transport Type Definitions
 *
 * Types used by the custom HTTP transport layer for MCP protocol.
 */

import { AuthContext } from "../auth/apiKeyValidator.js";

export interface TransportConfig {
  sessionTimeoutMs: number;
}

export interface ParsedRequest {
  method: string;
  params?: any;
  id?: string | number;
}

export interface TransportResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
  };
  id?: string | number;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  authContext: AuthContext;
  createdAt: Date;
  lastActivity: Date;
}
