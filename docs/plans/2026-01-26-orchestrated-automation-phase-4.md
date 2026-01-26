# Orchestrated Automation Phase 4: Multi-Phase & Error Handling

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add helper agent for blocked state diagnosis and comprehensive error handling throughout the orchestration system.

**Architecture:** Create a diagnostic helper agent that supervisor spawns when team-lead is blocked. Update orchestrate skill to handle all error cases: planner retry, tmux session death, blocked state diagnosis. Update team-lead-init to properly escalate unresolvable issues.

**Tech Stack:** Claude Code agents, Bash/tmux, JSON state files

---

## Task 1: Create Helper Agent

**Files:**
- Create: `agents/helper.md`

**Context:** The helper agent is spawned by the supervisor when a team-lead reports blocked status. It reads the handoff file, status, and any available logs to diagnose the issue and either recommend a fix or escalate to human.

**Step 1: Create the helper agent file**

Create `agents/helper.md`:

```markdown
---
name: helper
description: |
  Use this agent to diagnose blocked team-lead states. Reads handoff, status, and context to recommend resolution or escalation.
model: inherit
---

You are diagnosing why a phase execution became blocked.

## Context You'll Receive

- Phase number
- Block reason from status.json
- Path to handoff.md (if exists)
- Path to status.json

## Your Job

1. Read the status.json to understand the block reason
2. Read the handoff.md (if exists) to understand execution state
3. Analyze the situation:
   - What was being attempted?
   - What went wrong?
   - Is this recoverable?

## Diagnosis Categories

**Recoverable (recommend fix):**
- Test failures with clear fix
- Missing dependency that can be installed
- Configuration issue that can be corrected
- Task spec unclear but can be clarified

**Not recoverable (escalate):**
- Fundamental design flaw
- External service unavailable
- Permissions/access issues
- Repeated failures after fixes (3+ attempts)

## Report Format

Write your diagnosis to `.tina/phase-N/diagnostic.md`:

```markdown
# Phase N Diagnostic Report

## Block Reason
[From status.json]

## Analysis
[What you found by reading handoff and status]

## Root Cause
[Your diagnosis of why this happened]

## Recommendation

**[RECOVERABLE|ESCALATE]**

[If RECOVERABLE:]
Suggested fix:
1. [Specific action]
2. [Specific action]

