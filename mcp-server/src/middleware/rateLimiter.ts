/** In-memory rate limiter for MCP tool calls. */

const WINDOW_MS = 60000; // 1 minute

const RATE_LIMITS: Record<string, number> = {
  ask_question: 10,
  get_response: 60,
  update_status: 30,
  pin_task: 10,
  resume_task: 10,
  get_interrupts: 30,
  get_pending_tasks: 30,
  claim_task: 20,
  complete_task: 20,
};
const DEFAULT_LIMIT = 100;

const store = new Map<string, { count: number; resetAt: number }>();

function getRecord(userId: string, tool: string) {
  const key = `${userId}:${tool}`;
  const now = Date.now();
  const record = store.get(key);
  const maxRequests = RATE_LIMITS[tool] ?? DEFAULT_LIMIT;

  if (!record || now >= record.resetAt) {
    return { key, record: null, maxRequests, now };
  }
  return { key, record, maxRequests, now };
}

/** Returns true if allowed, false if rate limited. */
export function checkRateLimit(userId: string, tool: string): boolean {
  const { key, record, maxRequests, now } = getRecord(userId, tool);

  if (!record) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (record.count >= maxRequests) return false;
  record.count++;
  return true;
}

/** Get time until rate limit resets (in ms). */
export function getRateLimitResetIn(userId: string, tool: string): number {
  const { record, now } = getRecord(userId, tool);
  return record ? record.resetAt - now : 0;
}

/** Clean up expired records. Call periodically. */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (now >= record.resetAt) store.delete(key);
  }
}
