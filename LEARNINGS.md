# CacheBash Learnings & Technical Notes

This document captures key technical findings, gotchas, and architectural decisions discovered during development.

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
3. **MCP Server** - `gcloud run deploy cachebash-mcp --source . --region us-central1`
4. **iOS TestFlight** - `flutter build ipa` → Transporter
5. **Android Internal** - `flutter build appbundle` → Play Console

---

*Last updated: 2026-01-30*