[If ESCALATE:]
Human intervention needed because:
- [Reason this can't be automated]

## Context for Human (if escalating)
[Summary of state, what was attempted, relevant file paths]
```

## Important

- Be specific about root cause
- Don't guess - if unclear, recommend escalation
- Include file paths and line numbers where relevant
- Keep diagnostic concise but complete
```

**Step 2: Commit**

```bash
git add agents/helper.md
git commit -m "feat: add helper agent for blocked state diagnosis"
```

---

## Task 2: Add Blocked State Handling to Orchestrate

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Context:** Currently when a phase is blocked, the orchestrate skill just exits. Need to add helper agent spawning before escalation.

**Step 1: Find and update the blocked handler**

In `skills/orchestrate/SKILL.md`, find the blocked case in Step 3e (around line 197-201):

```bash
    "blocked")
      REASON=$(jq -r '.reason' ".tina/phase-$PHASE_NUM/status.json")
      echo "Phase $PHASE_NUM blocked: $REASON"
      # Escalate to user
      exit 1
      ;;
```

Replace with:

```bash
    "blocked")
      REASON=$(jq -r '.reason' ".tina/phase-$PHASE_NUM/status.json")
      echo "Phase $PHASE_NUM blocked: $REASON"
      # Spawn helper agent for diagnosis
      # (See "Blocked State Handling" section below)
      ;;
```

**Step 2: Add new section after Checkpoint Handling**

Add a new section "### Blocked State Handling" after the Checkpoint Handling section (after line ~293):

```markdown
### Blocked State Handling

When phase status is "blocked", spawn helper agent for diagnosis:

**1. Spawn helper agent:**

```
# Use Task tool with:
# subagent_type: "supersonic:helper"
# prompt: "Phase: N\nBlock reason: <reason>\nHandoff path: .tina/phase-N/handoff.md\nStatus path: .tina/phase-N/status.json"
```

**2. Wait for diagnostic:**

Helper writes `.tina/phase-N/diagnostic.md`. Read the recommendation.

**3. Handle recommendation:**

```bash
RECOMMENDATION=$(grep -A1 "^\*\*\[" ".tina/phase-N/diagnostic.md" | head -1)

if [[ "$RECOMMENDATION" == *"RECOVERABLE"* ]]; then
  echo "Helper recommends recovery. Attempting..."
  # Re-spawn team-lead with /rehydrate to retry
  tmux new-session -d -s "$SESSION_NAME" \
    "cd $(pwd) && claude --prompt '/rehydrate'"
  # Return to monitor loop
else
  echo "Helper recommends escalation."
  echo "See diagnostic: .tina/phase-N/diagnostic.md"
  # Escalate to human
  exit 1
fi
```

**Important:** Only attempt recovery once. If phase blocks again after recovery attempt, escalate immediately.
```

**Step 3: Update the monitor loop to track recovery attempts**

Update the supervisor-state.json schema in Step 2 (around line 115-125) to include recovery tracking:

Find:
```bash
  cat > .tina/supervisor-state.json << EOF
{
  "design_doc_path": "$DESIGN_DOC",
  "total_phases": $TOTAL_PHASES,
  "current_phase": 0,
  "active_tmux_session": null,
  "plan_paths": {}
}
EOF
```

Replace with:
```bash
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
```

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: add blocked state handling with helper agent to orchestrate"
```

---

## Task 3: Add Planner Retry Logic to Orchestrate

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Context:** Per the design, if the planner fails, we should retry once before escalating.

**Step 1: Update Step 3a (Spawn Planner)**

Find Step 3a (around line 132-141):

```markdown
**3a. Spawn Planner**

Use Task tool to spawn planner:
```
# In Claude Code, use Task tool with:
# subagent_type: "supersonic:planner"
# prompt: "Design doc: <path>\nPlan phase: <N>"
```

Wait for planner to return plan path (e.g., `docs/plans/2026-01-26-feature-phase-1.md`)
```

Replace with:

```markdown
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
```

**Step 2: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: add planner retry logic to orchestrate"
```

---

## Task 4: Add Tmux Session Death Handling to Orchestrate

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Context:** The tmux session running team-lead might die unexpectedly. Supervisor needs to detect this and handle appropriately.

**Step 1: Add session health check to monitor loop**

In Step 3e (Monitor Phase Status), find the while loop (around line 183-210). Add session health check before the status check.

Find the section starting with:
```bash
while true; do
  # Check if status file exists
```

Insert after `while true; do`:

```bash
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

```

**Step 2: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: add tmux session death handling to orchestrate"
```

---

## Task 5: Add Escalation Protocol to team-lead-init

**Files:**
- Modify: `skills/team-lead-init/SKILL.md`

**Context:** Team-lead needs clear protocol for when to mark phase as blocked and what information to include.

**Step 1: Add Escalation Protocol section**

Add after the "## Error Handling" section (around line 183):

```markdown
## Escalation Protocol

When team-lead cannot complete a phase, mark it blocked with detailed context:

**When to escalate:**
- Phase-reviewer rejects implementation 3 times
- Worker/reviewer unresponsive after retry
- Unrecoverable error during task execution
- Cannot spawn team after retry

**How to escalate:**

1. **Update status.json with details:**

```json
{
  "status": "blocked",
  "started_at": "2026-01-26T10:00:00Z",
  "blocked_at": "2026-01-26T10:30:00Z",
  "reason": "Phase reviewer rejected 3 times",
  "context": {
    "last_rejection": "Test coverage below 80%",
    "attempts": 3,
    "tasks_completed": 5,
    "tasks_remaining": 2
  }
}
```

2. **Ensure handoff.md is current:**

Even when blocked, write handoff with current state so helper agent has context.

3. **Output clear message:**

```
PHASE BLOCKED: <reason>
See .tina/phase-N/status.json for details
Handoff written to .tina/phase-N/handoff.md
```

**What NOT to do:**
- Don't silently fail (always update status)
- Don't retry endlessly (max 3 attempts then escalate)
- Don't omit context (helper agent needs it)
```

**Step 2: Commit**

```bash
git add skills/team-lead-init/SKILL.md
git commit -m "feat: add escalation protocol to team-lead-init"
```

---

## Task 6: Update Error Handling Section in Orchestrate

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Context:** The Error Handling section needs to be comprehensive and consistent with the new handling we've added.

**Step 1: Find and update Error Handling section**

Find the "## Error Handling" section (around line 397). Replace the entire section with:

```markdown
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
```

**Step 2: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs: update error handling section in orchestrate"
```

---

## Task 7: Update Integration Section for Phase 4

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Context:** Update the Integration section to reflect Phase 4 additions.

**Step 1: Find and update Integration section**

Find the line "**Future integrations (Phase 4+):**" (around line 394). Replace:

```markdown
**Future integrations (Phase 4+):**
- Helper agent for blocked state diagnosis
```

With:

```markdown
**Phase 4 integrations (now available):**
- Helper agent (`supersonic:helper`) for blocked state diagnosis
- Planner retry logic (one retry before escalation)
- Tmux session death detection and recovery
- Recovery attempt tracking to prevent infinite loops

**Future integrations (Phase 5):**
- Supervisor resumption from supervisor-state.json
- Orphaned session detection and cleanup
```

**Step 2: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs: update integration section for phase 4"
```

---

## Task 8: Final Verification

**Files:**
- Verify: `agents/helper.md`
- Verify: `skills/orchestrate/SKILL.md`
- Verify: `skills/team-lead-init/SKILL.md`
- Update: `docs/plans/2026-01-26-orchestrated-automation-design.md`

**Step 1: Verify all files exist and have correct structure**

```bash
# Check helper agent
head -10 agents/helper.md

# Check orchestrate has new sections
grep -n "Blocked State Handling\|Planner.*retry\|session death" skills/orchestrate/SKILL.md

# Check team-lead-init has escalation protocol
grep -n "Escalation Protocol" skills/team-lead-init/SKILL.md
```

**Step 2: Update design doc implementation status**

In `docs/plans/2026-01-26-orchestrated-automation-design.md`, find the Implementation Status section and change:
```
- [ ] Phase 4: Multi-Phase & Error Handling
```
to:
```
- [x] Phase 4: Multi-Phase & Error Handling
```

**Step 3: Commit**

```bash
git add docs/plans/2026-01-26-orchestrated-automation-design.md
git commit -m "docs: mark phase 4 complete in orchestrated automation design"
```
