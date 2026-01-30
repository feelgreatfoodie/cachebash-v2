# CacheBash

> Mobile companion app for Claude Code - Answer questions on the go, monitor progress from anywhere.

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
// Returns: { hasTasks: boolean, tasks: Array<{id, title, instructions, priority, status}> }
```

### claim_task
Claim a pending task to start working on it.
```typescript
{
  taskId: string,
  sessionId?: string       // Optional session to associate
}
// Returns: { taskId, title, instructions, priority }
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
