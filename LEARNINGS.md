# CacheBash Learnings & Technical Notes

This document captures key technical findings, gotchas, and architectural decisions discovered during development.

---

## MCP Transport & Cloud Run

### MCP Transport Timeout Race Condition (2026-02-01)

**Problem:** Claude Code MCP client reported "Unexpected content type: text/html" despite server processing requests successfully. All tool calls failed with this error.

**Root Cause:** The 100ms hardcoded timeout in `CustomHTTPTransport.ts:302` was too short for Firestore operations (typically 50-200ms latency). This created a race condition:

1. MCP message triggered tool handler
2. Tool handler queried Firestore (50-200ms)
3. Handler called `transport.send()` to queue response
4. **100ms timeout expired BEFORE response was queued**
5. Server returned 204 No Content with empty body
6. Cloud Run load balancer returned HTML error page to client

**Evidence:**
- Curl tests showed proper JSON responses when manually testing
- Server logs showed successful request processing
- Client consistently reported HTML errors
- No HTML-generating code exists in the codebase
- Firestore queries need 50-200ms, but only 100ms was allocated for response queueing

**Solution:**

1. **Replaced fixed 100ms timeout with adaptive polling:**
   - Poll every 50ms intervals
   - Wait up to 2000ms max (configurable via `responseQueueTimeout`)
   - Break early when responses arrive (typically 100-150ms)

2. **Added comprehensive diagnostics:**
   - Request/response logging with timing in `index.ts`
   - Transport pipeline logging showing message flow
   - Content-Type validation to catch non-JSON responses
   - Null body validation in MessageParser

3. **Enhanced health checks:**
   - Test Firestore connectivity in `/v1/health`
   - Return "degraded" status (still 200 OK) instead of failing completely
   - Increased Docker health check timeout from 3s to 5s

**Files Modified:**
- `mcp-server/src/transport/CustomHTTPTransport.ts` - Adaptive timeout (line 301-317)
- `mcp-server/src/transport/types.ts` - Added `responseQueueTimeout` config option
- `mcp-server/src/index.ts` - Request/response logging, Firestore health check
- `mcp-server/src/transport/MessageParser.ts` - Null body validation
- `mcp-server/Dockerfile` - Health check timeout increase

**Verification:**
- 10 consecutive successful MCP tool calls with no HTML errors
- All responses return proper JSON with `Content-Type: application/json`
- Response queue times: 100-150ms (well within 2000ms timeout)
- No 204 No Content responses when tools return data

**Key Insight:** When integrating async operations (like Firestore) with synchronous response patterns, always account for worst-case latency plus buffer. The original 100ms was too optimistic for network I/O.

---

## iOS Build & Simulator

### Apple Silicon Simulator Architecture (2026-01-30)

**Problem:** iOS simulator builds fail with "App needs to be updated" on iOS 26.2 simulators.

**Root Cause:** Podfile was excluding arm64 from simulator builds:
```ruby
config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'arm64'
```

This was a legacy workaround for Intel→Apple Silicon transition but breaks on modern simulators.

**Fix:** Allow arm64 for simulators:
```ruby
post_install do |installer|
  installer.pods_project.targets.each do |target|
    flutter_additional_ios_build_settings(target)
    target.build_configurations.each do |config|
      config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = ''
      config.build_settings['ONLY_ACTIVE_ARCH'] = 'YES'
    end
  end
end
```

**Result:** App builds as universal binary (x86_64 + arm64), installs on iOS 26.2 simulators.

---

## Firestore

### Composite Index Requirements

**Problem:** Queries with multiple `where` clauses + `orderBy` fail with permission errors that are actually missing index errors.

**Solution:** Add composite indexes for each query pattern. Key indexes for messages:

```json
{
  "collectionGroup": "messages",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "deletedAt", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

**Gotcha:** Firestore error messages are misleading - "permission-denied" often means "missing index".

### Merging Legacy Collections

**Problem:** After migrating from `/questions` to `/messages`, old data doesn't appear in new queries.

**Solution:** Merge both collections in providers:
```dart
final activeMessagesProvider = StreamProvider<List<MessageModel>>((ref) {
  // Stream new collection
  return messagesStream.asyncMap((snapshot) async {
    final messages = await _decryptMessages(snapshot.docs, encryptionService);
    final messageIds = messages.map((m) => m.id).toSet();

    // Fetch and merge legacy collection
    final legacyDocs = await _firestore
        .collection('users/${user.uid}/questions')
        .where(...)
        .get();

    final legacyMessages = await Future.wait(
      legacyDocs.docs
          .where((doc) => !messageIds.contains(doc.id))  // Dedupe
          .map((doc) => _decryptLegacyQuestion(doc, encryptionService)),
    );
    messages.addAll(legacyMessages);

    return messages..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  });
});
```

---

## MCP Server

### Dual-Write Pattern for Migration

**Pattern:** When migrating to a new data model, write to both old and new collections:

```typescript
// Write to legacy collection (backward compat)
const questionRef = await db.collection(`users/${userId}/questions`).add(data);

