type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  userId?: string;
  action?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

function maskSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ["apikey", "token", "password", "secret", "authorization"];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = maskSensitiveData(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function createLogEntry(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (meta) {
    const masked = maskSensitiveData(meta);
    Object.assign(entry, masked);
  }

  return entry;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const entry = createLogEntry(level, message, meta);
  const output = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    default:
      // Use stdout for info/debug in Cloud Run
      process.stdout.write(output + "\n");
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
};
