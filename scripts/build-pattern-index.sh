#!/usr/bin/env bash
set -euo pipefail

# Build a lightweight whole-repo pattern index used by review detectors.
# Output defaults to .claude/tina/pattern-index.txt in the current repo.

ROOT="${1:-$(pwd)}"
OUT="${2:-$ROOT/.claude/tina/pattern-index.txt}"

mkdir -p "$(dirname "$OUT")"

{
  echo "# Pattern Index"
  echo "generated_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "root: $ROOT"
  echo
  echo "## Reusable Rust APIs"
  rg -n --glob '*.rs' '^pub (fn|struct|trait|enum) ' "$ROOT" || true
  echo
  echo "## Reusable TypeScript APIs"
  rg -n --glob '*.{ts,tsx,js,jsx}' '^export (const|function|class|interface|type) ' "$ROOT" || true
  echo
  echo "## Architectural Context Docs"
  rg -n --glob '*.md' '^## Architectural Context' "$ROOT/docs" "$ROOT/agents" "$ROOT/skills" 2>/dev/null || true
  echo
  echo "## Existing Detector Mentions"
  rg -n --glob '*.md' 'test_integrity|reuse_drift|architecture_drift' "$ROOT" || true
} > "$OUT"

echo "$OUT"
