import { logger } from "../lib/logger";

describe("Logger", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let stdoutWriteSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
    stdoutWriteSpy = jest.spyOn(process.stdout, "write").mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
  });

  describe("log levels", () => {
    it("logs debug messages to stdout", () => {
      logger.debug("Debug message");
      expect(stdoutWriteSpy).toHaveBeenCalled();
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.level).toBe("debug");
      expect(parsed.message).toBe("Debug message");
    });

    it("logs info messages to stdout", () => {
      logger.info("Info message");
      expect(stdoutWriteSpy).toHaveBeenCalled();
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("Info message");
    });

    it("logs warn messages to console.warn", () => {
      logger.warn("Warning message");
      expect(consoleWarnSpy).toHaveBeenCalled();
      const output = consoleWarnSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("warn");
      expect(parsed.message).toBe("Warning message");
    });

    it("logs error messages to console.error", () => {
      logger.error("Error message");
      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("error");
      expect(parsed.message).toBe("Error message");
    });
  });

  describe("structured data", () => {
    it("includes timestamp in ISO format", () => {
      logger.info("Test");
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("includes metadata in log entry", () => {
      logger.info("Action performed", {
        userId: "user-123",
        action: "login",
        duration_ms: 42,
      });
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.userId).toBe("user-123");
      expect(parsed.action).toBe("login");
      expect(parsed.duration_ms).toBe(42);
    });

    it("handles undefined metadata", () => {
      logger.info("No meta");
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.message).toBe("No meta");
      expect(parsed.userId).toBeUndefined();
    });
  });

  describe("sensitive data masking", () => {
    it("masks apiKey field", () => {
      logger.info("Auth", { apiKey: "secret-key-123" });
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.apiKey).toBe("[REDACTED]");
    });

    it("masks token field", () => {
      logger.info("Auth", { token: "jwt-token" });
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.token).toBe("[REDACTED]");
    });

    it("masks password field", () => {
      logger.info("Auth", { password: "supersecret" });
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.password).toBe("[REDACTED]");
    });

    it("masks secret field", () => {
      logger.info("Auth", { clientSecret: "abc123" });
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.clientSecret).toBe("[REDACTED]");
    });

    it("masks authorization field", () => {
      logger.info("Request", { authorization: "Bearer xyz" });
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.authorization).toBe("[REDACTED]");
    });

    it("masks nested sensitive fields", () => {
      logger.info("Request", {
        headers: {
          authorization: "Bearer xyz",
          contentType: "application/json",
        },
      });
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.headers.authorization).toBe("[REDACTED]");
      expect(parsed.headers.contentType).toBe("application/json");
    });

    it("preserves non-sensitive fields", () => {
      logger.info("Action", {
        userId: "user-123",
        action: "read",
        path: "/api/data",
      });
      const output = stdoutWriteSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());
      expect(parsed.userId).toBe("user-123");
      expect(parsed.action).toBe("read");
      expect(parsed.path).toBe("/api/data");
    });
  });
});
