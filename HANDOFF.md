# CacheBash Session Handoff

**Last Updated:** 2026-01-30
**Status:** Phase 3 - Premium UX Enhancements - IN PROGRESS
**Branch:** `ralph/phase3-ux-enhancements`

---

## Current Status

### Phase 1: MVP - COMPLETE
- Local MCP server, Firebase backend, Flutter app
- Push notifications working
- TestFlight deployed

### Phase 2: Cloud-Hosted MCP Server - COMPLETE
- Cloud Run deployment at `https://cachebash-mcp-94772408270.us-central1.run.app`
- SSE transport with Bearer token auth
- All 17 stories complete
- Projects feature with archive/delete

### Phase 3: Premium UX Enhancements - IN PROGRESS

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
- [x] Git history cleanup (author: feelgreatfoodie)
- [x] E2E encryption tested and verified working

#### In Progress / Next
- [ ] Answer streaks system
- [ ] Staggered list animations
- [ ] Shimmer loading states

---

## New Features This Session

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
- **Email:** `cachebashapp+test@gmail.com`
- **Password:** `cachebashtest`

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
- `app/lib/providers/tasks_provider.dart` - Task state
- `app/lib/providers/sessions_provider.dart` - Session state with archive
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
f286cd1 Add Firestore indexes for tasks collection
8fe4007 Add E2E encryption for tasks
4eb5867 Fix E2E encryption by using correct storage key
c3744a1 Update HANDOFF.md with Phase 3 status and new features
cb6a179 Update documentation for Phase 3 features
```

---

## Configuration

- **Bundle ID:** `com.cachebash.app`
- **Firebase Project:** `cachebash-app`
- **Cloud Run:** `cache-bash-app` (GCP project)
- **GitHub:** `feelgreatfoodie/cachebash`
- **Git Author:** `feelgreatfoodie <chrisbourlier@hotmail.com>`
