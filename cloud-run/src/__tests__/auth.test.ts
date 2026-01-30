import { Request, Response, NextFunction } from "express";
import { authMiddleware, _internal, AuthContext } from "../middleware/auth";

// Mock Firebase
jest.mock("../lib/firebase", () => ({
  getFirestore: jest.fn(() => ({
    doc: jest.fn((path: string) => ({
      get: jest.fn(() => {
        // Mock valid API key lookup
        if (path.includes("apiKeys/")) {
          const hash = path.replace("apiKeys/", "");
          // Valid test key hash
          if (hash === "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8") {
            return Promise.resolve({
              exists: true,
              data: () => ({ userId: "test-user-123" }),
            });
          }
        }
        if (path === "users/test-user-123") {
          return Promise.resolve({
            exists: true,
            data: () => ({
              apiKeyHash: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
            }),
          });
        }
        return Promise.resolve({ exists: false });
      }),
    })),
  })),
}));

describe("Auth Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    // Clear rate limit state between tests
    _internal.authFailures.clear();

    jsonMock = jest.fn();
    statusMock = jest.fn(() => ({ json: jsonMock }));

    mockReq = {
      headers: {},
      ip: "127.0.0.1",
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
      setHeader: jest.fn(),
    } as Partial<Response>;

    nextFn = jest.fn();
  });

  describe("Missing Authorization", () => {
    it("returns 401 when Authorization header is missing", async () => {
      authMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: "Authorization header required" });
      expect(nextFn).not.toHaveBeenCalled();
    });
  });

  describe("Invalid Authorization Format", () => {
    it("returns 401 for non-Bearer auth", async () => {
      mockReq.headers = { authorization: "Basic abc123" };

      authMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Invalid authorization format. Use: Bearer <api_key>",
      });
    });

    it("returns 401 for malformed Bearer token", async () => {
      mockReq.headers = { authorization: "Bearer" };

      authMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe("Invalid API Key", () => {
    it("returns 401 for unknown API key", async () => {
      mockReq.headers = { authorization: "Bearer invalid-key" };

      authMiddleware(mockReq as Request, mockRes as Response, nextFn);

      // Wait for async validation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: "Invalid API key" });
    });
  });

  describe("Valid API Key", () => {
    it("calls next() and attaches auth context for valid key", async () => {
      // The hash of "password" is a known value for testing
      mockReq.headers = { authorization: "Bearer password" };

      authMiddleware(mockReq as Request, mockRes as Response, nextFn);

      // Wait for async validation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(nextFn).toHaveBeenCalled();
      expect((mockReq as Request & { auth: AuthContext }).auth).toBeDefined();
      expect((mockReq as Request & { auth: AuthContext }).auth.userId).toBe("test-user-123");
    });
  });

  describe("Rate Limiting", () => {
    it("returns 429 after too many failures", async () => {
      const ip = "192.168.1.100";
      mockReq = { ...mockReq, ip, headers: { authorization: "Bearer bad-key" } };

      // Record many failures
      for (let i = 0; i < 10; i++) {
        _internal.recordAuthFailure(ip);
      }

      authMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(429);
      expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    });

    it("resets rate limit after window expires", () => {
      const ip = "192.168.1.101";

      // Record failures
      for (let i = 0; i < 10; i++) {
        _internal.recordAuthFailure(ip);
      }

      expect(_internal.isRateLimited(ip)).toBe(true);

      // Manually expire the window
      const entry = _internal.authFailures.get(ip);
      if (entry) {
        entry.resetAt = Date.now() - 1000;
      }

      expect(_internal.isRateLimited(ip)).toBe(false);
    });
  });

  describe("Hash Function", () => {
    it("produces consistent SHA-256 hashes", () => {
      const hash1 = _internal.hashApiKey("test-key");
      const hash2 = _internal.hashApiKey("test-key");

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it("produces different hashes for different inputs", () => {
      const hash1 = _internal.hashApiKey("key-1");
      const hash2 = _internal.hashApiKey("key-2");

      expect(hash1).not.toBe(hash2);
    });
  });
});
