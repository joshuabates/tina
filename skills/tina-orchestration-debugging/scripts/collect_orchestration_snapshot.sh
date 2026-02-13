#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Collect a Tina orchestration debug snapshot (Convex + runtime + local logs).

Usage:
  collect_orchestration_snapshot.sh --orchestration-id <id> [options]
  collect_orchestration_snapshot.sh --feature <feature-name> [options]

Options:
  -o, --orchestration-id <id>   Convex orchestration id
  -f, --feature <name>          Feature name; resolves latest orchestration if id not provided
  -l, --limit <n>               Limit for timeline/event/telemetry queries (default: 200)
  -d, --out-dir <path>          Output directory root (default: tmp/orchestration-debug)
      --skip-telemetry          Skip telemetry queries
  -h, --help                    Show help
EOF
}

ORCHESTRATION_ID=""
FEATURE=""
LIMIT=200
OUT_DIR="tmp/orchestration-debug"
SKIP_TELEMETRY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--orchestration-id)
      ORCHESTRATION_ID="${2:-}"
      shift 2
      ;;
    -f|--feature)
      FEATURE="${2:-}"
      shift 2
      ;;
    -l|--limit)
      LIMIT="${2:-}"
      shift 2
      ;;
    -d|--out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --skip-telemetry)
      SKIP_TELEMETRY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$ORCHESTRATION_ID" && -z "$FEATURE" ]]; then
  echo "Provide --orchestration-id or --feature." >&2
  usage
  exit 1
fi

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
  echo "--limit must be an integer." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required but not installed." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

RUN_KEY="${ORCHESTRATION_ID:-$FEATURE}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="${OUT_DIR%/}/${RUN_KEY}-${TIMESTAMP}"
mkdir -p "$RUN_DIR"
SUMMARY_FILE="$RUN_DIR/summary.md"

cat > "$SUMMARY_FILE" <<EOF
# Tina Orchestration Debug Snapshot

- captured_at_utc: ${TIMESTAMP}
- repo_root: ${REPO_ROOT}
- requested_orchestration_id: ${ORCHESTRATION_ID:-"(none)"}
- requested_feature: ${FEATURE:-"(none)"}
- limit: ${LIMIT}
- tina_env: ${TINA_ENV:-"(unset)"}

## Artifacts
EOF

extract_orchestration_id() {
  local raw="$1"
  python3 - "$raw" <<'PY'
import json
import sys

raw = sys.argv[1]
try:
    payload = json.loads(raw)
except Exception:
    print("", end="")
    raise SystemExit(0)

if isinstance(payload, dict):
    print(payload.get("_id", ""), end="")
else:
    print("", end="")
PY
}

json_get() {
  local json_file="$1"
  local path="$2"
  python3 - "$json_file" "$path" <<'PY'
import json
import sys

json_file = sys.argv[1]
path = sys.argv[2].split(".")

try:
    with open(json_file, "r", encoding="utf-8") as f:
        value = json.load(f)
except Exception:
    print("", end="")
    raise SystemExit(0)

for part in path:
    if isinstance(value, dict) and part in value:
        value = value[part]
    else:
        print("", end="")
        raise SystemExit(0)

if value is None:
    print("", end="")
elif isinstance(value, (dict, list)):
    print(json.dumps(value), end="")
else:
    print(str(value), end="")
PY
}

collect_query() {
  local slug="$1"
  local fn="$2"
  local args="$3"
  local out_file="$RUN_DIR/${slug}.json"
  local err_file="$RUN_DIR/${slug}.stderr"

  if npx convex run "$fn" "$args" >"$out_file" 2>"$err_file"; then
    [[ -s "$err_file" ]] || rm -f "$err_file"
    echo "- [ok] \`$fn\` -> \`${slug}.json\`" >> "$SUMMARY_FILE"
  else
    echo "- [error] \`$fn\` failed -> \`${slug}.stderr\`" >> "$SUMMARY_FILE"
  fi
}

capture_shell_command() {
  local slug="$1"
  local cmd="$2"
  local out_file="$RUN_DIR/${slug}.txt"
  local err_file="$RUN_DIR/${slug}.stderr"
  local rc

  set +e
  bash -lc "$cmd" >"$out_file" 2>"$err_file"
  rc=$?
  set -e

  if [[ $rc -eq 0 ]]; then
    [[ -s "$err_file" ]] || rm -f "$err_file"
    echo "- [ok] command \`${cmd}\` -> \`${slug}.txt\`" >> "$SUMMARY_FILE"
  else
    echo "- [warn] command \`${cmd}\` exited ${rc} -> \`${slug}.stderr\`" >> "$SUMMARY_FILE"
  fi
}

if [[ -z "$ORCHESTRATION_ID" ]]; then
  feature_args=$(printf '{"featureName":"%s"}' "$FEATURE")
  if feature_output=$(npx convex run orchestrations:getByFeature "$feature_args" 2>"$RUN_DIR/resolve_feature.stderr"); then
    printf '%s\n' "$feature_output" > "$RUN_DIR/orchestration_by_feature.json"
    ORCHESTRATION_ID="$(extract_orchestration_id "$feature_output")"
    if [[ -n "$ORCHESTRATION_ID" ]]; then
      echo "- [ok] resolved orchestration id from feature -> \`orchestration_by_feature.json\`" >> "$SUMMARY_FILE"
    else
      echo "- [error] could not resolve orchestration id for feature '$FEATURE'" >> "$SUMMARY_FILE"
      echo "Could not resolve orchestration id for feature '$FEATURE'." >&2
      exit 1
    fi
  else
    echo "- [error] failed to query \`orchestrations:getByFeature\`" >> "$SUMMARY_FILE"
    echo "Failed to query orchestrations:getByFeature for feature '$FEATURE'." >&2
    exit 1
  fi
