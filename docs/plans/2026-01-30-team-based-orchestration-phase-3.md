# Team-Based Orchestration Phase 3 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Implement recovery and remediation capabilities so the orchestrator can resume from crashes and handle reviewer-reported gaps with dedicated remediation phases.

**Architecture:** Recovery uses the task list as the source of truth - no separate state file needed. When orchestrate is invoked, it checks for an existing team and resumes from the current task state. Remediation creates new tasks (plan-phase-N.5, execute-phase-N.5, review-phase-N.5) with proper dependencies to fix gaps before proceeding. The phase executor must also handle resume scenarios where the tmux session already exists.

**Phase context:** Phase 1 created agent definitions (phase-executor, worktree-setup, phase-planner) and updated team-lead-init to write team name files. Phase 2 rewrote the orchestrate skill with the team-based model including task creation, teammate spawning, and event loop. Phase 3 adds the recovery and remediation logic that was documented but needs concrete implementation in the agents and skill files.

---

### Task 1: Add resume detection to orchestrate skill header

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Read the current orchestrate skill header**

Read the first 100 lines of the orchestrate skill to understand the current step structure.

**Step 2: Add resume detection after STEP 1**

Locate the text:

```markdown
## STEP 1: Count phases and extract feature name

```bash
DESIGN_DOC="<path from invocation>"
TOTAL_PHASES=$(grep -cE "^##+ Phase [0-9]" "$DESIGN_DOC")
FEATURE_NAME=$(basename "$DESIGN_DOC" | sed 's/^[0-9-]*//; s/-design\.md$//')
```

---

## STEP 2: Create orchestration team
```

Replace with:

```markdown
## STEP 1: Count phases and extract feature name

```bash
DESIGN_DOC="<path from invocation>"
TOTAL_PHASES=$(grep -cE "^##+ Phase [0-9]" "$DESIGN_DOC")
FEATURE_NAME=$(basename "$DESIGN_DOC" | sed 's/^[0-9-]*//; s/-design\.md$//')
TEAM_NAME="${FEATURE_NAME}-orchestration"
```

---

## STEP 1b: Check for existing orchestration (RESUME DETECTION)

Before creating a new team, check if one already exists for this design doc:

```bash
TEAM_CONFIG="$HOME/.claude/teams/${TEAM_NAME}.json"
if [ -f "$TEAM_CONFIG" ]; then
    echo "Found existing orchestration team: $TEAM_NAME"
    # SKIP TO STEP 5b (Resume Logic) below
fi
```

If team exists, DO NOT create new team or tasks. Instead:
1. Skip to STEP 5b: Resume Logic
2. Read existing task list
3. Find current state and resume

---

## STEP 2: Create orchestration team
```

**Step 3: Add STEP 5b for resume logic before the event loop**

Find the text:

```markdown
## STEP 5: Event loop - React to teammate messages
```

Insert before it:

```markdown
## STEP 5b: Resume Logic (when existing team found)

When team already exists, resume from current state:

**Step 5b.1: Read task list**
```
TaskList
```

**Step 5b.2: Categorize tasks**
```
COMPLETED_TASKS = tasks where status == "completed"
IN_PROGRESS_TASKS = tasks where status == "in_progress"
PENDING_UNBLOCKED = tasks where status == "pending" AND all blockedBy are completed
```

**Step 5b.3: Determine action based on state**

| State | Action |
|-------|--------|
| Has in_progress task | Respawn teammate for that task |
| No in_progress, has pending unblocked | Spawn teammate for first unblocked |
| All tasks complete | Report completion, exit |

**Step 5b.4: Respawn teammate for in_progress task**

For each task type, spawn the appropriate teammate:
- `validate-design` in_progress → spawn design-validator
- `setup-worktree` in_progress → spawn worktree-setup
- `plan-phase-N` in_progress → spawn phase-planner
- `execute-phase-N` in_progress → spawn phase-executor
- `review-phase-N` in_progress → spawn phase-reviewer

Use TaskGet to retrieve any metadata needed from completed tasks (worktree_path, plan_path, etc.)

**Step 5b.5: Continue to STEP 5 (Event loop)**

After spawning the resumed teammate, continue with normal event loop processing.

---

```

