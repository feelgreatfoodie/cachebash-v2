# CacheBash

> Mobile companion app for Claude Code — Answer questions on the go, monitor progress from anywhere.

## For Grid Programs

**Your identity comes from YOUR repo's CLAUDE.md, not this file.** This is project reference only. See your own repo for behavioral rules, comms protocol, AFK mode, and work completion checklists.

---

## Project Overview

CacheBash enables asynchronous communication between Claude Code sessions and users via push notifications. When Claude needs clarification, it sends a question to the user's phone. The user can respond from anywhere, and Claude continues working.

## Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   Claude Code     |<--->|   MCP Server      |<--->|    Firebase       |
|   (Terminal)      |     |   (TypeScript)    |     |   (Backend)       |
+-------------------+     +-------------------+     +---------+---------+
                                                              |
                                                              v
                                                    +-------------------+
                                                    |  Flutter App      |
                                                    |  (iOS/Android)    |
                                                    +-------------------+
```

## Directory Structure

```
cachebash/
+-- mcp-server/          # MCP server (Cloud Run)
|   +-- src/
|       +-- index.ts     # HTTP server entry
|       +-- transport/   # Custom HTTP transport
|       +-- tools/       # MCP tool implementations
|       +-- auth/        # API key validation
|       +-- iso/         # ISO connector endpoint
+-- firebase/            # Firebase backend
|   +-- functions/       # Cloud Functions
|   +-- firestore.rules
+-- app/                 # Flutter mobile app
|   +-- lib/
|       +-- providers/   # Riverpod providers
|       +-- models/      # Data models
|       +-- screens/     # UI screens
|       +-- services/    # Firebase, notifications
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Mobile App | Flutter 3.x + Riverpod + go_router |
| Backend | Firebase (Firestore, FCM, Functions) |
| MCP Server | TypeScript + @modelcontextprotocol/sdk |

---

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
| `send_message` | Send message/instruction to a program |
| `create_task` | Create a task for a program. Supports `target` and `source` routing. |
| `create_session` | Create/upsert session with optional `sessionId` and `programId` |
| `list_sessions` | List sessions, filterable by `programId` |

For full API signatures, see `mcp-server/src/tools/`.

> **Note:** A `peek()` bash function exists for zero-token polling of interrupts via `GET /v1/interrupts/peek`. Use this instead of MCP tool calls when checking for work.

---

## MCP Server Setup

