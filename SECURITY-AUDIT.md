# CacheBash Security Audit

**Auditor:** Security Review
**Date:** 2026-02-13
**Branch:** `security-sweep`
**Scope:** Full codebase — MCP server, Firebase backend, Flutter app, Cloud Run config

---

## Executive Summary

CacheBash demonstrates solid security fundamentals: secrets are properly gitignored, CORS is locked down (no `Access-Control-Allow-Origin` header set), Firestore rules enforce user isolation, and the Docker image runs as a non-root user with multi-stage builds. No hardcoded passwords, tokens, or service account keys were found in tracked files or git history. No references to client names, "Three Bears", or "TBD" were discovered.

However, four **critical** findings require immediate attention:

1. **No rate limiting on authentication endpoints** — brute-force attacks against API key validation are unconstrained.
2. **Timing-unsafe API key comparison** — `apiKeyValidator.ts` uses `!==` instead of `crypto.timingSafeEqual()`, enabling timing side-channel attacks.
3. **High-severity dependency vulnerability** — `@modelcontextprotocol/sdk` versions 1.10.0–1.25.3 have a cross-client data leak (GHSA-345p-7cg4-v4c7).
4. **Plaintext API key held in memory** — the full API key is stored in `AuthContext` for E2E encryption, expanding the attack surface if memory is dumped.

**Overall Grade: B-** — Strong access control and secret management, but authentication hardening and dependency patching are needed before the next production deploy.

---

## Findings

| # | Severity | Location | Description | Remediation |
|---|----------|----------|-------------|-------------|
| 1 | ~~CRITICAL~~ **FIXED** | `mcp-server/src/index.ts` | No rate limiting on auth endpoints — brute-force wide open. | **Fixed:** Added IP-based `checkAuthRateLimit` (10 req/min) to `/v1/interrupts/peek` and `/v1/mcp/*`. |
| 2 | ~~CRITICAL~~ **FIXED** | `mcp-server/src/auth/apiKeyValidator.ts` | Hash comparison used `!==` — timing side-channel. | **Fixed:** Replaced with `crypto.timingSafeEqual()`. |
| 3 | ~~CRITICAL~~ **FIXED** | `mcp-server/package.json` | `@modelcontextprotocol/sdk` 1.25.3 — cross-client data leak (GHSA-345p-7cg4-v4c7). | **Fixed:** Upgraded to 1.26.0. |
| 4 | ~~CRITICAL~~ **FIXED** | `mcp-server/src/auth/apiKeyValidator.ts` | Plaintext API key stored in `AuthContext` memory. | **Fixed:** Derive encryption key via PBKDF2 at auth time; raw key never stored. |
| 5 | ~~HIGH~~ **FIXED** | `mcp-server/src/index.ts:832` | Debug endpoints guarded by `NODE_ENV !== "production"` — misconfiguration exposed them. | **Fixed:** Changed to allowlist `=== "development"`. Unset env var now defaults to disabled. |
| 6 | ~~HIGH~~ **FIXED** | `firebase/firestore.rules` | Message `direction` field was mutable on update, enabling message spoofing. | **Fixed:** Added `directionUnchanged()` guard to update rule. |
| 7 | ~~HIGH~~ **FIXED** | `firebase/firestore.rules` | No explicit rules for `rateLimits` and `mcp_sessions` subcollections. | **Fixed:** Added explicit `allow read, write: if false` blocks for both. |
| 8 | **MEDIUM** | `mcp-server/src/middleware/rateLimiter.ts:18` | Rate limiting uses an in-memory `Map`. State resets on every Cloud Run cold start, and is not shared across instances. Under load, multiple instances each maintain independent counters. | Migrate to Firestore-backed or Redis-backed rate limiting, or use Cloud Run's built-in concurrency controls as a supplementary layer. |
| 9 | **MEDIUM** | `mcp-server/package.json` | `hono` <=4.11.6 has 4 moderate vulnerabilities: XSS via malicious MIME type, web cache deception, IP spoofing via `X-Forwarded-For`, arbitrary key read. | Upgrade `hono` to latest (>=4.12.0). Review custom middleware for MIME type or IP-dependent logic. |
| 10 | **MEDIUM** | `mcp-server/src/index.ts:775` | `/v1/health` endpoint returns `error.message` in 500 responses. Stack traces or internal paths could leak to unauthenticated callers. | Return a generic error message (`"Health check failed"`) in production. Log the full error server-side only. |
| 11 | **MEDIUM** | `firebase/firestore.rules` | Message `status` field is not validated on update. Clients can set arbitrary status values (e.g., `"admin"`, `"system"`) that the app doesn't expect. | Add `.hasOnly()` validation: `request.resource.data.status in ['pending', 'in_progress', 'answered', 'complete', 'expired', 'cancelled', 'acknowledged']`. |
| 12 | **MEDIUM** | `app/android/app/build.gradle.kts` | No ProGuard/R8 obfuscation configured for release builds. No signing config beyond TODOs. APK internals (class names, string literals) are readable. | Enable `minifyEnabled true` and `shrinkResources true` in release build type. Configure signing with a keystore before any public distribution. |
| 13 | **LOW** | `mcp-server/package.json`, `firebase/functions/package.json`, `cloud-run/package.json` | `qs` 6.7.0–6.14.1 has a DoS vulnerability via `arrayLimit` bypass. Present in all 3 packages. | Run `npm audit fix` in each package directory, or upgrade `qs` to >=6.15.0. |
| 14 | **LOW** | `app/lib/firebase_options.dart`, `app/android/app/google-services.json`, `app/ios/Runner/GoogleService-Info.plist` | Firebase API keys present in client code. These are expected for Firebase client SDKs and are not secret, but should be restricted. | Apply API key restrictions in Google Cloud Console: limit to Firebase APIs only, restrict by app bundle ID / package name. |
| 15 | **LOW** | `CLAUDE.md`, `LEARNINGS.md` | Personal email addresses appear in documentation files. Minor privacy concern. | Replace with generic addresses or remove if not needed. |