**Step 4: Verify the changes**

Run: `grep -n "STEP 5b" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new resume logic section

**Step 5: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add resume detection and logic for crash recovery"
```

---

### Task 2: Add tmux session resume to phase-executor agent

**Files:**
- Modify: `agents/phase-executor.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Read the current phase-executor agent**

Read the full agent file to understand the current structure.

**Step 2: Add session detection before creating**

Find the text:

```markdown
## Tmux Session Management

### Creating the Session

```bash
SESSION_NAME="tina-$FEATURE_NAME-phase-$PHASE_NUM"
tmux new-session -d -s "$SESSION_NAME" \
  "cd $WORKTREE_PATH && claude --dangerously-skip-permissions"
```
```

Replace with:

```markdown
## Tmux Session Management

### Check for Existing Session (Resume Support)

Before creating a new session, check if one already exists:

```bash
SESSION_NAME="tina-$FEATURE_NAME-phase-$PHASE_NUM"

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Found existing tmux session: $SESSION_NAME"
    # Session exists - skip creation, go directly to monitoring
    # This handles resume after executor crash
else
    # No existing session - create new one
    # Continue to "Creating the Session" below
fi
```

### Creating the Session

Only create if session does not exist:

```bash
SESSION_NAME="tina-$FEATURE_NAME-phase-$PHASE_NUM"
tmux new-session -d -s "$SESSION_NAME" \
  "cd $WORKTREE_PATH && claude --dangerously-skip-permissions"
```
```

**Step 3: Add status file check before team-lead-init**

Find the text:

```markdown
### Sending Commands

**CRITICAL:** Command and Enter MUST be two separate tmux send-keys calls:

```bash
tmux send-keys -t "$SESSION_NAME" "/tina:team-lead-init $PLAN_PATH"
tmux send-keys -t "$SESSION_NAME" Enter
```
```

Replace with:

```markdown
### Check Phase Status Before Sending Commands

Before sending team-lead-init, check if the phase is already complete or in progress:

```bash
STATUS_FILE="$WORKTREE_PATH/.claude/tina/phase-$PHASE_NUM/status.json"

if [ -f "$STATUS_FILE" ]; then
    STATUS=$(jq -r '.status // "unknown"' "$STATUS_FILE" 2>/dev/null)

    if [ "$STATUS" = "complete" ]; then
        echo "Phase already complete - skipping to completion reporting"
        # Jump to Completion section
    fi

    if [ "$STATUS" = "executing" ]; then
        echo "Phase already executing - skip init, go to monitoring"
        # Jump to Monitoring Loop (team-lead-init already ran)
    fi
fi
```

### Sending Commands

Only send if phase not already started. **CRITICAL:** Command and Enter MUST be two separate tmux send-keys calls:

```bash
tmux send-keys -t "$SESSION_NAME" "/tina:team-lead-init $PLAN_PATH"
tmux send-keys -t "$SESSION_NAME" Enter
```
```

**Step 4: Verify the changes**

Run: `grep -n "Resume Support" /Users/joshuabates/Projects/tina/agents/phase-executor.md`
Expected: Should find the new section

**Step 5: Commit**

```bash
git add agents/phase-executor.md
git commit -m "feat(phase-executor): add resume support for existing tmux sessions and phase status"
```

---

### Task 3: Add remediation task creation to orchestrate skill

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Read the current remediation flow section**

Find and read the "Remediation Flow" section in the orchestrate skill.

**Step 2: Add concrete remediation task creation function**

Find the text in the "Event Loop" section:

```markdown
if message contains "review-N complete (gaps)":
    Parse: issues list from message
    TaskUpdate: review-phase-N, status: completed
    TaskUpdate: review-phase-N, metadata: { status: "gaps", issues: [...] }

    Create remediation tasks (see Remediation Flow)
    Spawn planner-N.5
    Print: "Phase N has gaps. Creating remediation phase N.5..."
