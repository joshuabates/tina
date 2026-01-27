---
description: Automate full development pipeline from design document to implementation
---

# EXECUTE THESE STEPS IN ORDER

You are a THIN COORDINATOR. Execute each step below. Do not skip steps.

## FORBIDDEN ACTIONS (if you do these, STOP immediately)
- Reading files other than design doc header
- Using Explore agent
- Creating tasks with TaskCreate
- Writing code
- Making implementation decisions

---

## STEP 1: Count phases

Run this command NOW:
```bash
grep -cE "^##+ Phase [0-9]" <DESIGN_DOC_PATH>
```

Store the result as TOTAL_PHASES.

---

## STEP 2: Create worktree

Follow the worktree creation steps from the skill (Step 1b).

---

## STEP 3: Initialize supervisor state

Create `.claude/tina/supervisor-state.json` per the skill.

---

## STEP 4: For PHASE_NUM = 1 to TOTAL_PHASES

### 4a. CALL Task tool NOW to spawn planner:

```json
{
  "subagent_type": "tina:planner",
  "model": "opus",
  "description": "Plan phase N",
  "prompt": "Design doc: <PATH>\nPhase: <N>\n\nCreate implementation plan. Return ONLY: PLAN_PATH: <path>"
}
```

Wait for response. Extract path from `PLAN_PATH: ...` line.

### 4b. Run tmux commands NOW:

```bash
SESSION_NAME="tina-phase-$PHASE_NUM"
tmux new-session -d -s "$SESSION_NAME" "cd $WORKTREE_PATH && ~/.local/bin/claudesp --dangerously-skip-permissions --model claude-opus-4-5-20251101"
```

Wait 3 seconds, then:

```bash
tmux send-keys -t "$SESSION_NAME" "/team-lead-init $PLAN_PATH" Enter
```

### 4c. CALL Task tool NOW to spawn background monitor:

```json
{
  "subagent_type": "tina:monitor",
  "model": "haiku",
  "run_in_background": true,
  "description": "Monitor phase N",
  "prompt": "Monitor phase execution:\n- phase_num: <N>\n- worktree_path: <PATH>\n- tmux_session: tina-phase-<N>\n- context_threshold: 50"
}
```

### 4d. STOP HERE - Terminal is now free

The monitor runs in background. Check its output file periodically for signals.
When you see `[SIGNAL] phase_complete`, proceed to next phase (repeat Step 4).

---

## STEP 5: After all phases complete

Invoke `tina:finishing-a-development-branch` for merge/PR workflow.

---

The full skill with details follows. But EXECUTE THE STEPS ABOVE - don't just read them.
