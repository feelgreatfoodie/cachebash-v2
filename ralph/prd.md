# CacheBash - Product Requirements Document

> **Mobile companion app for Claude Code - Answer questions on the go, monitor progress from anywhere.**

---

## Executive Summary

CacheBash is a mobile application that bridges Claude Code sessions with users when they're away from their computer. It enables asynchronous communication between Claude and users via push notifications, allowing autonomous workflows to continue by queuing questions until the user responds.

### Key Value Propositions

1. **Never block on questions** - Claude can pin tasks and continue other work while waiting
2. **Real-time visibility** - See what Claude is working on from anywhere
3. **Async-first workflow** - Questions accumulate, respond when convenient
4. **Multi-session support** - Track multiple projects/workspaces simultaneously

---

## Technical Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER'S COMPUTER                              │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐      ┌─────────────────────────────────────┐   │
│  │   Claude Code   │◄────►│      CacheBash MCP Server           │   │
│  │   (VS Code or   │      │  - ask_question tool                │   │
│  │    Terminal)    │      │  - update_status tool               │   │
│  └─────────────────┘      │  - get_response tool                │   │
│                           │  - pin_task / resume_task tools     │   │
│                           └──────────────┬──────────────────────┘   │
└──────────────────────────────────────────┼──────────────────────────┘
                                           │ HTTPS
                                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FIREBASE BACKEND                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │   Firestore     │  │ Cloud Functions │  │   FCM (Push)        │  │
│  │  - sessions     │  │  - onQuestion   │  │  - iOS APNs         │  │
│  │  - questions    │  │  - onResponse   │  │  - Android FCM      │  │
│  │  - responses    │  │  - analytics    │  │                     │  │
│  │  - devices      │  │                 │  │                     │  │
│  │  - analytics    │  │                 │  │                     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
└──────────────────────────────────────────┼──────────────────────────┘
                                           │ Push Notifications
                                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FLUTTER MOBILE APP                              │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  Sessions View  │  │ Questions Queue │  │  Analytics View     │  │
│  │  - Active work  │  │  - Pending Qs   │  │  - Response times   │  │
│  │  - Status       │  │  - History      │  │  - Question types   │  │
│  │  - History      │  │  - Quick reply  │  │  - Session stats    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Mobile App | Flutter | Single codebase for iOS + Android, native performance |
| Backend | Firebase | Real-time sync, push notifications, serverless |
| Database | Firestore | Real-time listeners, offline support |
| Push | FCM + APNs | Native push for both platforms |
| MCP Server | TypeScript/Node.js | Standard MCP implementation |
| Auth | API Key + Device Token | Simple, secure pairing |

---

## User Stories

### Epic 1: MCP Server Foundation

#### US-001: MCP Server Setup
**Priority:** P0 (Critical)
**Estimate:** 3-4 hours

**As a** developer
**I want** a working MCP server scaffold
**So that** Claude Code can communicate with CacheBash

**Acceptance Criteria:**
- [ ] MCP server initializes and registers with Claude Code
- [ ] Server exposes tool definitions to Claude
- [ ] Basic health check endpoint works
- [ ] Configuration loads from environment/config file
- [ ] Graceful shutdown handling

**Technical Notes:**
- Use `@modelcontextprotocol/sdk` package
- TypeScript with strict mode
- Configuration: API key, Firebase credentials, session ID

---

#### US-002: Ask Question Tool
**Priority:** P0 (Critical)
**Estimate:** 3-4 hours

**As** Claude
**I want to** send a question to the user's mobile device
**So that** I can get clarification without blocking

**Acceptance Criteria:**
- [ ] `ask_question` tool accepts: question text, options (optional), priority
- [ ] Question is stored in Firestore with timestamp and session context
- [ ] Push notification is triggered via Cloud Function
- [ ] Tool returns a question ID for tracking
- [ ] Duplicate detection prevents spam

**Technical Notes:**
```typescript
interface AskQuestionParams {
  question: string;
  options?: string[];        // Optional multiple choice
  priority: 'low' | 'normal' | 'high';
  context?: string;          // What Claude was working on
}
```

---

#### US-003: Get Response Tool
**Priority:** P0 (Critical)
**Estimate:** 2-3 hours

**As** Claude
**I want to** check if the user has responded to my question
**So that** I can continue the pinned task

**Acceptance Criteria:**
- [ ] `get_response` tool accepts question ID
- [ ] Returns response if available, null if pending
- [ ] Includes response timestamp and any user notes
- [ ] Can query multiple question IDs at once
- [ ] Handles expired/cancelled questions