```

Replace with the more detailed implementation:

```markdown
if message contains "review-N complete (gaps)":
    Parse: issues list from message
    TaskUpdate: review-phase-N, status: completed
    TaskUpdate: review-phase-N, metadata: { status: "gaps", issues: [...] }

    # Check remediation depth (max 2 remediation cycles)
    REMEDIATION_DEPTH = count of ".5" in phase number (e.g., "1.5" = 1, "1.5.5" = 2)
    if REMEDIATION_DEPTH >= 2:
        Print: "ERROR: Phase N has failed review after 2 remediation attempts"
        Print: "Manual intervention required. Issues: <issues list>"
        Exit orchestration

    # Calculate remediation phase number
    if N is integer:
        REMEDIATION_PHASE = "${N}.5"
    else:
        # Already a remediation phase (e.g., 1.5), add another .5
        REMEDIATION_PHASE = "${N}.5"

    # Create remediation tasks
    TaskCreate {
        "subject": "plan-phase-${REMEDIATION_PHASE}",
        "description": "Plan remediation for phase ${N} gaps: ${issues_joined_by_comma}",
        "activeForm": "Planning phase ${REMEDIATION_PHASE} remediation"
    }

    TaskCreate {
        "subject": "execute-phase-${REMEDIATION_PHASE}",
        "description": "Execute remediation plan for phase ${N} gaps",
        "activeForm": "Executing phase ${REMEDIATION_PHASE} remediation"
    }

    TaskCreate {
        "subject": "review-phase-${REMEDIATION_PHASE}",
        "description": "Review remediation for phase ${N} gaps",
        "activeForm": "Reviewing phase ${REMEDIATION_PHASE} remediation"
    }

    # Set up dependencies
    TaskUpdate: execute-phase-${REMEDIATION_PHASE}, addBlockedBy: [plan-phase-${REMEDIATION_PHASE}]
    TaskUpdate: review-phase-${REMEDIATION_PHASE}, addBlockedBy: [execute-phase-${REMEDIATION_PHASE}]

    # Find the next main phase (or finalize) and add remediation as blocker
    NEXT_PHASE = ceiling of N + 1  # e.g., 1.5 -> plan-phase-2, 2 -> plan-phase-3
    if NEXT_PHASE <= TOTAL_PHASES:
        TaskUpdate: plan-phase-${NEXT_PHASE}, addBlockedBy: [review-phase-${REMEDIATION_PHASE}]
    else:
        TaskUpdate: finalize, addBlockedBy: [review-phase-${REMEDIATION_PHASE}]

    # Store remediation context
    TaskUpdate: plan-phase-${REMEDIATION_PHASE}, metadata: {
        "parent_phase": N,
        "issues": [...],
        "remediation_depth": REMEDIATION_DEPTH + 1
    }

    # Spawn remediation planner
    Spawn phase-planner with:
        phase_num: ${REMEDIATION_PHASE}
        design_doc_path: <DESIGN_DOC>
        remediation_for: phase ${N}
        issues: <issues list>

    Print: "Phase ${N} has gaps. Creating remediation phase ${REMEDIATION_PHASE}..."
```

**Step 3: Verify the changes**

Run: `grep -n "REMEDIATION_DEPTH" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new remediation depth logic

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add concrete remediation task creation with depth limiting"
```

---

### Task 4: Update phase-planner to handle remediation context

**Files:**
- Modify: `agents/phase-planner.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Read the current phase-planner agent**

Read the full agent file.

**Step 2: Add remediation handling to input section**

Find the text:

```markdown
## Input

You receive via spawn prompt:
- `phase_num`: The phase number to plan
- `design_doc_path`: Path to the design document
```

Replace with:

```markdown
## Input

You receive via spawn prompt:
- `phase_num`: The phase number to plan (may be decimal like "1.5" for remediation)
- `design_doc_path`: Path to the design document
- `remediation_for`: (optional) Original phase number if this is a remediation phase
- `issues`: (optional) List of specific gaps to address if this is a remediation phase
```

**Step 3: Add remediation-specific planning guidance**

Find the text:

```markdown
### Write the Implementation Plan

Create a plan file at `docs/plans/YYYY-MM-DD-<feature>-phase-N.md` following the planner methodology:
```

Replace with:

