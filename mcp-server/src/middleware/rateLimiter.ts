/** In-memory rate limiter for MCP tool calls and auth endpoints. */

const WINDOW_MS = 60000; // 1 minute
const AUTH_WINDOW_MS = 60000; // 1 minute
const AUTH_MAX_ATTEMPTS = 100; // raised for multi-program sessions (4-5 programs share IP)

const RATE_LIMITS: Record<string, number> = {
  ask_question: 30,
  get_response: 120,
  update_status: 90,
  pin_task: 30,
  resume_task: 30,
  get_interrupts: 90,
  get_pending_tasks: 90,
  claim_task: 60,
  complete_task: 60,
  send_message: 60,
  create_task: 30,
  send_heartbeat: 60,
  send_alert: 30,
  update_sprint_story: 60,
  create_sprint: 10,
  complete_sprint: 10,
  add_story_to_sprint: 30,
};
const DEFAULT_LIMIT = 200;

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

// --- Auth endpoint rate limiting (by IP) ---

const authStore = new Map<string, { count: number; resetAt: number }>();

/** Returns true if auth attempt is allowed, false if rate limited. */
export function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = authStore.get(ip);

  if (!record || now >= record.resetAt) {
    authStore.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return true;
  }

  if (record.count >= AUTH_MAX_ATTEMPTS) return false;
  record.count++;
  return true;
}

// --- ISO endpoint rate limiting (by IP, 30 req/min) ---

const ISO_WINDOW_MS = 60000;
const ISO_MAX_REQUESTS = 120; // raised for multi-program sessions

const isoStore = new Map<string, { count: number; resetAt: number }>();

/** Returns true if ISO request is allowed, false if rate limited. */
export function checkIsoRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = isoStore.get(ip);

  if (!record || now >= record.resetAt) {
    isoStore.set(ip, { count: 1, resetAt: now + ISO_WINDOW_MS });
    return true;
  }

  if (record.count >= ISO_MAX_REQUESTS) return false;
  record.count++;
  return true;
}

/** Clean up expired records. Call periodically. */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (now >= record.resetAt) store.delete(key);
  }
  for (const [key, record] of authStore.entries()) {
    if (now >= record.resetAt) authStore.delete(key);
  }
  for (const [key, record] of isoStore.entries()) {
    if (now >= record.resetAt) isoStore.delete(key);
  }
}
