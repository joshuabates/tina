#!/usr/bin/env bash
# Plugin install/update helper
# Usage: plugin-post-install.sh <install|update>
set -euo pipefail

ACTION="${1:?Usage: plugin-post-install.sh <install|update>}"
PROJECT_DIR="${MISE_PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Ensure marketplace is registered
if ! claude plugin marketplace list 2>&1 | grep -q 'tina'; then
  echo "Adding tina marketplace..."
  claude plugin marketplace add "$PROJECT_DIR/.claude-plugin/marketplace.json"
fi

# Install or update
case "$ACTION" in
  install)
    echo "Installing tina plugin..."
    claude plugin install tina@tina
    ;;
  update)
    echo "Updating tina plugin..."
    claude plugin update tina@tina
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    exit 1
    ;;
esac

# Update ~/.local/bin symlinks to release builds
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
ln -sf "$PROJECT_DIR/tina-session/target/release/tina-session" "$BIN_DIR/tina-session"
ln -sf "$PROJECT_DIR/tina-daemon/target/release/tina-daemon" "$BIN_DIR/tina-daemon"
ln -sf "$PROJECT_DIR/tina-monitor/target/release/tina-monitor" "$BIN_DIR/tina-monitor"
echo "Symlinks updated:"
ls -la "$BIN_DIR"/tina-session "$BIN_DIR"/tina-daemon "$BIN_DIR"/tina-monitor

# Bounce daemon if it was running
if tina-session daemon status 2>&1 | grep -q 'running'; then
  echo "Bouncing daemon..."
  tina-session daemon stop
  tina-session daemon start
  echo "Daemon restarted."
else
  echo "Daemon not running (start with: tina-session daemon start)"
fi
