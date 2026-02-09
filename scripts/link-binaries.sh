#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="${TINA_BIN_DIR:-$HOME/.local/bin}"

SESSION_BIN="$PROJECT_DIR/tina-session/target/release/tina-session"
DAEMON_BIN="$PROJECT_DIR/tina-daemon/target/release/tina-daemon"
MONITOR_BIN="$PROJECT_DIR/tina-monitor/target/release/tina-monitor"

for bin in "$SESSION_BIN" "$DAEMON_BIN" "$MONITOR_BIN"; do
  if [[ ! -x "$bin" ]]; then
    echo "Missing binary: $bin" >&2
    echo "Build release binaries first (for example: mise run build)." >&2
    exit 1
  fi
done

mkdir -p "$BIN_DIR"
ln -sf "$SESSION_BIN" "$BIN_DIR/tina-session"
ln -sf "$DAEMON_BIN" "$BIN_DIR/tina-daemon"
ln -sf "$MONITOR_BIN" "$BIN_DIR/tina-monitor"

echo "Symlinks updated:"
echo "  $BIN_DIR/tina-session -> $SESSION_BIN"
echo "  $BIN_DIR/tina-daemon -> $DAEMON_BIN"
echo "  $BIN_DIR/tina-monitor -> $MONITOR_BIN"
