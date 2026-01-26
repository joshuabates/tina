# Bug: Shell Corruption After Worktree Removal

## Summary

When removing a git worktree while the shell's working directory is inside that worktree, the Bash tool becomes permanently broken for the rest of the session.

## Steps to Reproduce

1. Create a worktree: `git worktree add .worktrees/feature -b feature/foo`
2. Change into the worktree: `cd .worktrees/feature`
3. Do some work, commit, merge back to main
4. Remove the worktree: `git worktree remove .worktrees/feature`
5. **Shell is now broken** - all subsequent Bash commands fail with exit code 1

## Root Cause

The Bash tool maintains persistent working directory state between commands. When you `cd` into a directory and then delete that directory, the shell's CWD becomes invalid. All subsequent commands fail because the shell can't determine its current directory.

Even commands like `cd /some/other/path`, `pwd`, `echo "hello"`, and `/bin/ls /absolute/path` fail because the shell itself can't initialize properly with an invalid CWD.

## Current Workaround

None within the session. User must:
- Use other tools (Glob, Read, Write) which don't depend on shell CWD
- Commit changes manually outside the session
- Start a new session

## Suggested Fix for `using-git-worktrees` Skill

Add to the skill's cleanup process:

```markdown
## Worktree Removal

**CRITICAL:** Before removing a worktree, ensure you're not in it:

```bash
# Always cd to project root BEFORE removing worktree
cd "$(git rev-parse --show-toplevel)"
git worktree remove .worktrees/feature-name
```

Never run `git worktree remove` while your shell is inside the worktree directory.
```

## Also Consider

The `finishing-a-development-branch` skill should include this same warning if it handles worktree cleanup.

## Session Impact

Once corrupted, the Bash tool is unusable. Other tools (Glob, Grep, Read, Write, Edit) continue to work since they don't depend on shell state.

## Actual Command History (2026-01-24 Session)

```bash
# Initial checks (CWD: /Users/joshua/Projects/supersonic/.worktrees/planner-subagent)
ls -d .worktrees 2>/dev/null || ls -d worktrees 2>/dev/null || echo "none"
# → none

grep -i "worktree" CLAUDE.md 2>/dev/null || echo "no preference"
# → no preference

git check-ignore -q .worktrees 2>/dev/null && echo "ignored" || echo "not ignored"
# → not ignored

cat .gitignore 2>/dev/null || echo "no .gitignore"
# → showed .worktrees/ already in .gitignore

git status .gitignore
# → clean

# Create worktree
git worktree add .worktrees/planner-subagent -b feature/planner-subagent
# → success

# Check for setup files
ls .worktrees/planner-subagent/package.json .worktrees/planner-subagent/Cargo.toml ... 2>/dev/null || echo "no dependencies"
# → no dependencies

ls .worktrees/planner-subagent/tests/ 2>/dev/null | head -5
# → showed test dirs

# [File writes happened via Write/Edit tools, not Bash]

# Work in worktree - THIS IS WHERE I ENTERED THE WORKTREE
cd /Users/joshua/Projects/supersonic/.worktrees/planner-subagent && git status
# → showed changes

git add agents/planner.md skills/writing-plans/SKILL.md && git commit -m "feat: add planner subagent..."
# → success

git diff agents/planner.md
# → showed diff

git add agents/planner.md && git commit -m "fix: use Rust examples..."
# → success

# Merge - note: this cd's back to main project
cd /Users/joshua/Projects/supersonic && git checkout main && git merge feature/planner-subagent --no-ff -m "..."
# → success

# Attempt cleanup
git worktree remove .worktrees/planner-subagent && git branch -d feature/planner-subagent
# → FAILED: "contains modified or untracked files, use --force"

# Check what's untracked - THIS CD'S BACK INTO THE WORKTREE
cd .worktrees/planner-subagent && git status --short
# → ?? .tina/

# Force remove - WHILE SHELL CWD IS INSIDE THE WORKTREE
git worktree remove --force .worktrees/planner-subagent && git branch -d feature/planner-subagent
# → Worktree removed, but then: "fatal: Unable to read current working directory: No such file or directory"

# ALL SUBSEQUENT COMMANDS FAIL
cd /Users/joshua/Projects/supersonic && git branch -d feature/planner-subagent
# → Exit code 1

pwd
# → Exit code 1

echo "hello"
# → Exit code 1

/bin/ls /Users/joshua/Projects/supersonic
# → Exit code 1

# Even subshells fail
/bin/bash -c "cd /Users/joshua/Projects/supersonic && git branch"
# → Exit code 1

# Recovery attempts all fail
cd ~ && cd /Users/joshua/Projects/supersonic && git branch
# → Exit code 1

true
# → Exit code 1
```

## The Actual Mistake

The sequence that caused the problem:

1. `cd .worktrees/planner-subagent && git status --short` - entered worktree to check untracked files
2. `git worktree remove --force .worktrees/planner-subagent` - removed worktree while inside it

The fix: should have used `ls .worktrees/planner-subagent` or `git -C .worktrees/planner-subagent status --short` instead of `cd`ing into it, OR should have `cd`'d out before removing.