// Also write to unified collection
await db.collection(`users/${userId}/messages`).doc(questionRef.id).set({
  ...data,
  direction: 'to_user',  // New field
});
```

**Benefits:**
- Old clients continue working
- New clients get unified view
- Can remove dual-write once migration complete

### Cloud Run HTTP Transport (2026-01-30)

**Issue:** MCP server used `StdioServerTransport` (stdin/stdout) which doesn't work on Cloud Run.

**Solution:** Use `StreamableHTTPServerTransport` from the MCP SDK:

```typescript
import http from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

await server.connect(transport);

const httpServer = http.createServer(async (req, res) => {
  if (req.url?.startsWith("/v1/mcp")) {
    await transport.handleRequest(req, res);
  }
});

httpServer.listen(process.env.PORT || 8080);
```

**Key points:**
- SDK's `StreamableHTTPServerTransport` handles MCP protocol over HTTP
- Requires `@hono/node-server` (transitive dep from SDK)
- Auth via `Authorization: Bearer` header, stored per-session
- Claude Code connects with `--transport http` flag

### Per-Request Authentication

**Pattern:** Store auth context per session ID for tool calls:

```typescript
const sessionAuthContexts = new Map<string, AuthContext>();

// On request, validate API key and store for session
const sessionId = req.headers["mcp-session-id"];
sessionAuthContexts.set(sessionId, authContext);

// In tool handler, retrieve auth context
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const authContext = sessionAuthContexts.get(extra?.sessionId);
  // Use authContext for Firestore operations
});
```

### Claude Code v2.0.71+ Accept Header Issue (2026-02-01)

**Problem:** Claude Code v2.0.71+ fails to connect to MCP server with "✗ Failed to connect" error.

**Root Cause:** Claude Code's HTTP client doesn't send the `Accept` header that the MCP spec requires for POST requests. The SDK's `StreamableHTTPServerTransport` expects `Accept: application/json, text/event-stream` but Claude Code omits it.

**Solution:** Inject the Accept header if missing by modifying the `rawHeaders` array:

```typescript
// WORKAROUND: Claude Code v2.0.71+ doesn't send required Accept header
if (req.method === "POST" && Array.isArray(req.rawHeaders)) {
  const hasAcceptHeader = req.rawHeaders.some((header, i) =>
    i % 2 === 0 && header?.toLowerCase() === "accept"
  );

  if (!hasAcceptHeader) {
    req.rawHeaders.push("Accept", "application/json, text/event-stream");
  }
}
```

**Key Points:**
- Must modify `req.rawHeaders` array, not `req.headers` object
- Hono's `getRequestListener()` reads from `rawHeaders` directly
- `rawHeaders` format: `['Header1', 'value1', 'Header2', 'value2', ...]`
- Check only even indices for header names (odd indices are values)

**Deployment Required:** After fixing this issue locally, **you must redeploy to Cloud Run** for the fix to take effect. New Claude sessions will fail to connect until deployed.

**Reference:** [Claude Code issue #15523](https://github.com/anthropics/claude-code/issues/15523)

---

## Flutter / Riverpod

### Raw String Literals Prevent Interpolation (2026-01-31)

**Problem:** MCP configuration example displayed literal text "Environment.mcpBaseUrl" instead of the actual URL, causing "No host specified in URI" errors.

**Root Cause:** Using raw string literals (triple quotes `'''...'''`) in Dart prevents string interpolation:

```dart
// ❌ WRONG - No interpolation in raw strings
String _getMcpConfigExample(String apiKey) {
  return '''{
    "url": "$Environment.mcpBaseUrl/v1/sse",  // Treated as literal text!
  }''';
}
```

**Solution:** Use regular multi-line strings with double quotes:

```dart
// ✅ CORRECT - Interpolation works
String _getMcpConfigExample(String apiKey) {
  return """
{
  "url": "${Environment.mcpBaseUrl}/v1/mcp",  // Properly interpolated
}""";
}
```

**Key Takeaways:**
- Raw strings (`r"..."` or `'''...'''`) treat `$variable` as literal text
- Use `"""..."""` for multi-line strings that need interpolation
- Add curly braces `${expression}` for clarity and to support property access
- Lint warning `prefer_single_quotes` can be ignored when interpolation is needed

**File:** `app/lib/screens/auth/api_key_screen.dart:617-629`

### Parallel Decryption with Future.wait

**Before (sequential, slow):**
```dart
if (options != null) {
  final decrypted = <String>[];
  for (final option in options) {
    decrypted.add(await encryptionService.decrypt(option));
  }
  options = decrypted;
}
```

**After (parallel, fast):**
```dart
options = options != null
    ? await Future.wait(options.map((o) => encryptionService.decrypt(o)))
    : null;
