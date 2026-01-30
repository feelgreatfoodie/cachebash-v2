import { z } from "zod";

// Character limits for validation
export const LIMITS = {
  question: 2000,
  context: 500,
  status: 200,
  optionText: 100,
  maxOptions: 5,
  taskContext: 2000,
};

// Regex to match control characters except newlines and tabs
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Sanitize a string by removing control characters except newlines and tabs
 */
export function sanitizeString(input: string): string {
  // Remove control characters
  let sanitized = input.replace(CONTROL_CHARS_REGEX, "");

  // Normalize Unicode (NFC normalization)
  sanitized = sanitized.normalize("NFC");

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Validate and sanitize a string field
 */
export function validateString(
  value: unknown,
  fieldName: string,
  maxLength: number
): { valid: true; value: string } | { valid: false; error: string } {
  if (typeof value !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  const sanitized = sanitizeString(value);

  if (sanitized.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }

  if (sanitized.length > maxLength) {
    return {
      valid: false,
      error: `${fieldName} exceeds maximum length of ${maxLength} characters`,
    };
  }

  return { valid: true, value: sanitized };
}

/**
 * Validate and sanitize an optional string field
 */
export function validateOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number
): { valid: true; value: string | undefined } | { valid: false; error: string } {
  if (value === undefined || value === null) {
    return { valid: true, value: undefined };
  }

  if (typeof value !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  const sanitized = sanitizeString(value);

  if (sanitized.length === 0) {
    return { valid: true, value: undefined };
  }

  if (sanitized.length > maxLength) {
    return {
      valid: false,
      error: `${fieldName} exceeds maximum length of ${maxLength} characters`,
    };
  }

  return { valid: true, value: sanitized };
}

/**
 * Validate and sanitize an array of option strings
 */
export function validateOptions(
  value: unknown
): { valid: true; value: string[] | undefined } | { valid: false; error: string } {
  if (value === undefined || value === null) {
    return { valid: true, value: undefined };
  }

  if (!Array.isArray(value)) {
    return { valid: false, error: "options must be an array" };
  }

  if (value.length > LIMITS.maxOptions) {
    return {
      valid: false,
      error: `options cannot have more than ${LIMITS.maxOptions} items`,
    };
  }

  const sanitizedOptions: string[] = [];
  const items = value as unknown[];

  for (let i = 0; i < items.length; i++) {
    const item: unknown = items[i];
    if (typeof item !== "string") {
      return { valid: false, error: `options[${i}] must be a string` };
    }

    const sanitized = sanitizeString(item);

    if (sanitized.length === 0) {
      return { valid: false, error: `options[${i}] cannot be empty` };
    }

    if (sanitized.length > LIMITS.optionText) {
      return {
        valid: false,
        error: `options[${i}] exceeds maximum length of ${LIMITS.optionText} characters`,
      };
    }

    sanitizedOptions.push(sanitized);
  }

  return { valid: true, value: sanitizedOptions.length > 0 ? sanitizedOptions : undefined };
}

// Validation schemas with sanitization transforms
export const SanitizedAskQuestionSchema = z.object({
  question: z
    .string()
    .min(1, "question cannot be empty")
    .max(LIMITS.question, `question exceeds maximum length of ${LIMITS.question}`)
    .transform(sanitizeString),
  options: z
    .array(
      z
        .string()
        .max(LIMITS.optionText, `each option exceeds maximum length of ${LIMITS.optionText}`)
        .transform(sanitizeString)
    )
    .max(LIMITS.maxOptions, `options cannot have more than ${LIMITS.maxOptions} items`)
    .optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  context: z
    .string()
    .max(LIMITS.context, `context exceeds maximum length of ${LIMITS.context}`)
    .transform(sanitizeString)
    .optional(),
  projectId: z.string().optional(),
});

export const SanitizedUpdateStatusSchema = z.object({
  status: z
    .string()
    .min(1, "status cannot be empty")
    .max(LIMITS.status, `status exceeds maximum length of ${LIMITS.status}`)
    .transform(sanitizeString),
  progress: z.number().min(0).max(100).optional(),
  state: z.enum(["working", "blocked", "complete", "pinned"]).default("working"),
  sessionId: z.string().optional(),
});

export const SanitizedPinTaskSchema = z.object({
  taskId: z.string().min(1, "taskId cannot be empty"),
  questionId: z.string().min(1, "questionId cannot be empty"),
  context: z
    .string()
    .min(1, "context cannot be empty")
    .max(LIMITS.taskContext, `context exceeds maximum length of ${LIMITS.taskContext}`)
    .transform(sanitizeString),
});

export interface ValidationError {
  field: string;
  message: string;
}

export function formatValidationErrors(errors: z.ZodError): ValidationError[] {
  return errors.errors.map((err) => ({
    field: err.path.join("."),
    message: err.message,
  }));
}