### 1. Get API Key from Flutter App
Open CacheBash app -> Settings -> Copy API Key

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
# Should show: cachebash: ... (HTTP) - Connected
```

**Note:** Config stored in `~/.claude.json` under `mcpServers`.

---

## ISO MCP Connector (claude.ai Desktop)

ISO connects to CacheBash via a custom MCP connector for direct program communication.

### Endpoint
```
https://cachebash-mcp-922749444863.us-central1.run.app/v1/iso/mcp?token=YOUR_API_KEY
```

### Setup in claude.ai
1. Settings > Connectors > Add custom connector
2. URL: endpoint above (API key as query param)
3. Auth type: None (auth in URL)
4. Transport: Streamable HTTP

### ISO Whitelisted Tools
`get_pending_tasks`, `get_interrupts`, `send_message`, `create_task`, `claim_task`, `complete_task`, `update_status`

### Blocked Tools
`ask_question`, `get_response`, `pin_task`, `resume_task`, `send_heartbeat`, `send_alert`, all sprint tools.

### Security
- Auth via `?token=` query param
- Rate limiting: disabled for internal use
- Messages tagged with `source: "iso"` in Firestore
- Health check: `GET /v1/iso/health`

---

## Sprint Orchestration Protocol

Wave session sync is **automatic** via the `onStoryUpdate` Cloud Function.

**Orchestrator responsibilities:**
1. `update_sprint_story({ status: "active" })` before spawning subagent
2. `update_sprint_story({ status: "complete" })` after subagent returns
3. Include `sprintId` and `storyId` in subagent prompts for progress updates

**Data flow:** story update -> onStoryUpdate trigger -> wave session update -> onSessionUpdate -> FCM push

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

## Dream Mode (Phase 1)

Autonomous overnight task execution. Flynn queues a task from mobile, a watcher daemon detects it and wakes the target agent in a tmux session.

**Status lifecycle:** `pending` -> `active` -> `completed` | `failed` | `killed`

**REST endpoints (zero-token):**
- `GET /v1/dreams/peek` — returns pending dream sessions
- `POST /v1/dreams/activate` — atomic `pending -> active` transition

**Firestore Path:** `/users/{userId}/dream_sessions/{dreamId}`

**Watcher daemon:** `~/1P projects/basher/dream-watcher.sh` — polls peek every 30s, activates + wakes agent via tmux. Runs as `com.cachebash.dream-watcher` launchd service.

**Branch naming:** `dream/{date}/{task-slug}`

---

## Session Identity

Sessions support custom IDs and program identity for clean Grid integration.

**Naming convention:** `{program}[-{env}].{task}`
- `basher.dream-deploy` — single env, no suffix
- `iso-cli.portal-synthesis` — ISO in terminal
- `iso-mob.afternoon-check` — ISO on mobile

**`programId`** is auto-extracted from the sessionId prefix (before first `-` or `.`):
- `basher.dream-deploy` -> programId: `basher`
- `iso-cli.portal` -> programId: `iso`

**Tools:** `create_session(sessionId, programId)`, `list_sessions(programId)`, `update_status(sessionId)`

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
  - programId?: string
  - status: string
  - state: 'working' | 'blocked' | 'pinned' | 'complete'
  - progress: number
  - projectName?: string
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
  - action?: 'interrupt' | 'parallel' | 'queue' | 'backlog'
  - target?: string
  - source?: string
  - sessionId?: string
  - lastHeartbeat?: timestamp
  - threadId?: string
  - inReplyTo?: string
  - priority: 'low' | 'normal' | 'high'
  - status: 'pending' | 'in_progress' | 'answered' | 'complete' | 'expired' | 'cancelled' | 'acknowledged'
  - createdAt: timestamp
  - archived: boolean
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
  - timeout_hours: number
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
- `~/.claude/hooks/cachebash-check-interrupts.sh` — polls `GET /v1/interrupts/peek` every 30s
- `~/.claude/hooks/cachebash-check-interrupts-stop.sh` — blocks stop with unhandled interrupts
- Hooks configured globally in `~/.claude/settings.json`
- Action-level filtering: only `interrupt`, `sprint`, `parallel` trigger hooks. `queue` and `backlog` are ignored.

### MCP Server Deployment
- GCP project: `cachebash-app` (NOT `cache-bash-app`)
- Deploy with `--clear-base-image` flag
- `GET /v1/interrupts/peek` — lightweight REST for hooks (no MCP session)

---

## Critical Rules

1. **Security First** — API keys hashed (bcrypt), Firestore rules enforce user isolation
2. **Offline-First** — Firestore persistence enabled, responses queued locally
3. **Real-Time Updates** — Use Firestore listeners, not polling
4. **Push Notification UX** — High priority = immediate notification, deep link to question

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
cd mcp-server && gcloud run deploy cachebash-mcp --source . --region us-central1 --allow-unauthenticated --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=cachebash-app" --project cachebash-app --clear-base-image

# Firebase Functions
cd firebase && firebase deploy --only functions --project cachebash-app

# Flutter (open Xcode for TestFlight)
open app/ios/Runner.xcworkspace
```

## Commit Rules

- All commits authored by `feelgreatfoodie <feelgreatfoodie@users.noreply.github.com>`
- **NEVER** use `Co-Authored-By:`
- Stage specific files, never `-A` or `.`
- Feature branches: `grid/<program>/<short-description>`
- Branch protection ON — use branches + PRs, no direct push to main

---

*Created: 2026-01-23*
