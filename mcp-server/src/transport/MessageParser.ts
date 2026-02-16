/**
 * JSON-RPC Message Parser
 *
 * MCP uses JSON-RPC 2.0 for message formatting. This parser extracts messages
 * from HTTP request bodies and validates basic structure.
 *
 * JSON-RPC message format:
 * {
 *   "jsonrpc": "2.0",
 *   "method": "tools/call",
 *   "params": { ... },
 *   "id": 1
 * }
 *
 * Special case: "initialize" method
 * - First message in MCP protocol
 * - Establishes protocol version and capabilities
 * - Server responds with available tools and config
 *
 * Error cases:
 * - Invalid JSON: return parse error
 * - Missing required fields: return invalid request error
 * - Wrong JSON-RPC version: return invalid request error
 */

import { IncomingMessage } from "http";
import { ParsedRequest } from "./types.js";

/**
 * Parse JSON body from HTTP request
 */
export async function parseJsonBody(req: IncomingMessage): Promise<ParsedRequest> {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);

        // Validate JSON-RPC structure
        if (parsed.jsonrpc !== "2.0") {
          reject(new Error("Invalid JSON-RPC version"));
          return;
        }

        if (!parsed.method) {
          reject(new Error("Missing required field: method"));
          return;
        }

        resolve({
          method: parsed.method,
          params: parsed.params,
          id: parsed.id,
        });
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

/**
 * Check if a message is an initialize request
 */
export function isInitializeRequest(message: ParsedRequest): boolean {
  return message.method === "initialize";
}
