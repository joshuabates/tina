#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_DIR/.claude-plugin/.plugin-dist"
PLUGIN_DIR="$DIST_DIR/plugin"
PROFILE="release"
SKIP_BUILD=0

usage() {
  cat <<USAGE
Usage: scripts/build-plugin-bundle.sh [--profile release|debug] [--skip-build] [--output <dir>]

Builds a minimal Claude plugin bundle that includes only:
- plugin metadata
- skills/agents/hooks/assets
- selected Rust binaries (tina-session, tina-daemon, tina-monitor)

No Cargo build artifacts are copied.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --output)
      DIST_DIR="${2:-}"
      PLUGIN_DIR="$DIST_DIR/plugin"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$PROFILE" != "release" && "$PROFILE" != "debug" ]]; then
  echo "Invalid --profile '$PROFILE'. Use 'release' or 'debug'." >&2
  exit 1
fi

cargo_profile_args=()
if [[ "$PROFILE" == "release" ]]; then
  cargo_profile_args+=(--release)
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "Building tina-session ($PROFILE)..."
  cargo build "${cargo_profile_args[@]}" --manifest-path "$PROJECT_DIR/tina-session/Cargo.toml"

  echo "Building tina-daemon ($PROFILE)..."
  cargo build "${cargo_profile_args[@]}" --manifest-path "$PROJECT_DIR/tina-daemon/Cargo.toml"

  echo "Building tina-monitor ($PROFILE)..."
  cargo build "${cargo_profile_args[@]}" --manifest-path "$PROJECT_DIR/tina-monitor/Cargo.toml"
fi

BIN_SUBDIR="$PROFILE"
SESSION_BIN="$PROJECT_DIR/tina-session/target/$BIN_SUBDIR/tina-session"
DAEMON_BIN="$PROJECT_DIR/tina-daemon/target/$BIN_SUBDIR/tina-daemon"
MONITOR_BIN="$PROJECT_DIR/tina-monitor/target/$BIN_SUBDIR/tina-monitor"

for bin in "$SESSION_BIN" "$DAEMON_BIN" "$MONITOR_BIN"; do
  if [[ ! -x "$bin" ]]; then
    echo "Missing binary: $bin" >&2
    echo "Run without --skip-build, or build the binaries first." >&2
    exit 1
  fi
done

rm -rf "$DIST_DIR"
mkdir -p "$PLUGIN_DIR"

cp "$PROJECT_DIR/.claude-plugin/plugin.json" "$PLUGIN_DIR/plugin.json"
cp -R "$PROJECT_DIR/agents" "$PLUGIN_DIR/agents"
cp -R "$PROJECT_DIR/skills" "$PLUGIN_DIR/skills"
cp -R "$PROJECT_DIR/hooks" "$PLUGIN_DIR/hooks"
cp -R "$PROJECT_DIR/assets" "$PLUGIN_DIR/assets"
mkdir -p "$PLUGIN_DIR/bin"
cp "$SESSION_BIN" "$PLUGIN_DIR/bin/tina-session"
cp "$DAEMON_BIN" "$PLUGIN_DIR/bin/tina-daemon"
cp "$MONITOR_BIN" "$PLUGIN_DIR/bin/tina-monitor"
chmod +x "$PLUGIN_DIR/bin/tina-session" "$PLUGIN_DIR/bin/tina-daemon" "$PLUGIN_DIR/bin/tina-monitor"
chmod +x "$PLUGIN_DIR/hooks/session-start.sh"

MARKETPLACE_TEMPLATE="$PROJECT_DIR/.claude-plugin/marketplace.json"
if [[ ! -f "$MARKETPLACE_TEMPLATE" ]]; then
  echo "Missing marketplace template: $MARKETPLACE_TEMPLATE" >&2
  exit 1
fi

sed 's#"source": "\./"#"source": "./plugin"#g' "$MARKETPLACE_TEMPLATE" > "$DIST_DIR/marketplace.json"

echo "Plugin bundle ready:"
echo "  Marketplace: $DIST_DIR/marketplace.json"
echo "  Plugin root: $PLUGIN_DIR"
echo ""
echo "Install locally with:"
echo "  claude plugins add-marketplace $DIST_DIR/marketplace.json"
echo "  claude plugins add tina"
