---
name: orchestrate
description: Use when you have a design document with multiple phases and want fully automated execution from design to implementation
---

# Orchestrated Automation

## Overview

Automates the full development pipeline from design document to implementation. Spawns planner subagents for each phase, then team-leads in tmux sessions for execution. Monitors progress.

**Core principle:** Supervisor maintains zero context about plan content - only tracks file paths, phase numbers, and process state. Fresh context per phase via tmux.

**Announce at start:** "I'm using the orchestrate skill to automate implementation of this design."

## When to Use

- You have a complete design document with `## Phase N` sections
- You want fully automated execution without manual intervention
- The design has been reviewed by `supersonic:architect`

## When NOT to Use

- Design is incomplete or unapproved
- You want manual control over each phase
- Single-phase designs (use `supersonic:writing-plans` + `supersonic:executing-plans` directly)

## The Process

```dot
digraph orchestrate {
    rankdir=TB;

    "Parse design doc for phases" [shape=box];
    "Initialize .tina/supervisor-state.json" [shape=box];
    "More phases?" [shape=diamond];
    "Spawn planner subagent" [shape=box];
    "Wait for plan path" [shape=box];
    "Spawn team-lead-init in tmux" [shape=box];
    "Monitor phase status" [shape=box];
    "Phase complete?" [shape=diamond];
    "Kill tmux session, next phase" [shape=box];
    "Invoke finishing-a-development-branch" [shape=box style=filled fillcolor=lightgreen];

    "Parse design doc for phases" -> "Initialize .tina/supervisor-state.json";
    "Initialize .tina/supervisor-state.json" -> "More phases?";
    "More phases?" -> "Spawn planner subagent" [label="yes"];
    "Spawn planner subagent" -> "Wait for plan path";
    "Wait for plan path" -> "Spawn team-lead-init in tmux";
    "Spawn team-lead-init in tmux" -> "Monitor phase status";
    "Monitor phase status" -> "Phase complete?";
    "Phase complete?" -> "Monitor phase status" [label="no"];
    "Phase complete?" -> "Kill tmux session, next phase" [label="yes"];
    "Kill tmux session, next phase" -> "More phases?";
    "More phases?" -> "Invoke finishing-a-development-branch" [label="no"];
}
```

## Invocation

```
/supersonic:orchestrate docs/plans/2026-01-26-myfeature-design.md
```

## Phase 1 Behavior (Current Implementation)

This phase implements basic orchestration without team-based execution:

1. **Parse design doc** - Count `## Phase N` sections
2. **Initialize state** - Create `.tina/supervisor-state.json`
3. **For each phase:**
   - Spawn `supersonic:planner` subagent with design doc + phase number
   - Wait for plan path
   - Spawn `supersonic:team-lead-init` in tmux with plan path
   - Monitor `.tina/phase-N/status.json` until complete
   - Kill tmux session, proceed to next phase
4. **Completion** - Invoke `supersonic:finishing-a-development-branch`

## Implementation Notes

**Monitoring:** Polls `.tina/phase-N/status.json` every 10 seconds until phase status is "complete" or "blocked".

**Tmux session naming:** Uses pattern `supersonic-phase-N` where N is the phase number.

**Cleanup:** Supervisor state and phase directories persist in `.tina/` for resumption. Can be manually removed after successful completion if desired.

## Implementation Details

**Note:** The variables `$DESIGN_DOC`, `$PHASE_NUM`, and `$PLAN_PATH` are placeholders representing values from the execution context. The tmux invocation `claude --prompt '/team-lead-init $PLAN_PATH'` starts a new Claude CLI session that will execute the team-lead-init skill with the provided plan path argument.

### Step 1: Parse Design Doc

```bash
# Count phases
TOTAL_PHASES=$(grep -c "^## Phase [0-9]" "$DESIGN_DOC")
if [ "$TOTAL_PHASES" -eq 0 ]; then
  echo "Error: Design doc must have ## Phase N sections"
  exit 1
fi
```

### Step 2: Initialize or Resume State

**If `.tina/supervisor-state.json` exists:** Resume from saved state
**Otherwise:** Initialize new state

```bash
# Initialize session tracking (may be set during resume)
ACTIVE_SESSION=""

if [ -f ".tina/supervisor-state.json" ]; then
  # Resume: read current phase
  CURRENT_PHASE=$(jq -r '.current_phase' .tina/supervisor-state.json)
  echo "Resuming from phase $CURRENT_PHASE"

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
else
  # Initialize: create state file
  mkdir -p .tina
  cat > .tina/supervisor-state.json << EOF
{
  "design_doc_path": "$DESIGN_DOC",
  "total_phases": $TOTAL_PHASES,
  "current_phase": 0,
  "active_tmux_session": null,
  "plan_paths": {},
  "recovery_attempts": {}
}
EOF
  CURRENT_PHASE=0
fi
```

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

