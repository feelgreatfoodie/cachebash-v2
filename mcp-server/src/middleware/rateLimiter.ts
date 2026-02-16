/**
 * Rate Limiter Middleware
 *
 * Prevents abuse by limiting how many requests a user can make per time window.
 *
 * Algorithm: Token bucket (not sliding window)
 * - Each user gets a bucket with N tokens
 * - Each request consumes 1 token
 * - Tokens refill at a constant rate (e.g., 10 per second)
 * - If bucket is empty, request is rejected with 429 Too Many Requests
 *
 * Why token bucket:
 * - Handles bursts gracefully (accumulate tokens during idle periods)
 * - Simple to implement (just track tokens and last refill time)
 * - Fair across users (each user has independent bucket)
 *
 * Default limits:
 * - 100 requests per minute per user (covers typical agent workload)
 * - Higher limits for specific tools (e.g., heartbeat can be 10/sec)
 *
 * Storage: in-memory Map
 * - Ephemeral, resets on server restart (acceptable for rate limiting)
 * - Fast lookups (O(1))
 * - Auto-cleanup of expired buckets every 5 minutes
 *
 * Production considerations:
 * - Use Redis for multi-server deployments (shared rate limit state)
 * - Add per-IP limits in addition to per-user (prevent account sharing abuse)
 * - Different limits for different subscription tiers
 */

interface Bucket {
  tokens: number;
  lastRefill: Date;
}

const buckets: Map<string, Bucket> = new Map();
const REFILL_RATE = 100 / 60; // 100 tokens per minute = ~1.67 per second
const MAX_TOKENS = 100;
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a request should be rate limited
 * Returns true if allowed, false if rate limit exceeded
 */
export function checkRateLimit(userId: string, toolName: string): boolean {
  const key = `${userId}:${toolName}`;
  const now = new Date();

  let bucket = buckets.get(key);

  // Create new bucket if doesn't exist
  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = (now.getTime() - bucket.lastRefill.getTime()) / 1000; // seconds
  const tokensToAdd = elapsed * REFILL_RATE;
  bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  // Check if request can proceed
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}

/**
 * Cleanup expired buckets
 */
function cleanup() {
  const now = new Date();
  const expired: string[] = [];

  for (const [key, bucket] of buckets.entries()) {
    const elapsed = now.getTime() - bucket.lastRefill.getTime();
    if (elapsed > 30 * 60 * 1000) {
      // 30 min idle
      expired.push(key);
    }
  }

  for (const key of expired) {
    buckets.delete(key);
  }

  if (expired.length > 0) {
    console.log(`Cleaned up ${expired.length} rate limit buckets`);
  }
}

// Start cleanup job
setInterval(cleanup, CLEANUP_INTERVAL);
