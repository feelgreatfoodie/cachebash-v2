# CacheBash Session Handoff

**Last Updated:** 2026-01-31
**Status:** All PRD items complete ✅ | Build 14 deployed to TestFlight
**Branch:** `main`

---

## PRD Status: COMPLETE

All 14 user stories from `ralph/prd.md` are complete:

| Priority | Stories | Status |
|----------|---------|--------|
| P1 Critical | US-001 Push Notifications, US-002 Real-Time Updates, US-003 Sessions on Home | ✅ |
| P2 High | US-004 Archive Error, US-005 Archive Folder, US-006 Session Cards, US-007 Session History, US-008 Project Identifier | ✅ |
| P3 Medium | US-009 Nav Icons, US-010 Remove Task Button, US-011 X Button, US-012 Keyboard Dismiss, US-013 Back Navigation | ✅ |
| P4 Low | US-014 Help/Feedback | ✅ |

---

## CURRENT SESSION - Push Notification Hardening

### What Was Done
- Fixed FCM token registration race condition
- Added app lifecycle observer to sync token on resume
- Added token validation (min 100 chars)
- Expanded Cloud Function token cleanup (4 error codes)
- Deployed Firebase Functions
- Built and uploaded iOS build 14 to TestFlight

### Commits
- `5a1205e` - Fix push notification reliability issues

---

## PREVIOUS SESSION - Fixed Task Retrieval Bug

### Root Cause
MCP config in `~/.claude.json` was pointing to old Cloud Run service URL.

- **Old (wrong):** `cachebash-mcp-94772408270.us-central1.run.app/v1/messages`
- **New (correct):** `cachebash-mcp-922749444863.us-central1.run.app/v1/mcp`

### What Was Fixed
1. Updated `~/.claude.json` MCP config with correct URL
2. Updated `HANDOFF.md` - all URLs now point to correct service
3. Updated `app/lib/screens/auth/api_key_screen.dart` - test connection URL
4. Added `/v1/debug/messages` endpoint to MCP server for diagnostics

### Verification
```bash
# Debug endpoint confirmed 10 pending tasks exist for the authenticated user
curl -s '.../v1/debug/messages' -H 'Authorization: Bearer ...' | jq '.count'
# Returns: 10
```

### Next Step
**Restart Claude Code** - MCP servers are loaded at startup.

---

## PREVIOUS SESSION - MCP Protocol & Task Tools

### Context
Fixed Claude Code MCP integration and added all 9 MCP tools with E2E encryption support.

### What We Did This Session

1. **Fixed MCP Protocol Support**:
   - Added `initialize` method handler (required by Claude Code HTTP transport)
   - Added `notifications/initialized` and `ping` handlers
   - Changed from SSE endpoint (`/v1/sse`) to HTTP messages endpoint (`/v1/messages`)
   - Claude Code now connects successfully: `claude mcp list` shows ✓ Connected

2. **Added Task Tools with Decryption**:
   - `get_pending_tasks` - Retrieves encrypted tasks, decrypts them
   - `claim_task` - Claims task and returns decrypted content
   - `complete_task` - Marks task as complete
   - `get_interrupts` - Gets session interrupt messages

3. **Added Encryption Module** (`cloud-run/src/encryption/crypto.ts`):
   - PBKDF2 key derivation from API key
   - AES-256-CBC decryption matching Flutter app
   - `decryptTaskData()` helper for task content

4. **Fixed Deploy Script**:
   - Added `FIREBASE_PROJECT_ID=cachebash-app` env var (was getting lost on deploy)

5. **MCP Server Configuration**:
   - Added via: `claude mcp add --transport http cachebash .../v1/messages`
   - Config stored in `~/.claude.json` under project settings
   - Requires session restart to pick up new MCP servers

### All 9 MCP Tools Now Working

| Tool | Status | Description |
|------|--------|-------------|
| `ask_question` | ✅ | Send question to mobile, get push notification |
| `get_response` | ✅ | Check for user's answer |
| `update_status` | ✅ | Update session status in app |
| `pin_task` | ✅ | Save context for later |
| `resume_task` | ✅ | Resume saved context |
| `get_pending_tasks` | ✅ | Get tasks from app (decrypted) |
| `claim_task` | ✅ | Claim task to work on (decrypted) |
| `complete_task` | ✅ | Mark task done |
| `get_interrupts` | ✅ | Get messages from app |

### Tested End-to-End

- ✅ `ask_question` sent "Testing MCP connection" → arrived on phone
- ✅ User responded "yes! it works" → `get_response` returned it
- ✅ User created task "What are our next steps?" → `get_pending_tasks` returned decrypted

