#!/bin/bash
API_KEY=$(cat ~/.claude.json | jq -r '.projects | to_entries[] | select(.value.mcpServers.cachebash) | .value.mcpServers.cachebash.headers.Authorization' | sed 's/Bearer //' | head -n 1)
BASE_URL="https://your-service-url.run.app/v1/mcp"

echo "Testing MCP tools with API key: ${API_KEY:0:20}..."

# Test 1: Initialize session
echo -e "\n=== Test 1: Initialize ==="
INIT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}')

HTTP_CODE=$(echo "$INIT_RESPONSE" | tail -1)
BODY=$(echo "$INIT_RESPONSE" | head -n -1)
echo "HTTP $HTTP_CODE"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

SESSION_ID=$(echo "$BODY" | jq -r '.result.sessionId // empty' 2>/dev/null)
if [ -z "$SESSION_ID" ]; then
  echo "ERROR: No session ID returned"
  exit 1
fi
echo "Session ID: $SESSION_ID"

# Test 2: Call tools/list
echo -e "\n=== Test 2: List Tools ==="
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq '.'

# Test 3: Call get_pending_tasks
echo -e "\n=== Test 3: Get Pending Tasks ==="
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_pending_tasks","arguments":{"status":"pending","limit":10}}}' | jq '.'

echo -e "\n=== Test Complete ==="
