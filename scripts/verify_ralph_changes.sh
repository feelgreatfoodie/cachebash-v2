#!/bin/bash
#
# Verify Ralph's CacheBash Improvements
# Tests all 14 user stories from the PRD
#

# Don't exit on error - we want to run all tests
set +e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; FAIL=$((FAIL+1)); }
skip() { echo -e "${YELLOW}○ SKIP${NC}: $1 (manual test required)"; SKIP=$((SKIP+1)); }
section() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

cd "$(dirname "$0")/.."

section "US-001: Push Notifications"

# Check onMessageCreate is exported in functions index
if grep -q "onMessageCreate" firebase/functions/src/index.ts; then
  pass "onMessageCreate exported in Cloud Functions"
else
  fail "onMessageCreate NOT exported in Cloud Functions"
fi

# Check preview field in askQuestion
if grep -q "preview" mcp-server/src/tools/askQuestion.ts; then
  pass "Preview field added to askQuestion"
else
  fail "Preview field missing in askQuestion"
fi

# Check notification functions use preview
if grep -q "message.preview\|question.preview" firebase/functions/src/notifications/*.ts; then
  pass "Notification functions use preview field"
else
  fail "Notification functions don't use preview field"
fi

section "US-002: Real-Time Updates"

# Check for stream combining in messages provider
if grep -q "_combineStreams\|snapshots()" app/lib/providers/messages_provider.dart; then
  pass "Messages provider uses stream listeners"
else
  fail "Messages provider missing stream listeners"
fi

section "US-003: Sessions on Home Screen"

# Check archived: false in updateStatus
if grep -q "archived.*false\|archived: false" mcp-server/src/tools/updateStatus.ts; then
  pass "updateStatus sets archived: false"
else
  fail "updateStatus missing archived: false"
fi

section "US-004: Archive Error Fix"

# Check dual-collection handling in archive methods
if grep -A30 "archiveMessage" app/lib/providers/messages_provider.dart | grep -q "questions"; then
  pass "archiveMessage handles both collections"
else
  fail "archiveMessage doesn't handle /questions collection"
fi

section "US-005: Archived Messages Folder"

# Check archived messages screen exists
if [ -f "app/lib/screens/messages/archived_messages_screen.dart" ]; then
  pass "ArchivedMessagesScreen exists"
else
  fail "ArchivedMessagesScreen missing"
fi

# Check route exists
if grep -q "archived.*messages\|/messages/archived" app/lib/app.dart; then
  pass "Archived messages route configured"
else
  fail "Archived messages route missing"
fi

# Check archive icon in messages screen
if grep -q "archive" app/lib/screens/messages/messages_screen.dart; then
  pass "Archive icon in messages screen AppBar"
else
  fail "Archive icon missing from messages screen"
fi

section "US-006: Session Cards Show Updates"

# Already implemented - verify fields are displayed
if grep -q "session.status" app/lib/widgets/session_card.dart; then
  pass "SessionCard displays status"
else
  fail "SessionCard missing status display"
fi

if grep -q "lastUpdate\|_formatTime" app/lib/widgets/session_card.dart; then
  pass "SessionCard displays timestamp"
else
  fail "SessionCard missing timestamp"
fi

section "US-007: Session Status History"

# Check updates subcollection in MCP
if grep -q "updates" mcp-server/src/tools/updateStatus.ts; then
  pass "updateStatus writes to updates subcollection"
else
  fail "updateStatus missing subcollection write"
fi

# Check StatusUpdate model
if grep -q "StatusUpdate" app/lib/models/session_model.dart; then
  pass "StatusUpdate model exists"
else
  fail "StatusUpdate model missing"
fi

# Check sessionUpdatesProvider
if grep -q "sessionUpdatesProvider" app/lib/providers/sessions_provider.dart; then
  pass "sessionUpdatesProvider exists"
else
  fail "sessionUpdatesProvider missing"
fi

section "US-008: Project Identifier"

# Check projectName in MCP
if grep -q "projectName" mcp-server/src/tools/updateStatus.ts; then
  pass "projectName in updateStatus"
else
  fail "projectName missing from updateStatus"
fi

# Check projectName in SessionModel
if grep -q "projectName" app/lib/models/session_model.dart; then
  pass "projectName in SessionModel"
else
  fail "projectName missing from SessionModel"
fi

# Check projectName display in SessionCard
if grep -q "projectName" app/lib/widgets/session_card.dart; then
  pass "projectName displayed in SessionCard"
else
  fail "projectName not displayed in SessionCard"
fi

section "US-009: Swap Search/Sessions Icons"

# Check order in main_shell - sessions should come before search
if grep -n "terminal\|search" app/lib/widgets/main_shell.dart | head -4; then
  skip "Nav icon order (verify visually: Sessions should be before Search)"
fi

section "US-010: Remove New Task Button"

# Check FAB removed from tasks screen
if grep -q "FloatingActionButton" app/lib/screens/tasks/tasks_screen.dart; then
  fail "FloatingActionButton still in tasks screen"
else
  pass "FloatingActionButton removed from tasks screen"
fi

section "US-011: Fix X Button on Compose"

# Check compose uses push not go
if grep -q "context.push.*messages/new\|push('/messages/new')" app/lib/widgets/main_shell.dart; then
  pass "Compose button uses push() for navigation"
else
  fail "Compose button may still use go() - X button won't work"
fi

section "US-012: Keyboard Dismiss"

# Check GestureDetector in key screens
KEYBOARD_SCREENS=(
  "app/lib/screens/messages/create_message_screen.dart"
  "app/lib/screens/search/search_screen.dart"
  "app/lib/screens/auth/login_screen.dart"
)

for screen in "${KEYBOARD_SCREENS[@]}"; do
  if grep -q "GestureDetector\|unfocus" "$screen" 2>/dev/null; then
    pass "Keyboard dismiss in $(basename $screen)"
  else
    fail "Keyboard dismiss missing in $(basename $screen)"
  fi
done

section "US-013: Back Navigation Fix"

# Check push usage in session navigation
if grep -q "context.push.*sessions" app/lib/screens/sessions/sessions_screen.dart; then
  pass "Sessions screen uses push() for navigation"
else
  fail "Sessions screen may use go() - back button won't work"
fi

# Check pop in session detail
if grep -q "context.pop\|canPop" app/lib/screens/sessions/session_detail_screen.dart; then
  pass "Session detail uses pop() for back"
else
  fail "Session detail missing pop() for back"
fi

section "US-014: Help/Feedback Icon"

# Check url_launcher dependency
if grep -q "url_launcher" app/pubspec.yaml; then
  pass "url_launcher dependency added"
else
  fail "url_launcher dependency missing"
fi

# Check help icon in home screen
if grep -q "help\|feedback\|github" app/lib/screens/home/home_screen.dart; then
  pass "Help/feedback in home screen"
else
  fail "Help/feedback missing from home screen"
fi

# Check feedback in settings
if grep -q "Feedback\|feedback" app/lib/screens/settings/settings_screen.dart; then
  pass "Feedback option in settings"
else
  fail "Feedback option missing from settings"
fi

section "Build Verification"

# Run flutter analyze
echo "Running flutter analyze..."
cd app
if flutter analyze --no-fatal-infos --no-fatal-warnings 2>/dev/null; then
  pass "Flutter analyze passes"
else
  fail "Flutter analyze has errors"
fi
cd ..

# Run MCP server build
echo "Running MCP server build..."
cd mcp-server
if npm run build 2>/dev/null; then
  pass "MCP server builds"
else
  fail "MCP server build fails"
fi
cd ..

section "Summary"
echo ""
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$SKIP skipped${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}Some tests failed. Review the issues above.${NC}"
  exit 1
else
  echo -e "${GREEN}All automated tests passed!${NC}"
  echo "Manual verification still recommended for UI/UX items."
  exit 0
fi
