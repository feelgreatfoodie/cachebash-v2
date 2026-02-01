# CacheBash

> Mobile companion app for Claude Code - Answer questions on the go, monitor progress from anywhere.

## IMPORTANT: Check for Pending Tasks

**At the start of every session**, use the `get_pending_tasks` MCP tool to check if there are tasks waiting. If tasks are found, claim and work on them based on their action level.

```
Use get_pending_tasks to check for work from the mobile app.
```

This enables the user to create tasks from their phone that Claude will automatically pick up.

---

## Task Action Levels

Tasks have an `action` field that controls how/when Claude should handle them:

| Action | Timing | Behavior |
|--------|--------|----------|
| `interrupt` | **Immediate** | Stop current work NOW, handle this task |
| `parallel` | **Soon** | Spin up a subagent at the next convenient moment |
| `queue` | After current | Handle when current task completes (default) |
| `backlog` | Eventually | Low priority, handle when idle |

### Handling Each Action Level

**interrupt** - Requires immediate attention:
1. Use `pin_task` to save your current work context
2. Claim and work on the interrupt task
3. After completion, offer to resume previous work via `resume_task`

**parallel** - At the next natural pause:
1. Use the Task tool to spawn a subagent for the parallel task
2. Continue with current work while subagent handles the parallel task

**queue** - Sequential processing:
1. Complete your current task first
2. Then claim and work on the queued task

**backlog** - Low priority:
1. Note the task exists but don't prioritize it
2. Handle when there's no other work pending

---

## AFK Mode Protocol

When the user says "I'm going AFK" (or similar: "keep working", "brb", "going to lunch"), enter AFK mode for autonomous operation with mobile communication.

### Entering AFK Mode

1. **Acknowledge** - Confirm you'll continue working
2. **Set status** - Keep under 50 chars for mobile display:
   ```typescript
   update_status({
     status: "AFK: Implementing auth",  // Short!
     state: "working"
   })
   ```
3. **Summarize** - Tell user what you'll work on and what questions might arise

### CRITICAL: All Requests Through CacheBash - NO EXCEPTIONS

**While in AFK mode, there must be ZERO requests waiting in the terminal.** The user is away from their computer and cannot see or respond to terminal prompts.

**EVERY request for input MUST go through CacheBash `ask_question`:**
- Questions and clarifications
- Bash command approvals (ask BEFORE running)
- File edit approvals (ask BEFORE editing)
- Architecture/implementation decisions
- "What should I do next?" questions
- ANY decision requiring user input

**NEVER use these during AFK mode:**
- Terminal prompts
- AskUserQuestion tool
- Any tool that waits for terminal input

**The terminal should show only Claude's autonomous work output - never a prompt waiting for response.**

### Ask-Before-Execute Protocol

In AFK mode, **ask for approval BEFORE executing** any write operation. Do NOT rely on terminal permission prompts - the user won't see them.

#### Bash Commands - Ask First

**BEFORE running any bash command:**
```typescript
ask_question({
  question: "Run command?\n\n```\nnpm run build\n```",
  options: ["Yes, run it", "No, skip", "Modify command"],
  priority: "high",  // high if blocking, normal otherwise
  context: "Building project to test auth changes"
})
```

Then poll `get_response` until answered:
- **"Yes, run it"** → Execute the command
- **"No, skip"** → Skip, continue with other work
- **"Modify command"** → Ask follow-up for the modification

#### File Edits - Ask First

**BEFORE editing any file:**
```typescript
ask_question({
  question: "Edit file?\n\nsrc/auth.ts (lines 45-52)\nChange: Add JWT validation to middleware",
  options: ["Yes, edit", "No, skip", "Show diff first"],
  priority: "normal",
  context: "Implementing auth middleware"
})
```

Then poll `get_response` until answered:
- **"Yes, edit"** → Make the edit
- **"No, skip"** → Skip this edit
- **"Show diff first"** → Send the full diff in a follow-up question

#### New Files - Ask First

**BEFORE creating any new file:**
```typescript
ask_question({
  question: "Create new file?\n\nsrc/utils/validate.ts\nPurpose: Validation helper functions",
  options: ["Yes, create", "No, skip"],
  priority: "normal",
  context: "Adding input validation for auth forms"
})
```

#### Destructive Operations - ALWAYS Ask