---

## Previous Session - API Key Authentication Fix

### Root Cause Analysis

The Cloud Run service was deployed in GCP project `cache-bash-app` but Firestore lives in Firebase project `cachebash-app`. The service needed:
1. `FIREBASE_PROJECT_ID` env var to point to the correct Firestore
2. IAM permissions for cross-project Firestore access

### Verification Results

```
$ curl -s https://cachebash-mcp-922749444863.us-central1.run.app/v1/debug/auth \
  -H "Authorization: Bearer <key>" | jq
{
  "keyProvided": true,
  "keyHashPartial": "7eae7bc9...5aec",
  "apiKeysDocExists": true,
  "usersDocExists": true,
  "usersDocHashMatch": true,
  "failureReason": "success",
  "hint": "API key is valid and properly registered. Authentication should work.",
  "userId": "T0NW...UHJ2"
}
```

SSE connection test also successful.

### How E2E Encryption Works

```
MCP Server                          Mobile App
    │                                    │
    │  API Key (in config)               │  API Key (in secure storage)
    │         │                          │         │
    │         ▼                          │         ▼
    │  PBKDF2(apiKey, salt)              │  PBKDF2(apiKey, salt)
    │         │                          │         │
    │         ▼                          │         ▼
    │  Derived Key (256-bit)             │  Derived Key (256-bit)
    │         │                          │         │
    │         ▼                          │         ▼
    │  AES-256-CBC encrypt ──────────────│──► AES-256-CBC decrypt
```

**Key files:**
- MCP encryption: `mcp-server/src/encryption/crypto.ts`
- MCP auth: `mcp-server/src/auth/apiKeyValidator.ts`
- App encryption: `app/lib/services/encryption_service.dart`

### What Needs Testing (Next Session)

After restarting Claude Code with new API key:

1. **Send test message via `ask_question`**
   - Verify message arrives on phone
   - Verify message is decrypted correctly (not showing ciphertext)

2. **Respond from app**
   - Check `get_response` returns decrypted response

3. **Test full workflow:**
   - Create task from app
   - Claude picks up task via `get_pending_tasks`
   - Verify task title/instructions are decrypted

4. **Verify 5-icon navigation** - User reported only seeing 4 icons before build 2

### Things We Tried That Didn't Work

1. **Firebase Admin SDK script to delete users** - Failed due to expired Google OAuth credentials (`invalid_rapt` error)
2. **`gcloud auth application-default login`** - Requires interactive browser auth

**Solution:** User deleted users manually via Firebase Console

### Files Changed This Session

| File | Change |
|------|--------|
| `~/.claude/mcp.json` | Updated API key |
| `app/pubspec.yaml` | Version bump to 1.0.0+2 |

---

## Previous Status (Phases 1-3 Complete)

### Phase 1: MVP - COMPLETE
- Local MCP server, Firebase backend, Flutter app
- Push notifications working
- TestFlight deployed

### Phase 2: Cloud-Hosted MCP Server - COMPLETE
- Cloud Run deployment at `https://cachebash-mcp-922749444863.us-central1.run.app`
- SSE transport with Bearer token auth
- All 17 stories complete
- Projects feature with archive/delete

### Phase 3: Premium UX Enhancements - COMPLETE

#### Completed
- [x] Haptic feedback system across all interactive elements
- [x] Pull-to-refresh on Questions and Projects screens
- [x] End-to-end encryption (AES-256-CBC with PBKDF2 key derivation)
  - Questions: encrypted on send, decrypted on display
  - Responses: encrypted on submit, decrypted by MCP server
  - Tasks: title & instructions encrypted (tested & verified)
- [x] Gmail-style session management (Active/Inactive/Archived)
- [x] Session detail screen with interrupt messaging
- [x] Task queue system (App → Claude communication)
- [x] Task action levels (interrupt, parallel, queue, backlog)
- [x] Git history cleanup (author: feelgreatfoodie)
- [x] E2E encryption tested and verified working
- [x] Staggered list animations (fade/slide-in with stagger delay)
- [x] Shimmer loading states (questions, sessions, tasks)
- [x] Unified search (questions, tasks, sessions, projects)
- [x] Bottom nav with Search icon and Inbox notification badge
- [x] Multi-select for bulk archive/delete (questions, sessions, tasks)

---

## New Features This Session

### Unified Search
Search across all content types from the new Search screen:
- **Filter by type:** All, Questions, Tasks, Sessions, Projects
- **Filter by status:** All, Pending, Completed, Archived
- **Debounced search** (300ms) for responsive UX
- Results grouped by type with section headers

