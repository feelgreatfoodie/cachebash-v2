# Push Notification Test Procedure

## Prerequisites
- MCP server is configured with valid API key in `~/.claude.json`
- CacheBash app is installed on physical iPhone
- User is signed in and has granted notification permissions
- App is running in background (not actively open)

## Test Sequence

Execute these steps in order. Each step uses MCP tools available to this Claude Code session.

---

### Step 1: Update Status (Verify MCP Connection)

First, verify the MCP server is working by updating the session status:

```
Use the update_status tool with:
- status: "Testing push notifications"
- progress: 10
- state: "working"
```

**Expected:** Tool returns success. Check the app - status should appear on the Sessions screen.

---

### Step 2: Send Test Question (High Priority)

Send a push notification to the user's phone:

```
Use the ask_question tool with:
- question: "This is a test push notification from Claude Code. Did you receive this on your iPhone?"
- options: ["Yes, received it!", "No notification", "Received but delayed"]
- priority: "high"
- context: "Testing CacheBash push notification flow"
```

**Expected:**
- Tool returns a questionId
- Push notification appears on iPhone within seconds
- Notification shows the question text

**Save the questionId for Step 3.**

---

### Step 3: Poll for Response

Wait 30-60 seconds for the user to respond on their phone, then check:

```
Use the get_response tool with:
- questionId: <the ID from Step 2>
```

**Expected:**
- If answered: Returns `{ response: "Yes, received it!", answeredAt: <timestamp> }`
- If not answered yet: Returns null or pending status

---

### Step 4: Update Status (Complete)

Mark the test as complete:

```
Use the update_status tool with:
- status: "Push notification test complete"
- progress: 100
- state: "complete"
```

---

### Step 5: Test Pin/Resume Flow (Optional)

Test the task pinning feature:

```
Use the pin_task tool with:
- taskId: "test-pin-001"
- questionId: <same questionId from Step 2>
- context: "Testing pin functionality. Was verifying push notifications work correctly."
```

Then later:

```
Use the resume_task tool with:
- taskId: "test-pin-001"
```

**Expected:** Returns the saved context and any response.

---

## Troubleshooting

### MCP tool not found
- Restart Claude Code to reload MCP configuration
- Verify `~/.claude.json` has the cachebash MCP server configured

### ask_question fails with auth error
- API key may be invalid or expired
- Generate new API key in app Settings and update `~/.claude.json`

### No push notification received
1. Check iPhone notification settings for CacheBash app
2. Verify FCM token was registered (check Firestore `/users/{uid}/devices`)
3. Check Firebase Cloud Functions logs for errors
4. Ensure phone has internet connection

### get_response returns null
- User hasn't responded yet - wait longer
- Question may have expired (24h TTL)

---

## Success Criteria

All tests pass if:
- [ ] update_status succeeds and status visible in app
- [ ] ask_question returns a questionId
- [ ] Push notification appears on iPhone
- [ ] User can tap notification and see question in app
- [ ] User can respond via app
- [ ] get_response returns the user's answer
- [ ] pin_task and resume_task work correctly

---

## Autonomous Execution

To run this test autonomously without user interaction:

1. Execute Steps 1-2 immediately
2. After sending the question, inform the user: "I've sent a test notification to your phone. Please respond when you see it."
3. Wait 60 seconds, then poll with get_response
4. If no response after 3 polls (3 minutes total), report that user did not respond
5. Complete Step 4 regardless of response status

The test is considered successful if the ask_question tool executes without error - this confirms the full path from Claude Code -> MCP -> Firebase -> FCM is working. User response verification is optional confirmation.
