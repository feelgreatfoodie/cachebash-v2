#!/bin/bash
# Dream Mode Watcher Daemon
# Polls CacheBash for pending dream sessions and wakes target agents via tmux.
# Zero model tokens — pure bash + curl + jq.

set -euo pipefail

LOG_DIR="$HOME/.cachebash"
LOG_FILE="$LOG_DIR/dream-watcher.log"
POLL_INTERVAL=30

mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

# --- Extract API key from Claude MCP config ---
get_api_key() {
  local config="$HOME/.claude.json"
  [[ -f "$config" ]] || { log "ERROR: $config not found"; return 1; }
  jq -r '.mcpServers.cachebash.headers.Authorization // empty' "$config" 2>/dev/null | sed 's/^Bearer //'
}

get_base_url() {
  local config="$HOME/.claude.json"
  jq -r '.mcpServers.cachebash.url // empty' "$config" 2>/dev/null | sed 's|/v1/mcp$||; s|/mcp$||'
}

# --- Abstracted wake interface (Decision #6 amended) ---
# Defaults to tmux send-keys. Swap this function to change the wake mechanism.
wake() {
  local agent="$1" dream_id="$2" branch="$3" budget="$4" timeout="$5" task_id="$6"

  local prompt="You have been woken by Dream Mode. Dream session ID: ${dream_id}. Branch: ${branch}. Budget cap: \$${budget}. Timeout: ${timeout}h. Task: ${task_id:-unspecified}. Work autonomously within budget. When done, write morning_report to the dream session doc and set status to completed. If you fail, set status to failed with outcome details. Check git out to branch ${branch} before starting."

  if tmux has-session -t "$agent" 2>/dev/null; then
    # Session exists — send dream context
    log "Waking existing session: $agent"
    tmux send-keys -t "$agent" "$prompt" Enter
  else
    # No session — create one with grid-launch pattern
    local dir
    case "$agent" in
      basher|sark) dir="$HOME/1P projects/cachebash" ;;
      *) dir="$HOME/1P projects/rezzed-ai" ;;
    esac

    log "Creating new session for: $agent"
    tmux new-session -d -s "$agent" -c "$dir"
    tmux send-keys -t "$agent" "export CACHEBASH_SESSION_ID=$agent" Enter
    sleep 1
    tmux send-keys -t "$agent" "claude --append-system-prompt '$prompt'" Enter
  fi
}

# --- Main loop ---
API_KEY=$(get_api_key) || exit 1
BASE_URL=$(get_base_url) || exit 1

if [[ -z "$API_KEY" || -z "$BASE_URL" ]]; then
  log "ERROR: Could not extract API key or URL from config"
  exit 1
fi

log "Dream watcher started. Polling every ${POLL_INTERVAL}s."
log "Base URL: $BASE_URL"

while true; do
  # Poll for pending dreams
  RESPONSE=$(curl -s -m 5 \
    -H "Authorization: Bearer $API_KEY" \
    "${BASE_URL}/v1/dreams/peek" 2>/dev/null) || { log "WARN: peek request failed"; sleep "$POLL_INTERVAL"; continue; }

  HAS_DREAMS=$(echo "$RESPONSE" | jq -r '.hasDreams // false' 2>/dev/null) || { sleep "$POLL_INTERVAL"; continue; }

  if [[ "$HAS_DREAMS" != "true" ]]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  COUNT=$(echo "$RESPONSE" | jq -r '.count // 0' 2>/dev/null)
  log "Found $COUNT pending dream(s)"

  # Process each pending dream
  echo "$RESPONSE" | jq -c '.dreams[]' 2>/dev/null | while read -r dream; do
    DREAM_ID=$(echo "$dream" | jq -r '.id')
    AGENT=$(echo "$dream" | jq -r '.agent')
    BRANCH=$(echo "$dream" | jq -r '.branch')
    BUDGET=$(echo "$dream" | jq -r '.budget_cap_usd')
    TIMEOUT=$(echo "$dream" | jq -r '.timeout_hours')
    TASK_ID=$(echo "$dream" | jq -r '.task_id // empty')

    log "Activating dream $DREAM_ID for agent $AGENT"

    # Atomic pending → active transition
    ACTIVATE_RESPONSE=$(curl -s -m 5 \
      -X POST \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"dreamId\":\"$DREAM_ID\"}" \
      "${BASE_URL}/v1/dreams/activate" 2>/dev/null) || { log "WARN: activate failed for $DREAM_ID"; continue; }

    SUCCESS=$(echo "$ACTIVATE_RESPONSE" | jq -r '.success // false' 2>/dev/null)

    if [[ "$SUCCESS" != "true" ]]; then
      log "WARN: Could not activate $DREAM_ID (already claimed or not found)"
      continue
    fi

    log "Dream $DREAM_ID activated. Waking agent $AGENT..."
    wake "$AGENT" "$DREAM_ID" "$BRANCH" "$BUDGET" "$TIMEOUT" "$TASK_ID"
    log "Agent $AGENT woken for dream $DREAM_ID"
  done

  sleep "$POLL_INTERVAL"
done
