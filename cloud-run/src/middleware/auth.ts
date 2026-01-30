import { Request, Response, NextFunction } from "express";
import * as crypto from "crypto";
import { getFirestore } from "../lib/firebase";
import { logger } from "../lib/logger";

export interface AuthContext {
  userId: string;
  apiKeyHash: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

// In-memory rate limiting for auth failures (per IP)
const authFailures = new Map<string, { count: number; resetAt: number }>();
const AUTH_FAILURE_LIMIT = 10;
const AUTH_FAILURE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function getClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0]?.trim() ?? req.ip ?? "unknown";
  }
  return req.ip ?? "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = authFailures.get(ip);

  if (!entry) {
    return false;
  }

  if (now > entry.resetAt) {
    authFailures.delete(ip);
    return false;
  }

  return entry.count >= AUTH_FAILURE_LIMIT;
}

function recordAuthFailure(ip: string): void {
  const now = Date.now();
  const entry = authFailures.get(ip);

  if (!entry || now > entry.resetAt) {
    authFailures.set(ip, {
      count: 1,
      resetAt: now + AUTH_FAILURE_WINDOW_MS,
    });
  } else {
    entry.count++;
  }
}

async function validateApiKey(apiKey: string): Promise<AuthContext | null> {
  const keyHash = hashApiKey(apiKey);
  const db = getFirestore();

  try {
    // Look up the key hash in the apiKeys collection
    const keyDoc = await db.doc(`apiKeys/${keyHash}`).get();

    if (!keyDoc.exists) {
      return null;
    }

    const data = keyDoc.data();
    if (data === undefined || typeof data.userId !== "string") {
      return null;
    }

    // Verify the user exists and the hash matches
    const userDoc = await db.doc(`users/${data.userId}`).get();
    if (!userDoc.exists) {
      return null;
    }

    const userData = userDoc.data();
    if (userData?.apiKeyHash !== keyHash) {
      // Key has been regenerated
      return null;
    }

    return {
      userId: data.userId,
      apiKeyHash: keyHash,
    };
  } catch (error) {
    logger.error("API key validation error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ip = getClientIp(req);

  // Check rate limiting
  if (isRateLimited(ip)) {
    const entry = authFailures.get(ip);
    const retryAfter = entry ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 3600;

    logger.warn("Auth rate limit exceeded", { ip, action: "auth_rate_limited" });

    res.setHeader("Retry-After", retryAfter.toString());
    res.status(429).json({
      error: "Too many authentication failures",
      retryAfter,
    });
    return;
  }

  // Check for Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader === undefined || authHeader === "") {
    logger.info("Missing authorization header", { ip, action: "auth_missing" });
    res.status(401).json({ error: "Authorization header required" });
    return;
  }

  // Parse Bearer token
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (match === null || match[1] === undefined || match[1] === "") {
    logger.info("Invalid authorization format", { ip, action: "auth_invalid_format" });
    res.status(401).json({ error: "Invalid authorization format. Use: Bearer <api_key>" });
    return;
  }

  const apiKey = match[1];

  // Validate API key asynchronously
  validateApiKey(apiKey)
    .then((authContext) => {
      if (!authContext) {
        recordAuthFailure(ip);
        logger.info("Invalid API key", { ip, action: "auth_invalid_key" });
        res.status(401).json({ error: "Invalid API key" });
        return;
      }

      // Attach auth context to request
      (req as AuthenticatedRequest).auth = authContext;

      logger.info("Authentication successful", {
        userId: authContext.userId,
        action: "auth_success",
      });

      next();
    })
    .catch((error) => {
      logger.error("Auth middleware error", {
        error: error instanceof Error ? error.message : String(error),
        ip,
        action: "auth_error",
      });
      res.status(500).json({ error: "Authentication service error" });
    });
}

// Export for testing
export const _internal = {
  hashApiKey,
  isRateLimited,
  recordAuthFailure,
  authFailures,
  validateApiKey,
};
