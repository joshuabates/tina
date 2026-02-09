#!/usr/bin/env bash
# Plugin install/update helper
# Usage: plugin-post-install.sh <install|update>
set -euo pipefail

ACTION="${1:?Usage: plugin-post-install.sh <install|update>}"
PROJECT_DIR="${MISE_PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MARKETPLACE_FILE="$PROJECT_DIR/.claude-plugin/.plugin-dist/marketplace.json"
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
  if [[ "$lower_output" == *"already"* || "$lower_output" == *"exists"* || "$lower_output" == *"installed"* ]]; then
    [[ -n "$output" ]] && echo "$output"
    return 0
  fi

  LAST_COMMAND_ERROR="$output"
  return 1
}

add_marketplace() {
  local path="$1"
  run_allow_already claude plugin marketplace add "$path" && return 0
  run_allow_already claude plugins add-marketplace "$path" && return 0
  echo "$LAST_COMMAND_ERROR" >&2
  return 1
}

install_plugin() {
  run_allow_already claude plugin install tina@tina && return 0
  run_allow_already claude plugins add tina@tina && return 0
  run_allow_already claude plugins add tina && return 0
  echo "$LAST_COMMAND_ERROR" >&2
  return 1
}

update_plugin() {
  run_allow_already claude plugin update tina@tina && return 0
  run_allow_already claude plugins update tina@tina && return 0
  run_allow_already claude plugins update tina && return 0
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

# Ensure marketplace is registered
echo "Registering tina marketplace..."
add_marketplace "$MARKETPLACE_FILE"

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
