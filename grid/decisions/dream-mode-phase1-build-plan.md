# Dream Mode Phase 1 + Fleet Management — Build Plan

**Author:** BASHER | **Date:** 2026-02-14 | **Status:** Pending ISO Review
**References:** Decision #13 (Addendum C), Fleet Management Interrupt

---

## Context

Council ratified Decision #13 (Addendum C): Dream Mode Phase 1 enables autonomous overnight task execution. Flynn queues a task from the mobile app, a local watcher daemon detects it and wakes the target agent in a tmux session, the agent works within budget/time constraints, and pushes a morning report when done.

A second interrupt adds fleet management prerequisites: tmux-aware zshrc aliases (mostly already done) and the watcher daemon itself.

## Status Lifecycle

```
User creates in app  →  status: "pending"
Watcher detects      →  status: "active" (watcher writes this atomically)
Agent completes      →  status: "completed" + morning_report
Agent crashes        →  status: "failed"
User taps Kill       →  status: "killed"
```

Note: The ratified schema lists `active | completed | failed | killed`. This plan adds `pending` as the initial state — the gap between "user creates" and "watcher picks up." The watcher's atomic `pending → active` transition is the acknowledgment mechanism (no separate watcher_ack field needed).

## Deliverables (8 total, 4 waves)

---

### Wave 0: Prerequisites (no deps, local-only)

**0a. Install tmux** (if not present)
```bash
brew install tmux
```

**0b. Add missing `iso` alias to ~/.zshrc** (~line 110)
The `grid-launch` function and 7 program aliases already exist. Only `iso` is missing from the tmux block. Add:
```bash
alias iso='grid-launch iso "$HOME/1P projects/rezzed-ai"'
```

---

### Wave 1: Data Layer (blocks Waves 2-4)

**1a. Firestore security rules**
- File: `firebase/firestore.rules` — add after sprints block (line 103):
```
match /dream_sessions/{dreamId} {
  allow read, write: if isOwner(userId);
}
```

**1b. DreamSessionModel**
- File: `app/lib/models/dream_session_model.dart` (create)
- Schema matches ratified Decision #13 exactly
- Fields: id, type, version, status, agent, taskId, budgetCapUsd, budgetConsumedUsd, timeoutHours, createdBy, startedAt, endedAt, branch, prUrl, outcome, morningReport
- `factory fromFirestore(DocumentSnapshot)` with null-safe Timestamp conversion
- Status helpers: isPending, isActive, isCompleted, isFailed, isKilled, isDone, isRunning
- Budget helpers: budgetRemaining, budgetPercentUsed

**1c. DreamSessionsProvider + Service**
- File: `app/lib/providers/dream_sessions_provider.dart` (create)
- `activeDreamSessionsProvider` — streams where status in [pending, active]
- `dreamSessionProvider` — family provider for single dream by ID
- `dreamSessionHistoryProvider` — completed/failed/killed
- `DreamSessionsService` with:
  - `createDreamSession(userId, agent, taskId?, budgetCapUsd, timeoutHours)` — writes status: "pending", generates branch name `dream/{date}/{slug}`
  - `killDreamSession(userId, dreamId)` — writes status: "killed", ended_at

---

### Wave 2: Backend (depends on Wave 1) — parallelizable with Wave 3

**2a. MCP server: GET /v1/dreams/peek**
- File: `mcp-server/src/index.ts` — add after `/v1/interrupts/peek` block (~line 975)
- Exact same auth/rate-limit pattern as interrupts/peek
- Queries `dream_sessions` where status == "pending", orderBy started_at asc, limit 5
- Returns `{ hasDreams: bool, count: number, dreams: [{id, agent, task_id, budget_cap_usd, timeout_hours, branch}] }`
- Zero-token — pure REST, no MCP session

**2b. MCP server: POST /v1/dreams/activate**
- File: `mcp-server/src/index.ts` — add after dreams/peek
- Same auth pattern
- Body: `{ dreamId: string }`
- Firestore transaction: read dream doc, verify status == "pending", update to "active"
- Returns success/failure (prevents double-wake)

**2c. Firebase Function: onDreamSessionUpdate**
- File: `firebase/functions/src/notifications/onDreamSessionUpdate.ts` (create)
- Firestore onUpdate trigger on `users/{userId}/dream_sessions/{dreamId}`
- Only fires on terminal status transitions: → completed, failed, killed
- Sends FCM push notification to all user devices
- Title varies by status: "Dream Complete" / "Dream Failed" / "Dream Stopped"
- Body includes agent name + morning_report preview (first 100 chars) if completed
- File: `firebase/functions/src/index.ts` — add export

---

### Wave 3: Mobile UI (depends on Wave 1) — parallelizable with Wave 2

**3a. Activate Dream Screen (3-tap flow)**
- File: `app/lib/screens/dreams/activate_dream_screen.dart` (create)
- Pattern: ConsumerStatefulWidget (like create_task_screen.dart)
- Layout:
  1. Agent picker — SegmentedButton with icons: basher, sark, able, beck, alan, quorra, radia
  2. Task picker — list backlog tasks from existing messages provider, or free-text input
  3. Budget cap — preset chips: $1, $2, $5, $10 (default $5)
  4. "Start Dream" button