### Step 3: Phase Loop

For each phase from `CURRENT_PHASE + 1` to `TOTAL_PHASES`:

**3a. Spawn Planner (with retry)**

Use Task tool to spawn planner:
```
# In Claude Code, use Task tool with:
# subagent_type: "supersonic:planner"
# prompt: "Design doc: <path>\nPlan phase: <N>"
```

Wait for planner to return plan path (e.g., `docs/plans/2026-01-26-feature-phase-1.md`)

**If planner fails:**
```bash
echo "Planner failed for phase $PHASE_NUM, retrying..."
# Retry once with same prompt
# If still fails:
echo "Planner failed twice for phase $PHASE_NUM"
echo "Error: <planner error output>"
exit 1
```

**Important:** Planner failure means the design doc phase section may be malformed or the planner agent is broken. After one retry, escalate to human rather than continuing.

**3b. Update Supervisor State**

```bash
tmp_file=$(mktemp)
jq ".current_phase = $PHASE_NUM" .tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .tina/supervisor-state.json

# Add plan path to state
tmp_file=$(mktemp)
jq ".plan_paths[\"$PHASE_NUM\"] = \"$PLAN_PATH\"" .tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .tina/supervisor-state.json
```

**3c. Initialize Phase Directory**

```bash
mkdir -p ".tina/phase-$PHASE_NUM"
cat > ".tina/phase-$PHASE_NUM/status.json" << EOF
{
  "status": "pending",
  "started_at": null
}
EOF
```

**3d. Spawn Team-Lead in Tmux**

```bash
SESSION_NAME="supersonic-phase-$PHASE_NUM"
tmux new-session -d -s "$SESSION_NAME" \
  "cd $(pwd) && claude --prompt '/team-lead-init $PLAN_PATH'"

# Update active session in state
tmp_file=$(mktemp)
jq ".active_tmux_session = \"$SESSION_NAME\"" .tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .tina/supervisor-state.json
```

**3e. Monitor Phase Status**

Poll every 10 seconds until phase completes:

```bash
while true; do
  # Check if tmux session is still alive
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Tmux session $SESSION_NAME died unexpectedly"

    # Check if phase was actually complete
    if [ -f ".tina/phase-$PHASE_NUM/status.json" ]; then
      STATUS=$(jq -r '.status' ".tina/phase-$PHASE_NUM/status.json")
      if [ "$STATUS" = "complete" ]; then
        echo "Phase $PHASE_NUM was complete, continuing"
        break
      fi
    fi

    # Attempt recovery via rehydrate
    echo "Attempting recovery..."
    tmux new-session -d -s "$SESSION_NAME" \
      "cd $(pwd) && claude --prompt '/rehydrate'"

    # Track recovery attempt
    RECOVERY_COUNT=$(jq -r ".recovery_attempts[\"$PHASE_NUM\"] // 0" .tina/supervisor-state.json)
    RECOVERY_COUNT=$((RECOVERY_COUNT + 1))
    tmp_file=$(mktemp)
    jq ".recovery_attempts[\"$PHASE_NUM\"] = $RECOVERY_COUNT" .tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .tina/supervisor-state.json

    if [ "$RECOVERY_COUNT" -gt 1 ]; then
      echo "Recovery failed twice, escalating"
      exit 1
    fi

    sleep 5
    continue
  fi

  # Check if status file exists
  if [ ! -f ".tina/phase-$PHASE_NUM/status.json" ]; then
    echo "Error: Phase $PHASE_NUM status file not found"
    exit 1
  fi

  STATUS=$(jq -r '.status' ".tina/phase-$PHASE_NUM/status.json")

  case "$STATUS" in
    "complete")
      echo "Phase $PHASE_NUM complete"
      break
      ;;
    "blocked")
      REASON=$(jq -r '.reason' ".tina/phase-$PHASE_NUM/status.json")
      echo "Phase $PHASE_NUM blocked: $REASON"
      # Spawn helper agent for diagnosis
      # (See "Blocked State Handling" section below)
      ;;
    *)
      sleep 10
      ;;
  esac
done

# Note: In production, consider adding a timeout mechanism to prevent infinite loops
```

**3f. Cleanup and Proceed**

```bash
# Kill tmux session (errors suppressed if session already terminated)
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# Clear active session in state
tmp_file=$(mktemp)
jq ".active_tmux_session = null" .tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .tina/supervisor-state.json
```

