#!/usr/bin/env bash
# stryker-run.sh — Launch Stryker mutation test in background (WSL-safe)
#
# Usage:
#   bash scripts/stryker-run.sh                          # full run
#   bash scripts/stryker-run.sh --mutate "src/main/session-closer.ts"
#   bash scripts/stryker-run.sh --mutate "src/renderer/src/components/**/*.ts"
#
# Output:
#   logs/stryker-<timestamp>.log  — full Stryker output
#   logs/stryker.pid              — PID of the background process
#   logs/stryker.status           — "running" or "done:<exit-code>"
#
# NOTE: In WSL, closing the terminal may kill background processes.
# Use tmux/screen for persistent runs:
#   tmux new-session -d -s stryker 'bash scripts/stryker-run.sh --mutate "src/main/..."'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
MUTATE_PATTERN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mutate)
      MUTATE_PATTERN="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Ensure logs dir exists
mkdir -p "$PROJECT_ROOT/logs"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$PROJECT_ROOT/logs/stryker-${TIMESTAMP}.log"
PID_FILE="$PROJECT_ROOT/logs/stryker.pid"
STATUS_TMP="$PROJECT_ROOT/logs/stryker.status.tmp"
STATUS_FILE="$PROJECT_ROOT/logs/stryker.status"

# Build the stryker command
if [[ -n "$MUTATE_PATTERN" ]]; then
  STRYKER_CMD="npx stryker run --mutate \"${MUTATE_PATTERN}\""
  echo "Target: ${MUTATE_PATTERN}"
else
  STRYKER_CMD="npx stryker run"
  echo "Target: full project"
fi

echo "Log:    ${LOG_FILE}"
echo "Status: ${STATUS_FILE}"

# Write initial status (atomic)
echo "running" > "$STATUS_TMP"
mv "$STATUS_TMP" "$STATUS_FILE"

# Launch in background via nohup
nohup bash -c "
  cd '${PROJECT_ROOT}'
  ${STRYKER_CMD}
  EXIT_CODE=\$?
  echo \"done:\${EXIT_CODE}\" > '${STATUS_TMP}'
  mv '${STATUS_TMP}' '${STATUS_FILE}'
  exit \$EXIT_CODE
" > "$LOG_FILE" 2>&1 &

BG_PID=$!
echo "$BG_PID" > "$PID_FILE"

echo "Started PID ${BG_PID} — use 'bash scripts/stryker-poll.sh' to check progress"