**Technical Notes:**
- Poll-based initially, could add WebSocket later
- Cache responses locally to reduce API calls

---

#### US-004: Update Status Tool
**Priority:** P1 (High)
**Estimate:** 2-3 hours

**As** Claude
**I want to** update my current working status
**So that** the user can see progress in the app

**Acceptance Criteria:**
- [ ] `update_status` tool accepts: status text, progress %, task ID
- [ ] Status updates in real-time in the app
- [ ] History of status updates preserved
- [ ] Includes timestamp automatically
- [ ] Can mark task as complete/blocked/in-progress

**Technical Notes:**
```typescript
interface UpdateStatusParams {
  status: string;
  progress?: number;         // 0-100
  taskId?: string;
  state: 'working' | 'blocked' | 'complete' | 'pinned';
}
```

---

#### US-005: Pin/Resume Task Tools
**Priority:** P1 (High)
**Estimate:** 2-3 hours

**As** Claude
**I want to** pin a task while waiting for a response and resume it later
**So that** I can work on other tasks in the meantime

**Acceptance Criteria:**
- [ ] `pin_task` stores current context and reason for pin
- [ ] `resume_task` retrieves pinned context
- [ ] Multiple tasks can be pinned simultaneously
- [ ] Pin includes: task ID, question ID, context summary
- [ ] Resume provides full context to continue work

**Technical Notes:**
- Store pin context in Firestore for persistence
- Include enough context to resume without prior conversation

---

### Epic 2: Firebase Backend

#### US-006: Firestore Schema Setup
**Priority:** P0 (Critical)
**Estimate:** 2-3 hours

**As a** developer
**I want** a well-designed Firestore schema
**So that** data is organized and queries are efficient

**Acceptance Criteria:**
- [ ] Collections defined: users, sessions, questions, responses, devices
- [ ] Security rules enforce user isolation
- [ ] Indexes created for common queries
- [ ] TypeScript types match schema
- [ ] Schema documented

**Technical Notes:**
```
/users/{userId}
  - apiKey: string (hashed)
  - createdAt: timestamp
  - settings: map

/users/{userId}/devices/{deviceId}
  - fcmToken: string
  - platform: 'ios' | 'android'
  - lastSeen: timestamp

/users/{userId}/sessions/{sessionId}
  - name: string
  - status: string
  - state: 'active' | 'pinned' | 'complete'
  - lastUpdate: timestamp

/users/{userId}/questions/{questionId}
  - sessionId: string
  - question: string
  - options?: string[]
  - priority: string
  - status: 'pending' | 'answered' | 'expired'
  - createdAt: timestamp
  - answeredAt?: timestamp
  - response?: string
```

---

#### US-007: Cloud Functions for Push
**Priority:** P0 (Critical)
**Estimate:** 3-4 hours

**As a** user
**I want to** receive push notifications when Claude asks a question
**So that** I'm alerted immediately

**Acceptance Criteria:**
- [ ] Function triggers on new question document
- [ ] Sends push to all user's registered devices
- [ ] Notification includes question preview
- [ ] High priority questions use high-priority push
- [ ] Handles FCM errors gracefully

**Technical Notes:**
- Use Firebase Admin SDK
- Configure APNs for iOS
- Include question ID in notification payload for deep linking

---

#### US-008: API Key Authentication
**Priority:** P0 (Critical)
**Estimate:** 2-3 hours

**As a** user
**I want** secure API key authentication
**So that** only I can access my sessions

**Acceptance Criteria:**
- [ ] API keys are generated securely (256-bit random)
- [ ] Keys are hashed before storage (bcrypt/argon2)
- [ ] Key validation is fast and secure
- [ ] Rate limiting prevents brute force
- [ ] Key can be regenerated if compromised

**Technical Notes:**
- Generate in app, hash and store
- MCP server validates key on each request
- Include user ID in key for fast lookup

---

### Epic 3: Flutter Mobile App

#### US-009: App Project Setup
**Priority:** P0 (Critical)
**Estimate:** 2-3 hours

**As a** developer
**I want** a well-structured Flutter project
**So that** development is organized and scalable

**Acceptance Criteria:**
- [ ] Flutter project initialized with proper package name
- [ ] Firebase configured for iOS and Android
- [ ] State management set up (Riverpod recommended)
- [ ] Navigation structure defined
- [ ] Theme/styling foundation

