# Context Management Redesign

## Overview

Redesign context management for orchestrated automation to be fully self-contained, requiring zero user configuration. The orchestrator provisions context monitoring when creating worktrees, and the supervisor owns checkpoint decisions.

## Problem

The current design has gaps:

1. **Statusline can't be bundled with plugins** - requires manual user configuration
2. **Checkpoint triggering split across components** - statusline creates signal, supervisor reacts
3. **External dependencies** - scripts must exist in ~/.claude/scripts/
4. **Naming mismatches** - hooks reference skills that don't exist with those names

## Solution

The orchestrator self-provisions context monitoring in each worktree. No user setup required.

### Architecture

```
Orchestrator
    │
    ├── Creates git worktree
    │
    ├── Writes .claude/tina-write-context.sh (inline)
    │       - Reads stdin from Claude statusline system
    │       - Writes context-metrics.json
    │       - Outputs simple status string
    │
    ├── Writes .claude/settings.local.json
    │       - Points statusLine to the script above
    │
    └── Spawns team-lead in worktree
            │
            └── Claude uses local statusline config
                    │
                    └── Writes .claude/tina/context-metrics.json
                            │
                            └── Supervisor reads, decides checkpoint
```

### Responsibilities

| Component | Responsibility |
|-----------|----------------|
| Orchestrator | Provision worktree with statusline config |
| tina-write-context.sh | Write context metrics (dumb data reporter) |
| Supervisor monitor loop | Read metrics, create checkpoint-needed, send commands |

### Key Design Decisions

**Supervisor owns checkpoint decisions.** The statusline just reports data. The supervisor monitor loop reads context-metrics.json and creates .claude/tina/checkpoint-needed when threshold exceeded. This centralizes decision logic.

**Scripts inline in worktree.** No external dependencies. The orchestrator writes the script directly when setting up the worktree. Self-contained and reproducible.

**settings.local.json for isolation.** Each worktree has its own statusline config. Doesn't affect user's main project or other sessions.

**One worktree per plan.** Orchestrator creates a single worktree at the start. All phases execute within that worktree. This provides isolation for statusline config without the overhead of per-phase worktrees.

## Implementation

### Worktree Setup (in orchestrate skill)

When orchestrator creates a worktree, add:

```bash
# Create .claude directory
mkdir -p "$WORKTREE_PATH/.claude"

# Write context monitoring script
cat > "$WORKTREE_PATH/.claude/tina-write-context.sh" << 'SCRIPT'
#!/bin/bash
set -e
TINA_DIR="${PWD}/.tina"
mkdir -p "$TINA_DIR"
INPUT=$(cat)
echo "$INPUT" | jq '{
  used_pct: (.context_window.used_percentage // 0),
  tokens: (.context_window.total_input_tokens // 0),
  max: (.context_window.context_window_size // 200000),
  timestamp: now | todate
}' > "$TINA_DIR/context-metrics.json"
echo "ctx:$(echo "$INPUT" | jq -r '.context_window.used_percentage // 0 | floor')%"
SCRIPT
chmod +x "$WORKTREE_PATH/.claude/tina-write-context.sh"

# Write local settings
cat > "$WORKTREE_PATH/.claude/settings.local.json" << EOF
{"statusLine": {"type": "command", "command": "$WORKTREE_PATH/.claude/tina-write-context.sh"}}
EOF
```

### Supervisor Monitor Loop Enhancement

Add checkpoint detection to the existing monitor loop (Step 3e in orchestrate):

```bash
# In monitor loop, check context metrics
if [ -f ".claude/tina/context-metrics.json" ]; then
  USED_PCT=$(jq -r '.used_pct // 0' ".claude/tina/context-metrics.json")
  THRESHOLD=${TINA_THRESHOLD:-70}

  if [ "$(echo "$USED_PCT >= $THRESHOLD" | bc)" -eq 1 ]; then
    if [ ! -f ".claude/tina/checkpoint-needed" ]; then
      echo "{\"triggered_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"context_pct\": $USED_PCT, \"threshold\": $THRESHOLD}" > ".claude/tina/checkpoint-needed"
      echo "Context at ${USED_PCT}%, triggering checkpoint"
    fi
  fi
fi

# Existing checkpoint-needed handling follows...
```

### Files to Modify

1. **skills/orchestrate/SKILL.md**
   - Add worktree statusline provisioning to Step 2 (worktree creation)
   - Add context threshold check to Step 3e (monitor loop)

### Files to Remove/Update

Review and clean up:
- `~/.claude/scripts/tina-statusline.sh` - User's personal script, not part of plugin
- `~/.claude/hooks/tina-check-threshold.sh` - May still be useful for interactive sessions
- `~/.claude/hooks/tina-session-start.sh` - May still be useful for interactive sessions

These are user-level files, not plugin files. They can remain for interactive use cases but are not required for orchestrated automation.

## Migration

No migration needed. This is additive:
- Orchestrated automation gains self-contained context monitoring
- Existing user-level statusline/hooks continue to work for interactive sessions
- No breaking changes

## Testing

1. Run orchestrate on a test design doc
2. Verify worktree has .claude/tina-write-context.sh and settings.local.json
3. Verify .claude/tina/context-metrics.json is written during team-lead execution
4. Force low threshold (TINA_THRESHOLD=10), verify checkpoint-needed created
5. Verify checkpoint/rehydrate cycle completes

## Success Criteria

1. User can run `/tina:orchestrate <design-doc>` with zero prior configuration
2. Context metrics written to .claude/tina/context-metrics.json during execution
3. Checkpoint triggered automatically when threshold exceeded
4. Full checkpoint/rehydrate cycle works without user intervention

## Architectural Context

**Patterns to follow:**
- Worktree creation: `skills/using-git-worktrees/SKILL.md:75-98` (directory selection, gitignore verification)
- Monitor loop structure: `skills/orchestrate/SKILL.md:249-314` (polling pattern, status checks)
- Checkpoint signal handling: `skills/orchestrate/SKILL.md:327-396` (detect, send command, wait, clear)

**Code to reuse:**
- `skills/using-git-worktrees/SKILL.md` - Integrate for worktree creation (currently not used by orchestrate)
- `skills/checkpoint/SKILL.md` - Team-lead checkpoint protocol (no changes needed)
- `skills/rehydrate/SKILL.md` - Team-lead rehydration protocol (no changes needed)

**Key integration points:**
- Entry: `skills/orchestrate/SKILL.md` Step 1 (after parsing design doc, before phase loop)
- Worktree path: One worktree per plan, all phases execute within it
- Monitor loop: `skills/orchestrate/SKILL.md:249-314` - Add context metrics check before existing status check
- Cleanup: Use `skills/finishing-a-development-branch/SKILL.md:136-148` pattern for worktree removal

**Clarifications from review:**
- One worktree per plan (not per phase) - all phases share the same worktree
- Orchestrate skill needs to integrate using-git-worktrees (currently runs in main directory)

**Anti-patterns:**
- Don't create checkpoint-needed from statusline - supervisor owns that decision
- Don't rely on user ~/.claude/scripts/ - keep everything in worktree