fi

orch_args=$(printf '{"orchestrationId":"%s"}' "$ORCHESTRATION_ID")
orch_limit_args=$(printf '{"orchestrationId":"%s","limit":%s}' "$ORCHESTRATION_ID" "$LIMIT")
shutdown_args=$(printf '{"orchestrationId":"%s","eventType":"agent_shutdown","limit":%s}' "$ORCHESTRATION_ID" "$LIMIT")

collect_query "orchestration_detail" "orchestrations:getOrchestrationDetail" "$orch_args"
collect_query "timeline_unified" "timeline:getUnifiedTimeline" "$orch_limit_args"
collect_query "events_all" "events:listEvents" "$orch_limit_args"
collect_query "events_agent_shutdown" "events:listEvents" "$shutdown_args"
collect_query "control_actions" "controlPlane:listControlActions" "$orch_limit_args"
collect_query "tasks_current" "tasks:getCurrentTasks" "$orch_args"
collect_query "commits" "commits:listCommits" "$orch_args"
collect_query "plans" "plans:listPlans" "$orch_args"

if [[ $SKIP_TELEMETRY -eq 0 ]]; then
  collect_query "telemetry_events" "telemetry:listEvents" "$orch_limit_args"
  collect_query "telemetry_spans" "telemetry:listSpans" "$orch_limit_args"
else
  echo "- [skip] telemetry queries disabled (--skip-telemetry)" >> "$SUMMARY_FILE"
fi

# Collect runtime context via tina-session/tmux when available.
if command -v tina-session >/dev/null 2>&1; then
  capture_shell_command "tina_session_config_show" "tina-session config show --env ${TINA_ENV:-prod}"
  capture_shell_command "tina_session_daemon_status" "tina-session daemon status"
  capture_shell_command "tina_session_list" "tina-session list"
else
  echo "- [skip] tina-session command not found" >> "$SUMMARY_FILE"
fi

if command -v tmux >/dev/null 2>&1; then
  capture_shell_command "tmux_list_sessions" "tmux list-sessions"
  capture_shell_command "tmux_list_panes" "tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_current_command}'"
else
  echo "- [skip] tmux command not found" >> "$SUMMARY_FILE"
fi

# If feature was not provided, infer it from orchestration detail when possible.
if [[ -z "$FEATURE" && -s "$RUN_DIR/orchestration_detail.json" ]]; then
  FEATURE="$(json_get "$RUN_DIR/orchestration_detail.json" "featureName")"
fi

# Local team config and lead debug log are high-signal for orchestration incidents.
if [[ -n "$FEATURE" ]]; then
  TEAM_NAME="${FEATURE}-orchestration"
  TEAM_CONFIG="$HOME/.claude/teams/${TEAM_NAME}/config.json"

  if [[ -f "$TEAM_CONFIG" ]]; then
    cp "$TEAM_CONFIG" "$RUN_DIR/team_config.json"
    echo "- [ok] copied team config -> \`team_config.json\`" >> "$SUMMARY_FILE"

    LEAD_SESSION_ID="$(json_get "$RUN_DIR/team_config.json" "leadSessionId")"
    if [[ -n "$LEAD_SESSION_ID" && -f "$HOME/.claude/debug/${LEAD_SESSION_ID}.txt" ]]; then
      cp "$HOME/.claude/debug/${LEAD_SESSION_ID}.txt" "$RUN_DIR/lead_debug.log"
      echo "- [ok] copied lead debug log -> \`lead_debug.log\`" >> "$SUMMARY_FILE"

      # Extract signatures that commonly indicate orchestration routing/dispatch failures.
      if grep -nE "handleSpawnInProcess.*found=false|SystemPrompt.*path=simple|error_code|cli_exit_non_zero|cli_spawn_failed|payload_invalid|unknown_action_type|agent_shutdown" \
        "$RUN_DIR/lead_debug.log" > "$RUN_DIR/lead_debug_signatures.txt"; then
        echo "- [ok] extracted lead debug signatures -> \`lead_debug_signatures.txt\`" >> "$SUMMARY_FILE"
      else
        echo "- [info] no known failure signatures found in lead debug log" >> "$SUMMARY_FILE"
      fi
    else
      echo "- [warn] lead debug log not found for team '${TEAM_NAME}'" >> "$SUMMARY_FILE"
    fi
  else
    echo "- [warn] team config not found at \`${TEAM_CONFIG}\`" >> "$SUMMARY_FILE"
  fi
else
  echo "- [warn] feature name unavailable; skipped team config/debug log collection" >> "$SUMMARY_FILE"
fi

cat > "$RUN_DIR/meta.json" <<EOF
{
  "capturedAtUtc": "${TIMESTAMP}",
  "repoRoot": "${REPO_ROOT}",
  "orchestrationId": "${ORCHESTRATION_ID}",
  "featureName": "${FEATURE}",
  "limit": ${LIMIT},
  "tinaEnv": "${TINA_ENV:-}"
}
EOF

echo
echo "Snapshot complete."
echo "Orchestration ID: ${ORCHESTRATION_ID}"
[[ -n "$FEATURE" ]] && echo "Feature: ${FEATURE}"
echo "Output: ${RUN_DIR}"
echo "Summary: ${SUMMARY_FILE}"
