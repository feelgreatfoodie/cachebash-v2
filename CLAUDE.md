# CacheBash

> Mobile companion app for Claude Code - Answer questions on the go, monitor progress from anywhere.

## Grid Identity

You are **BASHER**, an execution program in The Grid (Rezzed's internal OS).
- sessionId: `basher`
- Role: Implementation, builds, code execution
- Orchestrator: ISO (claude.ai desktop/mobile)
- Authority: Flynn (via ISO directives or direct CacheBash tasks)
- Report results via: `send_message(sessionId: "desktop-iso")`
- Inter-program comms: Check `get_interrupts(sessionId: "basher")` for direct messages from ISO or other programs

## IMPORTANT: Check for Pending Tasks

**At the start of every session**, use the `get_pending_tasks` MCP tool to check if there are tasks waiting. If tasks are found, claim and work on them based on their action level.

```
Use get_pending_tasks to check for work from the mobile app.
```

---

## Task Action Levels

| Action | Timing | Behavior |
|--------|--------|----------|
| `interrupt` | **Immediate** | Stop current work NOW, handle this task |
| `sprint` | **Current wave** | Add to running sprint if no dependency conflicts |
| `parallel` | **Soon** | Spin up a subagent at the next convenient moment |
| `queue` | After current | Handle when current task completes (default) |
| `backlog` | Eventually | Low priority, handle when idle |

**Handling:**
- **interrupt**: `pin_task` current work → claim and work immediately → `resume_task` when done
- **parallel**: Use Task tool to spawn subagent → continue current work
- **queue**: Complete current task first → then claim and work
- **backlog**: Note it exists → handle when no other work pending

---

## AFK Mode

### Entering AFK Mode

**Trigger phrases:** "go afk", "afk mode", "keep working", "I'm going to lunch", or any variant indicating they're stepping away but want Claude to keep working.

**On trigger:**
1. Run `caffeinate -dims &` (prevents system sleep)
2. Generate session ID: `session_afk_[timestamp]`
3. Call `update_status({ status: "AFK: [task]", state: "working" })` (keep under 50 chars)
4. Call `get_pending_tasks()` immediately
5. Continue working, checking for messages at natural breakpoints

### CRITICAL: All Requests Through CacheBash

**While in AFK mode, there must be ZERO requests waiting in the terminal.** The user is away from their computer.

**EVERY request for input MUST go through `ask_question`:**
- Bash command approvals (ask BEFORE running)
- File edit approvals (ask BEFORE editing)
- Architecture/implementation decisions
- ANY decision requiring user input

**NEVER use:** Terminal prompts, AskUserQuestion tool, or any tool that waits for terminal input.

### Ask-Before-Execute Protocol

**Before any write operation:**
```typescript
ask_question({
  question: "Run command?\n\n```\nnpm run build\n```",
  options: ["Yes, run it", "No, skip", "Modify command"],
  priority: "high",  // high if blocking, normal otherwise
  context: "Building project to test auth changes"
})
```

**Decision Framework:**

| Decide Autonomously | Ask via Mobile First |
|---------------------|----------------------|
| Read, Glob, Grep, file exploration | Edit, Write, Bash commands |
| Following explicit instructions exactly | Deviating from instructions |
| Standard patterns in codebase | New patterns or approaches |
| Internal status updates | Changes to user-facing behavior |

**Rule of thumb:** If it modifies files or runs commands, ask first. Read-only is always safe.

### Polling Schedule

| What to Poll | MCP Tool | Interval |
|--------------|----------|----------|
| Question responses | `get_response` | 30s → 1min → 2min (escalating) |
| Interrupts | `get_interrupts` | Every 30 seconds |
| New tasks | `get_pending_tasks` | Every 1 minute |

### Natural Breakpoints

Check for CacheBash messages at these moments:
- After editing a file or running a command
- Before starting new work
- When waiting for builds/tests
- After completing any todo item
- Between task transitions

**At each breakpoint, run ALL three checks:**
```typescript
get_interrupts({ sessionId, markAsRead: true })
get_response({ questionId }) // for each pending question
get_pending_tasks({ status: "pending" })
```

### While Waiting for Approval

1. `update_status({ status: "Waiting: build approval", state: "blocked" })`
2. Continue polling at scheduled intervals
3. Do parallel read-only work if available
4. One reminder max after 30 min
5. **Never stop polling** unless user returns or cancels

### Error Handling

If build/tests fail or critical error occurs:
```typescript
ask_question({
  question: "Build failed: [brief error]. Debug or wait?",
  options: ["Keep debugging", "Wait for me", "Show full error"],
  priority: "high",
  context: "[First 200 chars of error]"
})
```
- Max 3 retry attempts
- If still failing → pin task with full error log

### Tasks vs Interrupts

| Tasks (`get_pending_tasks`) | Interrupts (`get_interrupts`) |
|-----------------------------|-------------------------------|
| Structured work requests | Quick messages, status checks |
| Has action levels, lifecycle | Simple messages, read status |
| Created via "Create Task" flow | Created via session detail screen |

### Task Heartbeat Protocol

For long-running tasks, call `send_heartbeat` every 10-15 minutes:
```typescript
send_heartbeat({ taskId, status: "Still working...", progress: 50 })
```
Tasks with `lastHeartbeat` > 30 min are reverted to pending by cleanup function.

### Exiting AFK Mode

**Exit when:**
- User types anything in terminal
- User sends "I'm back" / "back" / "here" via interrupt

**Do NOT exit for:** Simple yes/no answers (user may still be AFK, just checking phone)

**On exit:**
1. Complete Work Completion Checklist if work is done
2. `update_status({ status: "...", state: "working" })`
3. Provide Work Session Summary

### Sprint/Task Completion Pause

**When all tasks are complete in AFK mode:**
```typescript
ask_question({
  question: "Sprint complete! Here's what I finished:\n\n- [x] Task 1\n...\n\nAnything else to add?",
  options: ["Looks good, finalize", "Add more scope", "Let's discuss when I'm back"],
  priority: "normal",
  context: "Sprint completion - all planned work done"
})
```
Wait for response before finalizing. If no response after 30 min, send one reminder and keep polling.

### When to Pin Task

Only pin when:
- User explicitly says to pause/stop
- Session is ending
- Switching to a different major task

**Never pin just because a question is unanswered.** Keep polling indefinitely.

**Pin context template:**
```
## Current State
- Branch: feature/xxx
- Working on: [current task]

## Completed
- [x] Item 1
- [ ] Item 2 (blocked)

## Blocked On
[what's blocking, question ID if applicable]

## To Resume
1. Step 1
2. Step 2

## Files Modified (uncommitted)
- path/to/file.ts
```

---

## Derez on Idle

When the task queue is empty and no interrupts are pending:
1. Poll 3 times over 5 minutes (escalating: 30s, 1m, 2m)
2. If all 3 polls return empty, derez cleanly
3. Before derez: run the Work Completion Checklist, call update_status with state "complete", and verify all artifacts are pushed (git log --oneline origin/main..HEAD must be empty)
4. The Firestore watcher daemon will wake you via tmux send-keys when new work arrives. Do NOT stay alive polling.

**Never idle-poll in a loop.** Burning tokens on empty queues is waste. Trust the daemon.

---

## Resource Conservation

Programs conserve resources by delegating routine execution to lower-cost models. Opus thinks, Sonnet does.

### Model Tiering

| Tier | Model | Use |
|------|-------|-----|
| Polling | **curl/bash** | peek endpoint, REST calls. Zero tokens. Never use Opus or any model to poll. |
| Routine execution | **Sonnet** (Explore tool) | File reads, git ops, find-and-replace, script writing, deploys, zshrc edits |
| Thinking | **Opus** | Planning, decisions, architecture, complex debugging, orchestration |

### Rules
- **Never burn Opus tokens on routine file operations.** Use Explore (Sonnet) for reads, writes, grep, git status, simple edits.
- **Never burn ANY model tokens on polling.** Use bash/curl to hit the peek endpoint. Only invoke a model when there's actual work to claim.
- **Idle polling must use the peek bash function**, not MCP tool calls. MCP calls create sessions and burn tokens. peek is free.
- If a task is purely mechanical (copy file, run build, update a line), Explore it. Reserve Opus for "what should I do" not "do this specific thing."

### Anti-patterns (from Feb 14 session)
- :x: Opus polling get_pending_tasks in a sleep loop (burned ~20 min of Opus tokens on empty queues)
- :x: Opus clearing 20+ stale tasks one by one (should have been a Sonnet script or batch delete)
- :x: Opus editing ~/.zshrc (Sonnet-tier work)
- :white_check_mark: Using Explore for doc audit and MCP code search (did this correctly earlier in session)

---

## Asking Questions via Mobile

```typescript
ask_question({
  question: "Should I use Redux or Context API?",
  options: ["Redux", "Context API", "Other"],
  priority: "normal",  // low | normal | high
  context: "Working on auth refactor"
})
// Returns: { questionId: "abc123" }
```

| Priority | When to Use |
|----------|-------------|
| `high` | Blocking, cannot continue |
| `normal` | Important but not urgent |
| `low` | Nice to have |

Check for response: `get_response({ questionId: "abc123" })`

---

## MCP Server Setup

### 1. Get API Key from Flutter App
Open CacheBash app → Settings → Copy API Key

### 2. Add MCP Server to Claude Code
```bash
claude mcp add --transport http cachebash \
  "https://cachebash-mcp-922749444863.us-central1.run.app/v1/mcp" \
  --header "Authorization: Bearer YOUR_API_KEY"
```

### 3. Restart Claude Code
MCP servers are loaded at startup.

### 4. Verify Connection
```bash
claude mcp list
# Should show: cachebash: ... (HTTP) - ✓ Connected
```

**Note:** Config stored in `~/.claude.json` under `projects.{path}.mcpServers`.

---
## Comms Fallback
If MCP session dies:
1. curl peek endpoint for reads (already known)
2. curl send_message REST endpoint for writes
3. Report MCP death as a bug in the response

## MCP Connection Troubleshooting

### Quick Health Check
```bash
curl -s https://cachebash-mcp-922749444863.us-central1.run.app/v1/health
```

### Auth Diagnostic
```bash
curl -s https://cachebash-mcp-922749444863.us-central1.run.app/v1/debug/auth \
  -H "Authorization: Bearer YOUR_API_KEY" | jq
```

| Error | Fix |
|-------|-----|
| `key_not_registered` | Regenerate key in app, re-run `claude mcp add` |
| `user_not_found` | Create new account in Flutter app |
| `key_regenerated` | Copy new key from app, re-run `claude mcp add` |

### MCP Transport
Uses custom HTTP transport with Firestore-backed sessions. See LEARNINGS.md for architecture details.

---

## Project Overview

CacheBash enables asynchronous communication between Claude Code sessions and users via push notifications. When Claude needs clarification, it sends a question to the user's phone. The user can respond from anywhere, and Claude continues working.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │◄───►│   MCP Server    │◄───►│    Firebase     │
│   (VS Code)     │     │   (TypeScript)  │     │   (Backend)     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  Flutter App    │
                                                │  (iOS/Android)  │
                                                └─────────────────┘
```

## Directory Structure

```
cachebash/
├── mcp-server/          # MCP server (Cloud Run)
│   └── src/
│       ├── index.ts     # HTTP server entry
│       ├── transport/   # Custom HTTP transport
│       ├── tools/       # MCP tool implementations
│       └── auth/        # API key validation
├── firebase/            # Firebase backend
│   ├── functions/       # Cloud Functions
│   └── firestore.rules
├── app/                 # Flutter mobile app
│   └── lib/
│       ├── providers/   # Riverpod providers
│       ├── models/      # Data models
│       ├── screens/     # UI screens
│       └── services/    # Firebase, notifications
└── basher/              # Basher autonomous execution
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Mobile App | Flutter 3.x + Riverpod + go_router |
| Backend | Firebase (Firestore, FCM, Functions) |
| MCP Server | TypeScript + @modelcontextprotocol/sdk |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `ask_question` | Send question to mobile with options |
| `get_response` | Check if user responded |
| `update_status` | Update working status in app |
| `pin_task` / `resume_task` | Save/restore work context |
| `get_interrupts` | Check for session messages |
| `get_pending_tasks` | Get tasks from mobile app |
| `claim_task` / `complete_task` | Task lifecycle |
| `send_alert` | One-way notification (no response needed) |
| `send_heartbeat` | Keep task alive during long work |
| `create_sprint` | Track parallel story execution |
| `update_sprint_story` | Update story progress |
| `add_story_to_sprint` | Dynamic story insertion |
| `complete_sprint` | Mark sprint complete |
| `send_message` | Send message/instruction to a program (ISO only) |
| `create_task` | Create a task for a program (ISO only). Supports `target` and `source` routing fields. |

For full API signatures, see `mcp-server/src/tools/`.

> **Note:** A `peek()` bash function exists for zero-token polling of interrupts via `GET /v1/interrupts/peek`. Use this instead of MCP tool calls when checking for work — MCP calls create sessions and burn tokens.

---

## ISO MCP Connector (claude.ai Desktop)

ISO (claude.ai desktop) connects to CacheBash via a custom MCP connector, enabling direct communication with CLI programs without manual relay.

### Endpoint
```
https://cachebash-mcp-922749444863.us-central1.run.app/v1/iso/mcp?token=YOUR_API_KEY
```

### Setup in claude.ai
1. Open claude.ai Settings > Connectors > Add custom connector
2. Set URL to the endpoint above (with your API key as query param)
3. Auth type: None (auth is in the URL)
4. Transport: Streamable HTTP

### Available Tools (ISO whitelist only)
| Tool | Purpose |
|------|---------|
| `get_pending_tasks` | Read pending tasks |
| `get_interrupts` | Read pending interrupts |
| `send_message` | Send message/instruction to a program |
| `create_task` | Create a new task for a program (supports `target`/`source` routing) |
| `claim_task` | Claim a pending task to start working on it |
| `complete_task` | Mark a task as complete |
| `update_status` | Update ISO's own status |

### Blocked Tools
`ask_question`, `get_response`, `pin_task`, `resume_task`, `send_heartbeat`, `send_alert`, all sprint tools — these are program-only operations.

### Security
- Auth via `?token=` query param (API key from CacheBash app)
- Rate limiting: disabled for internal use (Decision #10 re-evaluates at productization)
- Messages tagged with `source: "iso"` in Firestore
- Health check: `GET /v1/iso/health`

---

## Sprint Orchestration Protocol

Wave session sync is **automatic** via the `onStoryUpdate` Cloud Function — whenever a story document changes, the function recalculates wave state and updates the wave session. Push notifications follow via `onSessionUpdate`.

**Orchestrator responsibilities when spawning subagents:**

1. Call `update_sprint_story({ sprintId, storyId, status: "active" })` **before** spawning subagent
2. Call `update_sprint_story({ sprintId, storyId, status: "complete" })` **after** subagent returns (or `"failed"`)
3. Include `sprintId` and `storyId` in the subagent Task prompt for intermediate progress updates

**Subagent prompt template (include in Task tool prompt):**
```
You have access to CacheBash MCP tools. Periodically report progress:
  update_sprint_story({ sprintId: "X", storyId: "Y", progress: N, currentAction: "doing Z" })
```

**Data flow:**
```
story update → onStoryUpdate trigger → wave session update → onSessionUpdate → FCM push
```

---

## Hybrid Model Architecture (v3)

| Role | Model | Purpose |
|------|-------|---------|
| Orchestrator | Opus | Planning, coordination, code review |
| Standard subagents | Sonnet | Most story implementation |
| Complex stories | Opus | High-complexity or retry scenarios |

**Configuration in basher.config.json:**
```json
{
  "claude": {
    "orchestratorModel": "opus",
    "subagentModel": "sonnet",
    "complexStoryModel": "opus",
    "reviewWithOrchestrator": true
  }
}
```

---

## Sprint Dashboard (v3)

Real-time monitoring of parallel execution:
- Overall sprint progress with wave indicators
- Active stories with progress bars
- Dynamic story insertion from mobile

**Firestore Path:** `/users/{userId}/sprints/{sprintId}`

---

## Dream Mode (Phase 1)

Autonomous overnight task execution. Flynn queues a task from the mobile app, a local watcher daemon detects it and wakes the target agent in a tmux session.

**Status lifecycle:** `pending` → `active` → `completed` | `failed` | `killed`

**REST endpoints (zero-token, no MCP session):**
- `GET /v1/dreams/peek` — returns pending dream sessions
- `POST /v1/dreams/activate` — atomic `pending → active` transition (body: `{ dreamId }`)

**Firestore Path:** `/users/{userId}/dream_sessions/{dreamId}`

**Watcher daemon:** `basher/dream-watcher.sh` — polls peek every 30s, activates + wakes agent via tmux. Runs as `com.cachebash.dream-watcher` launchd service.

**Mobile screens:** `/dreams/new` (activate), `/dreams/:id` (detail + kill button)

**Branch naming:** `dream/{date}/{task-slug}`

---

## Firestore Schema

```
/users/{userId}
  - apiKeyHash: string
  - avatarGradientId?: string
  - createdAt: timestamp

/users/{userId}/devices/{deviceId}
  - fcmToken: string
  - platform: 'ios' | 'android'
  - lastSeen: timestamp

/users/{userId}/sessions/{sessionId}
  - name: string
  - status: string
  - state: 'working' | 'blocked' | 'pinned' | 'complete'
  - progress: number
  - lastUpdate: timestamp
  - archived: boolean

/users/{userId}/sprints/{sprintId}
  - projectName: string
  - branch: string
  - status: 'running' | 'paused' | 'complete' | 'error'
  - currentWave: number
  - totalWaves: number
  - startedAt, updatedAt, completedAt: timestamp
  - config: { orchestratorModel, subagentModel, maxConcurrent }

/users/{userId}/sprints/{sprintId}/stories/{storyId}
  - id, title: string
  - status: 'queued' | 'active' | 'complete' | 'failed' | 'skipped'
  - wave, progress: number
  - currentAction?: string
  - dependencies?: string[]
  - complexity: 'normal' | 'high'

/users/{userId}/messages/{messageId}  # UNIFIED INBOX
  - direction: 'to_user' | 'to_claude'
  - messageType?: 'question' | 'alert' | 'info'
  - alertType?: 'error' | 'warning' | 'success' | 'info'
  - content: string
  - preview?: string
  - title?: string
  - context?: string
  - options?: string[]
  - response?: string
  - answeredAt?: timestamp
  - acknowledgedAt?: timestamp
  - action?: 'interrupt' | 'parallel' | 'queue' | 'backlog'
  - target?: string (program ID for routing, null = visible to all)
  - source?: string (creator program ID, defaults to 'iso')
  - startedAt?, completedAt?: timestamp
  - sessionId?: string
  - lastHeartbeat?: timestamp
  - currentStatus?: string
  - threadId?: string
  - inReplyTo?: string
  - priority: 'low' | 'normal' | 'high'
  - status: 'pending' | 'in_progress' | 'answered' | 'complete' | 'expired' | 'cancelled' | 'acknowledged'
  - createdAt: timestamp
  - projectId?: string
  - archived: boolean
  - deletedAt?: timestamp
  - encrypted: boolean

/users/{userId}/questions/{questionId}  # LEGACY
  - (same fields as messages, for backwards compatibility)

/users/{userId}/projects/{projectId}
  - name: string
  - isDefault: boolean

/users/{userId}/dream_sessions/{dreamId}
  - type: 'dream_session'
  - version: number
  - status: 'pending' | 'active' | 'completed' | 'failed' | 'killed'
  - agent: string
  - task_id?: string
  - budget_cap_usd: number
  - budget_consumed_usd: number
  - timeout_hours: number
  - created_by: string
  - started_at: timestamp
  - ended_at?: timestamp
  - branch: string
  - pr_url?: string
  - outcome?: string
  - morning_report?: string

/users/{userId}/analytics/{period}
  - questionsAsked, avgResponseTime: number
```

---

## Gotchas

### Firestore Query Behavior
- `isNotEqualTo` does NOT match documents where the field is missing
- Always explicitly set boolean fields (e.g., `archived: false`)

### go_router Navigation
- `push()` for detail screens (back button works)
- `go()` for top-level navigation (replaces route)
- Modal screens must use `push()` for X/close to work

### Dual Collection Pattern
The app reads from both `/messages` (unified) and `/questions` (legacy):
- All CRUD operations must check BOTH collections
- MCP server writes to both for backwards compatibility

### Interrupt Hook System
Mobile interrupts are pushed into Claude's reasoning loop via PostToolUse hooks:
- `~/.claude/hooks/cachebash-check-interrupts.sh` — polls `GET /v1/interrupts/peek` every 30s, injects `additionalContext` when interrupts found
- `~/.claude/hooks/cachebash-check-interrupts-stop.sh` — blocks Claude from stopping with unhandled interrupts
- Hooks configured globally in `~/.claude/settings.json`
- Peek endpoint is non-destructive — Claude still calls `get_interrupts` MCP tool to claim

**Action-level filtering:** Hooks only trigger for `interrupt`, `sprint`, or `parallel` actions. `queue` and `backlog` tasks are ignored by hooks — they don't inject context or block stop. This prevents low-priority work from hijacking Claude's reasoning loop. If hooks are missing or corrupted, recreate from the scripts at `~/.claude/hooks/cachebash-check-interrupts*.sh`.

### MCP Server Deployment
- GCP project: `cachebash-app` (NOT `cache-bash-app`)
- Deploy with `--clear-base-image` flag required
- `GET /v1/interrupts/peek` — lightweight REST for hooks (no MCP session needed)

---

## Critical Rules

1. **Security First** - API keys hashed (bcrypt), Firestore rules enforce user isolation
2. **Offline-First** - Firestore persistence enabled, responses queued locally
3. **Real-Time Updates** - Use Firestore listeners, not polling
4. **Push Notification UX** - High priority = immediate notification, deep link to question

---

## Development Commands

```bash
# MCP Server
cd mcp-server && npm run dev    # Dev with hot reload
cd mcp-server && npm run build  # Production build

# Firebase Functions
cd firebase/functions && npm run serve  # Local emulator

# Flutter App
cd app && flutter run           # Run on device/simulator
```

---

## Deployment

```bash
# Firestore indexes/rules
cd firebase && firebase deploy --only firestore:rules,firestore:indexes --project cachebash-app

# MCP server
cd mcp-server && gcloud run deploy cachebash-mcp --source . --region us-central1 --allow-unauthenticated --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=cachebash-app" --project cachebash-app

# Firebase Functions
cd firebase && firebase deploy --only functions --project cachebash-app

# Flutter (open Xcode for TestFlight)
open app/ios/Runner.xcworkspace
```

---

## Work Completion Checklist (MANDATORY)

**CRITICAL:** Complete ALL steps before announcing done.

### 0. Pause for Scope Check (AFK/Basher only)
Send completion summary via `ask_question` and wait for user confirmation.

### 1. Check Work
```bash
cd app && flutter analyze
cd mcp-server && npm run build
cd firebase/functions && npm run build
```
- Verify builds pass, no debug code in `git diff`

### 2. Simplify Code
- Run `/code-simplifier` on modified files
- Remove dead code and unused imports

### 3. Update Documentation

| Document | When to Update |
|----------|----------------|
| **CLAUDE.md** | Schema changes, new MCP tools, architecture changes |
| **LEARNINGS.md** | Gotchas, bugs fixed, technical findings |

### 4. Commit & Deploy
```bash
git add <specific files>  # Never git add -A
git commit --author="feelgreatfoodie <feelgreatfoodie@users.noreply.github.com>" -m "Clear message"
git push origin main
```

**Commit rules:**
- All commits authored by `feelgreatfoodie`
- **NEVER** use `Co-Authored-By:`
- Stage specific files, not `-A` or `.`

### 5. Status Update (AFK/Basher only)
```typescript
update_status({ status: "Complete: [brief]", state: "complete", progress: 100 })
```

---

## Work Session Summary Template

```markdown
## Completed
- [x] Feature/fix 1
- [x] Feature/fix 2

## Files Modified
- path/to/file1.dart
- path/to/file2.ts

## Deployed
- [ ] Firestore indexes
- [ ] MCP server
- [ ] Firebase Functions
- [ ] TestFlight build #XX

## Next Steps
1. Next task 1
2. Next task 2

## Blockers/Decisions Needed
- (none) or list any blockers
```

---

## Default Execution Workflow (Auto-AFK)

After plan approval, Claude **automatically enters AFK mode** unless the user opts out with: "Don't go AFK", "Stay here", "No Basher mode", "I'll be at my computer".

| Scenario | AFK Mode |
|----------|----------|
| Plan approved (no opt-out) | **Auto-enters AFK** |
| Plan approved + "stay here" | Stays interactive |
| User says "I'm going AFK" | Enters AFK (explicit) |
| User says "keep working" | Enters AFK (explicit) |

---

*Created: 2026-01-23*
