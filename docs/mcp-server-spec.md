# CacheBash MCP Server Specification

## Overview

The CacheBash MCP (Model Context Protocol) server enables Claude Code to communicate with users through the CacheBash mobile app. It exposes tools that Claude can call to ask questions, check for responses, update status, and manage pinned tasks.

## Installation & Configuration

### Installation

```bash
# Install globally
npm install -g @cachebash/mcp-server

# Or add to Claude Code config
```

### Claude Code Configuration

Add to `~/.config/claude/mcp.json`:

```json
{
  "mcpServers": {
    "cachebash": {
      "command": "cachebash-mcp",
      "env": {
        "CACHEBASH_API_KEY": "your-api-key",
        "CACHEBASH_SESSION_ID": "optional-session-id"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CACHEBASH_API_KEY` | Yes | User's API key from the mobile app |
| `CACHEBASH_SESSION_ID` | No | Override session ID (auto-generated if not set) |
| `CACHEBASH_API_URL` | No | Custom API endpoint (default: production) |

---

## Tools

### 1. ask_question

Send a question to the user's mobile device.

**Parameters:**

```typescript
{
  question: string;          // The question to ask (required)
  options?: string[];        // Multiple choice options (optional)
  priority?: 'low' | 'normal' | 'high';  // Notification priority (default: 'normal')
  context?: string;          // What you're working on (shown in app)
  waitForResponse?: boolean; // Block until response (default: false)
  timeoutMs?: number;        // Timeout if waiting (default: 300000 = 5 min)
}
```

**Returns:**

```typescript
{
  questionId: string;        // Unique ID to check for response
  status: 'sent' | 'delivered';
  estimatedDeliveryTime?: string;
}
```

**Example Usage:**

```
I need to ask the user about the database schema. Let me send them a question.

<tool_call>
ask_question({
  question: "Should user profiles be stored in a separate collection or as subcollections under tenants?",
  options: ["Separate /users collection", "Subcollection /tenants/{id}/users", "Let me explain my preference"],
  priority: "normal",
  context: "Designing Firestore schema for multi-tenant app"
})
</tool_call>
```

---

### 2. get_response

Check if the user has responded to a question.

**Parameters:**

```typescript
{
  questionId: string;        // ID from ask_question (required)
}
```

**Returns:**

```typescript
// If answered:
{
  status: 'answered';
  response: string;          // The user's response
  selectedOption?: number;   // Index if multiple choice
  notes?: string;            // Additional notes from user
  answeredAt: string;        // ISO timestamp
}

// If pending:
{
  status: 'pending';
  askedAt: string;
  estimatedResponseTime?: string;
}

// If expired:
{
  status: 'expired';
  reason: string;
}
```

**Example Usage:**

```
Let me check if the user responded to my question about the schema.

<tool_call>
get_response({
  questionId: "q_abc123"
})
</tool_call>
```

---

### 3. update_status

Update the current working status visible in the mobile app.

**Parameters:**

```typescript
{
  status: string;            // Status message (required)
  progress?: number;         // Percentage 0-100 (optional)
  taskId?: string;           // Task/story ID being worked on
  state?: 'working' | 'blocked' | 'complete' | 'pinned';  // (default: 'working')
  details?: string;          // Additional details
}
```

**Returns:**

```typescript
{
  success: boolean;
  updatedAt: string;
}
```

**Example Usage:**

```
Let me update the user on my progress.

<tool_call>
update_status({
  status: "Implementing user authentication flow",
  progress: 35,
  taskId: "US-010",
  state: "working",
  details: "Setting up Firebase Auth provider and login screen"
})
</tool_call>
```

---

### 4. pin_task

Pin the current task to work on something else while waiting for a response.

**Parameters:**

```typescript
{
  taskId: string;            // Identifier for this task (required)
  questionId: string;        // Question waiting for response (required)
  context: string;           // Summary to resume from (required)
  files?: string[];          // Key files involved
  currentStep?: string;      // Where you left off
}
```

**Returns:**

```typescript
{
  pinId: string;
  pinnedAt: string;
  canResume: boolean;
}
```

**Example Usage:**

