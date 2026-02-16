# Contributing to CacheBash

Thank you for considering contributing to CacheBash. This document explains how to set up the development environment, follow code conventions, and submit changes.

---

## Development Setup

### Prerequisites

- **Node.js** >= 18
- **Flutter SDK** >= 3.2
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Google Cloud SDK** (for Cloud Run deployment)

### MCP Server

The MCP server is a TypeScript application that provides the core backend API.

```bash
cd mcp-server
npm install
npm run dev            # Starts TypeScript watcher (auto-recompiles on file changes)
npm start              # Runs compiled server on port 3001
```

**Environment variables** (`.env` file):
- `FIREBASE_PROJECT_ID` — Your Firebase project ID
- `PORT` — Server port (default: 3001)
- `NODE_ENV` — `development` or `production`

### Mobile App

The Flutter app is the mobile client for CacheBash.

```bash
cd app
flutter pub get
```

**Configure Firebase:**
1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com)
2. Run: `flutterfire configure`
3. This generates `lib/firebase_options.dart` with platform-specific configs
4. Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) to the appropriate directories

**Run the app:**
```bash
flutter run
```

### Cloud Functions

Cloud Functions handle server-side scheduled tasks and triggers.

```bash
cd firebase/functions
npm install
npm run build
```

**Deploy to Firebase:**
```bash
firebase deploy --only functions --project your-project-id
```

### Firebase Emulator (Local Development)

Run Firestore, Functions, and other Firebase services locally for faster iteration.

```bash
firebase emulators:start --project your-project-id
```

The emulator UI runs at `http://localhost:4000`.

---

## Code Style & Conventions

### TypeScript (MCP Server)

- **Strict mode**: No `any` where avoidable — use `unknown` and validate with Zod
- **Named exports**: No default exports
- **Zod schemas**: All input validation uses Zod
- **Documentation**: Every module has a doc comment explaining its purpose
- **Handler signature**: `(auth: AuthContext, args: unknown) => Promise<ToolResult>`
- **Error handling**: Catch errors, format them, and return structured errors. Never throw to the transport layer.

**Example:**
```typescript
import { z } from 'zod';

const CreateTaskSchema = z.object({
  title: z.string().max(200),
  target: z.string().max(100),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export async function createTask(auth: AuthContext, args: unknown): Promise<ToolResult> {
  const validated = CreateTaskSchema.parse(args);
  // ... implementation
  return { success: true, data: { taskId: 'abc123' } };
}
```

### Dart (Flutter App)

- **Riverpod** for state management (StreamProvider for real-time data)
- **go_router** for navigation with auth redirects
- **Models** have `fromFirestore` factories and `toMap()` methods
- **Screens** are stateless where possible — state lives in providers

**Example model:**
```dart
class Task {
  final String id;
  final String title;
  final String status;

  Task({required this.id, required this.title, required this.status});

  factory Task.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return Task(
      id: doc.id,
      title: data['title'] ?? '',
      status: data['status'] ?? 'created',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'title': title,
      'status': status,
    };
  }
}
```

### Naming Conventions

- **Files**: `snake_case`
- **TypeScript**:
  - Variables/functions: `camelCase`
  - Types/classes: `PascalCase`
- **Dart**:
  - Variables/functions: `camelCase`
  - Classes: `PascalCase`
- **Database fields**: `camelCase`

---

## PR Process

1. **Fork the repo** and clone your fork locally
2. **Create a feature branch**: `feat/short-description` or `fix/bug-description`
3. **Write code with tests** (see Testing section below)
4. **Run checks**:
   - MCP Server: `cd mcp-server && npm run build && npm test`
   - Mobile App: `cd app && flutter analyze`
5. **Open a PR** with:
   - Clear description of what changed and why
   - Screenshots for UI changes
   - Test plan or steps to verify the change

**PR reviews** typically focus on:
- Code clarity and maintainability
- Test coverage
- Security implications (especially for auth/data access)
- Performance considerations

---

## Commit Messages

Use the format: `type: description`

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code restructuring (no behavior change)
- `test:` Test additions or fixes
- `chore:` Build/tooling changes

**Examples:**
```
feat: add task priority field
fix: prevent duplicate task claims
docs: update deployment instructions
refactor: extract validation logic into module
test: add lifecycle state transition tests
chore: upgrade Firebase SDK to v11
```

---

## Adding a New MCP Tool

Follow these steps to add a new tool to the MCP server:

### 1. Define the handler

Create or modify a file in `mcp-server/src/modules/` (e.g., `tasks.ts`).

```typescript
import { z } from 'zod';
import { AuthContext, ToolResult } from '../types';

const MyToolSchema = z.object({
  fieldName: z.string(),
  optionalField: z.number().optional(),
});

export async function myTool(auth: AuthContext, args: unknown): Promise<ToolResult> {
  const validated = MyToolSchema.parse(args);

  // Business logic here
  // Access Firestore: admin.firestore()
  // Access authenticated user: auth.uid

  return {
    success: true,
    data: { result: 'value' },
  };
}
```

### 2. Add Zod validation schema

Define the schema inline or export it separately for reuse in tests.

### 3. Register in `tools.ts`

Add your tool to the registry in `mcp-server/src/tools.ts`:

