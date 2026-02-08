#!/usr/bin/env bash
# Watch Convex state for an orchestration feature.
# Usage: watch-convex.sh <feature_name> [poll_interval_secs] [timeout_secs]
#
# Polls tina-harness verify and reports changes.
# Exits when orchestration reaches terminal state or timeout.

set -euo pipefail

FEATURE="${1:?Usage: watch-convex.sh <feature_name> [poll_interval] [timeout]}"
POLL_INTERVAL="${2:-30}"
TIMEOUT="${3:-3000}"

START=$(date +%s)
LAST_STATUS=""
SEEN_ORCHESTRATION=false

echo "Watching Convex for feature: ${FEATURE}"
echo "Poll interval: ${POLL_INTERVAL}s, Timeout: ${TIMEOUT}s"

while true; do
    ELAPSED=$(( $(date +%s) - START ))

    if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
        echo "TIMEOUT: ${ELAPSED}s elapsed, stopping watcher"
        exit 1
    fi

    # Run verify and capture output
    OUTPUT=$(tina-harness verify "$FEATURE" 2>&1) || true

    if echo "$OUTPUT" | grep -q "VERIFY PASS"; then
        if [ "$SEEN_ORCHESTRATION" = false ]; then
            echo "[${ELAPSED}s] MILESTONE: Orchestration appeared in Convex"
            SEEN_ORCHESTRATION=true
        fi

        # Extract counts using POSIX-compatible extended regex (macOS compatible)
        PHASES=$(echo "$OUTPUT" | sed -n 's/.*Phases: \([0-9][0-9]*\).*/\1/p' | head -1)
        TASKS=$(echo "$OUTPUT" | sed -n 's/.*Tasks: \([0-9][0-9]*\).*/\1/p' | head -1)
        MEMBERS=$(echo "$OUTPUT" | sed -n 's/.*Team Members: \([0-9][0-9]*\).*/\1/p' | head -1)

        PHASES="${PHASES:-?}"
        TASKS="${TASKS:-?}"
        MEMBERS="${MEMBERS:-?}"

        STATUS="phases=${PHASES} tasks=${TASKS} members=${MEMBERS}"
        if [ "$STATUS" != "$LAST_STATUS" ]; then
            echo "[${ELAPSED}s] UPDATE: ${STATUS}"
            LAST_STATUS="$STATUS"
        fi
    elif echo "$OUTPUT" | grep -q "VERIFY FAIL"; then
        if [ "$SEEN_ORCHESTRATION" = false ] && [ "$ELAPSED" -ge 300 ]; then
            echo "[${ELAPSED}s] ANOMALY: 5+ minutes elapsed, no orchestration in Convex"
        fi
    fi

    sleep "$POLL_INTERVAL"
done