```

### LevelDB Lock Errors on macOS

**Problem:** "Failed to open LevelDB database... Resource temporarily unavailable"

**Cause:** Multiple Flutter instances trying to access same Firestore cache.

**Fix:** Kill all Flutter processes and remove lock:
```bash
pkill -9 -f "flutter.*run"
pkill -9 -f "CacheBash"
rm -f ~/Library/Application\ Support/firestore/__FIRAPP_DEFAULT/cachebash-app/main/LOCK
```

---

## Code Style Decisions

### Message Direction Enum
```dart
enum MessageDirection {
  toUser,    // Claude → User (questions)
  toClaude,  // User → Claude (tasks)
}
```

Using `toUser`/`toClaude` instead of `question`/`task` because:
- Clearer semantic meaning
- Extensible for future message types
- Avoids confusion with "task" (overloaded term)

### Status Values by Direction

| Status | toUser (question) | toClaude (task) |
|--------|-------------------|-----------------|
| `pending` | Awaiting response | Awaiting Claude |
| `in_progress` | - | Claude working |
| `answered` | User responded | - |
| `complete` | - | Claude finished |
| `expired` | Timed out | - |
| `cancelled` | Dismissed | User cancelled |

---

## Deployment Checklist

1. **Firestore** - `firebase deploy --only firestore:rules,firestore:indexes`
2. **Functions** - `firebase deploy --only functions` (if changed)
3. **MCP Server** (CRITICAL - must deploy after local changes):
   ```bash
   cd mcp-server && gcloud run deploy cachebash-mcp \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=cachebash-app" \
     --project cachebash-app
   ```
4. **iOS TestFlight** - `flutter build ipa` → Transporter
5. **Android Internal** - `flutter build appbundle` → Play Console

**Important:** MCP server changes are LOCAL until deployed to Cloud Run. New Claude sessions will fail to connect if you commit fixes but forget to deploy.

---

*Last updated: 2026-02-01*

---

## MCP Transport & Claude Code Compatibility (2026-02-01)

### Claude Code Accept Header Bug

**Problem:** Claude Code v2.0.71+ doesn't send the required `Accept: application/json, text/event-stream` header on POST requests to MCP servers.

**MCP Spec Requirement:** MCP specification requires POST requests to include this header to indicate the client accepts both JSON-RPC responses and SSE streaming.

**Impact:** SDK's `StreamableHTTPServerTransport` validates headers at initialization and returns HTTP 406 "Not Acceptable" before any custom code runs.

**Why rawHeaders Workaround Failed:**
- Attempted to inject missing header into `req.rawHeaders` array
- SDK's Hono server reads headers BEFORE our middleware executes
- Header validation happens in SDK's internal code at line 363-365 of `webStandardStreamableHttp.js`

**GitHub Issue:** Tracked as [#15523](https://github.com/anthropics/claude-code/issues/15523)

### Custom HTTP Transport Solution

**Approach:** Built custom HTTP transport layer that implements MCP SDK's `Transport` interface but with relaxed header validation.

**Key Components:**

1. **CustomHTTPTransport** (`mcp-server/src/transport/CustomHTTPTransport.ts`)
   - Implements `Transport` interface from MCP SDK
   - Handles HTTP → JSON-RPC translation
   - **Lenient mode (default):** Accept header is optional
   - **Strict mode (opt-in):** Requires full header (for future when Claude Code bug is fixed)

2. **SessionManager** (`mcp-server/src/transport/SessionManager.ts`)
   - **Critical:** Firestore-backed session storage (NOT in-memory)
   - Cloud Run scales to zero → in-memory sessions would be lost
   - Sessions stored at: `users/{userId}/mcp_sessions/{sessionId}`
   - Cleanup via Cloud Function every 5 minutes (deletes sessions older than 30 min)

3. **MessageParser** (`mcp-server/src/transport/MessageParser.ts`)
   - JSON-RPC validation using SDK's `JSONRPCMessageSchema`
   - Handles both single and batch messages
   - Helper functions: `isInitializeRequest`, `isNotification`, `isRequest`, `isResponse`

4. **ResponseBuilder** (`mcp-server/src/transport/ResponseBuilder.ts`)
   - Standardized HTTP response construction
   - JSON-RPC error formatting
   - Security headers injection

**Header Validation Strategy:**

Three-tier approach:

1. **Strict Mode** (opt-in via `strictAcceptHeader: true`):
   - Requires both `application/json` AND `text/event-stream`
   - Full MCP spec compliance

2. **Lenient Mode** (default, `strictAcceptHeader: false`):
   - Accept header is OPTIONAL (allows Claude Code)
   - If present, must include at least one of: `application/json` OR `text/event-stream`
   - Logs missing headers for monitoring

3. **Feature Detection**:
   - Logs when clients DO send proper headers
   - Helps identify when to tighten validation in future

**Benefits:**

- ✅ Works with Claude Code's buggy client (no Accept header required)
- ✅ Stays MCP spec compliant (validates JSON-RPC messages with SDK schemas)
- ✅ Enterprise-grade (security headers, DNS rebinding protection, monitoring)
- ✅ No changes to existing tools (drop-in transport replacement)
- ✅ Scalable (Firestore session storage works across Cloud Run instances)

**Deployment:**

```bash
# MCP Server
cd mcp-server && gcloud run deploy cachebash-mcp \
  --source . --region us-central1 \
  --project cachebash-app

