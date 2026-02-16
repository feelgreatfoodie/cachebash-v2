/**
 * Rate limiter — DISABLED for internal use (Flynn directive, 2026-02-14).
 *
 * All check functions return true (allowed). No state is tracked.
 * When productization approaches, the security team evaluates abuse vectors
 * and designs a tiered approach. Until then, the pipe is open.
 */

/** Always allowed — rate limiting disabled. */
export function checkRateLimit(_userId: string, _tool: string): boolean {
  return true;
}

/** No rate limit active — returns 0. */
export function getRateLimitResetIn(_userId: string, _tool: string): number {
  return 0;
}

/** Always allowed — rate limiting disabled. */
export function checkAuthRateLimit(_ip: string): boolean {
  return true;
}

/** Always allowed — rate limiting disabled. */
export function checkIsoRateLimit(_ip: string): boolean {
  return true;
}

/** No-op — nothing to clean up. */
export function cleanupRateLimits(): void {}
