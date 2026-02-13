#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

SOURCES=(
  "AGENTS.md"
  "CLAUDE.md"
  "README.md"
  "skills"
  "agents"
)

echo "Checking tina-session CLI/doc parity..."

SESSION_BIN="$PROJECT_DIR/tina-session/target/debug/tina-session"
if [[ ! -x "$SESSION_BIN" ]]; then
  echo "Building tina-session debug binary for parity checks..."
  cargo build --quiet --manifest-path tina-session/Cargo.toml
fi

RAW_COMMANDS_FILE="$(mktemp)"
rg --no-filename --glob '*.md' -o 'tina-session (init|start|wait|stop|state|check|name|exists|send|attach|capture|status|daemon|config|list|register-team|exec-codex|cleanup|orchestrate|work|review)(?: [a-z][a-z0-9-]*){0,3}' "${SOURCES[@]}" \
  | sort -u > "$RAW_COMMANDS_FILE"

if [[ ! -s "$RAW_COMMANDS_FILE" ]]; then
  rm -f "$RAW_COMMANDS_FILE"
  echo "No tina-session commands found in checked docs."
  exit 0
fi

normalize_command_path() {
  local -a parts=("$@")
  local total=${#parts[@]}
  local n
  for ((n=total; n>=2; n--)); do
    local -a candidate=("${parts[@]:0:n}")
    local -a args=("${candidate[@]:1}")
    if "$SESSION_BIN" "${args[@]}" --help >/dev/null 2>&1; then
      echo "${candidate[*]}"
      return 0
    fi
  done
  return 1
}

NORMALIZED_FILE="$(mktemp)"
UNRESOLVED=0
while IFS= read -r command_path; do
  [[ -z "$command_path" ]] && continue
  read -r -a parts <<< "$command_path"
  if normalized="$(normalize_command_path "${parts[@]}")"; then
    echo "$normalized" >> "$NORMALIZED_FILE"
  else
    UNRESOLVED=$((UNRESOLVED + 1))
    echo "FAIL: unresolved command path reference: $command_path"
    rg -n --glob '*.md' -F "$command_path" "${SOURCES[@]}" || true
  fi
done < "$RAW_COMMANDS_FILE"
rm -f "$RAW_COMMANDS_FILE"

if [[ $UNRESOLVED -gt 0 ]]; then
  rm -f "$NORMALIZED_FILE"
  echo "CLI/doc parity failed: $UNRESOLVED unresolved command path reference(s)."
  exit 1
fi

COMMAND_PATHS_FILE="$(mktemp)"
sort -u "$NORMALIZED_FILE" > "$COMMAND_PATHS_FILE"
rm -f "$NORMALIZED_FILE"

COMMAND_COUNT="$(wc -l < "$COMMAND_PATHS_FILE" | tr -d ' ')"
echo "Found ${COMMAND_COUNT} command paths after normalization."

FAILED=0
while IFS= read -r command_path; do
  [[ -z "$command_path" ]] && continue
  read -r -a parts <<< "$command_path"
  if [[ ${#parts[@]} -lt 2 || "${parts[0]}" != "tina-session" ]]; then
    continue
  fi

  args=("${parts[@]:1}")
  if "$SESSION_BIN" "${args[@]}" --help >/dev/null 2>&1; then
    echo "PASS: $command_path"
  else
    FAILED=$((FAILED + 1))
    echo "FAIL: $command_path"
    rg -n --glob '*.md' -F "$command_path" "${SOURCES[@]}" || true
  fi
done < "$COMMAND_PATHS_FILE"
rm -f "$COMMAND_PATHS_FILE"

if [[ $FAILED -gt 0 ]]; then
  echo "CLI/doc parity failed: $FAILED command path(s) are not supported by tina-session."
  exit 1
fi

echo "PASS: CLI/doc parity checks passed."