# Session Cleanup Cloud Function
cd firebase && firebase deploy --only functions:cleanupExpiredSessions \
  --project cachebash-app
```

**Verification:**

```bash
# Health check
curl -s https://cachebash-mcp-922749444863.us-central1.run.app/v1/health

# Test without Accept header (Claude Code scenario)
curl -X POST "https://cachebash-mcp-922749444863.us-central1.run.app/v1/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}'

# Should return JSON response, NOT 406 Not Acceptable
```

**Future Enhancements:**

- SSE streaming support (GET requests) - currently deferred to v2
- WebSocket transport for bidirectional communication
- Multi-region deployment for lower latency
- JWT-based stateless session tokens

### Node.js to Web API Request Conversion

**Challenge:** MCP SDK uses Web API `Request` and `Response` types, but Cloud Run gives us Node.js `http.IncomingMessage` and `http.ServerResponse`.

**Solution:** Helper functions to convert between Node.js and Web API types.

**Gotchas:**

1. **Body consumption:** Must fully consume Node.js request body before creating Web API Request
2. **Headers conversion:** Node.js headers can be string | string[] | undefined
3. **Socket encryption check:** `req.socket.encrypted` doesn't exist in types, use `(req.socket as any).encrypted`
4. **Stream handling:** Web API Response.body is a ReadableStream, must use reader to pipe to Node.js response

**Implementation:**

```typescript
async function nodeRequestToWebRequest(req: http.IncomingMessage): Promise<Request> {
  // Collect body chunks
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : null;

  // Convert headers
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v));
      } else {
        headers.append(key, value);
      }
    }
  }

  return new Request(url, { method: req.method, headers, body });
}

async function webResponseToNodeResponse(
  webResponse: Response,
  nodeResponse: http.ServerResponse
): Promise<void> {
  nodeResponse.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });

  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      nodeResponse.write(value);
    }
  }
  
  nodeResponse.end();
}
```

### Firestore Session Schema

**Collection:** `users/{userId}/mcp_sessions/{sessionId}`

**Fields:**
- `sessionId`: string (hex random bytes)
- `userId`: string (from auth context)
- `authContext`: object (API key and userId)
- `lastActivity`: number (timestamp in ms)
- `protocolVersion`: string (optional, set after initialize)
- `createdAt`: number (timestamp in ms)

**Indexes:** Created automatically by Firestore
- Single field index on `lastActivity` (for cleanup queries)

**Cleanup Query:**

```typescript
const expiryThreshold = now - sessionTimeout;
const expiredSnapshot = await sessionsRef
  .where('lastActivity', '<', expiryThreshold)
  .get();