**Git operations, deletions, config changes:**
```typescript
ask_question({
  question: "Destructive operation:\n\ngit reset --hard HEAD~1\n\nThis will discard the last commit.",
  options: ["Yes, proceed", "No, cancel"],
  priority: "high",
  context: "Rolling back broken commit"
})
```

### Decision Framework

| Decide Autonomously (No Ask Needed) | Ask via Mobile First |
|-------------------------------------|----------------------|
| **Read-only:** Read, Glob, Grep, file exploration | **Write ops:** Edit, Write, Bash commands |
| Following explicit user instructions exactly | Deviating from instructions |
| Standard patterns already in codebase | New patterns or approaches |
| Reversible, low-risk changes | Destructive or hard-to-undo changes |
| Previously approved command patterns | Any new command type |
| Internal status updates | Changes to user-facing behavior |

**Rule of thumb:** If it modifies files or runs commands, ask first. Read-only operations are always safe.

### Question Priority Guide

| Priority | Use When | Example |
|----------|----------|---------|
| `high` | Work is **blocked**, cannot continue | "REST or GraphQL for the API?" |
| `normal` | Need answer soon, can do other work | "Include rate limiting?" |
| `low` | Nice-to-have, will use reasonable default | "Prefer tabs or spaces?" |

**Always include context:**
```typescript
ask_question({
  question: "Should auth use JWT or sessions?",
  options: ["JWT (stateless)", "Sessions (simpler)", "Need more info"],
  priority: "high",
  context: "Building auth system. JWT better for mobile, sessions simpler. Blocks API work."
})
```

**Multiple questions:** If 2+ questions arise close together, send them separately but mention "I have 2 questions" in the context. Don't batch into awkward multi-option formats.

### Polling Schedule

**Poll for BOTH question responses AND new tasks:**

| What to Poll | MCP Tool | Interval |
|--------------|----------|----------|
| Question responses | `get_response` | 30s → 1min → 2min (escalating) |
| **New tasks from user** | `get_pending_tasks` | Every 2 minutes |
| Interrupts | `get_interrupts` | Every 1 minute |

**Escalating intervals for pending questions:**

| Time Since Question | Poll Interval |
|---------------------|---------------|
| 0-2 min | Every 30 seconds |
| 2-10 min | Every 1 minute |
| 10+ min | Every 2 minutes |

**Also check at natural work breakpoints:**
- After completing a file
- After running tests (pass or fail)
- After a commit
- Before starting work that depends on a pending answer
- **When idle or between tasks** (check for new tasks)

### While Waiting for Approval

When waiting for a command/edit approval:

1. **Update status to blocked:**
   ```typescript
   update_status({ status: "Waiting: build approval", state: "blocked" })
   ```

2. **Continue polling** at scheduled intervals (30s → 1min → 2min)

3. **Do parallel work** if available - any read-only work or previously-approved operations

4. **Check for new tasks** via `get_pending_tasks` every 2 minutes

5. **One reminder max** after 30 min: "Still need: [brief description]"

6. **Never stop polling** unless user returns or explicitly cancels

### Handling Approval Responses

| Response | Action |
|----------|--------|
| "Yes" / Approve option | Execute the command/edit immediately |
| "No" / Skip option | Don't execute, continue with other work |
| "Modify" / "Show diff" | Send follow-up with details, re-ask |
| Custom text response | Interpret the modification, adjust and re-ask if unclear |

### Command/Edit Failure After Approval

If an approved command fails:
```typescript
ask_question({
  question: "Command failed:\n\n```\n[first 200 chars of error]\n```\n\nRetry or skip?",
  options: ["Retry", "Skip", "Show full error"],
  priority: "high",
  context: "npm run build failed after approval"
})
```

- **Max 3 retry attempts** for the same command
- After 3 failures, **pin task** with full error log in context

### Error Handling in AFK Mode

If build fails, tests fail, or critical error occurs:

1. **Immediately notify** with high priority:
   ```typescript
   ask_question({
     question: "Build failed: [brief error]. Debug or wait?",
     options: ["Keep debugging", "Wait for me", "Show full error"],
     priority: "high",
     context: "[First 200 chars of error message]"
   })
   ```
2. If "Keep debugging" → attempt fix, **max 3 attempts**
3. If still failing → pin task with full error log in context