---

## Sweep Results by Category

### 1. Hardcoded Secrets, API Keys, Tokens
**Status: PASS**
No hardcoded passwords, AWS keys, GitHub tokens, OpenAI keys, private keys, or service account credentials found in tracked files. Firebase client API keys exist but are expected and properly scoped.

### 2. .env Files / Service Account JSON in Git History
**Status: PASS**
No `.env` files or service account JSON files found in git history. `.gitignore` is comprehensive and correctly excludes sensitive files (`*.json` configs, `.env*`, `firebase_options.dart`, etc.).

### 3. CORS Configuration
**Status: PASS**
No `Access-Control-Allow-Origin` header is set, meaning browser cross-origin requests are blocked by default. Only programmatic (non-browser) clients can reach the API.

### 4. Missing Auth on REST Endpoints
**Status: PARTIAL PASS**
All endpoints except `/v1/health` require authentication. Health endpoint is intentionally public (Cloud Run health check) but leaks error details (Finding #10).

### 5. Exposed Debug/Dev Routes
**Status: CONDITIONAL PASS**
Debug endpoints exist but are guarded by `NODE_ENV !== "production"`. Both Dockerfile and deploy command set `NODE_ENV=production`. Risk is misconfiguration (Finding #5).

### 6. Dependency Vulnerabilities (npm audit)
**Status: FAIL**
1 HIGH, 4 MODERATE, 3 LOW vulnerabilities across packages. The HIGH vulnerability in `@modelcontextprotocol/sdk` is particularly concerning as it enables cross-client data leaks (Finding #3).

### 7. Client Names / "Three Bears" / "TBD" References
**Status: PASS**
No references to external client names, "Three Bears", or "TBD" found anywhere in the codebase.

### 8. Firestore Security Rules
**Status: PARTIAL PASS**
User isolation is enforced via `isOwner()`. However, field-level validation is missing on updates (Findings #6, #11) and subcollection rules are implicit (Finding #7).

### 9. Cloud Run / Service Permissions
**Status: PARTIAL PASS**
`--allow-unauthenticated` is intentional (app-level auth handles access control). No explicit `--service-account` is specified in deploy scripts, meaning the default Compute Engine service account is used — which may have broader permissions than needed.

---

## Recommended Priority

| Priority | Findings | Effort |
|----------|----------|--------|
| ~~Immediate~~ | ~~#1, #2, #3~~ | **ALL FIXED** |
| ~~This sprint~~ | ~~#4, #5, #6, #7~~, #11 | **6/7 FIXED** |
| **Next sprint** | #8, #9, #10, #12 | ~3 hours |
| **Backlog** | #13, #14, #15 | ~1 hour |

---


