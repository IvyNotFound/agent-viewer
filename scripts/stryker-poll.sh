#!/usr/bin/env bash
# stryker-poll.sh — Check Stryker background run status and tail log
#
# Usage:
#   bash scripts/stryker-poll.sh
#
# Exit codes:
#   0 — run is done (check exit code in status file)
#   1 — run is still in progress
#   2 — no run found (status file missing)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

STATUS_FILE="$PROJECT_ROOT/logs/stryker.status"
PID_FILE="$PROJECT_ROOT/logs/stryker.pid"

if [[ ! -f "$STATUS_FILE" ]]; then
  echo "No Stryker run found. Start one with: bash scripts/stryker-run.sh"
  exit 2
fi

STATUS="$(cat "$STATUS_FILE")"

# Find latest log file
LATEST_LOG="$(ls -t "$PROJECT_ROOT"/logs/stryker-*.log 2>/dev/null | head -n 1 || true)"

if [[ "$STATUS" == "running" ]]; then
  echo "=== Status: RUNNING ==="
  if [[ -f "$PID_FILE" ]]; then
    PID="$(cat "$PID_FILE")"
    if kill -0 "$PID" 2>/dev/null; then
      echo "PID: ${PID} (alive)"
    else
      echo "PID: ${PID} (process not found — may have finished)"
    fi
  fi
  if [[ -n "$LATEST_LOG" ]]; then
    echo ""
    echo "=== Last 50 lines of ${LATEST_LOG} ==="
    tail -n 50 "$LATEST_LOG"
  fi
  exit 1
else
  EXIT_CODE="${STATUS#done:}"
  echo "=== Status: DONE (exit code: ${EXIT_CODE}) ==="
  if [[ -n "$LATEST_LOG" ]]; then
    echo ""
    echo "=== Last 80 lines of ${LATEST_LOG} ==="
    tail -n 80 "$LATEST_LOG"
  fi
  if [[ "$EXIT_CODE" == "0" ]]; then
    echo ""
    echo "Run completed successfully. Use 'bash scripts/stryker-results.sh' for summary."
  else
    echo ""
    echo "Run finished with errors. Check full log: ${LATEST_LOG}"
  fi
  exit 0
fi