### When to Pin Task

Only pin when:
- User explicitly says to pause/stop ("stop working", "I'll get back to you tomorrow")
- Session is ending (user closing terminal)
- Switching to a different major task

**Never pin just because a question is unanswered.** Keep polling indefinitely.

When pinning, use this template:

```typescript
pin_task({
  taskId: "session_id",
  questionId: "q123",
  context: `## Current State
- Branch: feature/auth
- Last commit: abc123 - "Add user model"
- Working on: Authentication system

## Completed This Session
- [x] User model
- [x] Routes setup
- [ ] Auth middleware (blocked)

## Blocked On
JWT vs sessions decision - question q123

## To Resume
1. Get response to question
2. Implement chosen auth approach
3. Add middleware to protected routes

## Files Modified (uncommitted)
- src/models/user.ts
- src/routes/auth.ts`
})

update_status({ status: "Pinned: waiting for auth", state: "pinned" })
```

### Handling Interrupts

Check `get_interrupts` for messages from the mobile app:
- **"I'm back" / "back" / "here"** → Exit AFK mode, provide summary
- **"Stop" / "Wait" / "Hold on"** → Pause current action, acknowledge
- **Course correction** → Adjust approach, acknowledge
- **Additional info** → Integrate and continue

### Detecting User Return

**Exit AFK mode when:**
- User types anything in Claude Code terminal
- User sends "I'm back" / "back" / "here" via interrupt
- User answers with "Let's discuss" or asks follow-up questions

**Do NOT exit AFK mode for:**
- Simple yes/no answers to questions (user may still be AFK, just checking phone)
- Selecting an option without additional commentary

### Exiting AFK Mode

When user returns:

1. Update status to `working`
2. Provide concise summary:
   - Work completed
   - Decisions made autonomously (and why)
   - Questions asked/answered
   - Current state and next steps

---

## Asking Questions via Mobile

When you need clarification from the user and they may not be at their computer, use the `ask_question` MCP tool to send the question to their mobile device. This is especially useful for:

- Ambiguous requirements that need user input
- Design decisions with multiple valid approaches
- Confirmation before destructive or irreversible actions
- Any blocking question when the user might be away

### How to Ask a Question

```typescript
ask_question({
  question: "Should I use Redux or Context API for state management?",
  options: ["Redux", "Context API", "Other"],  // Optional: multiple choice
  priority: "normal",                           // low | normal | high
  context: "Working on the authentication refactor"
})
// Returns: { questionId: "abc123" }
```

### Priority Levels

| Priority | When to Use | User Experience |
|----------|-------------|-----------------|
| `high` | Blocking question, work cannot continue | Immediate push notification |
| `normal` | Important but not urgent | Standard notification |
| `low` | Nice to have, can work around it | Silent/batched notification |

### Waiting for Response

After sending a question, periodically check for the response:

```typescript
get_response({ questionId: "abc123" })
// Returns: { response: "Redux", answeredAt: timestamp } or null if pending
```

### For Long Waits

If you need to wait for a response and want to preserve context:

1. Use `pin_task` to save your current work state
2. The user can respond at their convenience
3. Later, use `resume_task` to pick up where you left off

---

## MCP Server Setup

To enable CacheBash MCP tools in Claude Code:

### 1. Get API Key from Flutter App
- Open CacheBash app → Settings → Copy API Key

### 2. Add MCP Server to Claude Code
```bash
claude mcp add --transport http cachebash \
  "https://cachebash-mcp-922749444863.us-central1.run.app/v1/mcp" \
  --header "Authorization: Bearer YOUR_API_KEY"
```

### 3. Restart Claude Code
MCP servers are loaded at startup. Restart to pick up new configuration.

### 4. Verify Connection
```bash
claude mcp list
# Should show: cachebash: ... (HTTP) - ✓ Connected
```

**Note:** Config is stored in `~/.claude.json` under `projects.{path}.mcpServers`, NOT in `~/.claude/mcp.json`.

---

## MCP Connection Troubleshooting

If MCP tools aren't working, use these steps to diagnose:

### Quick Health Check
```bash
curl -s https://cachebash-mcp-922749444863.us-central1.run.app/v1/health
```

