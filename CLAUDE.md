# CacheBash

> Mobile companion app for Claude Code - Answer questions on the go, monitor progress from anywhere.

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

For full API signatures, see `mcp-server/src/tools/`.

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
