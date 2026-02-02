/**
 * Message parsing and validation for JSON-RPC messages
 */

import { JSONRPCMessage, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { ParseResult } from './types.js';

/**
 * Parse JSON body from HTTP request
 */
export function parseJsonBody(body: string): ParseResult {
  if (body === null || body === undefined || body === '') {
    console.error('[MessageParser] Received null/empty body');
    return {
      success: false,
      error: {
        code: -32700,
        message: 'Parse error: Request body is empty',
        data: { receivedBody: body },
      },
    };
  }

  try {
    const parsed = JSON.parse(body);

    // Handle batch messages (array)
    if (Array.isArray(parsed)) {
      const messages: JSONRPCMessage[] = [];
      for (const item of parsed) {
        const result = JSONRPCMessageSchema.safeParse(item);
        if (!result.success) {
          return {
            success: false,
            error: {
              code: -32600,
              message: 'Invalid Request: Batch message contains invalid JSON-RPC message',
              data: result.error.format(),
            },
          };
        }
        messages.push(result.data);
      }
      return { success: true, message: messages };
    }

    // Handle single message
    const result = JSONRPCMessageSchema.safeParse(parsed);
    if (!result.success) {
      return {
        success: false,
        error: {
          code: -32600,
          message: 'Invalid Request: Not a valid JSON-RPC message',
          data: result.error.format(),
        },
      };
    }

    return { success: true, message: result.data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: -32700,
        message: 'Parse error: Invalid JSON',
        data: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Validate a JSON-RPC message
 */
export function validateJsonRpcMessage(message: unknown): ParseResult {
  const result = JSONRPCMessageSchema.safeParse(message);
  if (!result.success) {
    return {
      success: false,
      error: {
        code: -32600,
        message: 'Invalid Request: Not a valid JSON-RPC message',
        data: result.error.format(),
      },
    };
  }
  return { success: true, message: result.data };
}

/**
 * Check if a message is an initialize request
 */
export function isInitializeRequest(message: JSONRPCMessage): boolean {
  return (
    'method' in message &&
    message.method === 'initialize' &&
    'id' in message
  );
}

/**
 * Check if a message is a notification (no id field)
 */
export function isNotification(message: JSONRPCMessage): boolean {
  return 'method' in message && !('id' in message);
}

/**
 * Check if a message is a request (has id field)
 */
export function isRequest(message: JSONRPCMessage): boolean {
  return 'method' in message && 'id' in message;
}

/**
 * Check if a message is a response (has result or error)
 */
export function isResponse(message: JSONRPCMessage): boolean {
  return 'id' in message && ('result' in message || 'error' in message);
}

/**
 * Extract request ID from a message if present
 */
export function getRequestId(message: JSONRPCMessage): string | number | null {
  if ('id' in message && message.id !== undefined) {
    return message.id;
  }
  return null;
}