**Technical Notes:**
- Package name: `com.cachebash.app`
- Use `flutter_riverpod` for state
- `go_router` for navigation
- Firebase packages: `firebase_core`, `cloud_firestore`, `firebase_messaging`

---

#### US-010: Device Registration & Auth
**Priority:** P0 (Critical)
**Estimate:** 3-4 hours

**As a** user
**I want to** pair my device with my API key
**So that** I can receive notifications

**Acceptance Criteria:**
- [ ] Onboarding screen explains the app
- [ ] API key input with validation
- [ ] Device registered with FCM token
- [ ] Pairing success confirmation
- [ ] Can re-pair if needed

**Technical Notes:**
- Store API key securely (flutter_secure_storage)
- Request notification permissions
- Generate and store FCM token

---

#### US-011: Sessions List View
**Priority:** P1 (High)
**Estimate:** 3-4 hours

**As a** user
**I want to** see all my active Claude sessions
**So that** I can monitor multiple projects

**Acceptance Criteria:**
- [ ] List shows all sessions with status
- [ ] Real-time updates via Firestore listeners
- [ ] Status indicator (active, pinned, complete)
- [ ] Tap to view session details
- [ ] Pull to refresh

**Technical Notes:**
- Use StreamBuilder with Firestore
- Show last update time relative (e.g., "2 min ago")
- Badge for pending questions

---

#### US-012: Session Detail View
**Priority:** P1 (High)
**Estimate:** 3-4 hours

**As a** user
**I want to** see detailed status of a Claude session
**So that** I know exactly what Claude is working on

**Acceptance Criteria:**
- [ ] Current status with progress indicator
- [ ] History of recent status updates
- [ ] List of pinned tasks for this session
- [ ] Quick link to pending questions
- [ ] Session metadata (started, last update)

**Technical Notes:**
- Real-time status updates
- Scrollable history with timestamps
- Visual progress bar if progress % available

---

#### US-013: Questions Queue View
**Priority:** P0 (Critical)
**Estimate:** 4-5 hours

**As a** user
**I want to** see and respond to Claude's questions
**So that** I can unblock Claude's work

**Acceptance Criteria:**
- [ ] List of pending questions across all sessions
- [ ] Sorted by priority, then by time
- [ ] Session context shown with each question
- [ ] Quick reply for multiple choice questions
- [ ] Text input for open questions
- [ ] Swipe to dismiss/defer

**Technical Notes:**
- Badge count on tab for pending questions
- Haptic feedback on interaction
- Offline queue for responses

---

#### US-014: Question Response Flow
**Priority:** P0 (Critical)
**Estimate:** 3-4 hours

**As a** user
**I want to** respond to a question
**So that** Claude can continue working

**Acceptance Criteria:**
- [ ] Tap question opens response view
- [ ] Multiple choice shows tap-to-select options
- [ ] Open questions show text input with suggestions
- [ ] Can add notes with any response
- [ ] Confirmation after sending
- [ ] Response synced to Firestore

**Technical Notes:**
- Optimistic UI update
- Offline support (queue and sync)
- Push response to MCP server via webhook

---

#### US-015: Push Notification Handling
**Priority:** P0 (Critical)
**Estimate:** 3-4 hours

**As a** user
**I want to** receive and interact with push notifications
**So that** I'm alerted to new questions

**Acceptance Criteria:**
- [ ] Notification shows question preview
- [ ] Tap opens directly to question
- [ ] Quick actions for multiple choice (iOS/Android)
- [ ] Badge updates with pending count
- [ ] Works when app is closed/background
- [ ] Sound/vibration for high priority

**Technical Notes:**
- Configure `firebase_messaging` for foreground/background
- Deep linking to specific question
- iOS: configure APNs, request permissions
- Android: configure notification channel

---

#### US-016: Offline Support
**Priority:** P2 (Medium)
**Estimate:** 3-4 hours

**As a** user
**I want** the app to work offline
**So that** I can respond even without internet

**Acceptance Criteria:**
- [ ] Questions cached locally
- [ ] Responses queued when offline
- [ ] Sync when connection restored
- [ ] Visual indicator of offline mode
- [ ] No data loss

**Technical Notes:**
- Firestore offline persistence enabled
- Queue responses in local storage
- Sync on connectivity change

---

### Epic 4: Analytics Dashboard

#### US-017: Analytics Data Collection
**Priority:** P2 (Medium)
**Estimate:** 2-3 hours

**As a** developer
**I want** analytics events tracked
**So that** users can see their usage patterns

