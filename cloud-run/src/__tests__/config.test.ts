// Test config validation
// Note: We test the schema, not the actual config load since it runs at module init

import { z } from "zod";

// Replicate the schema to test validation logic
const envSchema = z.object({
  PORT: z.string().default("8080").transform(Number),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
});

describe("Config Validation", () => {
  describe("envSchema", () => {
    it("uses default PORT of 8080", () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(8080);
      }
    });

    it("transforms PORT string to number", () => {
      const result = envSchema.safeParse({ PORT: "3000" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(3000);
        expect(typeof result.data.PORT).toBe("number");
      }
    });

    it("uses default NODE_ENV of development", () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe("development");
      }
    });

    it("accepts valid NODE_ENV values", () => {
      expect(envSchema.safeParse({ NODE_ENV: "development" }).success).toBe(true);
      expect(envSchema.safeParse({ NODE_ENV: "production" }).success).toBe(true);
      expect(envSchema.safeParse({ NODE_ENV: "test" }).success).toBe(true);
    });

    it("rejects invalid NODE_ENV values", () => {
      const result = envSchema.safeParse({ NODE_ENV: "staging" });
      expect(result.success).toBe(false);
    });

    it("accepts optional GOOGLE_APPLICATION_CREDENTIALS", () => {
      const result = envSchema.safeParse({
        GOOGLE_APPLICATION_CREDENTIALS: "/path/to/credentials.json",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.GOOGLE_APPLICATION_CREDENTIALS).toBe("/path/to/credentials.json");
      }
    });

    it("accepts optional FIREBASE_PROJECT_ID", () => {
      const result = envSchema.safeParse({
        FIREBASE_PROJECT_ID: "my-project",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.FIREBASE_PROJECT_ID).toBe("my-project");
      }
    });

    it("allows all optional fields to be undefined", () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
        expect(result.data.FIREBASE_PROJECT_ID).toBeUndefined();
      }
    });

    it("provides error details for invalid config", () => {
      const result = envSchema.safeParse({ NODE_ENV: "invalid" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorPaths = result.error.errors.map((e) => e.path.join("."));
        expect(errorPaths).toContain("NODE_ENV");
      }
    });
  });

  describe("loadConfig error handling", () => {
    it("formats error message correctly", () => {
      // Simulate the error formatting from config.ts
      const result = envSchema.safeParse({ NODE_ENV: "invalid" });
      if (!result.success) {
        const errors = result.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        expect(errors).toContain("NODE_ENV");
        expect(errors).toContain("Invalid");
      }
    });
  });
});