```markdown
### Write the Implementation Plan

**For regular phases:**
Create a plan file at `docs/plans/YYYY-MM-DD-<feature>-phase-N.md` following the planner methodology.

**For remediation phases (when `remediation_for` is provided):**
Create a plan file at `docs/plans/YYYY-MM-DD-<feature>-phase-N.5.md` with these differences:

1. **Narrow scope:** Only address the specific issues listed, not the full phase scope
2. **Reference original work:** The original phase code exists - build on it, don't replace
3. **Smaller tasks:** Remediation should be 1-3 tasks max, focused on the gaps
4. **Clear success criteria:** Each issue from the list must have a corresponding fix

Example remediation plan header:
```markdown
# <Feature> Phase N.5 Remediation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Address gaps from Phase N review: [issues list]

**Architecture:** Targeted fixes to existing implementation. No new architecture.

**Phase context:** Phase N implemented [summary]. Review found gaps: [issues]. This remediation addresses only those specific issues.

**Issues to address:**
1. [Issue 1] - Fix: [approach]
2. [Issue 2] - Fix: [approach]
```

Following the planner methodology:
```

**Step 4: Verify the changes**

Run: `grep -n "remediation_for" /Users/joshuabates/Projects/tina/agents/phase-planner.md`
Expected: Should find the new remediation context

**Step 5: Commit**

```bash
git add agents/phase-planner.md
git commit -m "feat(phase-planner): add remediation context handling for gap-fixing phases"
```

---

### Task 5: Update phase-reviewer to output structured gap format

**Files:**
- Modify: `agents/phase-reviewer.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Read the current phase-reviewer agent**

Read the full agent file.

**Step 2: Add structured completion message format**

Find the text at the end of the file (the "Red Flags" section or similar):

```markdown
**DON'T:**
- Assume code is connected because it exists
- Skip integration tracing
- Give vague feedback
- Approve with any open issues
- Skip metrics collection even if estimates are missing (report "no estimates provided")
- Approve with Stop-level metric drift
- Ignore ROI for test-heavy work
```

Add after it:

```markdown

## Completion Message Format

After writing your review to the output file, send a completion message to the orchestrator.

**Message format for pass:**
```
review-N complete (pass)
```

**Message format for gaps:**
```
review-N complete (gaps): issue1, issue2, issue3
```

The issues list must be:
- Comma-separated
- Each issue a short phrase (5-10 words max)
- Actionable (describes what needs to be fixed, not what's wrong)

**Examples:**
```
review-1 complete (gaps): add unit tests for error paths, fix unconnected API handler, update integration test mocks
```

```
review-2 complete (pass)
```

**For remediation phases (N.5, N.5.5):**

Check ONLY the specific issues from the remediation plan:
- Were all listed issues addressed?
- Did the fix introduce new issues?

If all original issues addressed and no new issues: `review-N.5 complete (pass)`
If issues remain or new ones found: `review-N.5 complete (gaps): remaining/new issues`
```

**Step 3: Verify the changes**

Run: `grep -n "Completion Message Format" /Users/joshuabates/Projects/tina/agents/phase-reviewer.md`
Expected: Should find the new section

**Step 4: Commit**

```bash
git add agents/phase-reviewer.md
git commit -m "feat(phase-reviewer): add structured completion message format for orchestrator parsing"
```

---

### Task 6: Add cleanup handling for failed orchestration

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Read the current error handling in the event loop**

Find the error handling section in the event loop.

**Step 2: Add cleanup instructions for orchestration failure**

Find the text near the end of the "Event Loop" section:

```markdown
**Error handling:**

For any error message:
1. Log the full error
2. Check if this is first retry
3. If first retry: respawn the teammate
4. If second failure: exit with error, leave tasks for manual inspection

**Retry tracking:**

Track retries in task metadata:
```json
TaskUpdate {
  "taskId": "execute-phase-1",
  "metadata": { "retry_count": 1 }
}
```

Max 1 retry per task before escalating.
```

Replace with:

```markdown
**Error handling:**

For any error message:
1. Log the full error
2. Check if this is first retry (look at task metadata.retry_count)
3. If first retry: respawn the teammate
4. If second failure: graceful exit with cleanup instructions

**Retry tracking:**

Track retries in task metadata:
```json
TaskUpdate {
  "taskId": "execute-phase-1",
  "metadata": { "retry_count": 1 }
}
```

Max 1 retry per task before escalating.

**Graceful exit on failure:**

When orchestration cannot continue (after retries exhausted or remediation limit hit):

```
Print:
═══════════════════════════════════════════════════════════
ORCHESTRATION FAILED
Task: <failed task name>
Error: <error description>

Current state preserved in task list.
To resume after fixing the issue:
  /tina:orchestrate <design-doc-path>

To reset and start fresh:
  rm -rf ~/.claude/teams/${TEAM_NAME}.json
  rm -rf ~/.claude/tasks/${TEAM_NAME}/
  /tina:orchestrate <design-doc-path>

To manually inspect state:
  TaskList
═══════════════════════════════════════════════════════════
```

Do NOT clean up team or tasks automatically - preserve state for debugging.
```

**Step 3: Verify the changes**

Run: `grep -n "ORCHESTRATION FAILED" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new failure message

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): add graceful exit with cleanup instructions on failure"
```

---

### Task 7: Add integration test scenario documentation

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Step 1: Read the end of the orchestrate skill**

Read the last 50 lines to find where to add test scenarios.

**Step 2: Add test scenarios section before Red Flags**

Find the text:

```markdown
## Red Flags

