#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$HOME/.local/bin"

cd "$PROJECT_DIR"

echo "Building tina-session..."
cargo build --release --manifest-path tina-session/Cargo.toml

echo "Building tina-monitor..."
cargo build --release --manifest-path tina-monitor/Cargo.toml

echo "Building tina-daemon..."
cargo build --release --manifest-path tina-daemon/Cargo.toml

mkdir -p "$BIN_DIR"

ln -sf "$PROJECT_DIR/tina-session/target/release/tina-session" "$BIN_DIR/tina-session"
ln -sf "$PROJECT_DIR/tina-monitor/target/release/tina-monitor" "$BIN_DIR/tina-monitor"
ln -sf "$PROJECT_DIR/tina-daemon/target/release/tina-daemon" "$BIN_DIR/tina-daemon"

echo "Installed:"
echo "  $BIN_DIR/tina-session -> $PROJECT_DIR/tina-session/target/release/tina-session"
echo "  $BIN_DIR/tina-monitor -> $PROJECT_DIR/tina-monitor/target/release/tina-monitor"
echo "  $BIN_DIR/tina-daemon -> $PROJECT_DIR/tina-daemon/target/release/tina-daemon"
