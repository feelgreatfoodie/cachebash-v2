import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth";
import { logger } from "../lib/logger";
import { getConnectionCount } from "../routes/sse";

// Rate limit configuration per tool/action
interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  sse_connection: { limit: 2, windowMs: 0 }, // Concurrent connections, not time-based
  ask_question: { limit: 100, windowMs: 60 * 60 * 1000 }, // 100 per hour
  get_response: { limit: 500, windowMs: 60 * 60 * 1000 }, // 500 per hour
  update_status: { limit: 200, windowMs: 60 * 60 * 1000 }, // 200 per hour
  pin_task: { limit: 50, windowMs: 60 * 60 * 1000 }, // 50 per hour
  resume_task: { limit: 50, windowMs: 60 * 60 * 1000 }, // 50 per hour
};

// Track request counts per user/action
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function getRateLimitKey(userId: string, action: string): string {
  return `${userId}:${action}`;
}

function checkRateLimit(userId: string, action: string): { allowed: boolean; retryAfter?: number } {
  const config = RATE_LIMITS[action];
  if (config === undefined) {
    return { allowed: true };
  }

  // Handle concurrent connection limit separately
  if (action === "sse_connection") {
    const currentConnections = getConnectionCount(userId);
    if (currentConnections >= config.limit) {
      return { allowed: false, retryAfter: 60 };
    }
    return { allowed: true };
  }

  const key = getRateLimitKey(userId, action);
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // If no entry or window expired, create new window
  if (entry === undefined || now > entry.windowStart + config.windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  // Check if limit exceeded
  if (entry.count >= config.limit) {
    const retryAfter = Math.ceil((entry.windowStart + config.windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Increment count
  entry.count++;
  return { allowed: true };
}

export function sseRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;

  // authMiddleware should have run first
  if (authReq.auth === undefined) {
    next();
    return;
  }

  const { allowed, retryAfter } = checkRateLimit(authReq.auth.userId, "sse_connection");

  if (!allowed) {
    logger.warn("SSE rate limit exceeded", {
      userId: authReq.auth.userId,
      action: "sse_rate_limited",
    });

    res.setHeader("Retry-After", (retryAfter ?? 60).toString());
    res.status(429).json({
      error: "Too many concurrent SSE connections",
      retryAfter,
    });
    return;
  }

  next();
}

export function checkToolRateLimit(userId: string, toolName: string): { allowed: boolean; retryAfter?: number } {
  return checkRateLimit(userId, toolName);
}

export function getRateLimitHeaders(userId: string, action: string): Record<string, string> {
  const config = RATE_LIMITS[action];
  if (config === undefined) {
    return {};
  }

  const key = getRateLimitKey(userId, action);
  const entry = rateLimitStore.get(key);
  const remaining = entry !== undefined ? Math.max(0, config.limit - entry.count) : config.limit;

  return {
    "X-RateLimit-Limit": config.limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": entry !== undefined
      ? Math.ceil((entry.windowStart + config.windowMs) / 1000).toString()
      : Math.ceil((Date.now() + config.windowMs) / 1000).toString(),
  };
}

// For testing
export const _internal = {
  rateLimitStore,
  checkRateLimit,
  RATE_LIMITS,
};
