import { handleToolCall, toolDefinitions } from "../mcp/protocol";
import {
  AskQuestionSchema,
  GetResponseSchema,
  UpdateStatusSchema,
  PinTaskSchema,
  ResumeTaskSchema,
  MCPErrorCode,
} from "../mcp/types";

// Mock Firebase
const mockAdd = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();

jest.mock("../lib/firebase", () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      add: mockAdd,
    })),
    doc: jest.fn(() => ({
      get: mockGet,
      set: mockSet,
      update: mockUpdate,
    })),
  })),
  serverTimestamp: jest.fn(() => "TIMESTAMP"),
}));

describe("MCP Protocol", () => {
  const userId = "test-user-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Tool Definitions", () => {
    it("exports all 5 tool definitions", () => {
      expect(toolDefinitions).toHaveLength(5);
      expect(toolDefinitions.map((t) => t.name)).toEqual([
        "ask_question",
        "get_response",
        "update_status",
        "pin_task",
        "resume_task",
      ]);
    });

    it("each tool has required properties", () => {
      for (const tool of toolDefinitions) {
        expect(tool).toHaveProperty("name");
        expect(tool).toHaveProperty("description");
        expect(tool).toHaveProperty("inputSchema");
        expect(tool.inputSchema).toHaveProperty("type", "object");
        expect(tool.inputSchema).toHaveProperty("properties");
        expect(tool.inputSchema).toHaveProperty("required");
      }
    });
  });

  describe("Input Validation", () => {
    it("AskQuestionSchema validates correctly", () => {
      expect(
        AskQuestionSchema.safeParse({ question: "Test?" }).success
      ).toBe(true);
      expect(
        AskQuestionSchema.safeParse({ question: "" }).success
      ).toBe(false);
      expect(
        AskQuestionSchema.safeParse({
          question: "Test?",
          priority: "invalid",
        }).success
      ).toBe(false);
    });

    it("GetResponseSchema validates correctly", () => {
      expect(
        GetResponseSchema.safeParse({ questionId: "abc123" }).success
      ).toBe(true);
      expect(GetResponseSchema.safeParse({}).success).toBe(false);
    });

    it("UpdateStatusSchema validates correctly", () => {
      expect(
        UpdateStatusSchema.safeParse({ status: "Working on it" }).success
      ).toBe(true);
      expect(
        UpdateStatusSchema.safeParse({ status: "", progress: 50 }).success
      ).toBe(false);
    });

    it("PinTaskSchema validates correctly", () => {
      expect(
        PinTaskSchema.safeParse({
          taskId: "task-1",
          questionId: "q-1",
          context: "Current context",
        }).success
      ).toBe(true);
      expect(
        PinTaskSchema.safeParse({
          taskId: "task-1",
          questionId: "q-1",
        }).success
      ).toBe(false);
    });

    it("ResumeTaskSchema validates correctly", () => {
      expect(
        ResumeTaskSchema.safeParse({ taskId: "task-1" }).success
      ).toBe(true);
      expect(ResumeTaskSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("handleToolCall", () => {
    it("returns error for invalid request format", async () => {
      const response = await handleToolCall(userId, { invalid: "request" });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.InvalidRequest);
    });

    it("returns error for unknown tool", async () => {
      const response = await handleToolCall(userId, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "unknown_tool" },
      });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.MethodNotFound);
    });

    it("returns error for invalid ask_question parameters", async () => {
      const response = await handleToolCall(userId, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "ask_question", arguments: { question: "" } },
      });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.InvalidParams);
    });

    it("returns error for invalid get_response parameters", async () => {
      const response = await handleToolCall(userId, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_response", arguments: {} },
      });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.InvalidParams);
    });

    it("returns error for invalid update_status parameters", async () => {
      const response = await handleToolCall(userId, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "update_status", arguments: { status: "" } },
      });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.InvalidParams);
    });

    it("returns error for invalid pin_task parameters", async () => {
      const response = await handleToolCall(userId, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "pin_task", arguments: { taskId: "t-1" } }, // missing questionId and context
      });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.InvalidParams);
    });

    it("returns error for invalid resume_task parameters", async () => {
      const response = await handleToolCall(userId, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "resume_task", arguments: {} }, // missing taskId
      });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.InvalidParams);
    });

    describe("ask_question", () => {
      it("creates a question and returns questionId", async () => {
        mockAdd.mockResolvedValue({ id: "new-question-id" });

        const response = await handleToolCall(userId, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "ask_question",
            arguments: { question: "What is the answer?" },
          },
        });

        expect(response.result).toBeDefined();
        expect(response.error).toBeUndefined();

        const content = JSON.parse(response.result?.content[0]?.text ?? "{}");
        expect(content.success).toBe(true);
        expect(content.questionId).toBe("new-question-id");
      });
    });

    describe("get_response", () => {
      it("returns pending status when no response", async () => {
        mockGet.mockResolvedValue({
          exists: true,
          data: () => ({ status: "pending" }),
        });

        const response = await handleToolCall(userId, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_response",
            arguments: { questionId: "q-123" },
          },
        });

        const content = JSON.parse(response.result?.content[0]?.text ?? "{}");
        expect(content.answered).toBe(false);
        expect(content.status).toBe("pending");
      });

      it("returns response when answered", async () => {
        mockGet.mockResolvedValue({
          exists: true,
          data: () => ({
            status: "answered",
            response: "Yes, 42",
            answeredAt: { toDate: () => new Date("2026-01-30") },
          }),
        });

        const response = await handleToolCall(userId, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_response",
            arguments: { questionId: "q-123" },
          },
        });

        const content = JSON.parse(response.result?.content[0]?.text ?? "{}");
        expect(content.answered).toBe(true);
        expect(content.response).toBe("Yes, 42");
      });
    });

    describe("update_status", () => {
      it("updates session status", async () => {
        mockSet.mockResolvedValue({});

        const response = await handleToolCall(userId, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "update_status",
            arguments: { status: "Working on tests", progress: 50 },
          },
        });

        const content = JSON.parse(response.result?.content[0]?.text ?? "{}");
        expect(content.success).toBe(true);
        expect(content.sessionId).toBeDefined();
      });
    });

    describe("pin_task", () => {
      it("pins a task", async () => {
        mockSet.mockResolvedValue({});

        const response = await handleToolCall(userId, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "pin_task",
            arguments: {
              taskId: "task-1",
              questionId: "q-1",
              context: "Working on feature X",
            },
          },
        });

        const content = JSON.parse(response.result?.content[0]?.text ?? "{}");
        expect(content.success).toBe(true);
        expect(content.taskId).toBe("task-1");
      });
    });

    describe("resume_task", () => {
      it("returns error if task not found", async () => {
        mockGet.mockResolvedValue({ exists: false });

        const response = await handleToolCall(userId, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "resume_task",
            arguments: { taskId: "nonexistent" },
          },
        });

        const content = JSON.parse(response.result?.content[0]?.text ?? "{}");
        expect(content.success).toBe(false);
        expect(content.error).toBe("Task not found");
      });

      it("returns error if task not pinned", async () => {
        mockGet.mockResolvedValue({
          exists: true,
          data: () => ({ state: "working" }),
        });

        const response = await handleToolCall(userId, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "resume_task",
            arguments: { taskId: "task-1" },
          },
        });

        const content = JSON.parse(response.result?.content[0]?.text ?? "{}");
        expect(content.success).toBe(false);
        expect(content.error).toBe("Task is not in pinned state");
      });

      it("resumes a pinned task with response", async () => {
        // First call for task lookup
        mockGet.mockResolvedValueOnce({
          exists: true,
          data: () => ({
            state: "pinned",
            questionId: "q-1",
            context: "Was working on X",
          }),
        });
        // Second call for question lookup
        mockGet.mockResolvedValueOnce({
          exists: true,
          data: () => ({ status: "answered", response: "User response" }),
        });
        mockUpdate.mockResolvedValue({});

        const response = await handleToolCall(userId, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "resume_task",
            arguments: { taskId: "task-1" },
          },
        });

        const content = JSON.parse(response.result?.content[0]?.text ?? "{}");
        expect(content.success).toBe(true);
        expect(content.context).toBe("Was working on X");
        expect(content.response).toBe("User response");
      });
    });
  });
});
