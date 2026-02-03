# CacheBash Improvements - Product Requirements Document

## Overview

CacheBash is a mobile companion app for Claude Code that enables asynchronous communication through push notifications. This PRD addresses critical bugs, UX improvements, and feature enhancements to make the app more reliable and user-friendly.

## Problem Statement

Users are experiencing several issues that reduce the app's usefulness: push notifications aren't working reliably, sessions don't appear on the home screen, archived messages don't move to the archive folder, and various UI inconsistencies create friction in the user experience.

## Goals

- Fix push notifications to reliably deliver messages to users
- Ensure real-time updates throughout the app
- Fix session visibility and navigation issues
- Improve archive/delete behavior to match user expectations
- Polish UI with consistent navigation and interactions

## Non-Goals (Out of Scope)

- Claude Cowork integration (needs investigation first)
- Multi-project management redesign (exploratory - needs more definition)
- New feature development beyond fixes and polish

## User Stories

### US-001: Fix Push Notifications
**Priority:** 1 (Critical)

As a user, I want to receive push notifications on my phone when Claude asks a question so that I can respond from anywhere.

**Acceptance Criteria:**
- [x] Push notifications are delivered to iOS devices
- [x] Push notifications are delivered to Android devices
- [x] High priority questions trigger immediate notifications
- [x] Notification contains enough context to understand the question

**Status:** ✅ Complete (Build 14)

**Technical Notes:**
Check FCM token registration, APNs configuration, and Cloud Function triggers. Verify the `onQuestion` Cloud Function is firing correctly.

---

### US-002: Add Real-Time Updates to Messages
**Priority:** 1 (Critical)

As a user, I want messages to update in real-time so that I don't need to pull-to-refresh to see new questions from Claude.

**Acceptance Criteria:**
- [x] New messages appear automatically without refresh
- [x] Message status changes (answered, expired) update in real-time
- [x] Uses Firestore listeners instead of one-time fetches

**Status:** ✅ Complete

**Technical Notes:**
Replace any one-time fetches in the messages provider with Firestore stream listeners.

---

### US-003: Fix Sessions Not Appearing on Home Screen
**Priority:** 1 (Critical)

As a user, I want to see my active Claude sessions on the home screen so that I can monitor progress at a glance.

**Acceptance Criteria:**
- [x] Active sessions appear in "Active Sessions" section on home screen
- [x] Sessions show their most recent status update
- [x] Sessions update in real-time when Claude sends status updates

**Status:** ✅ Complete

**Technical Notes:**
Check the sessions query in the home screen - likely a filter or listener issue. Sessions may not be getting created or may have wrong state values.

---

### US-004: Fix Archive Error "Document Not Found"
**Priority:** 2 (High)

As a user, I want to archive messages without seeing errors so that I can organize my inbox cleanly.

**Acceptance Criteria:**
- [x] Archiving a message completes without error
- [x] Archived message disappears from inbox
- [x] Archived message appears in archive folder

**Status:** ✅ Complete

**Technical Notes:**
Error "some requested document not found" suggests a batch operation or transaction is trying to access a non-existent document. Check the archive logic for race conditions or stale references.

---

### US-005: Archived Messages Move to Archive Folder
**Priority:** 2 (High)

As a user, I want archived messages to appear in an archive folder so that I can find them later if needed.

**Acceptance Criteria:**
- [x] Archive folder/tab exists in the app
- [x] Archived messages appear in the archive view
- [x] Archived messages are filtered out of the main inbox

**Status:** ✅ Complete

**Technical Notes:**
Likely need to add an archive tab or filter to the messages screen, and update the Firestore query to filter by `archived: true/false`.

---

### US-006: Session Cards Show Recent Updates
**Priority:** 2 (High)

As a user, I want session cards to show the most recent status update so that I can see progress without tapping into each session.

**Acceptance Criteria:**
- [x] Session card displays current status text
- [x] Session card shows last update timestamp
- [x] Session card reflects state (working, blocked, pinned, complete)

**Status:** ✅ Complete

**Technical Notes:**
The session model already has `status`, `state`, and `lastUpdate` fields - ensure the card widget displays them.

---

### US-007: Click Session to See Previous Updates
**Priority:** 2 (High)

As a user, I want to tap a session and see its history of status updates so that I can review what Claude has been working on.

**Acceptance Criteria:**
- [x] Tapping a session navigates to a detail view
- [x] Detail view shows list of status updates in chronological order
- [x] Each update shows timestamp and status text

