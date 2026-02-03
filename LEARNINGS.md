# CacheBash Learnings & Technical Notes

Key technical findings, gotchas, and architectural decisions discovered during development.

---

## MCP Transport & Cloud Run

### Custom HTTP Transport Architecture

The MCP server uses `CustomHTTPTransport` instead of the SDK's `StreamableHTTPServerTransport` to work around Claude Code v2.0.71+ missing the required `Accept` header. [GitHub #15523](https://github.com/anthropics/claude-code/issues/15523)

**Key Features:**
- **Lenient Accept header** - Optional (allows Claude Code), can enable strict mode
- **Firestore sessions** - Stored at `users/{userId}/mcp_sessions/{sessionId}`, survives Cloud Run scale-to-zero
- **Auto-cleanup** - Cloud Function deletes sessions >30 min old every 5 min

**Files:** `mcp-server/src/transport/` (CustomHTTPTransport, SessionManager, MessageParser, ResponseBuilder)

**Session Lifecycle:** Initialize (no session) → Creates in Firestore → Returns `Mcp-Session-Id` header → Subsequent requests validate/update `lastActivity`

**Troubleshooting:**
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=cachebash-mcp" --limit 20 --project cachebash-app
```

| Error | Fix |
|-------|-----|
| 32001 "Session expired" | Client must re-initialize |
| 32600 "Missing session ID" | Include `Mcp-Session-Id` from initialize response |

### Transport Timeout Race Condition (2026-02-01)

**Problem:** "Unexpected content type: text/html" errors despite successful processing.

**Root Cause:** 100ms hardcoded timeout too short for Firestore (50-200ms). Response queued after timeout → 204 No Content → Cloud Run returned HTML error.

**Fix:** Adaptive polling (50ms intervals, 2000ms max, configurable via `responseQueueTimeout`). Files: `CustomHTTPTransport.ts:301-317`, `types.ts`, `index.ts`, `Dockerfile`.

**Key Insight:** Always account for worst-case network latency plus buffer when integrating async operations with synchronous response patterns.

### Node.js ↔ Web API Conversion

MCP SDK uses Web API `Request`/`Response`, Cloud Run gives Node.js `http.IncomingMessage`/`ServerResponse`.

**Gotchas:**
- Must fully consume request body before creating Web Request
- Node.js headers can be `string | string[] | undefined`
- Use `(req.socket as any).encrypted` for socket encryption check
- Web Response.body is ReadableStream, use reader to pipe to Node response

---

## iOS Build & Simulator

### Apple Silicon Simulator (2026-01-30)

**Problem:** "App needs to be updated" on iOS 26.2 simulators.

**Cause:** Podfile excluding arm64: `EXCLUDED_ARCHS[sdk=iphonesimulator*] = 'arm64'` (legacy Intel→Apple Silicon workaround).

**Fix:** In Podfile post_install:
```ruby
config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = ''
config.build_settings['ONLY_ACTIVE_ARCH'] = 'YES'
```

---

## Firestore

### Composite Index Requirements

**Gotcha:** "permission-denied" errors often mean "missing index", not actual permission issues.

**Solution:** Add composite indexes for multi-where + orderBy queries:
```json
{ "collectionGroup": "messages", "fields": [
  { "fieldPath": "status", "order": "ASCENDING" },
  { "fieldPath": "deletedAt", "order": "ASCENDING" },
  { "fieldPath": "createdAt", "order": "DESCENDING" }
]}
```

### Dual-Write Migration Pattern

When migrating collections, write to both old and new:
```typescript
const questionRef = await db.collection(`users/${userId}/questions`).add(data);
await db.collection(`users/${userId}/messages`).doc(questionRef.id).set({
  ...data, direction: 'to_user',
});
```
Old clients keep working, new clients get unified view.

### Collection Group Queries for Orphan Detection

**Pattern:** Use collection group query instead of iterating all users:
```typescript
// O(orphans) instead of O(users)
const orphaned = await db.collectionGroup('messages')
  .where('direction', '==', 'to_claude')
  .where('status', '==', 'in_progress')
  .where('lastHeartbeat', '<', staleThreshold)
  .limit(500).get();
