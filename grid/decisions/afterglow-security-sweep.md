# Afterglow: Security Sweep

**Date:** 2026-02-13
**Branch:** `grid/sark/security-sweep`
**Auditor:** SARK
**Grade:** B- (pre-fix) → **A-** (post-fix)

---

## What We Did

Full-codebase security audit across MCP server, Firebase backend, Flutter app, and Cloud Run config. 9 sweep categories: secrets, git history, CORS, auth endpoints, debug routes, npm deps, client name references, Firestore rules, Cloud Run permissions.

Identified 15 findings. Fixed all 4 CRITICALs and all 3 HIGHs in the same session.

## Findings Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| CRITICAL | 4 | 4 | 0 |
| HIGH | 3 | 3 | 0 |
| MEDIUM | 5 | 0 | 5 |
| LOW | 3 | 0 | 3 |

## Fixes Applied (7 commits)

### CRITICALs

1. **Rate limiting on auth endpoints** — Added IP-based `checkAuthRateLimit` (10 req/min) to `/v1/interrupts/peek` and `/v1/mcp/*`. Blocks brute-force attempts before `validateApiKey()` is called.

2. **Timing-safe hash comparison** — Replaced `!==` string comparison with `crypto.timingSafeEqual()` in `apiKeyValidator.ts`. Eliminates timing side-channel on API key hash validation.

3. **MCP SDK upgrade** — `@modelcontextprotocol/sdk` 1.25.3 → 1.26.0. Patches cross-client data leak (GHSA-345p-7cg4-v4c7).

4. **Plaintext API key removed from memory** — `AuthContext` no longer stores raw API key. Encryption key is derived via PBKDF2 at auth time and only the derived `Buffer` is retained. Updated `encrypt`/`decrypt` to accept `string | Buffer`, updated all callers (askQuestion, getResponse, getTasks), transport types, and tests.

### HIGHs

5. **Debug endpoint hardening** — Changed guard from `!== "production"` to `=== "development"` (allowlist). Unset `NODE_ENV` now defaults to disabled.

6. **Firestore direction immutability** — Added `directionUnchanged()` rule to message updates. Prevents clients from changing `direction` field to spoof messages.

7. **Explicit subcollection rules** — Added `allow read, write: if false` for `rateLimits` and `mcp_sessions` subcollections. Server-only access via Admin SDK.

## Remaining (MEDIUM/LOW)

| # | Finding | Priority |
|---|---------|----------|
| 8 | In-memory rate limiting (no cross-instance) | Next sprint |
| 9 | hono moderate vulnerabilities | Next sprint |
| 10 | Health endpoint leaks error.message | Next sprint |
| 11 | Firestore message status not validated on update | Next sprint |
| 12 | Android missing ProGuard/signing config | Next sprint |
| 13 | qs dependency DoS (3 packages) | Backlog |
| 14 | Firebase API key restrictions in GCP Console | Backlog |
| 15 | Personal email in docs | Backlog |

## Deployment Required

These fixes are code-only and need deployment to take effect:

- **MCP Server** — `gcloud run deploy` (rate limiting, timing-safe, SDK upgrade, key derivation)
- **Firestore Rules** — `firebase deploy --only firestore:rules` (direction immutability, subcollection rules)

## Decisions Made

- **Allowlist over denylist** for debug endpoints (`=== "development"` instead of `!== "production"`) — safer default.
- **PBKDF2-derived Buffer** for encryption key instead of raw API key — crypto module already used PBKDF2 internally, so we derived once at auth and pass the Buffer through.
- **IP-based auth rate limiting** (10/min) — simple, effective for single-instance Cloud Run. Cross-instance enforcement deferred to #8.
- **`string | Buffer` overload** on encrypt/decrypt — backwards-compatible, no breaking changes to crypto API.

---

*End of line.*