### Checkpoint Handling

Supervisor monitors for checkpoint signal and coordinates context reset:

**1. Detect checkpoint needed:**

Within the monitor loop (Step 3e), check for signal file:

```bash
# In monitor loop, check for signal file
if [ -f ".tina/checkpoint-needed" ]; then
  echo "Checkpoint signal detected"
  # Proceed to checkpoint handling
fi
```

**2. Send checkpoint command:**

```bash
tmux send-keys -t "$SESSION_NAME" "/checkpoint" Enter
```

**3. Wait for handoff:**

Poll for handoff file update (max 5 minutes):

```bash
HANDOFF_FILE=".tina/phase-$PHASE_NUM/handoff.md"
TIMEOUT=300
START=$(date +%s)

while true; do
  if [ -f "$HANDOFF_FILE" ]; then
    # Check if modified after checkpoint signal
    HANDOFF_TIME=$(stat -f %m "$HANDOFF_FILE" 2>/dev/null || stat -c %Y "$HANDOFF_FILE")
    SIGNAL_TIME=$(stat -f %m ".tina/checkpoint-needed" 2>/dev/null || stat -c %Y ".tina/checkpoint-needed")
    if [ "$HANDOFF_TIME" -gt "$SIGNAL_TIME" ]; then
      echo "Handoff written"
      break
    fi
  fi

  ELAPSED=$(($(date +%s) - START))
  if [ "$ELAPSED" -gt "$TIMEOUT" ]; then
    echo "Checkpoint timeout - escalating"
    # Mark phase blocked, escalate to user
    exit 1
  fi

  sleep 5
done
```

**4. Send clear and rehydrate:**

```bash
# Clear context
tmux send-keys -t "$SESSION_NAME" "/clear" Enter
sleep 2

# Rehydrate from handoff
tmux send-keys -t "$SESSION_NAME" "/rehydrate" Enter

# Remove checkpoint signal
rm ".tina/checkpoint-needed"
```

**5. Continue monitoring:**

After rehydrate, return to normal phase monitoring loop (Step 3e).

### Blocked State Handling

When a phase enters blocked state, supervisor spawns a helper agent for diagnosis before escalating:

**1. Spawn helper agent:**

```bash
# Use Task tool to spawn helper agent
# subagent_type: "supersonic:helper"
# prompt: "Diagnose blocked phase: $PHASE_NUM\nReason: $REASON\nPhase dir: .tina/phase-$PHASE_NUM"
```

**2. Wait for diagnostic file:**

Poll for helper's diagnostic output (max 2 minutes):

```bash
DIAGNOSTIC_FILE=".tina/phase-$PHASE_NUM/diagnostic.md"
TIMEOUT=120
START=$(date +%s)

while true; do
  if [ -f "$DIAGNOSTIC_FILE" ]; then
    echo "Diagnostic received"
    break
  fi

  ELAPSED=$(($(date +%s) - START))
  if [ "$ELAPSED" -gt "$TIMEOUT" ]; then
    echo "Diagnostic timeout - escalating to user"
    exit 1
  fi

  sleep 5
done
```

**3. Read recommendation:**

```bash
RECOMMENDATION=$(jq -r '.recommendation' "$DIAGNOSTIC_FILE")
RECOVERY_CMD=$(jq -r '.recovery_command // empty' "$DIAGNOSTIC_FILE")
```

Helper writes one of:
- `RECOVERABLE` - Issue can be fixed automatically (includes `recovery_command`)
- `ESCALATE` - Requires human intervention

**4. Handle recommendation:**

```bash
case "$RECOMMENDATION" in
  "RECOVERABLE")
    # Check if we've already attempted recovery for this phase
    ALREADY_TRIED=$(jq -r ".recovery_attempts[\"$PHASE_NUM\"] // false" .tina/supervisor-state.json)

    if [ "$ALREADY_TRIED" = "true" ]; then
      echo "Recovery already attempted for phase $PHASE_NUM - escalating"
      exit 1
    fi

    # Mark recovery attempt
    tmp_file=$(mktemp)
    jq ".recovery_attempts[\"$PHASE_NUM\"] = true" .tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .tina/supervisor-state.json

    echo "Attempting recovery via /rehydrate"
    tmux send-keys -t "$SESSION_NAME" "/rehydrate" Enter

    # Reset phase status to allow re-monitoring
    cat > ".tina/phase-$PHASE_NUM/status.json" << EOF
{
  "status": "executing",
  "recovered_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

    # Continue monitoring (return to loop)
    ;;

  *)
    # ESCALATE or unknown - requires human
    echo "Phase $PHASE_NUM requires human intervention"
    echo "Reason: $REASON"
    echo "Diagnostic: $(cat $DIAGNOSTIC_FILE)"
    exit 1
    ;;
esac
```

