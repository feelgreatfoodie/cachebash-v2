import { _internal, checkToolRateLimit, getRateLimitHeaders } from "../middleware/rateLimit";

// Mock SSE connections
jest.mock("../routes/sse", () => ({
  getConnectionCount: jest.fn(() => 0),
}));

import { getConnectionCount } from "../routes/sse";

describe("Rate Limiting", () => {
  beforeEach(() => {
    _internal.rateLimitStore.clear();
    (getConnectionCount as jest.Mock).mockReturnValue(0);
  });

  describe("checkRateLimit", () => {
    it("allows requests within limit", () => {
      const result = _internal.checkRateLimit("user-1", "ask_question");
      expect(result.allowed).toBe(true);
    });

    it("blocks requests exceeding limit", () => {
      const userId = "user-2";
      const action = "ask_question";
      const limit = _internal.RATE_LIMITS[action]?.limit ?? 100;

      // Exhaust the limit
      for (let i = 0; i < limit; i++) {
        _internal.checkRateLimit(userId, action);
      }

      // Next request should be blocked
      const result = _internal.checkRateLimit(userId, action);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("resets after window expires", () => {
      const userId = "user-3";
      const action = "ask_question";

      // Make a request
      _internal.checkRateLimit(userId, action);

      // Manually expire the window
      const key = `${userId}:${action}`;
      const entry = _internal.rateLimitStore.get(key);
      if (entry) {
        entry.windowStart = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      }

      // Should be allowed (new window)
      const result = _internal.checkRateLimit(userId, action);
      expect(result.allowed).toBe(true);
    });

    it("tracks limits per user independently", () => {
      const action = "update_status";
      const limit = _internal.RATE_LIMITS[action]?.limit ?? 200;

      // Exhaust limit for user-1
      for (let i = 0; i < limit; i++) {
        _internal.checkRateLimit("user-1", action);
      }

      // user-1 should be blocked
      expect(_internal.checkRateLimit("user-1", action).allowed).toBe(false);

      // user-2 should still be allowed
      expect(_internal.checkRateLimit("user-2", action).allowed).toBe(true);
    });

    it("tracks limits per action independently", () => {
      const userId = "user-4";

      // Exhaust ask_question limit
      const askLimit = _internal.RATE_LIMITS["ask_question"]?.limit ?? 100;
      for (let i = 0; i < askLimit; i++) {
        _internal.checkRateLimit(userId, "ask_question");
      }

      // ask_question should be blocked
      expect(_internal.checkRateLimit(userId, "ask_question").allowed).toBe(false);

      // update_status should still be allowed
      expect(_internal.checkRateLimit(userId, "update_status").allowed).toBe(true);
    });
  });

  describe("SSE concurrent connection limit", () => {
    it("allows when under connection limit", () => {
      (getConnectionCount as jest.Mock).mockReturnValue(1);
      const result = _internal.checkRateLimit("user-5", "sse_connection");
      expect(result.allowed).toBe(true);
    });

    it("blocks when at connection limit", () => {
      (getConnectionCount as jest.Mock).mockReturnValue(2);
      const result = _internal.checkRateLimit("user-5", "sse_connection");
      expect(result.allowed).toBe(false);
    });
  });

  describe("checkToolRateLimit", () => {
    it("works for known tools", () => {
      const result = checkToolRateLimit("user-6", "get_response");
      expect(result.allowed).toBe(true);
    });

    it("allows unknown actions", () => {
      const result = checkToolRateLimit("user-6", "unknown_action");
      expect(result.allowed).toBe(true);
    });
  });

  describe("getRateLimitHeaders", () => {
    it("returns correct headers", () => {
      // Make some requests
      _internal.checkRateLimit("user-7", "ask_question");
      _internal.checkRateLimit("user-7", "ask_question");

      const headers = getRateLimitHeaders("user-7", "ask_question");

      expect(headers["X-RateLimit-Limit"]).toBe("100");
      expect(headers["X-RateLimit-Remaining"]).toBe("98");
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
    });

    it("returns empty for unknown actions", () => {
      const headers = getRateLimitHeaders("user-7", "unknown");
      expect(Object.keys(headers)).toHaveLength(0);
    });
  });
});