### Multi-Select for Bulk Operations
Long-press or tap checklist icon to enter selection mode:
- **Questions:** Bulk archive, bulk delete
- **Sessions:** Bulk archive, bulk delete
- **Tasks:** Bulk cancel, bulk delete
- Select All / Deselect All support
- Visual feedback with checkmarks and highlighted borders

### Bottom Navigation Updates
- Added Search icon between + and Sessions
- Inbox icon now shows notification badge with pending question count

### UX Polish
- **Shimmer loading states** replace spinners on all list screens
- **Staggered animations** for list items (fade + slide-in)

### Gmail-Style Session Management
Sessions now have intelligent state management:
- **Active** - Working/blocked sessions updated in last 30 minutes
- **Inactive** - Stale sessions (30+ min without update) shown separately
- **Archived** - User-archived sessions, viewable/restorable

**Gestures:**
- Swipe left → Archive session
- Swipe right on archived → Restore
- "Archive All" button for batch archiving inactive sessions

### Task Queue (Bidirectional Communication)
Users can now create tasks from the app for Claude to work on:

**App Side:**
- Create tasks with title, markdown instructions, priority
- View tasks by status (pending/in-progress/complete)
- Cancel or delete tasks

**MCP Tools (Claude Side):**
- `get_pending_tasks` - Check for work waiting
- `claim_task` - Start working on a task
- `complete_task` - Mark task done

**Workflow:**
1. User creates task in app → Firestore (status: pending)
2. Claude calls `get_pending_tasks` → sees waiting tasks
3. Claude calls `claim_task` → status: in_progress
4. Claude works on it
5. Claude calls `complete_task` → status: complete

### Session Interrupts
Users can send messages to active Claude sessions:
- Message input on session detail screen
- Messages stored in `/sessions/{id}/interrupts`
- Claude checks with `get_interrupts` MCP tool

---

## Quick Start for New Session

### 1. Check for Pending Tasks (REQUIRED)
**ALWAYS check for pending tasks at the start of every session:**
```
Use the get_pending_tasks tool to check if there's work waiting.
```
This allows the user to create tasks from the mobile app that Claude will automatically pick up and work on without manual notification.

### 2. Resume from Context
Read these files:
- `CLAUDE.md` - Project overview, MCP tools, Firestore schema
- `ralph/progress.txt` - Detailed session log
- This file (`HANDOFF.md`) - Current status

### 3. Current Working Directory
```
/Users/christianbourlier/1P projects/cachebash
```

### 4. Run the App
```bash
cd app && flutter run -d "iPhone"
```

### 5. Test Account
- **Note:** Previous test accounts were deleted on 2026-01-30
- User registered a new account - check with user for credentials
- API key in `~/.claude/mcp.json` should match the new account

---

## Architecture

```
┌─────────────────┐                    ┌─────────────────┐
│   Claude Code   │◄───── MCP ────────►│  MCP Server     │
│   (Desktop)     │    (stdio/SSE)     │  (Local/Cloud)  │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
                                       │    Firestore    │
                                       │                 │
                                       │  - questions    │
                                       │  - sessions     │
                                       │  - tasks        │◄── NEW
                                       │  - interrupts   │◄── NEW
                                       │  - projects     │
                                       └────────┬────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
                                       │  CacheBash App  │
                                       │    (Flutter)    │
                                       └─────────────────┘
```

---

## MCP Tools Reference

| Tool | Direction | Description |
|------|-----------|-------------|
| `ask_question` | Claude → User | Send question to mobile |
| `get_response` | Claude ← User | Check for answer |
| `update_status` | Claude → User | Update progress in app |
| `pin_task` | Claude | Save context for later |
| `resume_task` | Claude | Resume saved context |
| `get_interrupts` | Claude ← User | Check for messages from app |
| `get_pending_tasks` | Claude ← User | Check for tasks to work on |
| `claim_task` | Claude | Start working on a task |
| `complete_task` | Claude | Mark task as done |

---

## Key Files

### App
- `app/lib/screens/tasks/` - Task queue UI
- `app/lib/screens/sessions/` - Session management
- `app/lib/screens/search/` - Unified search screen
- `app/lib/providers/tasks_provider.dart` - Task state
- `app/lib/providers/sessions_provider.dart` - Session state with archive
- `app/lib/providers/search_provider.dart` - Search state and logic
- `app/lib/providers/selection_provider.dart` - Multi-select state
- `app/lib/widgets/main_shell.dart` - Bottom nav with badge
- `app/lib/widgets/selectable_card.dart` - Selection UI wrapper
- `app/lib/widgets/selection_action_bar.dart` - Bulk action bar
- `app/lib/widgets/shimmer_card.dart` - Loading placeholders
- `app/lib/widgets/animated_list_item.dart` - Staggered animations
- `app/lib/services/encryption_service.dart` - E2E encryption