**Status:** ✅ Complete

**Technical Notes:**
May need to store status history in a subcollection `/sessions/{id}/updates` or keep a list in the session document.

---

### US-008: Add Project Identifier to Sessions
**Priority:** 2 (High)

As a user, I want sessions to show which project/repo they belong to so that I can differentiate between multiple Claude terminals.

**Acceptance Criteria:**
- [x] Session card shows project name
- [x] Project defaults to repo name (e.g., "CacheBash")
- [x] Project can be set via MCP when creating/updating session

**Status:** ✅ Complete

**Technical Notes:**
Add `projectId` or `projectName` field to session. MCP server can pass this from the `project` field in ralph.config.json or detect from git remote.

---

### US-009: Swap Search and Sessions Icons
**Priority:** 3 (Medium)

As a user, I want the navigation icons in a logical order so that frequently-used items are in convenient positions.

**Acceptance Criteria:**
- [x] Sessions icon is swapped with search icon in bottom navigation
- [x] Navigation still functions correctly after swap

**Status:** ✅ Complete

**Technical Notes:**
Simple reorder in the bottom navigation widget.

---

### US-010: Remove "+ New Task" Button
**Priority:** 3 (Medium)

As a user, I don't need the "+ New Task" button because tasks are created from the messages compose screen.

**Acceptance Criteria:**
- [x] "+ New Task" button is removed from the UI
- [x] Task creation still works through compose message flow

**Status:** ✅ Complete

**Technical Notes:**
Remove the FAB or button from wherever it appears.

---

### US-011: Fix "X" Button on Compose Screen
**Priority:** 3 (Medium)

As a user, I want the X button to close the compose message screen so that I can cancel without sending.

**Acceptance Criteria:**
- [x] X button in compose screen closes the screen
- [x] No message is sent when canceling

**Status:** ✅ Complete

**Technical Notes:**
Likely a navigation issue - ensure the X button calls `Navigator.pop()` or `context.pop()`.

---

### US-012: Add Keyboard Dismiss Behavior
**Priority:** 3 (Medium)

As a user, I want to dismiss the keyboard by tapping outside or using a collapse button so that I can see more of the screen.

**Acceptance Criteria:**
- [x] Tapping outside input fields dismisses keyboard
- [x] Keyboard can be dismissed with a gesture or button

**Status:** ✅ Complete

**Technical Notes:**
Wrap screens in `GestureDetector` with `FocusScope.of(context).unfocus()` or use `ScrollView` with `keyboardDismissBehavior`.

---

### US-013: Fix Archived Sessions Back Navigation
**Priority:** 3 (Medium)

As a user, I want the back button on archived sessions to return to the sessions list so that navigation feels consistent.

**Acceptance Criteria:**
- [x] Back button from archived session goes to sessions list, not home
- [x] Navigation stack is preserved correctly

**Status:** ✅ Complete

**Technical Notes:**
Check go_router configuration for archived sessions route.

---

### US-014: Add Help/Feedback Icon
**Priority:** 4 (Low)

As a user, I want a help/feedback option so that I can report issues or get assistance.

**Acceptance Criteria:**
- [x] Help icon (?) visible in app header or settings
- [x] Tapping opens feedback form or links to GitHub issues

**Status:** ✅ Complete

**Technical Notes:**
Could link to GitHub issues page or open email compose with support address.

---

## Technical Considerations

### Architecture
- Use Firestore real-time listeners everywhere for consistency
- Consider storing session status history for the session detail view
- Ensure FCM tokens are properly registered and refreshed

### Dependencies
- Firebase Cloud Messaging (FCM)
- Apple Push Notification service (APNs)
- Firestore real-time listeners

### Data Model Changes
Session updates subcollection (if implementing history):
```
/users/{userId}/sessions/{sessionId}/updates/{updateId}
  - status: string
  - state: string
  - progress: number
  - timestamp: timestamp
```

Session additions:
```
/users/{userId}/sessions/{sessionId}
  + projectName: string  // e.g., "CacheBash"
```

## Success Metrics

- Push notifications delivered within 10 seconds of question creation
- All real-time updates reflected in UI within 2 seconds
- Zero "document not found" errors when archiving
- Sessions visible on home screen immediately after creation

## Open Questions

- Should deleted messages be retained for 7 days like email trash?
- What's the best UX for infinite scroll on pending questions and sessions?
- How should we handle many Claude terminals from different projects?

## Git Branch

**Branch Name:** `ralph/cachebash-improvements`
