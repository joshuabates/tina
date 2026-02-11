#!/usr/bin/env bash
# PreToolUse hook to prevent phase teammates from writing into the main repo
# when they are expected to operate in a worktree.

set -euo pipefail

main_root="/Users/joshua/Projects/tina"
worktree_prefix="${main_root}/.worktrees/"

input_json="$(cat)"

tool_name="$(printf '%s' "$input_json" | jq -r '.tool_name // .toolName // ""' 2>/dev/null || true)"
if [[ "$tool_name" != "Bash" ]]; then
  exit 0
fi

cwd="$(printf '%s' "$input_json" | jq -r '.cwd // ""' 2>/dev/null || true)"
command="$(printf '%s' "$input_json" | jq -r '.tool_input.command // .toolInput.command // ""' 2>/dev/null || true)"

# Only enforce for worktree-backed sessions.
if [[ "$cwd" != "$worktree_prefix"* ]]; then
  exit 0
fi

# Extract absolute repo paths from command text.
repo_paths="$(printf '%s' "$command" | grep -Eo '/Users/joshua/Projects/tina[^[:space:]\"'"'"'`\|&;\)]*' || true)"
has_main_repo_path=0
while IFS= read -r p; do
  if [[ -z "$p" ]]; then
    continue
  fi
  if [[ "$p" == "$main_root"* ]] && [[ "$p" != "$worktree_prefix"* ]]; then
    has_main_repo_path=1
    break
  fi
done <<< "$repo_paths"

if [[ "$has_main_repo_path" -eq 0 ]]; then
  exit 0
fi

# Block commands that are likely to mutate state in the main tree.
is_write_like=0
if [[ "$command" =~ (^|[[:space:];])(cp|mv|rsync|install|rm|touch|mkdir|mktemp|ln|sed|perl|python|node|tee|dd|git|cargo|npm|npx|pnpm|yarn)([[:space:];]|$) ]]; then
  is_write_like=1
fi
if [[ "$command" == *">"* ]] || [[ "$command" == *"--manifest-path /Users/joshua/Projects/tina/"* ]]; then
  is_write_like=1
fi
if [[ "$command" =~ (^|[[:space:];])cd[[:space:]]+/Users/joshua/Projects/tina($|[[:space:];/]) ]]; then
  is_write_like=1
fi

if [[ "$is_write_like" -eq 1 ]]; then
  cat <<EOF
{
  "decision": "block",
  "reason": "Worktree isolation enforced: phase teammates cannot run write-capable Bash commands against ${main_root}. Use worktree paths under ${cwd}."
}
EOF
fi

exit 0