### MCP Server
- `mcp-server/src/tools/getTasks.ts` - Task queue tools
- `mcp-server/src/tools/getInterrupts.ts` - Interrupt checking
- `mcp-server/src/encryption/crypto.ts` - Encryption matching Flutter

### Config
- `firebase/firestore.rules` - Security rules (includes tasks, interrupts)
- `firebase/firestore.indexes.json` - Query indexes

---

## Recent Commits

```
260370d Add unified search, multi-select, and UX polish features
9e031b4 Add task action levels and persistent bottom navigation
99469b4 Add automatic task checking instruction to documentation
28c848f Update HANDOFF.md with E2E encryption verification status
f286cd1 Add Firestore indexes for tasks collection
```

---

## API Key Authentication Troubleshooting

### How Authentication Works

1. **Flutter app generates key**: 256-bit random → base64url encoded
2. **SHA-256 hash computed**: `sha256(apiKey).toHex()`
3. **Two Firestore documents created**:
   - `apiKeys/{hash}` → `{userId, createdAt}`
   - `users/{userId}` → `{apiKeyHash: hash, ...}`
4. **Cloud Run validates by reverse lookup**:
   - Compute hash of provided key
   - Lookup `apiKeys/{hash}` to get userId
   - Verify `users/{userId}.apiKeyHash` matches

### Common Issues and Fixes

#### "Invalid API key" / "API key not registered"

**Cause**: The `apiKeys/{hash}` document doesn't exist in Firestore.

**Diagnosis**:
```bash
# Compute the hash of your key
echo -n "YOUR_API_KEY" | shasum -a 256

# Check Firebase Console for: apiKeys/{computed_hash}
```

**Fix**:
1. Regenerate key in Flutter app (Settings > Regenerate API Key)
2. Copy new key to `~/.claude/mcp.json`
3. Restart Claude Code

#### "User not found"

**Cause**: The user account was deleted but `apiKeys` document remains.

**Fix**: Create a new account in the Flutter app.

#### "API key was regenerated"

**Cause**: The key in mcp.json is old; a new key was generated in the app.

**Fix**: Copy the current API key from the app to `~/.claude/mcp.json`.

#### Rate Limited (429)

**Cause**: Too many failed auth attempts (10/hour limit).

**Fix**: Wait up to 1 hour, or redeploy Cloud Run to reset the in-memory rate limiter.

### Diagnostic Tools

**Debug endpoint** (after deployment):
```bash
curl -s https://cachebash-mcp-922749444863.us-central1.run.app/v1/debug/auth \
  -H "Authorization: Bearer YOUR_API_KEY" | jq
```

Returns detailed diagnostics:
- `apiKeysDocExists`: whether the key is registered
- `usersDocExists`: whether the user account exists
- `usersDocHashMatch`: whether the hashes match
- `failureReason`: specific error cause
- `hint`: how to fix it

**Verification script**:
```bash
cd firebase/scripts
npx ts-node verify-api-key.ts "YOUR_API_KEY"
```

**Quick hash check**:
```bash
echo -n "YOUR_API_KEY" | shasum -a 256
```

### MCP Connection Testing

```bash
# Health check (no auth)
curl -s https://cachebash-mcp-922749444863.us-central1.run.app/v1/health

# Auth diagnostic
curl -s https://cachebash-mcp-922749444863.us-central1.run.app/v1/debug/auth \
  -H "Authorization: Bearer YOUR_API_KEY" | jq

# SSE connection test
curl -s -m 5 https://cachebash-mcp-922749444863.us-central1.run.app/v1/sse \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: text/event-stream"
```

### Key Learnings

1. **Debug mode pitfall**: iOS simulator debug mode previously used a fallback debug key, which caused Firestore writes with the wrong hash. This has been fixed.

2. **Both documents required**: Auth requires BOTH `apiKeys/{hash}` AND `users/{userId}.apiKeyHash` to exist and match.

3. **Key mismatch**: If the app regenerates a key, the old key in mcp.json won't work even though the apiKeys document exists (because users.apiKeyHash changed).

---

## Configuration

- **Bundle ID:** `com.cachebash.app`
- **Firebase Project:** `cachebash-app`
- **Cloud Run:** `cache-bash-app` (GCP project)
- **GitHub:** `feelgreatfoodie/cachebash`
- **Git Author:** `feelgreatfoodie <chrisbourlier@hotmail.com>`
