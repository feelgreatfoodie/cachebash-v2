import {
  sanitizeString,
  validateString,
  validateOptionalString,
  validateOptions,
  LIMITS,
  SanitizedAskQuestionSchema,
  SanitizedUpdateStatusSchema,
  SanitizedPinTaskSchema,
  formatValidationErrors,
} from "../middleware/validate";

describe("Input Validation", () => {
  describe("sanitizeString", () => {
    it("removes control characters", () => {
      const input = "Hello\x00World\x1F!";
      expect(sanitizeString(input)).toBe("HelloWorld!");
    });

    it("preserves newlines and tabs", () => {
      const input = "Line 1\nLine 2\tTabbed";
      expect(sanitizeString(input)).toBe("Line 1\nLine 2\tTabbed");
    });

    it("trims whitespace", () => {
      const input = "  Hello World  ";
      expect(sanitizeString(input)).toBe("Hello World");
    });

    it("normalizes Unicode", () => {
      // é can be represented as single char or e + combining accent
      const composed = "\u00e9"; // é as single character
      const decomposed = "e\u0301"; // e + combining acute accent

      expect(sanitizeString(composed)).toBe(sanitizeString(decomposed));
    });

    it("handles empty strings", () => {
      expect(sanitizeString("")).toBe("");
      expect(sanitizeString("   ")).toBe("");
    });
  });

  describe("validateString", () => {
    it("accepts valid strings", () => {
      const result = validateString("Hello", "field", 100);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value).toBe("Hello");
      }
    });

    it("rejects non-strings", () => {
      const result = validateString(123, "field", 100);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("must be a string");
      }
    });

    it("rejects empty strings", () => {
      const result = validateString("", "field", 100);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("cannot be empty");
      }
    });

    it("rejects strings exceeding max length", () => {
      const longString = "a".repeat(101);
      const result = validateString(longString, "field", 100);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("exceeds maximum length");
      }
    });

    it("sanitizes input", () => {
      const result = validateString("  Hello\x00World  ", "field", 100);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value).toBe("HelloWorld");
      }
    });
  });

  describe("validateOptionalString", () => {
    it("returns undefined for null/undefined", () => {
      expect(validateOptionalString(undefined, "field", 100)).toEqual({
        valid: true,
        value: undefined,
      });
      expect(validateOptionalString(null, "field", 100)).toEqual({
        valid: true,
        value: undefined,
      });
    });

    it("returns undefined for empty strings after sanitization", () => {
      expect(validateOptionalString("   ", "field", 100)).toEqual({
        valid: true,
        value: undefined,
      });
    });

    it("validates and sanitizes non-empty strings", () => {
      const result = validateOptionalString("  Hello  ", "field", 100);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value).toBe("Hello");
      }
    });
  });

  describe("validateOptions", () => {
    it("returns undefined for null/undefined", () => {
      expect(validateOptions(undefined)).toEqual({ valid: true, value: undefined });
      expect(validateOptions(null)).toEqual({ valid: true, value: undefined });
    });

    it("rejects non-arrays", () => {
      const result = validateOptions("not an array");
      expect(result.valid).toBe(false);
    });

    it("rejects arrays exceeding max items", () => {
      const options = Array(LIMITS.maxOptions + 1).fill("option");
      const result = validateOptions(options);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain(`more than ${LIMITS.maxOptions}`);
      }
    });

    it("rejects non-string items", () => {
      const result = validateOptions(["valid", 123, "also valid"]);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("options[1]");
      }
    });

    it("rejects items exceeding max length", () => {
      const options = ["short", "a".repeat(LIMITS.optionText + 1)];
      const result = validateOptions(options);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("options[1]");
      }
    });

    it("sanitizes all options", () => {
      const options = ["  Option 1  ", "Option\x00 2"];
      const result = validateOptions(options);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value).toEqual(["Option 1", "Option 2"]);
      }
    });
  });

  describe("SanitizedAskQuestionSchema", () => {
    it("validates valid input", () => {
      const result = SanitizedAskQuestionSchema.safeParse({
        question: "What is the answer?",
        priority: "high",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty question", () => {
      const result = SanitizedAskQuestionSchema.safeParse({ question: "" });
      expect(result.success).toBe(false);
    });

    it("rejects question exceeding limit", () => {
      const result = SanitizedAskQuestionSchema.safeParse({
        question: "a".repeat(LIMITS.question + 1),
      });
      expect(result.success).toBe(false);
    });

    it("validates options array", () => {
      const result = SanitizedAskQuestionSchema.safeParse({
        question: "Choose one",
        options: ["A", "B", "C"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects too many options", () => {
      const result = SanitizedAskQuestionSchema.safeParse({
        question: "Choose one",
        options: Array(LIMITS.maxOptions + 1).fill("opt"),
      });
      expect(result.success).toBe(false);
    });

    it("sanitizes question text", () => {
      const result = SanitizedAskQuestionSchema.safeParse({
        question: "  What\x00 is this?  ",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.question).toBe("What is this?");
      }
    });
  });

  describe("SanitizedUpdateStatusSchema", () => {
    it("validates valid input", () => {
      const result = SanitizedUpdateStatusSchema.safeParse({
        status: "Working on feature",
        progress: 50,
        state: "working",
      });
      expect(result.success).toBe(true);
    });

    it("rejects status exceeding limit", () => {
      const result = SanitizedUpdateStatusSchema.safeParse({
        status: "a".repeat(LIMITS.status + 1),
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid progress values", () => {
      expect(
        SanitizedUpdateStatusSchema.safeParse({ status: "Test", progress: -1 }).success
      ).toBe(false);
      expect(
        SanitizedUpdateStatusSchema.safeParse({ status: "Test", progress: 101 }).success
      ).toBe(false);
    });

    it("rejects invalid state values", () => {
      const result = SanitizedUpdateStatusSchema.safeParse({
        status: "Test",
        state: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("SanitizedPinTaskSchema", () => {
    it("validates valid input", () => {
      const result = SanitizedPinTaskSchema.safeParse({
        taskId: "task-123",
        questionId: "q-456",
        context: "Working on feature X",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty context", () => {
      const result = SanitizedPinTaskSchema.safeParse({
        taskId: "task-123",
        questionId: "q-456",
        context: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects context exceeding limit", () => {
      const result = SanitizedPinTaskSchema.safeParse({
        taskId: "task-123",
        questionId: "q-456",
        context: "a".repeat(LIMITS.taskContext + 1),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("formatValidationErrors", () => {
    it("formats Zod errors correctly", () => {
      const result = SanitizedAskQuestionSchema.safeParse({ question: "" });
      if (!result.success) {
        const errors = formatValidationErrors(result.error);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.field).toBe("question");
        expect(errors[0]?.message).toContain("empty");
      }
    });
  });
});
