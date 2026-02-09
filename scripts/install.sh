#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Building tina-session..."
cargo build --release --manifest-path tina-session/Cargo.toml

echo "Building tina-monitor..."
cargo build --release --manifest-path tina-monitor/Cargo.toml

echo "Building tina-daemon..."
cargo build --release --manifest-path tina-daemon/Cargo.toml

"$PROJECT_DIR/scripts/link-binaries.sh"
