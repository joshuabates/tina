#!/usr/bin/env bash
# SessionStart hook for tina plugin

set -euo pipefail

# Determine plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Read using-tina content
using_tina_content=$(cat "${PLUGIN_ROOT}/skills/using-tina/SKILL.md" 2>&1 || echo "Error reading using-tina skill")

# Escape outputs for JSON using pure bash
escape_for_json() {
    local input="$1"
    local output=""
    local i char
    for (( i=0; i<${#input}; i++ )); do
        char="${input:$i:1}"
        case "$char" in
            $'\\') output+='\\' ;;
            '"') output+='\"' ;;
            $'\n') output+='\n' ;;
            $'\r') output+='\r' ;;
            $'\t') output+='\t' ;;
            *) output+="$char" ;;
        esac
    done
    printf '%s' "$output"
}

using_tina_escaped=$(escape_for_json "$using_tina_content")

# Output context injection as JSON
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>\nYou have TINA.\n\n**Below is the full content of your 'tina:using-tina' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${using_tina_escaped}\n</EXTREMELY_IMPORTANT>"
  }
}
EOF

exit 0
