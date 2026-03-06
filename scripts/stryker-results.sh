#!/usr/bin/env bash
# stryker-results.sh — Display Stryker mutation score and surviving mutants
#
# Usage:
#   bash scripts/stryker-results.sh
#
# Reads from reports/mutation/ (HTML report) and latest log file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REPORT_DIR="$PROJECT_ROOT/reports/mutation"
LATEST_LOG="$(ls -t "$PROJECT_ROOT"/logs/stryker-*.log 2>/dev/null | head -n 1 || true)"

echo "=== Stryker Mutation Test Results ==="
echo ""

# Parse score from latest log
if [[ -n "$LATEST_LOG" && -f "$LATEST_LOG" ]]; then
  echo "--- Score (from log: $(basename "$LATEST_LOG")) ---"

  # Extract mutation score line
  SCORE_LINE="$(grep -E "Mutation score|mutation score" "$LATEST_LOG" | tail -n 1 || true)"
  if [[ -n "$SCORE_LINE" ]]; then
    echo "$SCORE_LINE"
  fi

  # Extract summary table (Killed/Survived/Timeout/etc.)
  echo ""
  echo "--- Summary ---"
  grep -E "^\s*(Killed|Survived|Timeout|No coverage|Ignored|Runtime errors|Compile errors|Total mutants)" "$LATEST_LOG" | tail -n 20 || true

  # Extract surviving mutants
  echo ""
  echo "--- Surviving Mutants ---"
  grep -E "Survived" "$LATEST_LOG" | grep -v "^Survived" | head -n 30 || true

else
  echo "No log file found in logs/. Run: bash scripts/stryker-run.sh"
fi

# Report HTML location
echo ""
if [[ -f "$REPORT_DIR/index.html" ]]; then
  echo "--- HTML Report ---"
  echo "Open in browser: $REPORT_DIR/index.html"
else
  echo "No HTML report found at $REPORT_DIR/index.html"
  echo "Run Stryker first: bash scripts/stryker-run.sh"
fi