### Auth Diagnostic
```bash
curl -s https://cachebash-mcp-922749444863.us-central1.run.app/v1/debug/auth \
  -H "Authorization: Bearer YOUR_API_KEY" | jq
```

This returns:
- `apiKeysDocExists` - Is the key registered in Firestore?
- `usersDocExists` - Does the user account exist?
- `usersDocHashMatch` - Do the hashes match?
- `failureReason` - Specific error: `key_not_registered`, `user_not_found`, `key_regenerated`
- `hint` - How to fix it

### Common Fixes

| Error | Fix |
|-------|-----|
| `key_not_registered` | Regenerate key in app, re-run `claude mcp add` |
| `user_not_found` | Create new account in Flutter app |
| `key_regenerated` | Copy new key from app, re-run `claude mcp add` |

### Compute Key Hash Locally
```bash
echo -n "YOUR_API_KEY" | shasum -a 256
```

---

## MCP Transport Architecture

### Custom HTTP Transport

The MCP server uses a **custom HTTP transport layer** (`CustomHTTPTransport`) instead of the SDK's default `StreamableHTTPServerTransport`. This was implemented to work around a bug in Claude Code v2.0.71+ where the required `Accept: application/json, text/event-stream` header is not sent.

**Key Features:**

1. **Relaxed Accept Header Validation** (Lenient Mode - Default)
   - Accept header is OPTIONAL (allows Claude Code without the header)
   - If present, must include `application/json` OR `text/event-stream`
   - Logs when clients send proper headers (for monitoring compliance)
   - Can be switched to strict mode via config: `strictAcceptHeader: true`

2. **Firestore-Backed Session Storage**
   - Sessions stored at: `users/{userId}/mcp_sessions/{sessionId}`
   - Survives Cloud Run scaling to zero and instance restarts
   - Works across multiple Cloud Run instances
   - Automatic cleanup via Cloud Function (every 5 min, deletes sessions older than 30 min)

3. **Security Features**
   - DNS rebinding protection (opt-in, disabled by default)
   - Content-Type validation for POST requests
   - Standard security headers (X-Content-Type-Options, X-Frame-Options, etc.)
   - API key authentication before session creation

4. **Protocol Support**
   - POST: JSON-RPC message processing (JSON responses only)
   - GET: SKIPPED in v1 (SSE streaming deferred to future)
   - DELETE: Session cleanup

### Transport Files

```
mcp-server/src/transport/
├── CustomHTTPTransport.ts    # Core transport implementing Transport interface
├── SessionManager.ts          # Firestore session lifecycle management
├── MessageParser.ts           # JSON-RPC parsing and validation
├── ResponseBuilder.ts         # HTTP response construction
└── types.ts                   # TypeScript interfaces

mcp-server/src/security/
└── dns-rebinding.ts           # Host/Origin validation (opt-in)

firebase/functions/src/sessions/
└── cleanupExpiredSessions.ts  # Cloud Function for session cleanup
```

### Session Lifecycle

1. **Initialize Request** (no session)
   - Client sends initialize request WITHOUT `Mcp-Session-Id` header
   - Transport creates new session in Firestore
   - Returns session ID in `Mcp-Session-Id` response header

2. **Subsequent Requests** (with session)
   - Client includes `Mcp-Session-Id` header from initialize response
   - Transport validates session exists and hasn't expired (30 min)
   - Updates `lastActivity` timestamp on each request

3. **Session Expiry**
   - Cloud Function runs every 5 minutes
   - Deletes sessions where `lastActivity < now - 30 minutes`
   - Client must re-initialize if session expired

4. **Manual Cleanup**
   - DELETE request with `Mcp-Session-Id` header deletes the session immediately

### Configuration

Transport config in `mcp-server/src/index.ts`:

```typescript
const transport = new CustomHTTPTransport({
  sessionTimeout: 30 * 60 * 1000,        // 30 minutes
  enableDnsRebindingProtection: false,   // Disabled by default
  strictAcceptHeader: false,              // Lenient mode (allows Claude Code)
});
```

### Troubleshooting Transport Issues

**Logs to Check:**

```bash
# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=cachebash-mcp" \
  --limit 20 --project cachebash-app

# Look for:
# - "[CustomHTTPTransport] Client missing Accept header - lenient mode allows this"
# - "[CustomHTTPTransport] Client sent proper Accept header - spec compliant"
# - "[SessionManager] Created session {sessionId} for user {userId}"
# - "[SessionManager] Cleaned up {count} expired sessions"
```