**Never:**
```

Insert before it:

```markdown
## Test Scenarios

Use these scenarios to verify recovery and remediation work correctly.

### Scenario 1: Orchestrator Crash and Resume

1. Start orchestration: `/tina:orchestrate design.md`
2. Wait until `plan-phase-1` is in_progress
3. Kill the orchestrator session (Ctrl+C or close terminal)
4. Restart: `/tina:orchestrate design.md`
5. Expected: Orchestrator finds existing team, sees plan-phase-1 in_progress, respawns planner-1
6. Verify: Orchestration continues from where it left off

### Scenario 2: Executor Crash with Tmux Alive

1. Start orchestration until `execute-phase-1` is in_progress
2. Kill the executor teammate (not the tmux session)
3. Orchestrator should timeout waiting for message
4. Orchestrator respawns executor-1
5. Expected: New executor finds existing tmux session, skips creation, resumes monitoring
6. Verify: Phase completes normally

### Scenario 3: Single Remediation Cycle

1. Create a design that will fail review (e.g., no tests requirement)
2. Run orchestration through execute-phase-1
3. Reviewer reports gaps: `review-1 complete (gaps): missing unit tests`
4. Expected: Orchestrator creates plan-phase-1.5, execute-phase-1.5, review-phase-1.5
5. Expected: Dependencies updated so plan-phase-2 blocked by review-phase-1.5
6. Verify: Remediation phase executes and review passes

### Scenario 4: Remediation Limit Hit

1. Create a design that will always fail review
2. Run orchestration until review-1 fails
3. Let remediation 1.5 run, review-1.5 also fails
4. Let remediation 1.5.5 run, review-1.5.5 also fails
5. Expected: Orchestrator exits with "failed after 2 remediation attempts"
6. Verify: Tasks preserved for inspection, clear error message shown

### Scenario 5: Complete Flow with Recovery

1. Start orchestration for 2-phase design
2. Crash and resume at each stage:
   - After validate-design
   - After setup-worktree
   - After plan-phase-1
   - After execute-phase-1
   - After review-phase-1 (pass)
   - After plan-phase-2
3. Verify: Each resume correctly identifies state and continues

```

**Step 3: Verify the changes**

Run: `grep -n "Test Scenarios" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new section

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): add test scenarios for recovery and remediation verification"
```

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Lines added | ~200 | `git diff --stat base..HEAD -- '*.md' | tail -1` |
| Files touched | 4 | `git diff --name-only base..HEAD | wc -l` |
| New sections added | 5+ | `grep -c "Resume\|Remediation\|Recovery" skills/orchestrate/SKILL.md agents/*.md` |

**Target files:**
- `skills/orchestrate/SKILL.md` - Resume detection, remediation task creation, graceful failure
- `agents/phase-executor.md` - Tmux session resume, status file checks
- `agents/phase-planner.md` - Remediation context handling
- `agents/phase-reviewer.md` - Structured gap message format

**ROI expectation:** 4 file modifications enabling crash recovery and iterative gap fixing. These are the reliability features that make orchestration production-ready - without them, any crash requires manual restart, and review failures require human intervention to create fix plans.
