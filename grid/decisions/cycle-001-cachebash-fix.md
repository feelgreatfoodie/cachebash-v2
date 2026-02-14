# Cycle 001: CacheBash Core Fixes & ISO Connector

**Period:** 2026-01-30 — 2026-02-14
**Status:** COMPLETE

---

## Bugs Resolved

| Bug | Description | Fix | Commit | Deployed |
|-----|-------------|-----|--------|----------|
| BUG-001 | Interrupts don't interrupt — mobile messages sit unread | PostToolUse hook polls `/v1/interrupts/peek` every 30s, injects context | `ab608df` | Client-side hooks at `~/.claude/hooks/` |
| BUG-002 | Subagent wave sessions go stale on orchestrator crash | `onStoryUpdate` Firestore trigger auto-syncs wave sessions | `ded17a4` | Firebase Functions (`564c435` merge) |
| BUG-003 | Cross-repo MCP silent — project-scoped config | Moved MCP config to user scope in `~/.claude.json` | Client config | N/A (local config change) |

## Features Shipped

| Feature | Description | Commit |
|---------|-------------|--------|
| Security sweep | 7 fixes: rate limiting, timing-safe auth, SDK upgrade, debug lockdown, Firestore rules | `92deae6`, `b637c16` |
| ISO MCP connector | claude.ai desktop connects directly via `/v1/iso/mcp?token=` | `948708b` |
| `send_message` tool | ISO sends messages/instructions to CLI programs | `948708b` |
| `create_task` tool | ISO creates tasks for CLI programs | `948708b` |

## Deployments

| Target | Revision | Date |
|--------|----------|------|
| MCP Server (Cloud Run) | `cachebash-mcp-00031-j8k` | 2026-02-13 |
| MCP Server (Cloud Run) | `cachebash-mcp-00032-gs6` | 2026-02-14 |
| Firebase Functions | 10 functions (incl. `onStoryUpdate`) | 2026-02-13 |
| Firestore Rules | Direction immutability + subcollection lockdown | 2026-02-13 |

## Cleanup Performed

- 3 stale `in_progress` tasks cleared from Firestore (orphaned from Feb 1-3 sessions)
- Known Bugs section added to LEARNINGS.md with commit references

## Open Issues

None. All tracked bugs resolved.

## Warnings

- Firebase Functions runtime Node.js 20 deprecated 2026-04-30, decommissioned 2026-10-30
- `firebase-functions` package outdated — upgrade recommended

---

*End of line.*