- On submit: calls `dreamSessionsService.createDreamSession(...)`
- Navigates to dream detail screen on success

**3b. Dream Detail Screen (kill button + morning report)**
- File: `app/lib/screens/dreams/dream_detail_screen.dart` (create)
- Pattern: ConsumerWidget with `dreamSessionProvider.family` (like sprint_dashboard_screen.dart)
- Shows: status badge, agent, budget bar (consumed/cap), branch, elapsed time, PR link
- Morning report section: rendered markdown when status is completed
- Kill button: red ElevatedButton, visible only when isRunning, with confirmation dialog
- Kill action: calls `dreamSessionsService.killDreamSession(...)` + sends interrupt to agent

**3c. Router integration**
- File: `app/lib/app.dart` — add 2 routes inside ShellRoute:
  - `/dreams/new` → ActivateDreamScreen
  - `/dreams/:id` → DreamDetailScreen

**3d. Home screen integration**
- File: `app/lib/screens/home/home_screen.dart` — add Dream Mode section
- Watch `activeDreamSessionsProvider`
- If active dream exists: show dream card with status, agent, budget progress, tap-to-detail
- If no active dream: show "Start Dream" button → navigates to `/dreams/new`
- Insert between Pending Questions and Active Sessions sections

---

### Wave 4: Watcher Daemon (depends on Wave 2)

**4a. Dream watcher bash script**
- File: `basher/dream-watcher.sh` (create, ~60 lines)
- Extracts API key from `~/.claude.json` (same pattern as interrupt hooks)
- Polls `GET /v1/dreams/peek` every 30s
- For each pending dream:
  - POST `/v1/dreams/activate` to claim it (pending → active)
  - Call `wake()` function to send dream context to target agent's tmux session
- `wake()` is an abstracted function (Decision #6 amended):
  - Checks if tmux session exists for agent
  - If yes: `tmux send-keys -t $agent "dream context..."`
  - If no: creates session, launches claude, sends dream context
- Logs to `~/.cachebash/dream-watcher.log`

**4b. Launchd plist**
- File: `basher/com.cachebash.dream-watcher.plist` (create)
- Label: com.cachebash.dream-watcher
- RunAtLoad: true, KeepAlive: true
- PATH includes /opt/homebrew/bin for tmux/jq
- Stdout/stderr to ~/.cachebash/ logs

**4c. Installation**
```bash
mkdir -p ~/.cachebash
chmod +x basher/dream-watcher.sh
cp basher/com.cachebash.dream-watcher.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.cachebash.dream-watcher.plist
```

---

## Files Summary

| Action | File | Wave |
|--------|------|------|
| modify | `~/.zshrc` (add iso alias) | 0 |
| modify | `firebase/firestore.rules` | 1 |
| create | `app/lib/models/dream_session_model.dart` | 1 |
| create | `app/lib/providers/dream_sessions_provider.dart` | 1 |
| modify | `mcp-server/src/index.ts` (2 REST endpoints) | 2 |
| create | `firebase/functions/src/notifications/onDreamSessionUpdate.ts` | 2 |
| modify | `firebase/functions/src/index.ts` (add export) | 2 |
| create | `app/lib/screens/dreams/activate_dream_screen.dart` | 3 |
| create | `app/lib/screens/dreams/dream_detail_screen.dart` | 3 |
| modify | `app/lib/app.dart` (add routes + imports) | 3 |
| modify | `app/lib/screens/home/home_screen.dart` (dream section) | 3 |
| create | `basher/dream-watcher.sh` | 4 |
| create | `basher/com.cachebash.dream-watcher.plist` | 4 |

## Deployment Order

| Component | Command | When |
|-----------|---------|------|
| Firestore rules | `cb-rules` | After Wave 1 |
| MCP server | `cb-deploy` | After Wave 2 |
| Firebase Functions | `cd firebase && firebase deploy --only functions --project cachebash-app` | After Wave 2 |
| Flutter app | Xcode → TestFlight | After Wave 3 |
| Watcher daemon | `launchctl load ...` | After Wave 4 |

## Verification

1. **Firestore**: Deploy rules, verify no permission errors in Flutter app
2. **dreams/peek**: `curl -H "Authorization: Bearer $KEY" https://cachebash-mcp-.../v1/dreams/peek` returns `{ hasDreams: false }`
3. **Flutter**: Create dream session in app → verify Firestore doc with status: "pending"
4. **Watcher**: Tail log, verify it detects pending dream and transitions to "active"
5. **Kill flow**: Tap Kill in app → verify status: "killed" in Firestore
6. **Push notification**: Complete a dream session → verify FCM push arrives
7. **End-to-end**: Create dream from phone → watcher wakes basher tmux → basher works → completes → morning report push notification
