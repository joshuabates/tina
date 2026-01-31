# Orchestration System Test Plan

## Overview

This document outlines how to test the team-based orchestration system using the word-stats test design.

## Prerequisites

1. Ensure tmux is installed and working
2. Ensure Claude Code CLI is available
3. **Clear plugin cache** to ensure latest skills are loaded
4. Clean any previous test artifacts

## Test Execution

### Step 1: Start the Orchestration

```bash
cd /Users/joshuabates/Projects/tina
claude --dangerously-skip-permissions
# Then invoke: /tina:orchestrate docs/plans/2026-01-30-orchestration-test-design.md
```

### Step 2: Monitor Components

**Watch the orchestrator's task list:**
```bash
# Watch orchestration tasks (primary monitoring)
watch -n 2 'cat ~/.claude/tasks/orchestration-test-orchestration/tasks.json 2>/dev/null | jq ".tasks[] | {subject, status, blockedBy}"'
```

**Watch teams:**
```bash
# List teams
ls -la ~/.claude/teams/

# Watch orchestration team
watch -n 5 'cat ~/.claude/teams/orchestration-test-orchestration/config.json 2>/dev/null | jq ".members[] | {name, agentType}"'
```

**Watch phase execution (inside worktree):**
```bash
# Watch phase status files (written by phase-executor)
watch -n 2 'for f in .worktrees/orchestration-test/.claude/tina/phase-*/status.json; do echo "=== $f ==="; cat "$f" 2>/dev/null | jq .; done'
```

**Watch tmux sessions:**
```bash
# List tmux sessions
tmux list-sessions

# Attach to team-lead session (read-only)
tmux attach -t tina-orchestration-test-phase-1 -r
```

**Watch worktree:**
```bash
# List worktrees
git worktree list

# Watch worktree progress
ls -la .worktrees/orchestration-test/
```

## Checkpoints to Verify

### A. Orchestrator Initialization
- [ ] Team created: `orchestration-test-orchestration`
- [ ] All tasks created with correct subjects:
  - `validate-design`
  - `setup-worktree`
  - `plan-phase-1`, `execute-phase-1`, `review-phase-1`
  - `plan-phase-2`, `execute-phase-2`, `review-phase-2`
  - `plan-phase-3`, `execute-phase-3`, `review-phase-3`
  - `finalize`
- [ ] Dependencies set correctly (each task blocked by predecessor)

### B. Design Validation Phase
- [ ] `tina:design-validator` teammate spawned
- [ ] Validation report written to `.claude/tina/validation/design-report.md`
- [ ] Validator reports `VALIDATION_STATUS: Pass` or `Warning`
- [ ] `validate-design` task marked complete
- [ ] `setup-worktree` task unblocked

### C. Worktree Setup Phase
- [ ] `tina:worktree-setup` teammate spawned
- [ ] Worktree created at `.worktrees/orchestration-test/`
- [ ] Branch `tina/orchestration-test` created
- [ ] Statusline config installed in worktree
- [ ] `worktree_path` stored in task metadata
- [ ] `setup-worktree` task marked complete
- [ ] `plan-phase-1` task unblocked

### D. Phase 1 (Reader Module)
- [ ] `tina:phase-planner` teammate spawned
- [ ] Plan file created: `docs/plans/2026-01-30-orchestration-test-phase-1.md`
- [ ] `plan_path` stored in task metadata
- [ ] `plan-phase-1` task marked complete

- [ ] `tina:phase-executor` teammate spawned
- [ ] Tmux session started: `tina-orchestration-test-phase-1`
- [ ] `/tina:team-lead-init` command sent (two separate send-keys calls)
- [ ] Team-lead creates execution team and spawns workers
- [ ] TDD workflow: tests written before implementation
- [ ] `word-stats/src/reader.ts` created
- [ ] `word-stats/tests/reader.test.ts` created
- [ ] All tests pass
- [ ] Phase status.json updated to "complete"
- [ ] `execute-phase-1` task marked complete with `git_range` in metadata

- [ ] `tina:phase-reviewer` teammate spawned
- [ ] Review checks implementation against design
- [ ] Review passes OR remediation triggered
- [ ] `review-phase-1` task marked complete
- [ ] `plan-phase-2` task unblocked