**Acceptance Criteria:**
- [ ] Track: questions asked, response times, session duration
- [ ] Store aggregated stats in Firestore
- [ ] Daily/weekly/monthly rollups
- [ ] Per-session and global stats

**Technical Notes:**
- Cloud Function to aggregate on schedule
- Store in /users/{userId}/analytics collection

---

#### US-018: Analytics View
**Priority:** P2 (Medium)
**Estimate:** 3-4 hours

**As a** user
**I want to** see my usage analytics
**So that** I can understand my patterns

**Acceptance Criteria:**
- [ ] Average response time chart
- [ ] Questions per day/week
- [ ] Most active sessions
- [ ] Time of day patterns
- [ ] Filter by date range

**Technical Notes:**
- Use `fl_chart` for visualizations
- Cache analytics data locally
- Pull to refresh

---

### Epic 5: Distribution

#### US-019: TestFlight Setup
**Priority:** P1 (High)
**Estimate:** 2-3 hours

**As a** developer
**I want** the app deployed to TestFlight
**So that** beta testing can begin

**Acceptance Criteria:**
- [ ] iOS build signed with distribution certificate
- [ ] App uploaded to App Store Connect
- [ ] TestFlight internal testing enabled
- [ ] Build available for installation
- [ ] Crash reporting configured

**Technical Notes:**
- Configure Xcode signing
- Use `flutter build ipa`
- Upload via Transporter or `altool`

---

#### US-020: Android Internal Testing
**Priority:** P1 (High)
**Estimate:** 2-3 hours

**As a** developer
**I want** the app on Google Play internal testing
**So that** Android testing can begin

**Acceptance Criteria:**
- [ ] Android build signed with upload key
- [ ] App uploaded to Play Console
- [ ] Internal testing track configured
- [ ] Build available for installation

**Technical Notes:**
- Configure signing in build.gradle
- Use `flutter build appbundle`
- Upload via Play Console

---

## Story Dependencies

```
US-001 (MCP Setup)
    ├── US-002 (Ask Question)
    ├── US-003 (Get Response)
    ├── US-004 (Update Status)
    └── US-005 (Pin/Resume)

US-006 (Firestore Schema)
    ├── US-007 (Cloud Functions)
    └── US-008 (Auth)

US-009 (Flutter Setup)
    ├── US-010 (Device Auth)
    │       └── US-015 (Push Handling)
    ├── US-011 (Sessions List)
    │       └── US-012 (Session Detail)
    └── US-013 (Questions Queue)
            └── US-014 (Response Flow)

US-017 (Analytics Collection)
    └── US-018 (Analytics View)

US-010 + US-015 complete
    ├── US-019 (TestFlight)
    └── US-020 (Play Store)
```

---

## Effort Summary

| Epic | Stories | Min Hours | Max Hours |
|------|---------|-----------|-----------|
| MCP Server | 5 | 12 | 17 |
| Firebase Backend | 3 | 7 | 10 |
| Flutter App | 8 | 25 | 35 |
| Analytics | 2 | 5 | 7 |
| Distribution | 2 | 4 | 6 |
| **Total** | **20** | **53** | **75** |

---

## Implementation Phases

### Phase 1: Core Communication (MVP)
**Stories:** US-001 through US-008, US-009, US-010, US-013, US-014, US-015
**Estimate:** 35-50 hours
**Deliverable:** Working app that can receive questions and send responses

### Phase 2: Status & Sessions
**Stories:** US-004, US-005, US-011, US-012
**Estimate:** 10-14 hours
**Deliverable:** Full session monitoring and task pinning

### Phase 3: Analytics & Polish
**Stories:** US-016, US-017, US-018
**Estimate:** 8-11 hours
**Deliverable:** Offline support and usage analytics

### Phase 4: Distribution
**Stories:** US-019, US-020
**Estimate:** 4-6 hours
**Deliverable:** Apps on TestFlight and Play Store internal testing

---

## Success Metrics

1. **Response Time**: Average time from question to response < 5 minutes
2. **Delivery Rate**: 99%+ push notification delivery
3. **Adoption**: Users enable notifications and respond to >80% of questions
4. **Reliability**: <1% failed question/response syncs

---

## Future Considerations

- **Voice responses**: Reply via voice-to-text
- **Smart suggestions**: AI-powered response suggestions
- **Team support**: Multiple users per organization
- **Integrations**: Slack/Discord notifications as alternative
- **Widget**: iOS/Android home screen widgets for quick status

---

*Generated by CacheBash /kickoff flow*
*Created: 2026-01-23*