```typescript
import { myTool } from './modules/my-module';

export const TOOL_REGISTRY: Record<string, ToolHandler> = {
  // ... existing tools
  my_tool: myTool,
};

export const TOOL_SCHEMAS: Record<string, ToolSchema> = {
  // ... existing schemas
  my_tool: {
    name: 'my_tool',
    description: 'Brief description of what this tool does',
    inputSchema: {
      type: 'object',
      properties: {
        fieldName: { type: 'string', description: 'Field description' },
        optionalField: { type: 'number', description: 'Optional field' },
      },
      required: ['fieldName'],
    },
  },
};
```

### 4. Add REST endpoint

Add the corresponding route in `mcp-server/src/transport/rest.ts`:

```typescript
router.post('/my-tool', authenticate, async (req, res) => {
  try {
    const result = await myTool(req.auth!, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: formatError(error) });
  }
});
```

### 5. Add Firestore indexes (if needed)

If your tool performs queries with multiple filters or ordering, add indexes to `firebase/firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "tasks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

Deploy indexes:
```bash
cd firebase
firebase deploy --only firestore:indexes --project your-project-id
```

### 6. Update README

Add your tool to the "Available Tools" section of `README.md` with usage examples.

---

## Testing

### MCP Server

Run unit tests:
```bash
cd mcp-server
npm test
```

**Writing tests:**
- Test framework will be configured during initial setup
- Tests will be co-located with modules (`module.test.ts`)
- Mock Firestore operations with `@firebase/testing` or in-memory Firestore
- Test validation, authorization, and business logic separately

**Example:**
```typescript
import { createTask } from '../modules/tasks';
import { AuthContext } from '../types';

describe('createTask', () => {
  it('creates a task with valid input', async () => {
    const auth: AuthContext = { uid: 'user123', agentId: 'data-pipeline' };
    const result = await createTask(auth, { title: 'Test task', target: 'data-pipeline' });

    expect(result.success).toBe(true);
    expect(result.data.taskId).toBeDefined();
  });

  it('rejects task with empty title', async () => {
    const auth: AuthContext = { uid: 'user123', agentId: 'data-pipeline' };

    await expect(
      createTask(auth, { title: '', target: 'data-pipeline' })
    ).rejects.toThrow();
  });
});
```

### Mobile App

Run Flutter tests:
```bash
cd app
flutter test
```

**Widget tests** for UI components, **unit tests** for business logic.

---

## Issue Templates

### Bug Report

Use this template when reporting a bug:

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment:**
 - Device: [e.g. iPhone 12, Pixel 6]
 - OS: [e.g. iOS 15.0, Android 12]
 - App version: [e.g. 1.0.0]
 - Server environment: [e.g. production, local emulator]

**Additional context**
Add any other context about the problem here (logs, error messages, etc.).
```

### Feature Request

Use this template when proposing a new feature:

```markdown
**Is your feature request related to a problem? Please describe.**
A clear and concise description of what the problem is. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots about the feature request here.

**Implementation notes (optional)**
If you have ideas about how this could be implemented, share them here. This helps maintainers evaluate feasibility.
```

---

## Deployment

### MCP Server (Cloud Run)

Deploy from the `mcp-server/` directory:

```bash
cd mcp-server
gcloud run deploy cachebash-mcp \
  --source . \
  --region us-central1 \
  --project your-project-id \
  --allow-unauthenticated
```

**Note**: Must run from `mcp-server/` directory. Deployment from repo root fails because buildpacks can't find `package.json` in a subdirectory.

The `.gcloudignore` file excludes `node_modules/` from upload.

### Cloud Functions

Deploy from the `firebase/` directory:

```bash
cd firebase
firebase deploy --only functions --project your-project-id
```

### Mobile App

**Android:**
```bash
cd app
flutter build apk --release
# APK is at build/app/outputs/flutter-apk/app-release.apk
```

**iOS:**
```bash
cd app
flutter build ios --release
# Open ios/Runner.xcworkspace in Xcode and archive for App Store
```

---

## Architecture Overview

Understanding the architecture helps you contribute effectively.

### Data Flow

1. **Mobile app** (Flutter) → Firestore (real-time listeners) or REST API
2. **MCP server** (Node.js/TypeScript) → Firestore (admin SDK, bypasses security rules)
3. **Cloud Functions** (Node.js) → Triggered by Firestore changes or scheduled

### Key Collections

- `users/{uid}/tasks` — Task queue
- `users/{uid}/relay` — Inter-program messages
- `users/{uid}/sessions` — Work sessions with heartbeat tracking
- `users/{uid}/devices` — Push notification tokens
- `apiKeys/{hash}` — Per-program API keys (soft-delete on revoke)

### Security Model

- **Firestore rules**: Protect client SDK access (mobile app)
- **Admin SDK**: Bypasses rules — used by MCP server and Cloud Functions
- **Gate middleware**: Authenticates all MCP requests, logs to audit collection
- **Budget guard**: Cached check (60s TTL) prevents over-spending on expensive operations

### Lifecycle Engine

All task state transitions go through `lifecycle/engine.ts`. Valid lifecycle states:

- **created** — Initial state for new tasks
- **active** — Agent is working on the task
- **blocked** — Paused due to external dependency
- **completing** — Validation step (tasks only, between active and done)
- **done** — Successfully completed
- **failed** — Error occurred
- **archived** — Permanently removed

Valid transitions:
```
created → active → completing → done (tasks)
created → active → done (questions/sessions)
active → blocked → active
active → failed
created → archived
done → archived
failed → archived
```

Invalid transitions throw errors. This ensures data integrity.

---

## Getting Help

- **Issues**: Open an issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions or ideas
- Open a GitHub issue for questions or support

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).
