#!/usr/bin/env bash
# Plugin install/update helper
# Usage: plugin-post-install.sh <install|update>
set -euo pipefail

ACTION="${1:?Usage: plugin-post-install.sh <install|update>}"
PROJECT_DIR="${MISE_PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MARKETPLACE_FILE="$PROJECT_DIR/.claude-plugin/marketplace.json"
KNOWN_MARKETPLACES_FILE="$HOME/.claude/plugins/known_marketplaces.json"
LAST_COMMAND_ERROR=""

require_claude() {
  if ! command -v claude >/dev/null 2>&1; then
    echo "Claude CLI not found in PATH (expected 'claude')." >&2
    exit 1
  fi
}

run_allow_already() {
  local output
  local lower_output

  if output=$("$@" 2>&1); then
    [[ -n "$output" ]] && echo "$output"
    return 0
  fi
  lower_output="$(printf '%s' "$output" | tr '[:upper:]' '[:lower:]')"
  if [[ "$lower_output" == *"already exists"* || "$lower_output" == *"already installed"* || "$lower_output" == *"already added"* || "$lower_output" == *"already configured"* ]]; then
    [[ -n "$output" ]] && echo "$output"
    return 0
  fi

  LAST_COMMAND_ERROR="$output"
  return 1
}

add_marketplace() {
  local path="$1"
  run_allow_already claude plugin marketplace add "$path" && return 0
  echo "$LAST_COMMAND_ERROR" >&2
  return 1
}

remove_marketplace() {
  local name="$1"
  claude plugin marketplace remove "$name" >/dev/null 2>&1 && return 0
  return 1
}

sync_known_marketplace_file() {
  local expected_path="$1"

  if [[ ! -f "$KNOWN_MARKETPLACES_FILE" ]]; then
    return 0
  fi

  python3 - "$KNOWN_MARKETPLACES_FILE" "$expected_path" <<'PY'
import datetime
import json
import os
import sys

known_file = sys.argv[1]
expected_path = os.path.abspath(sys.argv[2])

with open(known_file, "r", encoding="utf-8") as f:
    data = json.load(f)

tina = data.get("tina")
if not isinstance(tina, dict):
    sys.exit(0)

source = tina.get("source")
if not isinstance(source, dict):
    source = {}

changed = False
if source.get("source") != "file":
    source["source"] = "file"
    changed = True
if source.get("path") != expected_path:
    source["path"] = expected_path
    changed = True

if changed:
    tina["source"] = source
    tina["lastUpdated"] = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    data["tina"] = tina
    with open(known_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"Synchronized tina marketplace source in {known_file}")
PY
}

verify_marketplace_source() {
  local expected_path="$1"
  if [[ ! -f "$KNOWN_MARKETPLACES_FILE" ]]; then
    echo "Warning: known marketplaces file not found: $KNOWN_MARKETPLACES_FILE" >&2
    return 0
  fi

  python3 - "$KNOWN_MARKETPLACES_FILE" "$expected_path" <<'PY'
import json
import os
import sys

known_file = sys.argv[1]
expected_path = os.path.abspath(sys.argv[2])

with open(known_file, "r", encoding="utf-8") as f:
    data = json.load(f)

source = data.get("tina", {}).get("source", {})
actual = source.get("path")
if actual and os.path.abspath(actual) == expected_path:
    print(f"Verified tina marketplace source: {actual}")
    sys.exit(0)

print(f"ERROR: tina marketplace source mismatch. expected={expected_path} actual={actual}", file=sys.stderr)
sys.exit(1)
PY
}

install_plugin() {
  run_allow_already claude plugin install tina@tina && return 0
  echo "$LAST_COMMAND_ERROR" >&2
  return 1
}

update_plugin() {
  if run_allow_already claude plugin update tina@tina; then
    return 0
  fi
  if [[ "$(printf '%s' "$LAST_COMMAND_ERROR" | tr '[:upper:]' '[:lower:]')" == *"not installed"* ]]; then
    echo "Plugin tina@tina is not installed; installing instead..."
    install_plugin && return 0
  fi
  echo "$LAST_COMMAND_ERROR" >&2
  return 1
}

bounce_daemon_if_running() {
  local session_bin="$PROJECT_DIR/tina-session/target/release/tina-session"
  local daemon_status_output
  local session_cmd=()

  if [[ -x "$session_bin" ]]; then
    session_cmd=("$session_bin")
  elif command -v tina-session >/dev/null 2>&1; then
    session_cmd=("tina-session")
  else
    echo "Skipping daemon bounce: tina-session binary not found." >&2
    return 0
  fi

  daemon_status_output="$("${session_cmd[@]}" daemon status 2>&1 || true)"
  if echo "$daemon_status_output" | grep -q "Daemon is running"; then
    echo "Bouncing daemon..."
    "${session_cmd[@]}" daemon stop
    "${session_cmd[@]}" daemon start
    echo "Daemon restarted."
  else
    echo "Daemon not running (start with: tina-session daemon start)"
  fi
}

require_claude

if [[ ! -f "$MARKETPLACE_FILE" ]]; then
  echo "Marketplace file not found: $MARKETPLACE_FILE" >&2
  echo "Run 'mise run plugin:bundle' first." >&2
  exit 1
fi

# Ensure marketplace source is refreshed and registered
echo "Refreshing tina marketplace source..."
remove_marketplace tina || true
add_marketplace "$MARKETPLACE_FILE"
sync_known_marketplace_file "$MARKETPLACE_FILE"
verify_marketplace_source "$MARKETPLACE_FILE"

# Install or update
case "$ACTION" in
  install)
    echo "Installing tina plugin..."
    install_plugin
    ;;
  update)
    echo "Updating tina plugin..."
    update_plugin
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    exit 1
    ;;
esac

"$PROJECT_DIR/scripts/link-binaries.sh"
bounce_daemon_if_running