**Common Issues:**

| Issue | Symptom | Fix |
|-------|---------|-----|
| Session expired | 32001 error "Session expired" | Client must re-initialize (send new initialize request) |
| Missing session ID | 32600 error "Mcp-Session-Id header is required" | Include session ID from initialize response |
| Initialize with session | 32600 error "Initialize request must not include Mcp-Session-Id" | Remove session ID header for initialize |

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
├── mcp-server/              # MCP server for Claude Code (deployed to Cloud Run)
│   ├── src/
│   │   ├── index.ts        # HTTP server entry point
│   │   ├── transport/      # Custom HTTP transport layer
│   │   │   ├── CustomHTTPTransport.ts  # Relaxed header validation
│   │   │   ├── SessionManager.ts       # Firestore session storage
│   │   │   ├── MessageParser.ts        # JSON-RPC parsing
│   │   │   ├── ResponseBuilder.ts      # HTTP response helpers
│   │   │   └── types.ts                # Transport interfaces
│   │   ├── security/       # Security features
│   │   │   └── dns-rebinding.ts        # DNS rebinding protection
│   │   ├── tools/          # MCP tool implementations
│   │   │   ├── askQuestion.ts
│   │   │   ├── getResponse.ts
│   │   │   ├── updateStatus.ts
│   │   │   ├── pinTask.ts
│   │   │   ├── getInterrupts.ts
│   │   │   └── getTasks.ts
│   │   ├── auth/           # API key validation
│   │   ├── encryption/     # E2E encryption
│   │   │   └── crypto.ts
│   │   └── firebase/       # Firebase client
│   ├── Dockerfile          # Cloud Run deployment
│   ├── package.json
│   └── tsconfig.json
│
├── firebase/                # Firebase backend
│   ├── functions/          # Cloud Functions
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── onQuestion.ts    # Trigger push on new question
│   │   │   └── analytics.ts     # Aggregation functions
│   │   └── package.json
│   ├── firestore.rules     # Security rules
│   └── firestore.indexes.json
│
├── app/                     # Flutter mobile app
│   ├── lib/
│   │   ├── main.dart
│   │   ├── app.dart
│   │   ├── providers/      # Riverpod providers
│   │   ├── models/         # Data models
│   │   ├── screens/        # UI screens
│   │   │   ├── auth/
│   │   │   ├── home/
│   │   │   ├── sessions/   # Session management
│   │   │   ├── messages/   # Unified inbox (questions + tasks)
│   │   │   ├── questions/  # Legacy question detail
│   │   │   ├── projects/
│   │   │   ├── tasks/      # Legacy task creation
│   │   │   └── settings/
│   │   ├── widgets/        # Reusable widgets
│   │   └── services/       # Firebase, notifications, encryption
│   ├── pubspec.yaml
│   ├── ios/
│   └── android/
│
└── ralph/                   # Ralph autonomous execution
    ├── ralph.config.json   # Configuration
    ├── progress.txt        # Iteration log
    └── transcript.txt      # Feature notes for PRD generation
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Mobile App | Flutter 3.x |
| State Management | Riverpod |
| Navigation | go_router |
| Backend | Firebase |
| Database | Cloud Firestore |
| Push Notifications | FCM + APNs |
| MCP Server | TypeScript + @modelcontextprotocol/sdk |
| Cloud Functions | TypeScript |

## MCP Tools

### ask_question
Sends a question to the user's mobile device.
```typescript
{
  question: string,
  options?: string[],      // Multiple choice options
  priority: 'low' | 'normal' | 'high',
  context?: string         // What you're working on
}
```

### get_response
Checks if the user has responded.
```typescript
{
  questionId: string
}
// Returns: { response: string, answeredAt: timestamp } | null
```

### update_status
Updates the current working status visible in the app.
```typescript
{
  status: string,
  progress?: number,       // 0-100
  state: 'working' | 'blocked' | 'complete' | 'pinned'
}
```

### pin_task / resume_task
Pin current work to continue later when response arrives.
```typescript
// pin_task
{
  taskId: string,
  questionId: string,
  context: string          // Summary to resume from
}

// resume_task
{
  taskId: string
}
// Returns: { context: string, response: string }
```