```

**Why Firestore vs In-Memory:**

Cloud Run characteristics:
- Scales to zero when idle
- Spins up new instances on demand
- No guarantee of instance persistence
- Multiple instances may serve requests concurrently

In-memory sessions would:
- ❌ Be lost when instance scales to zero
- ❌ Not work across multiple instances
- ❌ Cause session ID collisions

Firestore sessions:
- ✅ Persist across instance restarts
- ✅ Work with multiple Cloud Run instances
- ✅ Already encrypted at rest
- ✅ Low latency (< 10ms reads/writes)

### DNS Rebinding Protection

**Feature:** Validates `Host` and `Origin` headers to prevent DNS rebinding attacks.

**Implementation:** `mcp-server/src/security/dns-rebinding.ts`

**Default:** DISABLED (to allow local development)

**Enable via config:**

```typescript
const transport = new CustomHTTPTransport({
  enableDnsRebindingProtection: true,
  allowedOrigins: ['cachebash-mcp-922749444863.us-central1.run.app', 'localhost'],
});
```

**Why disabled by default:**

Cloud Run already provides protection:
- HTTPS enforcement
- Certificate validation
- Origin validation at load balancer level

Custom DNS rebinding check is opt-in for additional security layer.

---

## Flutter Notifications & Deep Linking (2026-02-01)

### Android Notification Channels

**Problem:** Notifications don't appear when app is closed on Android 8.0+.

**Root Cause:** Android requires notification channels to be created before notifications can be displayed. Cloud Function was sending notifications to channel ID "questions" but the channel didn't exist.

**Fix:** Create notification channel in `MainActivity.kt`:

```kotlin
private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(
            "questions",
            "Questions from Claude",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications when Claude needs your input"
            enableVibration(true)
            setShowBadge(true)
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }
}
```

**When:** Call in `configureFlutterEngine()` override so it runs before Flutter initialization.

### iOS Background Notifications

**Problem:** Notifications don't appear when app is closed on iOS.

**Root Cause:** Missing `UIBackgroundModes` in `Info.plist`.

**Fix:** Add to `Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
</array>
```

This enables the app to receive remote notifications while in background or terminated state.

### Notification Tap Handling

**Problem:** Tapping notifications doesn't navigate to the correct screen.

**Root Cause:** Missing handlers for notification tap events.

**Solution:** Implement both handlers in FCM service:

1. **getInitialMessage** - App launched from terminated state:
```dart
final initialMessage = await _messaging.getInitialMessage();
if (initialMessage != null) {
  _handleNotificationTap(initialMessage);
}
```

2. **onMessageOpenedApp** - App opened from background:
```dart
FirebaseMessaging.onMessageOpenedApp.listen((message) {
  _handleNotificationTap(message);
});
```

**Navigation:** Extract `messageId` or `questionId` from `message.data` and use GoRouter:

```dart
final messageId = message.data['messageId'] ?? message.data['questionId'];
if (messageId?.isNotEmpty ?? false) {
  router.go('/questions/$messageId');
}
```

**Gotcha:** Router must be passed to FCM service during initialization. Move FCM init to app widget's `didChangeDependencies()` to access the router after it's created.

### Session Interrupts → Messages Migration

**Problem:** Session replies stored in `/sessions/{id}/interrupts` don't appear in unified messages inbox.

**Solution:** Update `SessionsService.sendInterrupt()` to write to `/messages` collection:

```dart
await messageRef.set({
  'direction': 'to_claude',
  'content': message,
  'title': 'Session reply',
  'sessionId': sessionId,
  'priority': 'high',
  'status': 'pending',
  'action': 'interrupt',
  'createdAt': FieldValue.serverTimestamp(),
  'archived': false,
  'deletedAt': null,
  'encrypted': false,
});
```

**Migration:** Created Cloud Function `migrateInterruptsToMessages` to convert existing interrupts for users. Runs per-user via callable function.

**Deployment:**
```bash
firebase deploy --only functions:migrateInterruptsToMessages
```

---

## MCP Session Management

### Session Expiry Auto-Reinitialization Issue (2026-02-02)

**Problem:** When MCP session expires (>60min of inactivity), client receives `{"code":-32001,"message":"Session error: Session not found"}` errors but does not automatically reinitialize the connection.

**Current Behavior:**
- Session timeout increased from 30min → 60min in `SessionManager.ts`
- After timeout, all MCP tool calls fail with 32001 error
- Claude Code MCP client does NOT detect this error and reinitialize
- User must manually restart Claude Code to create a new session

**Expected Behavior:**
- Client should detect 32001 error code
- Automatically send new initialize request
- Resume normal operation transparently

**Workaround:**
- Restart Claude Code to reinitialize MCP connection
- Or ensure MCP tools are called at least once per 60 minutes

**Status:** Known limitation of Claude Code v2.0.x MCP client. May be fixed in future versions.

**Related:** Issue #10 in original improvement plan - "MCP session auto-reinitialization"

