import { createApp } from "../server";
import request from "supertest";
import { activeConnections, sendSSEEvent, getConnectionCount, closeAllConnections, broadcastToUser } from "../routes/sse";
import { Response } from "express";

// Mock Firebase
jest.mock("../lib/firebase", () => ({
  initializeFirebase: jest.fn(),
  getFirestore: jest.fn(() => ({
    doc: jest.fn((path: string) => ({
      get: jest.fn(() => {
        // Mock valid API key lookup for "test-api-key"
        const testKeyHash = require("crypto")
          .createHash("sha256")
          .update("test-api-key")
          .digest("hex");

        if (path === `apiKeys/${testKeyHash}`) {
          return Promise.resolve({
            exists: true,
            data: () => ({ userId: "test-user-123" }),
          });
        }
        if (path === "users/test-user-123") {
          return Promise.resolve({
            exists: true,
            data: () => ({ apiKeyHash: testKeyHash }),
          });
        }
        return Promise.resolve({ exists: false });
      }),
    })),
  })),
}));

describe("SSE Endpoint", () => {
  const app = createApp();

  beforeEach(() => {
    activeConnections.clear();
  });

  describe("Authentication", () => {
    it("returns 401 without Authorization header", async () => {
      const response = await request(app).get("/v1/sse");
      expect(response.status).toBe(401);
    });

    it("returns 401 with invalid API key", async () => {
      const response = await request(app)
        .get("/v1/sse")
        .set("Authorization", "Bearer invalid-key");

      // Wait for async auth
      await new Promise((r) => setTimeout(r, 50));

      expect(response.status).toBe(401);
    });
  });

  describe("sendSSEEvent", () => {
    it("formats SSE events correctly", () => {
      const chunks: string[] = [];
      const mockRes = {
        write: (data: string) => chunks.push(data),
      } as unknown as Response;

      sendSSEEvent(mockRes, 42, "test-event", { foo: "bar" });

      expect(chunks.join("")).toBe(
        'id: 42\nevent: test-event\ndata: {"foo":"bar"}\n\n'
      );
    });

    it("handles complex data objects", () => {
      const chunks: string[] = [];
      const mockRes = {
        write: (data: string) => chunks.push(data),
      } as unknown as Response;

      sendSSEEvent(mockRes, 1, "data-event", {
        nested: { value: 123 },
        array: [1, 2, 3],
      });

      const output = chunks.join("");
      expect(output).toContain("id: 1");
      expect(output).toContain("event: data-event");
      expect(output).toContain('"nested":{"value":123}');
      expect(output).toContain('"array":[1,2,3]');
    });
  });

  describe("getConnectionCount", () => {
    it("returns 0 when no connections", () => {
      expect(getConnectionCount()).toBe(0);
    });

    it("returns total connection count", () => {
      activeConnections.set("conn1", {
        id: "conn1",
        userId: "user-a",
        response: {} as Response,
        lastEventId: 0,
        connectedAt: new Date(),
      });
      activeConnections.set("conn2", {
        id: "conn2",
        userId: "user-b",
        response: {} as Response,
        lastEventId: 0,
        connectedAt: new Date(),
      });

      expect(getConnectionCount()).toBe(2);
    });

    it("returns count for specific user", () => {
      activeConnections.set("conn1", {
        id: "conn1",
        userId: "user-a",
        response: {} as Response,
        lastEventId: 0,
        connectedAt: new Date(),
      });
      activeConnections.set("conn2", {
        id: "conn2",
        userId: "user-a",
        response: {} as Response,
        lastEventId: 0,
        connectedAt: new Date(),
      });
      activeConnections.set("conn3", {
        id: "conn3",
        userId: "user-b",
        response: {} as Response,
        lastEventId: 0,
        connectedAt: new Date(),
      });

      expect(getConnectionCount("user-a")).toBe(2);
      expect(getConnectionCount("user-b")).toBe(1);
      expect(getConnectionCount("user-c")).toBe(0);
    });
  });

  describe("broadcastToUser", () => {
    it("sends event to all user connections", () => {
      const chunks1: string[] = [];
      const chunks2: string[] = [];
      const chunks3: string[] = [];

      activeConnections.set("conn1", {
        id: "conn1",
        userId: "user-a",
        response: { write: (d: string) => chunks1.push(d) } as unknown as Response,
        lastEventId: 0,
        connectedAt: new Date(),
      });
      activeConnections.set("conn2", {
        id: "conn2",
        userId: "user-a",
        response: { write: (d: string) => chunks2.push(d) } as unknown as Response,
        lastEventId: 5,
        connectedAt: new Date(),
      });
      activeConnections.set("conn3", {
        id: "conn3",
        userId: "user-b",
        response: { write: (d: string) => chunks3.push(d) } as unknown as Response,
        lastEventId: 0,
        connectedAt: new Date(),
      });

      broadcastToUser("user-a", "notification", { message: "hello" });

      // user-a connections should receive the event
      expect(chunks1.join("")).toContain("event: notification");
      expect(chunks1.join("")).toContain("id: 1"); // lastEventId incremented
      expect(chunks2.join("")).toContain("event: notification");
      expect(chunks2.join("")).toContain("id: 6"); // lastEventId incremented

      // user-b should not receive
      expect(chunks3.length).toBe(0);
    });
  });

  describe("closeAllConnections", () => {
    it("sends server event to all connections", () => {
      const chunks: string[] = [];
      const endMock = jest.fn();
      const mockRes = {
        write: (d: string) => chunks.push(d),
        end: endMock,
      } as unknown as Response;

      activeConnections.set("conn1", {
        id: "conn1",
        userId: "user-a",
        response: mockRes,
        lastEventId: 5,
        connectedAt: new Date(),
      });

      closeAllConnections("server-restarting");

      expect(chunks.join("")).toContain("server-restarting");
      expect(chunks.join("")).toContain("id: 6");
      expect(endMock).toHaveBeenCalled();
      expect(activeConnections.size).toBe(0);
    });

    it("handles multiple connections", () => {
      const endMocks = [jest.fn(), jest.fn()];

      activeConnections.set("conn1", {
        id: "conn1",
        userId: "user-a",
        response: { write: jest.fn(), end: endMocks[0] } as unknown as Response,
        lastEventId: 0,
        connectedAt: new Date(),
      });
      activeConnections.set("conn2", {
        id: "conn2",
        userId: "user-b",
        response: { write: jest.fn(), end: endMocks[1] } as unknown as Response,
        lastEventId: 0,
        connectedAt: new Date(),
      });

      closeAllConnections("maintenance");

      expect(endMocks[0]).toHaveBeenCalled();
      expect(endMocks[1]).toHaveBeenCalled();
      expect(activeConnections.size).toBe(0);
    });
  });

  describe("POST /messages", () => {
    it("returns 401 without auth", async () => {
      const response = await request(app)
        .post("/v1/messages")
        .send({ jsonrpc: "2.0", method: "tools/list", id: 1 });

      expect(response.status).toBe(401);
    });

    it("returns tool definitions for tools/list", async () => {
      const response = await request(app)
        .post("/v1/messages")
        .set("Authorization", "Bearer test-api-key")
        .send({ jsonrpc: "2.0", method: "tools/list", id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.jsonrpc).toBe("2.0");
      expect(response.body.id).toBe(1);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.tools).toBeDefined();
      expect(Array.isArray(response.body.result.tools)).toBe(true);
      // Verify all 5 tools are present
      const toolNames = response.body.result.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain("ask_question");
      expect(toolNames).toContain("get_response");
      expect(toolNames).toContain("update_status");
      expect(toolNames).toContain("pin_task");
      expect(toolNames).toContain("resume_task");
    });

    it("handles tool calls via handleToolCall", async () => {
      const response = await request(app)
        .post("/v1/messages")
        .set("Authorization", "Bearer test-api-key")
        .send({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 2,
          params: {
            name: "update_status",
            arguments: {
              status: "Testing",
              progress: 50,
              state: "working",
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.jsonrpc).toBe("2.0");
      expect(response.body.id).toBe(2);
      // Should have either result or error
      expect(response.body.result !== undefined || response.body.error !== undefined).toBe(true);
    });

    it("broadcasts tool response to SSE connections", async () => {
      const chunks: string[] = [];

      // Set up a mock SSE connection for the same user
      activeConnections.set("test-conn", {
        id: "test-conn",
        userId: "test-user-123",
        response: { write: (d: string) => chunks.push(d) } as unknown as Response,
        lastEventId: 0,
        connectedAt: new Date(),
      });

      await request(app)
        .post("/v1/messages")
        .set("Authorization", "Bearer test-api-key")
        .send({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 3,
          params: {
            name: "update_status",
            arguments: {
              status: "Broadcast test",
              state: "working",
            },
          },
        });

      // Should have broadcast to the SSE connection
      expect(chunks.join("")).toContain("tool-response");
    });
  });
});
