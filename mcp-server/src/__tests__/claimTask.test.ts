/**
 * Tests for claimTask transaction safety
 *
 * These tests verify that the claimTask function:
 * 1. Uses Firestore transactions to prevent double-claiming
 * 2. Is idempotent when called by the same session
 * 3. Rejects claims for non-pending tasks
 */

import { claimTask } from "../tools/getTasks";
import { AuthContext } from "../auth/apiKeyValidator";

// Mock Firebase Admin SDK
const mockTransaction = {
  get: jest.fn(),
  update: jest.fn(),
};

const mockFirestore = {
  doc: jest.fn(),
  runTransaction: jest.fn((callback) => callback(mockTransaction)),
};

jest.mock("../firebase/client", () => ({
  getFirestore: () => mockFirestore,
  serverTimestamp: () => "SERVER_TIMESTAMP",
}));

jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => "SERVER_TIMESTAMP",
    },
  },
}));

describe("claimTask", () => {
  const mockAuth: AuthContext = {
    userId: "test-user-123",
    apiKey: "test-api-key",
    apiKeyHash: "test-api-key-hash",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should claim a pending task successfully", async () => {
    const taskId = "task-123";
    const sessionId = "session-abc";

    const mockDoc = {
      exists: true,
      data: () => ({
        status: "pending",
        title: "Test Task",
        content: "Test instructions",
        action: "queue",
        priority: "normal",
      }),
    };

    mockFirestore.doc.mockReturnValue({ path: `users/${mockAuth.userId}/messages/${taskId}` });
    mockTransaction.get.mockResolvedValue(mockDoc);

    const result = await claimTask(mockAuth, { taskId, sessionId });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.success).toBe(true);
    expect(parsed.taskId).toBe(taskId);
    expect(parsed.message).toContain("claimed");
    expect(mockTransaction.update).toHaveBeenCalled();
  });

  it("should be idempotent for same session", async () => {
    const taskId = "task-123";
    const sessionId = "session-abc";

    const mockDoc = {
      exists: true,
      data: () => ({
        status: "in_progress",
        sessionId: sessionId, // Already claimed by this session
        title: "Test Task",
        content: "Test instructions",
        action: "queue",
        priority: "normal",
      }),
    };

    mockFirestore.doc.mockReturnValue({ path: `users/${mockAuth.userId}/messages/${taskId}` });
    mockTransaction.get.mockResolvedValue(mockDoc);

    const result = await claimTask(mockAuth, { taskId, sessionId });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.success).toBe(true);
    expect(parsed.alreadyClaimed).toBe(true);
    expect(mockTransaction.update).not.toHaveBeenCalled(); // No update needed
  });

  it("should reject claim for task already claimed by different session", async () => {
    const taskId = "task-123";
    const sessionId = "session-abc";

    const mockDoc = {
      exists: true,
      data: () => ({
        status: "in_progress",
        sessionId: "different-session", // Claimed by another session
        title: "Test Task",
      }),
    };

    mockFirestore.doc.mockReturnValue({ path: `users/${mockAuth.userId}/messages/${taskId}` });
    mockTransaction.get.mockResolvedValue(mockDoc);

    const result = await claimTask(mockAuth, { taskId, sessionId });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("not claimable");
  });

  it("should reject claim for non-existent task", async () => {
    const taskId = "non-existent-task";

    const mockDoc = {
      exists: false,
      data: () => null,
    };

    mockFirestore.doc.mockReturnValue({ path: `users/${mockAuth.userId}/messages/${taskId}` });
    mockTransaction.get.mockResolvedValue(mockDoc);

    const result = await claimTask(mockAuth, { taskId });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("Task not found");
  });

  it("should reject claim for completed task", async () => {
    const taskId = "task-123";

    const mockDoc = {
      exists: true,
      data: () => ({
        status: "complete",
        title: "Completed Task",
      }),
    };

    mockFirestore.doc.mockReturnValue({ path: `users/${mockAuth.userId}/messages/${taskId}` });
    mockTransaction.get.mockResolvedValue(mockDoc);

    const result = await claimTask(mockAuth, { taskId });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("not claimable");
    expect(parsed.error).toContain("complete");
  });

  it("should include lastHeartbeat in update", async () => {
    const taskId = "task-123";
    const sessionId = "session-abc";

    const mockDoc = {
      exists: true,
      data: () => ({
        status: "pending",
        title: "Test Task",
        content: "Test instructions",
      }),
    };

    const mockMessageRef = { path: `users/${mockAuth.userId}/messages/${taskId}` };
    const mockTaskRef = { path: `users/${mockAuth.userId}/tasks/${taskId}` };

    mockFirestore.doc
      .mockReturnValueOnce(mockMessageRef)
      .mockReturnValueOnce(mockTaskRef);

    mockTransaction.get
      .mockResolvedValueOnce(mockDoc)
      .mockResolvedValueOnce({ exists: false, data: () => null });

    await claimTask(mockAuth, { taskId, sessionId });

    // Verify the update includes lastHeartbeat
    expect(mockTransaction.update).toHaveBeenCalledWith(
      mockMessageRef,
      expect.objectContaining({
        status: "in_progress",
        lastHeartbeat: "SERVER_TIMESTAMP",
      })
    );
  });

  describe("concurrent claim race condition", () => {
    it("should handle transaction conflicts gracefully", async () => {
      const taskId = "task-123";

      // Simulate a transaction conflict error
      mockFirestore.runTransaction.mockRejectedValueOnce(
        new Error("ABORTED: Transaction was aborted")
      );

      const result = await claimTask(mockAuth, { taskId });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Failed to claim task");
    });
  });
});