```
I'm waiting for the user's response about the schema. Let me pin this task and work on something else.

<tool_call>
pin_task({
  taskId: "US-006",
  questionId: "q_abc123",
  context: "Designing Firestore schema. Waiting for decision on user collection structure. Next step: create security rules based on chosen approach.",
  files: ["firebase/firestore.rules", "docs/schema.md"],
  currentStep: "Collection structure decision"
})
</tool_call>
```

---

### 5. resume_task

Resume a previously pinned task after receiving a response.

**Parameters:**

```typescript
{
  taskId: string;            // Task to resume (required)
}
```

**Returns:**

```typescript
{
  context: string;           // The saved context
  response: {
    question: string;
    answer: string;
    answeredAt: string;
  };
  files: string[];
  currentStep: string;
  pinnedDuration: string;    // How long it was pinned
}
```

**Example Usage:**

```
The user responded to my schema question. Let me resume that task.

<tool_call>
resume_task({
  taskId: "US-006"
})
</tool_call>
```

---

### 6. list_pinned_tasks

List all currently pinned tasks.

**Parameters:**

```typescript
{
  includeResponded?: boolean;  // Include tasks with responses (default: true)
}
```

**Returns:**

```typescript
{
  tasks: Array<{
    taskId: string;
    questionId: string;
    context: string;
    pinnedAt: string;
    hasResponse: boolean;
    response?: string;
  }>;
}
```

---

### 7. get_session_info

Get information about the current session.

**Parameters:** None

**Returns:**

```typescript
{
  sessionId: string;
  sessionName: string;
  status: string;
  state: string;
  pendingQuestions: number;
  pinnedTasks: number;
  startedAt: string;
  lastUpdate: string;
}
```

---

## Best Practices

### When to Ask Questions

1. **Architecture decisions** - "Should we use X or Y approach?"
2. **Clarification needed** - "You mentioned Z, did you mean...?"
3. **Approval required** - "I'm about to delete X, is that okay?"
4. **Blocked on external info** - "What's the API key for service X?"

### When NOT to Ask

1. **Implementation details** - Make reasonable decisions
2. **Obvious choices** - Follow established patterns
3. **Trivial questions** - Don't interrupt unnecessarily

### Question Quality

**Good:**
```
"The PRD mentions 'user preferences'. Should these be:
A) Global preferences in /users/{id}/preferences
B) Per-tenant preferences in /tenants/{id}/users/{id}/preferences
C) Both with inheritance

This affects security rules and query patterns."
```

**Bad:**
```
"Where should I put user preferences?"
```

### Task Pinning Strategy

1. **Pin when blocked** - Don't wait idle, work on other tasks
2. **Save sufficient context** - Include files, current step, and what's needed
3. **Check pinned tasks** - Periodically check for responses
4. **Resume promptly** - When response arrives, resume that task

---

## Error Handling

### Common Errors

| Error Code | Description | Resolution |
|------------|-------------|------------|
| `AUTH_FAILED` | Invalid API key | Check CACHEBASH_API_KEY |
| `RATE_LIMITED` | Too many requests | Wait and retry |
| `SESSION_NOT_FOUND` | Session doesn't exist | Session may have expired |
| `QUESTION_EXPIRED` | Question timed out | Ask again if still needed |
| `NETWORK_ERROR` | Connectivity issue | Check internet connection |

### Retry Strategy

```typescript
// Automatic retry with exponential backoff
const config = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000
};
```

---

## Security

### API Key Security

- API keys are transmitted via HTTPS only
- Keys are never logged or stored in plaintext
- Rotation supported via mobile app

### Data in Transit

- All communication over TLS 1.3
- Certificate pinning in production

### Data at Rest

- Questions/responses encrypted in Firestore
- No sensitive data in push notification payloads

---

## Rate Limits

| Operation | Limit |
|-----------|-------|
| ask_question | 10/minute |
| get_response | 60/minute |
| update_status | 30/minute |
| pin_task | 20/minute |

---

## Monitoring

### Health Check

```bash
cachebash-mcp --health
```

### Debug Mode

```bash
CACHEBASH_DEBUG=true cachebash-mcp
```

### Logs

Logs are written to stderr and can be captured by Claude Code.

---

## Changelog

### v1.0.0 (Initial Release)
- Core tools: ask_question, get_response, update_status
- Task pinning: pin_task, resume_task, list_pinned_tasks
- Session management: get_session_info