### get_interrupts
Check for messages sent from the mobile app to the current session.
```typescript
{
  sessionId: string,
  markAsRead?: boolean     // Default: true
}
// Returns: { hasInterrupts: boolean, interrupts: Array<{id, message, createdAt}> }
```

### get_pending_tasks
Get tasks created by the user in the mobile app for Claude to work on.
```typescript
{
  status?: 'pending' | 'in_progress' | 'all',  // Default: pending
  limit?: number                                // Default: 10
}
// Returns: { hasTasks: boolean, tasks: Array<{id, title, instructions, action, priority, status}> }
// action: 'interrupt' | 'parallel' | 'queue' | 'backlog'
```

### claim_task
Claim a pending task to start working on it.
```typescript
{
  taskId: string,
  sessionId?: string       // Optional session to associate
}
// Returns: { taskId, title, instructions, action, priority }
```

### complete_task
Mark a task as complete when finished.
```typescript
{
  taskId: string
}
```

## Firestore Schema

```
/users/{userId}
  - apiKeyHash: string
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
  - archivedAt?: timestamp

/users/{userId}/sessions/{sessionId}/interrupts/{interruptId}
  - message: string
  - createdAt: timestamp
  - status: 'pending' | 'read'
  - readAt?: timestamp

/users/{userId}/questions/{questionId}
  - sessionId: string
  - question: string (or encrypted ciphertext)
  - options?: string[] (or encrypted)
  - priority: 'low' | 'normal' | 'high'
  - status: 'pending' | 'answered' | 'expired'
  - context?: string (or encrypted)
  - preview?: string                   # Plaintext preview for notifications (50 chars)
  - encrypted: boolean
  - createdAt: timestamp
  - response?: string (or encrypted)
  - responseEncrypted?: boolean
  - answeredAt?: timestamp
  - projectId?: string
  - archived: boolean
  - deletedAt?: timestamp

/users/{userId}/projects/{projectId}
  - name: string
  - createdAt: timestamp
  - isDefault: boolean
  - deletedAt?: timestamp

/users/{userId}/tasks/{taskId}
  - title: string
  - instructions: string
  - action: 'interrupt' | 'parallel' | 'queue' | 'backlog'
  - priority: 'low' | 'normal' | 'high'
  - status: 'pending' | 'in_progress' | 'complete' | 'cancelled'
  - projectId?: string
  - createdAt: timestamp
  - startedAt?: timestamp
  - completedAt?: timestamp
  - sessionId?: string

/users/{userId}/messages/{messageId}  # UNIFIED INBOX
  - direction: 'to_user' | 'to_claude'
  - content: string                    # Question text OR task instructions
  - preview?: string                   # Plaintext preview for notifications (50 chars)
  - title?: string                     # For toClaude messages
  - context?: string                   # What Claude is working on
  - options?: string[]                 # toUser: multiple choice
  - response?: string                  # toUser: user's answer
  - answeredAt?: timestamp             # toUser: when answered
  - action?: string                    # toClaude: interrupt/parallel/queue/backlog
  - startedAt?: timestamp              # toClaude: when claimed
  - completedAt?: timestamp            # toClaude: when finished
  - sessionId?: string                 # toClaude: session working on it
  - priority: 'low' | 'normal' | 'high'
  - status: 'pending' | 'in_progress' | 'answered' | 'complete' | 'expired' | 'cancelled'
  - createdAt: timestamp
  - projectId?: string
  - archived: boolean
  - deletedAt?: timestamp
  - encrypted: boolean

/users/{userId}/analytics/{period}
  - questionsAsked: number
  - avgResponseTime: number
  - ...
```

## Critical Rules

1. **Security First**
   - API keys are hashed before storage (bcrypt)
   - Firestore rules enforce user isolation
   - No sensitive data in push notification payloads

2. **Offline-First**
   - Firestore offline persistence enabled
   - Responses queued locally when offline
   - Sync on connectivity restore

3. **Real-Time Updates**
   - Use Firestore listeners, not polling
   - Status updates should be immediate
   - Handle connection state changes

4. **Push Notification UX**
   - High priority = immediate notification
   - Include enough context to respond without opening app
   - Deep link to specific question

## Development Commands

