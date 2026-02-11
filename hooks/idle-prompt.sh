#!/usr/bin/env bash
# Notification hook for idle prompts in Tina sessions.
# Injects a reminder to keep team sessions moving without manual nudges.

set -euo pipefail

input_json="$(cat)"

notification_type="$(printf '%s' "$input_json" | jq -r '.notification_type // .notificationType // ""' 2>/dev/null || true)"

# Matcher already scopes this to idle_prompt, but keep a defensive check.
if [[ "$notification_type" != "" && "$notification_type" != "idle_prompt" ]]; then
  exit 0
fi

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "Notification",
    "additionalContext": "<TINA_IDLE_PROMPT>\nIf this session is leading a team and there is pending teammate work, continue autonomously: read teammate inbox updates, apply review feedback, and dispatch next actions without waiting for a manual \"continue\" nudge.\n</TINA_IDLE_PROMPT>"
  }
}
EOF

exit 0