**Note:** Recovery is only attempted once per phase. If the same phase blocks again after recovery, it immediately escalates to the user.

### Step 4: Completion

After all phases complete, invoke the finishing skill:

```bash
# Use Skill tool to invoke finishing workflow
# User will be presented with merge/PR options
```

Note: The actual invocation happens in the Claude session - this skill documents the orchestration flow. The supervisor will communicate to the user that all phases are complete.

### Tmux Commands Reference

**Create session:**
```bash
tmux new-session -d -s <name> "<command>"
```

**Check session exists:**
```bash
tmux has-session -t <name> 2>/dev/null && echo "exists"
```

**Kill session:**
```bash
tmux kill-session -t <name>
```

**Send command to session:**
```bash
tmux send-keys -t <name> "<command>" Enter
```

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
  }
}
```

**Phase status:** `.tina/phase-N/status.json`
```json
{
  "status": "executing",
  "started_at": "2026-01-26T10:00:00Z"
}
```

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

## Integration

**Spawns:**
- `supersonic:planner` - Creates implementation plan for each phase
- Team-lead in tmux - Executes phase via `team-lead-init`

**Invokes after completion:**
- `supersonic:finishing-a-development-branch` - Handles merge/PR workflow

**State files:**
- `.tina/supervisor-state.json` - Supervisor resumption state
- `.tina/phase-N/status.json` - Per-phase execution status
- `.tina/phase-N/handoff.md` - Context handoff document for checkpoint/rehydrate

**Checkpoint cycle:**
- Statusline script creates `.tina/checkpoint-needed` when context > threshold
- Supervisor detects signal, sends `/checkpoint` to team-lead
- Team-lead runs checkpoint skill, writes handoff, outputs "CHECKPOINT COMPLETE"
- Supervisor sends `/clear`, then `/rehydrate`
- Team-lead runs rehydrate skill, restores state, resumes execution

**Depends on existing:**
- `supersonic:executing-plans` - Team-lead delegates to this for task execution
- `supersonic:planner` - Creates phase plans from design doc
- `supersonic:architect` - Design must be architect-reviewed before orchestration
- `supersonic:phase-reviewer` - Called by executing-plans after tasks complete

**Phase 2 integrations (now available):**
- Team-based execution via Teammate tool (workers + reviewers)
- Message-based coordination between teammates
- Review tracking and loop prevention

**Phase 3 integrations (now available):**
- Checkpoint/rehydrate for context management via `.tina/checkpoint-needed` signal
- Statusline context monitoring with automatic checkpoint triggering

**Phase 4 integrations (now available):**
- Helper agent (`supersonic:helper`) for blocked state diagnosis
- Planner retry logic (one retry before escalation)
- Tmux session death detection and recovery
- Recovery attempt tracking to prevent infinite loops

**Future integrations (Phase 5):**
- Supervisor resumption from supervisor-state.json
- Orphaned session detection and cleanup

## Error Handling

**Design doc has no phases:**
- Error immediately: "Design doc must have `## Phase N` sections"
- Exit with error code

**Planner fails:**
- Retry once with same prompt
- If still fails: output error, exit (human intervention needed)

**Team-lead tmux session dies:**
- Check if phase was complete (proceed if yes)
- Attempt recovery via `/rehydrate` in new session
- Track recovery attempts in supervisor-state.json
- If recovery fails twice: escalate to human

**Phase blocked:**
- Spawn helper agent for diagnosis
- Helper writes `.tina/phase-N/diagnostic.md`
- If helper recommends RECOVERABLE: attempt one recovery
- If helper recommends ESCALATE or recovery fails: escalate to human

**Checkpoint timeout:**
- Team-lead doesn't write handoff within 5 minutes
- Force kill tmux session
- Mark phase as blocked with reason "checkpoint timeout"
- Spawn helper agent (may be able to diagnose from partial state)

**Recovery tracking:**
- Supervisor tracks recovery attempts per phase in `recovery_attempts` field
- Maximum 1 recovery attempt per phase per error type
- Prevents infinite retry loops

## Red Flags

**Never:**
- Read plan content (only track file paths)
- Parse plan structure (that's team-lead's job)
- Skip phase completion verification
- Leave orphaned tmux sessions (always attempt cleanup)

**Always:**
- Wait for planner to return path before spawning team-lead
- Verify phase complete via status.json before proceeding
- Clean up tmux session after phase completes
- Run orphaned session cleanup before starting new phases
- Warn about orphaned sessions for incomplete phases
