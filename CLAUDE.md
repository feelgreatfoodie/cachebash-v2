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
├── mcp-server/              # MCP server for Claude Code
│   ├── src/
│   │   ├── index.ts        # Server entry point
│   │   ├── tools/          # MCP tool implementations
│   │   │   ├── askQuestion.ts
│   │   │   ├── getResponse.ts
│   │   │   ├── updateStatus.ts
│   │   │   ├── pinTask.ts
│   │   │   ├── getInterrupts.ts
│   │   │   └── getTasks.ts
│   │   ├── encryption/     # E2E encryption
│   │   │   └── crypto.ts
│   │   └── firebase/       # Firebase client
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
│   │   │   ├── questions/
│   │   │   ├── projects/
│   │   │   ├── tasks/      # Task queue
│   │   │   └── settings/
│   │   ├── widgets/        # Reusable widgets
│   │   └── services/       # Firebase, notifications, encryption
│   ├── pubspec.yaml
│   ├── ios/
│   └── android/
│
└── ralph/                   # Ralph configuration
    ├── prd.md
    ├── ralph.config.json
    └── progress.txt
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

*Created: 2026-01-23*
