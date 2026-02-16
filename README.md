# CacheBash

**Async dispatch infrastructure for AI agent networks.**

AI agents work best when they can coordinate without blocking each other — and when a human can stay in the loop without sitting at a terminal. CacheBash is the middleware that makes that work: a task queue, message relay, and mobile notification system built on the [Model Context Protocol](https://modelcontextprotocol.io) (MCP).

Agents dispatch tasks, exchange messages, and ask questions. Humans answer from their phone. Everything flows through Firestore with real-time sync.

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│  MCP Client  │────▶│  CacheBash MCP   │────▶│  Firestore   │
│  (any agent) │◀────│  Server          │◀────│  (per-user)  │
└──────────────┘     └──────────────────┘     └──────┬───────┘
                            │                        │
                     ┌──────┴───────┐         ┌──────┴───────┐
                     │  REST API    │         │  Cloud       │
                     │  (fallback)  │         │  Functions   │
                     └──────────────┘         └──────┬───────┘
                                                     │
                                              ┌──────┴───────┐
                                              │  FCM Push    │
                                              │  → Mobile App│
                                              └──────────────┘
```

## Why CacheBash?

AI agents are getting good at autonomous work. But they hit a wall when they need something from a human — a decision, approval, clarification. The agent blocks. The human isn't at the terminal. Work stops.

CacheBash solves this with async dispatch:

- **Agents don't block.** They dispatch a question and keep working on other tasks. The answer arrives when the human is ready.
- **Humans respond from anywhere.** Push notification to your phone. Tap to answer. The agent picks up where it left off.
- **Multi-agent coordination.** Agents send messages to each other through a typed relay. Priority routing ensures urgent signals arrive first.
- **Session monitoring.** Watch what your agents are doing in real-time — progress bars, status updates, heartbeat detection for stale connections.

This isn't a chatbot framework. It's plumbing for AI agent networks that need to coordinate with each other and with people.

## Compatible Clients

CacheBash works with any MCP-compatible client:

| Client | Transport |
|--------|-----------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | MCP (HTTP) |
| [Cursor](https://cursor.sh) | MCP (HTTP) |
| [Windsurf](https://codeium.com/windsurf) | MCP (HTTP) |
| [Cline](https://github.com/cline/cline) | MCP (HTTP) |
| [ChatGPT](https://openai.com/chatgpt) | REST API |
| [Gemini](https://gemini.google.com) | REST API |
| Any HTTP client | REST API |

Not MCP-native? The REST API provides full parity — every tool has a corresponding endpoint.

## Quick Start

```bash
# Clone and install
git clone https://github.com/feelgreatfoodie/cachebash-v2.git
cd cachebash-v2/mcp-server
npm install

# Configure Firebase (replace with your project ID)
export FIREBASE_PROJECT_ID=your-project-id

# Start the server
npm start
# → CacheBash MCP server listening on port 3001
```

That's it. The server exposes:
- `POST /v1/mcp` — MCP JSON-RPC endpoint
- `GET/POST /v1/*` — REST API
- `GET /v1/health` — Health check

## Tool Reference

CacheBash exposes 12 tools through MCP. Each tool is also available as a REST endpoint.

### Task Dispatch

#### `get_tasks`
Retrieve tasks filtered by status, type, or target agent.

```json
// Request
{ "status": "created", "target": "agent-1", "limit": 10 }

// Response
{
  "success": true,
  "count": 2,
  "tasks": [
    {
      "id": "abc123",
      "title": "Process quarterly report",
      "type": "task",
      "priority": "high",
      "status": "created",
      "target": "agent-1"
    }
  ]
}
```

**REST:** `GET /v1/tasks?status=created&target=agent-1`

#### `create_task`
Dispatch a new task to an agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Task title (max 200 chars) |
| `target` | string | Yes | Target agent ID or `"all"` for broadcast |
| `instructions` | string | No | Detailed instructions (max 4000 chars) |
| `type` | string | No | `"task"` / `"question"` / `"scheduled"` |
| `priority` | string | No | `"low"` / `"normal"` / `"high"` |
| `action` | string | No | `"interrupt"` / `"parallel"` / `"queue"` / `"backlog"` |
| `ttl` | number | No | Seconds until expiry |
| `threadId` | string | No | Group related tasks |
| `replyTo` | string | No | Parent task ID |

```json
// Request
{
  "title": "Analyze deployment logs",
  "target": "agent-2",
  "instructions": "Check the last 24h of logs for error patterns",
  "priority": "high",
  "action": "queue"
}

// Response
{ "success": true, "taskId": "xyz789" }
```

**REST:** `POST /v1/tasks`

#### `claim_task`
Atomically claim a task. Uses Firestore transactions — two agents can't claim the same task.

```json
// Request
{ "taskId": "xyz789", "sessionId": "my-session" }

// Response
{ "success": true, "taskId": "xyz789", "title": "Analyze deployment logs" }
```

**REST:** `POST /v1/tasks/:id/claim`

#### `complete_task`
Mark a claimed task as done.

```json
{ "taskId": "xyz789" }
```

**REST:** `POST /v1/tasks/:id/complete`

---

### Message Relay

#### `send_message`
Send a typed message to another agent. Messages are sorted by priority.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | Yes | Sender agent ID |
| `target` | string | Yes | Receiver agent ID or `"all"` |
| `message` | string | Yes | Content (max 2000 chars) |
| `messageType` | string | Yes | `PING` / `PONG` / `STATUS` / `QUERY` / `RESULT` / `DIRECTIVE` / `ACK` |
| `priority` | string | No | `"low"` / `"normal"` / `"high"` |
| `ttl` | number | No | Seconds until expiry (default: 86400) |

```json
{
  "source": "agent-1",
  "target": "agent-2",
  "message": "Dataset preprocessing complete. 1.2M rows, 47 features.",
  "messageType": "RESULT",
  "priority": "normal"
}
```

**REST:** `POST /v1/messages`

#### `get_messages`
Poll for pending messages. Atomic delivery — claimed messages won't be delivered twice.

```json
// Request
{ "sessionId": "agent-1", "markAsRead": true }

// Response
{
  "success": true,
  "messages": [
    {
      "id": "msg456",
      "source": "agent-2",
      "messageType": "QUERY",
      "message": "Which model should I use for classification?",
      "priority": "high"
    }
  ]
}
```

**REST:** `GET /v1/messages?sessionId=agent-1`

---

### Session Tracking

#### `create_session`
Register a work session. Sessions track what agents are doing in real-time.

```json
{
  "name": "Data Pipeline Run #42",
  "sessionId": "pipeline-42",
  "agentId": "agent-1",
  "state": "working",
  "progress": 0
}
```

**REST:** `POST /v1/sessions`

#### `update_session`
Update session status and progress. Set `lastHeartbeat: true` to signal liveness.

```json
{
  "sessionId": "pipeline-42",
  "status": "Processing batch 3 of 10",
  "progress": 30,
  "lastHeartbeat": true
}
```

**REST:** `PATCH /v1/sessions/:id`

#### `list_sessions`
List active sessions with optional filters.

**REST:** `GET /v1/sessions?state=working&agentId=agent-1`

---

### Human Communication

#### `ask_question`
Send a question to the human operator's mobile device. The answer comes back asynchronously.

```json
{
  "question": "The test suite has 3 failures. Should I fix them or skip and deploy?",
  "options": ["Fix first", "Deploy anyway", "Cancel deployment"],
  "priority": "high",
  "context": "CI pipeline blocked on test failures"
}
```

**REST:** `POST /v1/questions`

#### `get_response`
Check if the human has answered. Poll this until `answered: true`.

```json
// Request
{ "questionId": "q123" }

// Response (answered)
{ "success": true, "answered": true, "response": "Fix first" }

// Response (waiting)
{ "success": true, "answered": false, "status": "created" }
```

**REST:** `GET /v1/questions/:id/response`

#### `send_alert`
One-way notification — no response expected. Good for status updates, errors, completions.

```json
{
  "message": "Deployment complete. 3 services updated.",
  "alertType": "success",
  "priority": "normal"
}
```

**REST:** `POST /v1/alerts`

## Mobile App

The Flutter app is the human interface. It connects directly to Firestore for real-time updates and receives push notifications via FCM.

**Screens:**
- **Home** — Dashboard with active sessions, pending questions, recent activity
- **Sessions** — Live view of what agents are doing (progress bars, heartbeat status)
- **Questions** — Pending questions from agents, tap to answer
- **Messages** — Unified inbox of agent-to-agent and agent-to-human messages
- **Tasks** — Full task list with status filters
- **Settings** — Notification preferences, account management


## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| MCP Server | TypeScript | Type safety for a protocol-heavy server. Strict mode, Zod validation on every input. |
| Mobile App | Flutter + Riverpod | Single codebase for iOS/Android. Riverpod gives us real-time Firestore streams with zero boilerplate. |
| Database | Firestore | Real-time sync to mobile, serverless scaling, per-user data isolation with security rules. |
| Auth | Firebase Auth + API Keys | Users authenticate with email/password. Agents authenticate with SHA-256 hashed API keys scoped per agent. |
| Notifications | FCM | Push to iOS/Android from Cloud Functions. Deep links route to the right screen. |
| Deployment | Cloud Run | Container-based, scales to zero, $0 when idle. |
| Protocol | MCP (Model Context Protocol) | Open standard for AI tool integration. Works with any compatible client. |

## Project Structure

```
cachebash/
├── mcp-server/          # MCP + REST server (TypeScript)
│   ├── src/
│   │   ├── index.ts          # Entry point, HTTP routing
│   │   ├── tools.ts          # Tool registry (12 tools)
│   │   ├── auth/             # API key validation
│   │   ├── firebase/         # Firebase initialization
│   │   ├── modules/          # Business logic (tasks, messages, sessions, questions)
│   │   ├── transport/        # MCP HTTP transport + REST router
│   │   ├── lifecycle/        # State machine engine
│   │   ├── middleware/       # Rate limiting, audit logging
│   │   └── types/            # TypeScript type definitions
│   ├── .gcloudignore
│   ├── Dockerfile
│   ├── tsconfig.json
│   └── package.json
├── app/                 # Flutter mobile app
│   └── lib/
│       ├── models/           # Firestore data models
│       ├── providers/        # Riverpod state providers
│       ├── screens/          # UI screens
│       ├── services/         # Auth, FCM, storage
│       ├── theme/            # Material theme
│       └── widgets/          # Reusable components
├── firebase/            # Firebase configuration
│   ├── firestore.rules       # Security rules
│   ├── firestore.indexes.json
│   └── functions/            # Cloud Functions (notifications, cleanup)
├── ARCHITECTURE.md      # Deep technical documentation
├── CONTRIBUTING.md      # Development setup and conventions
└── LICENSE              # MIT


## Deployment

### MCP Server (Cloud Run)

```bash
cd mcp-server
gcloud run deploy cachebash \
  --source . \
  --region us-central1 \
  --project your-project-id \
  --set-env-vars FIREBASE_PROJECT_ID=your-project-id
```

### Cloud Functions

```bash
cd firebase
firebase deploy --only functions --project your-project-id
```

### Firestore Rules & Indexes

```bash
cd firebase
firebase deploy --only firestore --project your-project-id
```

## MCP Configuration

Add CacheBash to your MCP client config:

```json
{
  "mcpServers": {
    "cachebash": {
      "url": "https://your-server-url/v1/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

## License

MIT