```

**Required index:**
```json
{ "collectionGroup": "messages", "queryScope": "COLLECTION_GROUP", "fields": [
  { "fieldPath": "direction", "order": "ASCENDING" },
  { "fieldPath": "status", "order": "ASCENDING" },
  { "fieldPath": "lastHeartbeat", "order": "ASCENDING" }
]}
```

---

## MCP Server

### Per-Request Authentication

Store auth context per session ID:
```typescript
const sessionAuthContexts = new Map<string, AuthContext>();
// On request: sessionAuthContexts.set(sessionId, authContext);
// In tool handler: sessionAuthContexts.get(extra?.sessionId);
```

### Transaction Safety for Task Operations (2026-02-02)

**Problem:** Read-then-write pattern vulnerable to race conditions when multiple Claudes poll simultaneously.

**Solution:** Firestore transactions for atomic claim:
```typescript
const result = await db.runTransaction(async (transaction) => {
  const doc = await transaction.get(taskRef);
  if (doc.data().status === 'in_progress' && doc.data().sessionId === sessionId) {
    return { alreadyClaimed: true }; // Idempotent
  }
  if (doc.data().status !== 'pending') return { error: 'Not claimable' };
  transaction.update(taskRef, { status: 'in_progress', sessionId, lastHeartbeat: FieldValue.serverTimestamp() });
  return { taskData: doc.data() };
});
```

**Heartbeat for crash recovery:** Set on claim, update every 10-15 min. Cleanup function reverts tasks with `lastHeartbeat` >30 min to pending.

### Session Timeout Alignment

**Issue:** Inconsistent timeouts (30 min in index.ts, 60 min in SessionManager).

**Fix:** All aligned to 60 min. Cleanup uses 65 min (5 min grace period).

### getInterrupts Collection Mismatch Bug (2026-02-02)

**Problem:** "Get Status Update" never reached Claude - Flutter wrote to `/messages`, MCP read from `/sessions/{id}/interrupts`.

**Fix:** Updated `getInterrupts.ts` to read from `/messages` with `direction: 'to_claude'`.

**Lesson:** When migrating collections, audit ALL tools reading from old paths:
```bash
grep -r "collection\(" mcp-server/src/tools/
```

---

## Flutter / Riverpod

### Raw String Literals Block Interpolation

**Problem:** `'''...$variable...'''` treats `$variable` as literal text.

**Fix:** Use `"""..."""` for interpolation:
```dart
return """{"url": "${Environment.mcpBaseUrl}/v1/mcp"}""";
```

### Parallel Decryption

```dart
// Before: sequential loop with await
// After: parallel
options = await Future.wait(options.map((o) => encryptionService.decrypt(o)));
```

### LevelDB Lock Errors

**Problem:** "Failed to open LevelDB database... Resource temporarily unavailable"

**Fix:**
```bash
pkill -9 -f "flutter.*run" && pkill -9 -f "CacheBash"
rm -f ~/Library/Application\ Support/firestore/__FIRAPP_DEFAULT/cachebash-app/main/LOCK
```

### Dart 3 Pattern Matching

Switch expressions with record destructuring reduce boilerplate:
```dart
final (color, icon, label) = switch (alertType) {
  AlertType.error => (Colors.red, Icons.error, 'Error'),
  AlertType.warning => (Colors.orange, Icons.warning, 'Warning'),
  _ => (Colors.blue, Icons.info, 'Info'),
};
```

### Ambiguous Imports

Use `hide` directive: `import '...provider.dart' hide ThreadGroup;`

---

## Flutter Notifications

### Android Notification Channels (Android 8.0+)

**Problem:** Notifications don't appear when app is closed.

**Fix:** Create channel in `MainActivity.kt` `configureFlutterEngine()`:
```kotlin
NotificationChannel("questions", "Questions from Claude", NotificationManager.IMPORTANCE_HIGH)
```

### iOS Background Notifications

**Fix:** Add to `Info.plist`:
```xml
<key>UIBackgroundModes</key><array><string>remote-notification</string></array>
```

### Notification Tap Handling

Implement both handlers in FCM service:
- `getInitialMessage()` - App launched from terminated
- `onMessageOpenedApp.listen()` - App opened from background

**Gotcha:** Router must be passed to FCM service after creation (in `didChangeDependencies()`).

---

## Code Style Decisions

### Message Direction Enum
```dart
enum MessageDirection { toUser, toClaude }  // Not question/task
```
Clearer semantics, extensible, avoids overloaded "task" term.

### Status Values by Direction

| Status | toUser | toClaude |
|--------|--------|----------|
| pending | Awaiting response | Awaiting Claude |
| in_progress | - | Claude working |
| answered | User responded | - |
| complete | - | Claude finished |

### Threading Schema
```
threadId: string | null   // Groups messages
inReplyTo: string | null  // Points to parent
```
First message: both null. Reply: `threadId = parent.threadId ?? parent.id`.

---

## Deployment Checklist

1. **Firestore** - `firebase deploy --only firestore:rules,firestore:indexes`
2. **Functions** - `firebase deploy --only functions`
3. **MCP Server** (CRITICAL):
   ```bash
   cd mcp-server && gcloud run deploy cachebash-mcp --source . --region us-central1 --allow-unauthenticated --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=cachebash-app" --project cachebash-app
   ```
4. **iOS** - `flutter build ipa` → Transporter
5. **Android** - `flutter build appbundle` → Play Console

**Important:** MCP changes are LOCAL until deployed. New Claude sessions fail if you commit but forget to deploy.

---

## Known Limitations

### MCP Session Auto-Reinitialization (2026-02-02)

When session expires (>60min), client gets 32001 error but doesn't auto-reinitialize.

**Workaround:** Restart Claude Code, or ensure MCP tools called at least once per 60 min.

**Status:** Claude Code v2.0.x limitation.

---

*Last updated: 2026-02-02*