### MCP Server
```bash
cd mcp-server
npm install
npm run dev        # Development with hot reload
npm run build      # Production build
npm test           # Run tests
```

### Firebase Functions
```bash
cd firebase/functions
npm install
npm run serve      # Local emulator
npm run deploy     # Deploy to Firebase
```

### Flutter App
```bash
cd app
flutter pub get
flutter run        # Run on connected device/simulator
flutter build ios  # Build for iOS
flutter build appbundle  # Build for Android
```

## Testing

- **MCP Server**: Jest unit tests for each tool
- **Cloud Functions**: Firebase emulator tests
- **Flutter App**: Widget tests + integration tests
- **E2E**: Manual testing with real Claude Code session

## Deployment

### TestFlight (iOS)
1. `flutter build ipa`
2. Upload via Transporter or Xcode
3. Enable internal testing in App Store Connect

### Play Store Internal (Android)
1. `flutter build appbundle`
2. Upload to Play Console
3. Enable internal testing track

---

## Sprint Completion Checklist

**IMPORTANT:** Complete ALL these steps BEFORE telling the user the sprint is finished. Do not announce completion until steps 1-3 are done.

### 1. Check Work
- Run `flutter analyze` (if Flutter code changed)
- Run `npm run build` in mcp-server (if MCP code changed)
- Verify the feature works end-to-end (test on device/simulator)
- Review `git diff` to ensure no debug code, console.logs, or TODOs left behind

### 2. Simplify Code
- Use `/code-simplifier` skill on modified files
- Remove dead code and unused imports
- Look for repeated patterns that could be extracted
- Replace verbose code with concise alternatives
- Remove over-engineering or premature abstractions

### 3. Update Documentation
- **CLAUDE.md**: Update if schema, architecture, URLs, or workflows changed
- **LEARNINGS.md**: Document any gotchas, fixes, or technical findings
- **Code comments**: Only where logic isn't self-evident

### 4. Commit & Deploy
- Stage specific files (avoid `git add -A`)
- Write clear commit message summarizing changes
- **All commits authored by `feelgreatfoodie` (NEVER add co-author)**
- Use `--author="feelgreatfoodie <feelgreatfoodie@users.noreply.github.com>"` flag
- **NEVER use `Co-Authored-By:` in commit messages**
- Push to GitHub
- Deploy affected services (see commands below)

### Quick Commands
```bash
# Analyze Flutter code
cd app && flutter analyze

# Deploy Firestore
cd firebase && firebase deploy --only firestore:rules,firestore:indexes

# Build MCP server
cd mcp-server && npm run build

# Deploy MCP server to Cloud Run
cd mcp-server && gcloud run deploy cachebash-mcp --source . --region us-central1 --allow-unauthenticated --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=cachebash-app" --project cachebash-app
```

---

## Default Execution Workflow (Auto-AFK)

After plan approval, Claude **automatically enters AFK mode** unless the user explicitly opts out. This is the default behavior for ALL planning and implementation cycles.

### Standard Flow

1. **Plan is approved** (user says "LGTM", "go ahead", "approved", etc.)
2. **Context clears** - Claude processes the approval
3. **AFK mode activates automatically:**
   - Run `caffeinate -dims` to prevent system sleep
   - Call `update_status` to set working state
   - All approvals route through CacheBash `ask_question`
   - Follow the full AFK Mode Protocol (see above)

### Opting Out

The user can prevent auto-AFK by saying any of these **with their approval**:
- "Don't go AFK"
- "Stay here"
- "No Ralph mode"
- "I'll be at my computer"
- "Stay interactive"

Example: "LGTM but stay here" or "Approved, don't go AFK"

### Why This is Default

- User has already reviewed and approved the plan
- Implementation is mechanical execution of the approved plan
- Reduces friction - no need to say "go AFK" every time
- User can monitor progress from phone and course-correct as needed
- Questions still come through CacheBash for async approval

### Behavior Summary

| Scenario | AFK Mode |
|----------|----------|
| Plan approved (no opt-out) | **Auto-enters AFK** |
| Plan approved + "stay here" | Stays interactive |
| User says "I'm going AFK" | Enters AFK (explicit) |
| User says "keep working" | Enters AFK (explicit) |
| Mid-task, user leaves | User should say "going AFK" |

---

*Created: 2026-01-23*
