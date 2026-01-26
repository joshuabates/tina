# Orchestrated Automation Phase 5: Resumption & Polish

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete supervisor resumption from interrupted state, add orphaned session cleanup, and integrate the finishing workflow for completed orchestration.

**Architecture:** Enhance Step 2 to detect and reconnect to existing tmux sessions. Add orphaned session cleanup before starting new phases. Implement Step 4 completion to invoke finishing-a-development-branch after all phases complete.

**Tech Stack:** Claude Code skills, Bash/tmux, JSON state files

---

## Task 1: Enhance Supervisor Resumption Logic

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Context:** Step 2 already has basic resumption (reads current_phase from state), but doesn't detect existing tmux sessions or validate state consistency.

**Step 1: Update Step 2 to detect existing tmux sessions**

Find the "### Step 2: Initialize or Resume State" section (around line 102). After the existing resumption code that reads `CURRENT_PHASE`, add tmux session detection:

After the `echo "Resuming from phase $CURRENT_PHASE"` line, add:

```markdown
  # Check for existing tmux session
  ACTIVE_SESSION=$(jq -r '.active_tmux_session // ""' .tina/supervisor-state.json)
  if [ -n "$ACTIVE_SESSION" ] && tmux has-session -t "$ACTIVE_SESSION" 2>/dev/null; then
    echo "Found active session: $ACTIVE_SESSION"
    echo "Reconnecting to existing phase execution..."
    # Skip to monitor loop for current phase
    SESSION_NAME="$ACTIVE_SESSION"
    PHASE_NUM=$CURRENT_PHASE
    # Jump to Step 3e (monitoring)
  else
    echo "No active session found, will start fresh from phase $((CURRENT_PHASE + 1))"
    # Clear stale session reference
    if [ -n "$ACTIVE_SESSION" ]; then
      tmp_file=$(mktemp)
      jq '.active_tmux_session = null' .tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .tina/supervisor-state.json
    fi
  fi
```

**Step 2: Update the Resumption section**

Find the "## Resumption" section (around line 488). Replace the existing content with more detailed resumption behavior:

```markdown
## Resumption

If supervisor is interrupted (Ctrl+C, crash, terminal closed), re-run with same design doc path:

**State reconstruction:**
1. Read `.tina/supervisor-state.json` for current phase and active session
2. Check if `active_tmux_session` still exists via `tmux has-session`
3. If session exists: reconnect to monitoring loop
4. If session doesn't exist but phase incomplete: respawn team-lead with `/rehydrate`
5. If phase complete: proceed to next phase

**Resumption scenarios:**

| State | active_tmux_session | phase status | Action |
|-------|---------------------|--------------|--------|
| Session alive | exists, running | executing | Reconnect to monitor loop |
| Session died | exists in state, not running | executing | Respawn with /rehydrate |
| Phase done | null or stale | complete | Proceed to next phase |
| Phase blocked | null or stale | blocked | Spawn helper agent |

**Command:**
```bash
# Simply re-run orchestrate with same design doc
/supersonic:orchestrate docs/plans/2026-01-26-feature-design.md
```

The supervisor automatically detects existing state and resumes appropriately.
```

**Step 3: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: enhance supervisor resumption with tmux session detection"
```

---

## Task 2: Add Orphaned Session Cleanup

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Context:** If supervisor crashes or is interrupted, tmux sessions may be left running. Need to detect and clean up orphaned sessions before starting new work.

**Step 1: Add new section "### Orphaned Session Cleanup"**

Add after "### Step 2: Initialize or Resume State" and before "### Step 3: Phase Loop":

```markdown
### Step 2b: Orphaned Session Cleanup

Before starting new phases, clean up any orphaned tmux sessions from previous runs:

```bash
# Find all supersonic tmux sessions
ORPHANED=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^supersonic-phase-' || true)

for SESSION in $ORPHANED; do
  # Extract phase number from session name
  PHASE=$(echo "$SESSION" | sed 's/supersonic-phase-//')

  # Check if this session is our active session
  if [ "$SESSION" = "$ACTIVE_SESSION" ]; then
    echo "Keeping active session: $SESSION"
    continue
  fi

  # Check if phase is complete
  if [ -f ".tina/phase-$PHASE/status.json" ]; then
    STATUS=$(jq -r '.status' ".tina/phase-$PHASE/status.json")
    if [ "$STATUS" = "complete" ]; then
      echo "Cleaning up completed phase session: $SESSION"
      tmux kill-session -t "$SESSION" 2>/dev/null || true
      continue
    fi
  fi

  # Orphaned session for incomplete phase - ask supervisor how to handle
  echo "Warning: Found orphaned session $SESSION for incomplete phase $PHASE"
  echo "Options: kill (discard work) or adopt (reconnect)"
  # For now, leave it and warn - supervisor can manually handle
done
```

**Important:** Only automatically clean up sessions for completed phases. Orphaned sessions for incomplete phases may contain recoverable work.
```

**Step 2: Update Red Flags section**

Find the "## Red Flags" section. Add to the "Never" list:

```markdown
- Leave orphaned tmux sessions without cleanup attempt
```

And add to the "Always" list:

```markdown
- Run orphaned session cleanup before starting new phases
- Warn about orphaned sessions for incomplete phases
```

**Step 3: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: add orphaned tmux session cleanup to orchestrate"
```

---

## Task 3: Implement Step 4 Completion Workflow

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Context:** Step 4 mentions invoking finishing-a-development-branch but doesn't have actual implementation details.

