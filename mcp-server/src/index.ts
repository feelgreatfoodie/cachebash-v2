#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { initializeFirebase } from "./firebase/client.js";
import { validateApiKey, getAuthContext } from "./auth/apiKeyValidator.js";
import { askQuestion } from "./tools/askQuestion.js";
import { getResponse } from "./tools/getResponse.js";
import { updateStatus } from "./tools/updateStatus.js";
import { pinTask, resumeTask } from "./tools/pinTask.js";
import { getInterrupts } from "./tools/getInterrupts.js";

async function main() {
  // Get API key from environment
  const apiKey = process.env.CACHEBASH_API_KEY;

  if (!apiKey) {
    console.error("Error: CACHEBASH_API_KEY environment variable is required");
    process.exit(1);
  }

  // Initialize Firebase Admin SDK
  initializeFirebase();

  // Validate API key and get user context
  const authContext = await validateApiKey(apiKey);
  if (!authContext) {
    console.error("Error: Invalid API key");
    process.exit(1);
  }

  console.error(`Authenticated as user: ${authContext.userId}`);

  // Create MCP server
  const server = new Server(
    {
      name: "cachebash",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "ask_question",
          description:
            "Send a question to the user's mobile device and wait for a response",
          inputSchema: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "The question to ask the user",
              },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Optional multiple choice options",
              },
              priority: {
                type: "string",
                enum: ["low", "normal", "high"],
                description: "Notification priority level",
                default: "normal",
              },
              context: {
                type: "string",
                description: "Context about what you're working on",
              },
            },
            required: ["question"],
          },
        },
        {
          name: "get_response",
          description: "Check if the user has responded to a question",
          inputSchema: {
            type: "object",
            properties: {
              questionId: {
                type: "string",
                description: "The ID of the question to check",
              },
            },
            required: ["questionId"],
          },
        },
        {
          name: "update_status",
          description: "Update the current working status visible in the app",
          inputSchema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                description: "Status message to display",
              },
              progress: {
                type: "number",
                minimum: 0,
                maximum: 100,
                description: "Progress percentage (0-100)",
              },
              state: {
                type: "string",
                enum: ["working", "blocked", "complete", "pinned"],
                description: "Current state",
                default: "working",
              },
            },
            required: ["status"],
          },
        },
        {
          name: "pin_task",
          description:
            "Pin the current task to resume later when user responds",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "Unique identifier for this task",
              },
              questionId: {
                type: "string",
                description: "ID of the question waiting for response",
              },
              context: {
                type: "string",
                description: "Summary of current state to resume from",
              },
            },
            required: ["taskId", "questionId", "context"],
          },
        },
        {
          name: "resume_task",
          description: "Resume a previously pinned task",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "ID of the task to resume",
              },
            },
            required: ["taskId"],
          },
        },
        {
          name: "get_interrupts",
          description:
            "Check for interrupt messages sent from the mobile app to the current session. Use this to see if the user has sent you any messages.",
          inputSchema: {
            type: "object",
            properties: {
              sessionId: {
                type: "string",
                description: "The session ID to check for interrupts",
              },
              markAsRead: {
                type: "boolean",
                description: "Whether to mark interrupts as read (default: true)",
                default: true,
              },
            },
            required: ["sessionId"],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "ask_question":
          return await askQuestion(authContext, args as any);
        case "get_response":
          return await getResponse(authContext, args as any);
        case "update_status":
          return await updateStatus(authContext, args as any);
        case "pin_task":
          return await pinTask(authContext, args as any);
        case "resume_task":
          return await resumeTask(authContext, args as any);
        case "get_interrupts":
          return await getInterrupts(authContext, args as any);
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("CacheBash MCP server running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