### E. Phase 2 (Analyzer Module)
- [ ] Same checkpoints as Phase 1
- [ ] Correctly waits for Phase 1 review completion
- [ ] `word-stats/src/analyzer.ts` created
- [ ] `word-stats/tests/analyzer.test.ts` created
- [ ] WordStats interface with all 4 properties

### F. Phase 3 (CLI Integration)
- [ ] Same checkpoints as Phase 1
- [ ] Correctly waits for Phase 2 review completion
- [ ] `word-stats/src/formatter.ts` created
- [ ] `word-stats/src/index.ts` created
- [ ] `package.json` has bin entry
- [ ] CLI executable works: `node dist/index.js <file>`

### G. Completion
- [ ] `finalize` task unblocked after `review-phase-3` complete
- [ ] `tina:finishing-a-development-branch` invoked
- [ ] User presented with merge/PR/cleanup options
- [ ] All tasks marked complete
- [ ] Clean summary provided

## Remediation Testing (Optional)

To test remediation flow, temporarily modify reviewer to always report gaps:

1. Let orchestration run through `execute-phase-1`
2. When reviewer runs, if it reports gaps:
   - [ ] `plan-phase-1.5` task created
   - [ ] `execute-phase-1.5` task created
   - [ ] `review-phase-1.5` task created
   - [ ] `plan-phase-2` blocked by `review-phase-1.5`
   - [ ] Remediation cycle executes
3. If remediation also fails (2nd cycle):
   - [ ] `plan-phase-1.5.5` tasks created
4. If 3rd cycle would be needed:
   - [ ] Orchestrator exits with "failed after 2 remediation attempts"
   - [ ] Tasks preserved for inspection

## Known Failure Modes to Watch

1. **Tmux session fails to start** - Check tmux is available, check phase-executor logs
2. **Worktree creation fails** - Check disk space, permissions, branch name conflicts
3. **Phase executor can't find session** - Verify session naming pattern matches
4. **Tasks stuck in pending** - Check `blockedBy` dependencies, verify predecessor completed
5. **Review keeps failing** - Check remediation limit (max 2 cycles)
6. **Context overflow** - Watch `context-metrics.json` in worktree
7. **Teammate never responds** - Check if teammate crashed, look for error messages
8. **Stale plugin cache** - Clear cache if skills behave unexpectedly

## Logging Commands

```bash
# Capture full orchestrator output
script -q /tmp/orchestrator-test.log

# Capture recent session output (use tina-session instead of raw tmux)
tina-session capture --feature orchestration-test --phase 1 --lines 50

# Check teammate messages
cat ~/.claude/teams/orchestration-test-orchestration/mailbox/*.json 2>/dev/null | jq .
```

## Cleanup After Test

```bash
# Remove test worktree
git worktree remove .worktrees/orchestration-test --force

# Clean up orchestration team
rm -rf ~/.claude/teams/orchestration-test-orchestration/
rm -rf ~/.claude/tasks/orchestration-test-orchestration/

# Clean up any phase execution teams
rm -rf ~/.claude/teams/phase-*-execution/
rm -rf ~/.claude/tasks/phase-*-execution/

# Clean up phase state (if in main repo)
rm -rf .claude/tina/

# Remove test files (if created in main worktree)
rm -rf word-stats/
```

## Resume Testing

To test resume/recovery:

1. Start orchestration normally
2. Wait until a task is `in_progress`
3. Kill the orchestrator (Ctrl+C)
4. Restart: `/tina:orchestrate docs/plans/2026-01-30-orchestration-test-design.md`
5. Verify:
   - [ ] Orchestrator detects existing team
   - [ ] Reads task list to find current state
   - [ ] Respawns teammate for in_progress task
   - [ ] Continues from where it left off

## Issues Log

Record any issues encountered during the test:

| Time | Component | Issue | Resolution |
|------|-----------|-------|------------|
| | | | |

## Notes

- The test design has 3 phases to exercise the full orchestration flow
- Each phase is simple enough to complete quickly but complex enough to test TDD
- The new architecture uses teammates - orchestrator should NOT do work directly
- Task metadata carries state between teammates (worktree_path, plan_path, git_range)
- If orchestrator does work directly instead of spawning teammates, the plugin cache is stale