**Step 1: Add detailed Step 4 section**

Find "### Step 4: Completion" (should be after Step 3f Cleanup, around line 270). If it doesn't exist as a detailed section, add it. Replace or add:

```markdown
### Step 4: Completion

After all phases complete successfully:

**4a. Verify all phases complete:**

```bash
ALL_COMPLETE=true
for i in $(seq 1 $TOTAL_PHASES); do
  if [ ! -f ".tina/phase-$i/status.json" ]; then
    echo "Error: Missing status for phase $i"
    ALL_COMPLETE=false
    break
  fi

  STATUS=$(jq -r '.status' ".tina/phase-$i/status.json")
  if [ "$STATUS" != "complete" ]; then
    echo "Error: Phase $i not complete (status: $STATUS)"
    ALL_COMPLETE=false
    break
  fi
done

if [ "$ALL_COMPLETE" != "true" ]; then
  echo "Cannot proceed to completion - not all phases complete"
  exit 1
fi
```

**4b. Clean up all tmux sessions:**

```bash
for i in $(seq 1 $TOTAL_PHASES); do
  SESSION="supersonic-phase-$i"
  tmux kill-session -t "$SESSION" 2>/dev/null || true
done
```

**4c. Update supervisor state:**

```bash
tmp_file=$(mktemp)
jq '.status = "complete" | .completed_at = now | .active_tmux_session = null' .tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .tina/supervisor-state.json
```

**4d. Invoke finishing workflow:**

```
# Use Skill tool to invoke:
/superpowers:finishing-a-development-branch
```

This presents the user with options to merge, create PR, or keep the branch.

**4e. Report completion:**

```
All phases complete!

Phase summary:
- Phase 1: [plan path] - complete
- Phase 2: [plan path] - complete
...

Total commits: [count]
Files changed: [count]

Ready for merge/PR workflow.
```
```

**Step 2: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: implement completion workflow in orchestrate"
```

---

## Task 4: Add Supervisor State Schema Documentation

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Context:** The supervisor-state.json schema has evolved across phases. Document the complete schema.

**Step 1: Update the State Files section**

Find "## State Files" section (around line 470). Update the supervisor state documentation:

```markdown
## State Files

**Supervisor state:** `.tina/supervisor-state.json`
```json
{
  "design_doc_path": "docs/plans/2026-01-26-feature-design.md",
  "total_phases": 3,
  "current_phase": 2,
  "active_tmux_session": "supersonic-phase-2",
  "plan_paths": {
    "1": "docs/plans/2026-01-26-feature-phase-1.md",
    "2": "docs/plans/2026-01-26-feature-phase-2.md"
  },
  "recovery_attempts": {
    "1": 0,
    "2": 1
  },
  "status": "executing",
  "started_at": "2026-01-26T10:00:00Z",
  "completed_at": null
}
```

**Field descriptions:**
- `design_doc_path`: Original design document that started orchestration
- `total_phases`: Number of phases parsed from design doc
- `current_phase`: Last phase that was started (0 = not started)
- `active_tmux_session`: Currently running tmux session name (null if none)
- `plan_paths`: Map of phase number to generated plan file path
- `recovery_attempts`: Map of phase number to recovery attempt count
- `status`: Overall status (executing, complete, blocked)
- `started_at`: When orchestration began
- `completed_at`: When all phases completed (null if not complete)
```

**Step 2: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs: add complete supervisor state schema documentation"
```

---

## Task 5: Update Integration Section for Phase 5

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Context:** Mark Phase 5 integrations as complete and remove the Future integrations section.

**Step 1: Update Integration section**

Find "**Future integrations (Phase 5):**" in the Integration section. Replace:

```markdown
**Future integrations (Phase 5):**
- Supervisor resumption from supervisor-state.json
- Orphaned session detection and cleanup
```

With:

```markdown
**Phase 5 integrations (now available):**
- Supervisor resumption from supervisor-state.json with tmux session reconnection
- Orphaned session detection and cleanup before new phases
- Completion workflow with finishing-a-development-branch integration

**All planned integrations complete.** The orchestration system is fully functional.
```

**Step 2: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs: mark phase 5 integrations complete in orchestrate"
```

---

## Task 6: Final Verification and Design Doc Update

**Files:**
- Verify: `skills/orchestrate/SKILL.md`
- Update: `docs/plans/2026-01-26-orchestrated-automation-design.md`

**Step 1: Verify all Phase 5 features**

```bash
# Check resumption logic exists
grep -n "Reconnecting to existing phase" skills/orchestrate/SKILL.md

# Check orphaned session cleanup exists
grep -n "Orphaned Session Cleanup" skills/orchestrate/SKILL.md

# Check completion workflow exists
grep -n "4a. Verify all phases" skills/orchestrate/SKILL.md

# Check Phase 5 integrations marked complete
grep -n "Phase 5 integrations" skills/orchestrate/SKILL.md
```

**Step 2: Update design doc implementation status**

In `docs/plans/2026-01-26-orchestrated-automation-design.md`, find the Implementation Status section and change:
```
- [ ] Phase 5: Resumption & Polish
```
to:
```
- [x] Phase 5: Resumption & Polish
```

**Step 3: Commit**

```bash
git add docs/plans/2026-01-26-orchestrated-automation-design.md
git commit -m "docs: mark phase 5 complete - orchestrated automation fully implemented"
```
