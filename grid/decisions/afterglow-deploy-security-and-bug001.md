# Afterglow: Production Deploy — Security Fixes + BUG-001

**Date:** 2026-02-13
**Deployer:** BASHER
**Source:** `main` @ `a30a9b6` (merge of `grid/sark/security-sweep`)

---

## What Was Deployed

Full production deploy of SARK's security sweep (7 fixes) and BUG-002's `onStoryUpdate` Cloud Function. All three deployment targets updated in a single session.

## Deployment Targets

| Target | Status | Revision/Detail |
|--------|--------|-----------------|
| MCP Server (Cloud Run) | Deployed | `cachebash-mcp-00031-j8k`, 100% traffic |
| Firebase Functions | Deployed | 9 updated + 1 new (`onStoryUpdate`) |
| Firestore Rules | Deployed | Direction immutability + subcollection lockdown |

## Security Fixes Now Live

| # | Fix | Component |
|---|-----|-----------|
| 1 | IP-based rate limiting (10 req/min) on auth endpoints | MCP Server |
| 2 | Timing-safe API key hash comparison | MCP Server |
| 3 | `@modelcontextprotocol/sdk` 1.25.3 → 1.26.0 (GHSA-345p-7cg4-v4c7) | MCP Server |
| 4 | Raw API key purged from memory (PBKDF2-derived Buffer) | MCP Server |
| 5 | Debug endpoint allowlist (`=== "development"`) | MCP Server |
| 6 | Firestore `direction` field immutability rule | Firestore Rules |
| 7 | Explicit deny on `rateLimits` + `mcp_sessions` subcollections | Firestore Rules |

## Bug Fixes Now Live

| Bug | Fix | Component |
|-----|-----|-----------|
| BUG-002 | `onStoryUpdate` Firestore trigger for wave session sync | Firebase Functions |

## Verification

| Check | Result |
|-------|--------|
| `/v1/health` | `{"status":"ok","version":"1.0.1","firestore":"connected"}` |
| `/v1/interrupts/peek` (no auth) | 401 (correct — rate limiting active) |
| `/v1/interrupts/peek` (with auth) | 200 `{"hasInterrupts":false,"count":0}` |
| Firebase Functions deploy | All 10 functions successful |
| Firestore rules compilation | No errors |

## Warnings Noted

- Firebase Functions runtime Node.js 20 deprecated 2026-04-30, decommissioned 2026-10-30. Upgrade needed before then.
- `firebase-functions` package outdated — `npm install --save firebase-functions@latest` recommended.

## What Was NOT Deployed

- Flutter app (no code changes in this cycle)
- Firestore indexes (no changes)
- BUG-001 interrupt hooks (client-side only, already installed at `~/.claude/hooks/`)

---

*End of line.*
