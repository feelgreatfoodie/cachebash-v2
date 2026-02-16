/**
 * REST API Router
 *
 * Provides HTTP REST fallback for environments without MCP client support.
 * Full parity with MCP tools, just different transport layer.
 *
 * Why REST in addition to MCP:
 * - Not all environments have MCP client libraries (yet)
 * - REST is universal: curl, fetch, any HTTP client works
 * - Debugging is easier: can inspect/replay requests with standard tools
 *
 * API design:
 * - RESTful resource paths: /v1/tasks, /v1/messages, /v1/sessions
 * - Standard HTTP verbs: GET (read), POST (create), PATCH (update)
 * - Query params for filters: ?status=created&type=task
 * - Consistent response format: { success, data?, error?, meta: { timestamp } }
 *
 * Auth flow:
 * - Same as MCP: Authorization: Bearer <token>
 * - validateApiKey returns AuthContext
 * - Each handler gets auth context and can verify permissions
 *
 * Path parameter parsing:
 * - /v1/tasks/:id/claim matches /v1/tasks/abc123/claim
 * - Extract "id" param, pass to handler
 * - Regex-based matching for simplicity (no router library needed)
 */

import { IncomingMessage, ServerResponse } from "http";
import { jsonResponse } from "./ResponseBuilder.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import * as taskHandlers from "../modules/tasks.js";
import * as messageHandlers from "../modules/messages.js";
import * as sessionHandlers from "../modules/sessions.js";
import * as questionHandlers from "../modules/questions.js";

type RouteHandler = (auth: AuthContext, args: any) => Promise<any>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
  extractParams: (pathname: string) => Record<string, string>;
}

/**
 * Parse request body as JSON
 */
async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Parse query parameters and coerce types
 */
function parseQuery(url: string): Record<string, any> {
  const parsed = new URL(url, "http://localhost");
  const params: Record<string, any> = {};

  for (const [key, value] of parsed.searchParams.entries()) {
    // Coerce numeric values
    if (/^\d+$/.test(value)) {
      params[key] = parseInt(value, 10);
    }
    // Coerce boolean values
    else if (value === "true" || value === "false") {
      params[key] = value === "true";
    }
    // Keep as string
    else {
      params[key] = value;
    }
  }

  return params;
}

/**
 * Define routes with pattern matching
 */
const routes: Route[] = [
  // Tasks
  {
    method: "GET",
    pattern: /^\/v1\/tasks$/,
    handler: taskHandlers.getTasksHandler,
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: /^\/v1\/tasks$/,
    handler: taskHandlers.createTaskHandler,
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: /^\/v1\/tasks\/([^/]+)\/claim$/,
    handler: taskHandlers.claimTaskHandler,
    extractParams: (pathname) => {
      const match = pathname.match(/^\/v1\/tasks\/([^/]+)\/claim$/);
      return { taskId: match?.[1] || "" };
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/tasks\/([^/]+)\/complete$/,
    handler: taskHandlers.completeTaskHandler,
    extractParams: (pathname) => {
      const match = pathname.match(/^\/v1\/tasks\/([^/]+)\/complete$/);
      return { taskId: match?.[1] || "" };
    },
  },

  // Messages
  {
    method: "GET",
    pattern: /^\/v1\/messages$/,
    handler: messageHandlers.getMessagesHandler,
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: /^\/v1\/messages$/,
    handler: messageHandlers.sendMessageHandler,
    extractParams: () => ({}),
  },

  // Sessions
  {
    method: "GET",
    pattern: /^\/v1\/sessions$/,
    handler: sessionHandlers.listSessionsHandler,
    extractParams: () => ({}),
  },
  {
    method: "POST",
    pattern: /^\/v1\/sessions$/,
    handler: sessionHandlers.createSessionHandler,
    extractParams: () => ({}),
  },
  {
    method: "PATCH",
    pattern: /^\/v1\/sessions\/([^/]+)$/,
    handler: sessionHandlers.updateSessionHandler,
    extractParams: (pathname) => {
      const match = pathname.match(/^\/v1\/sessions\/([^/]+)$/);
      return { sessionId: match?.[1] || "" };
    },
  },

  // Questions
  {
    method: "POST",
    pattern: /^\/v1\/questions$/,
    handler: questionHandlers.askQuestionHandler,
    extractParams: () => ({}),
  },
  {
    method: "GET",
    pattern: /^\/v1\/questions\/([^/]+)\/response$/,
    handler: questionHandlers.getResponseHandler,
    extractParams: (pathname) => {
      const match = pathname.match(/^\/v1\/questions\/([^/]+)\/response$/);
      return { questionId: match?.[1] || "" };
    },
  },

  // Alerts
  {
    method: "POST",
    pattern: /^\/v1\/alerts$/,
    handler: questionHandlers.sendAlertHandler,
    extractParams: () => ({}),
  },
];

/**
 * Handle REST API request
 */
export async function handleRestRequest(
  req: IncomingMessage,
  res: ServerResponse,
  validateApiKey: (apiKey: string) => Promise<AuthContext | null>
): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method || "GET";

  // Find matching route
  const route = routes.find((r) => r.method === method && r.pattern.test(pathname));

  if (!route) {
    jsonResponse(res, 404, {
      success: false,
      error: "Not found",
      meta: { timestamp: new Date().toISOString() },
    });
    return;
  }

  // Validate auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    jsonResponse(res, 401, {
      success: false,
      error: "Missing or invalid Authorization header",
      meta: { timestamp: new Date().toISOString() },
    });
    return;
  }

  const apiKey = authHeader.substring(7);
  const authContext = await validateApiKey(apiKey);
  if (!authContext) {
    jsonResponse(res, 401, {
      success: false,
      error: "Invalid API key",
      meta: { timestamp: new Date().toISOString() },
    });
    return;
  }

  // Parse body and query params
  try {
    const body = await parseBody(req);
    const query = parseQuery(req.url || "");
    const pathParams = route.extractParams(pathname);
    const args = { ...query, ...body, ...pathParams };

    // Call handler
    const result = await route.handler(authContext, args);

    // Extract data from MCP format
    const data = result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;

    jsonResponse(res, 200, {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error("REST handler error:", error);
    jsonResponse(res, 400, {
      success: false,
      error: error.message || "Bad request",
      meta: { timestamp: new Date().toISOString() },
    });
  }
}
