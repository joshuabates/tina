---
name: orchestrate
description: Use when you have a design document with multiple phases and want fully automated execution from design to implementation
---

# EXECUTE THESE STEPS IN ORDER

You are a TEAM LEAD coordinating TEAMMATES. Do not do the work yourself - spawn teammates.

## FORBIDDEN ACTIONS
- Doing work that teammates should do (validation, worktree setup, planning, execution)
- Reading plan content (only track file paths)
- Implementing code directly
- Combining command and Enter in one tmux send-keys call

## ALLOWED ACTIONS
- Creating team and tasks
- Spawning teammates
- Processing teammate messages
- Updating task dependencies and metadata

---

## STEP 1: Parse invocation and extract info

```bash
# Parse --model argument if provided
# Invocation: /tina:orchestrate [--model <model>] <design-doc-path>
# Examples:
#   /tina:orchestrate docs/plans/feature-design.md
#   /tina:orchestrate --model haiku docs/plans/feature-design.md

MODEL_OVERRIDE=""  # empty means planner decides per-task
if [[ "$1" == "--model" ]]; then
    MODEL_OVERRIDE="$2"  # haiku or opus
    DESIGN_DOC="$3"
else
    DESIGN_DOC="$1"
fi

TOTAL_PHASES=$(grep -cE "^##+ Phase [0-9]" "$DESIGN_DOC")
FEATURE_NAME=$(basename "$DESIGN_DOC" | sed 's/^[0-9-]*//; s/-design\.md$//')
TEAM_NAME="${FEATURE_NAME}-orchestration"
```

If `MODEL_OVERRIDE` is set, pass it to phase-planner prompts so all tasks use that model.

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

Use Teammate tool:
```json
{
  "operation": "spawnTeam",
  "team_name": "<feature-name>-orchestration",
  "description": "Orchestrating <feature-name> from design doc: <path>"
}
```

---

## STEP 3: Create all tasks with dependencies

Create tasks representing all orchestration work. Dependencies enforce sequencing.

**Tasks to create:**

1. `validate-design` - No dependencies
2. `setup-worktree` - Blocked by: validate-design
3. For each phase N (1 to TOTAL_PHASES):
   - `plan-phase-N` - Blocked by: setup-worktree (if N=1) or review-phase-(N-1)
   - `execute-phase-N` - Blocked by: plan-phase-N
   - `review-phase-N` - Blocked by: execute-phase-N
4. `finalize` - Blocked by: review-phase-(TOTAL_PHASES)

Use TaskCreate for each, then TaskUpdate to set dependencies.

Example for 2-phase design:
```
TaskCreate: validate-design
TaskCreate: setup-worktree
TaskCreate: plan-phase-1
TaskCreate: execute-phase-1
TaskCreate: review-phase-1
TaskCreate: plan-phase-2
TaskCreate: execute-phase-2
TaskCreate: review-phase-2
TaskCreate: finalize

TaskUpdate: setup-worktree, addBlockedBy: [validate-design]
TaskUpdate: plan-phase-1, addBlockedBy: [setup-worktree]
TaskUpdate: execute-phase-1, addBlockedBy: [plan-phase-1]
TaskUpdate: review-phase-1, addBlockedBy: [execute-phase-1]
TaskUpdate: plan-phase-2, addBlockedBy: [review-phase-1]
TaskUpdate: execute-phase-2, addBlockedBy: [plan-phase-2]
TaskUpdate: review-phase-2, addBlockedBy: [execute-phase-2]
TaskUpdate: finalize, addBlockedBy: [review-phase-2]
```

---

## STEP 4: Spawn first teammate

The validate-design task has no blockers. Spawn the design validator:

Use Task tool:
```json
{
  "subagent_type": "tina:design-validator",
  "team_name": "<feature-name>-orchestration",
  "name": "validator",
  "prompt": "Design doc: <DESIGN_DOC>\nOutput file: .claude/tina/validation/design-report.md\n\nValidate this design and write your report. Return ONLY: VALIDATION_STATUS: Pass/Warning/Stop"
}
```

---

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

## STEP 5: Event loop - React to teammate messages

After spawning a teammate, wait for their message. Based on the message content, take the appropriate action:

### Message Handlers

**"validate complete" or "VALIDATION_STATUS: Pass/Warning":**
1. Mark validate-design task complete
2. Spawn worktree-setup teammate:
```json
{
  "subagent_type": "tina:worktree-setup",
  "team_name": "<feature-name>-orchestration",
  "name": "worktree-setup",
  "prompt": "feature_name: <FEATURE_NAME>\ndesign_doc_path: <DESIGN_DOC>"
}
```

**"VALIDATION_STATUS: Stop":**
1. Mark validate-design task complete with failure metadata
2. Report validation failure to user
3. Exit orchestration

**"setup-worktree complete" with worktree_path:**
1. Mark setup-worktree task complete
2. Store worktree_path in task metadata
3. Spawn phase-planner for phase 1:
```json
{
  "subagent_type": "tina:phase-planner",
  "team_name": "<feature-name>-orchestration",
  "name": "planner-1",
  "prompt": "phase_num: 1\ndesign_doc_path: <DESIGN_DOC>\nmodel_override: <MODEL_OVERRIDE or empty>"
}
```
Note: Include `model_override` only if MODEL_OVERRIDE was set from `--model` arg.

**"plan-phase-N complete" with PLAN_PATH:**
1. Mark plan-phase-N task complete
2. Store PLAN_PATH in task metadata
3. Retrieve worktree_path from setup-worktree task metadata
4. Spawn phase-executor:
```json
{
  "subagent_type": "tina:phase-executor",
  "team_name": "<feature-name>-orchestration",
  "name": "executor-N",
  "prompt": "phase_num: N\nworktree_path: <WORKTREE_PATH>\nplan_path: <PLAN_PATH>\nfeature_name: <FEATURE_NAME>"
}
```

**"execute-N complete" with git_range:**
1. Mark execute-phase-N task complete
2. Store git_range in task metadata
3. Spawn phase-reviewer:
```json
{
  "subagent_type": "tina:phase-reviewer",
  "team_name": "<feature-name>-orchestration",
  "name": "reviewer-N",
  "prompt": "phase_num: N\nworktree_path: <WORKTREE_PATH>\ndesign_doc_path: <DESIGN_DOC>\ngit_range: <GIT_RANGE>"
}
```

**"review-N complete (pass)":**
1. Mark review-phase-N task complete with status: pass
2. If more phases remain: spawn planner for phase N+1
3. If last phase: mark finalize task as in_progress, invoke finishing workflow

**"review-N complete (gaps)" with issues:**
1. Mark review-phase-N task complete with status: gaps, issues in metadata
2. Create remediation tasks:
   - plan-phase-N.5
   - execute-phase-N.5
   - review-phase-N.5
3. Update dependencies: review-N.5 blocks plan-(N+1)
4. Spawn planner for phase N.5

**"error: X":**
1. Log error details
2. Attempt one retry (re-spawn teammate)
3. If still fails: escalate to user

---

## STEP 6: Finalize

When finalize task becomes unblocked (all reviews passed):

1. Invoke `tina:finishing-a-development-branch` skill
2. Present merge/PR/cleanup options to user
3. Mark finalize task complete when user chooses

---

The full skill with details follows.

---

# Team-Based Orchestration

## Overview

Automates the full development pipeline from design document to implementation using a team-based model. The orchestrator is a team lead that coordinates teammates, not a single agent doing everything.

**Core principle:** Orchestrator maintains minimal context - it only sees teammate messages, not implementation details. Each teammate (validator, worktree-setup, planner, executor, reviewer) handles one specific responsibility.

**Announce at start:** "I'm using the orchestrate skill to coordinate a team for implementing this design."

## Orchestrator as Team Lead

The orchestrator creates a team (e.g., `auth-feature-orchestration`) and populates it with tasks:

```
[] validate-design
[] setup-worktree          (blocked by: validate)
[] plan-phase-1            (blocked by: setup-worktree)
[] execute-phase-1         (blocked by: plan-1)
[] review-phase-1          (blocked by: execute-1)
[] plan-phase-2            (blocked by: review-1)
...
[] finalize                (blocked by: review-N)
```

Dependencies enforce sequencing automatically.

## Teammate Types

| Agent | Claims | Responsibility |
|-------|--------|----------------|
| `tina:design-validator` | validate-design | Validate design doc, capture baseline metrics |
| `tina:worktree-setup` | setup-worktree | Create worktree, install statusline config |
| `tina:phase-planner` | plan-phase-N | Create implementation plan, validate plan |
| `tina:phase-executor` | execute-phase-N | Start team-lead in tmux, monitor progress |
| `tina:phase-reviewer` | review-phase-N | Review completed phase, report pass/fail/gaps |

## Task Metadata as State

Task metadata carries orchestration state:

| Data | Location |
|------|----------|
| Design doc path | Team description |
| Worktree path | setup-worktree task metadata |
| Plan path | plan-phase-N task metadata |
| Git range | execute-phase-N task metadata |
| Review findings | review-phase-N task metadata |

No separate supervisor-state.json needed.

## User Status Display

**At orchestration start:**
```
===============================================================
ORCHESTRATING: <design doc name>
Team: <team-name>-orchestration
Phases: <N> total
===============================================================
```

**When teammate completes:**
```
---------------------------------------------------------------
<TASK NAME>: Complete
  Next: <next task being spawned>
---------------------------------------------------------------
```

**At orchestration completion:**
```
===============================================================
ORCHESTRATION COMPLETE
All <N> phases finished successfully.
Ready for merge/PR workflow.
===============================================================
```

## When to Use

- You have a complete design document with `## Phase N` sections
- You want fully automated execution without manual intervention
- The design has been reviewed by `tina:architect`

## When NOT to Use

- Design is incomplete or unapproved
- You want manual control over each phase
- Single-phase designs (use `tina:writing-plans` + `tina:executing-plans` directly)

## Invocation

```
/tina:orchestrate docs/plans/2026-01-26-myfeature-design.md
```

## Implementation Details

### Task Creation

Create all tasks upfront with proper dependencies. This is done ONCE at orchestration start.

**Step-by-step task creation:**

1. **Extract design info:**
```bash
DESIGN_DOC="$1"
TOTAL_PHASES=$(grep -cE "^##+ Phase [0-9]" "$DESIGN_DOC")
FEATURE_NAME=$(basename "$DESIGN_DOC" | sed 's/^[0-9-]*//; s/-design\.md$//')
TEAM_NAME="${FEATURE_NAME}-orchestration"
```

2. **Create the team:**
```json
{
  "operation": "spawnTeam",
  "team_name": "<TEAM_NAME>",
  "description": "Orchestrating <FEATURE_NAME> from <DESIGN_DOC>"
}
```

3. **Create validate-design task:**
```json
TaskCreate {
  "subject": "validate-design",
  "description": "Validate design document at <DESIGN_DOC>. Run baseline commands if specified in Success Metrics section.",
  "activeForm": "Validating design document"
}
```

4. **Create setup-worktree task:**
```json
TaskCreate {
  "subject": "setup-worktree",
  "description": "Create isolated worktree for <FEATURE_NAME>. Provision statusline config and install dependencies.",
  "activeForm": "Setting up worktree"
}
```

5. **Create phase tasks (for each phase 1 to N):**
```json
TaskCreate {
  "subject": "plan-phase-<N>",
  "description": "Create implementation plan for phase <N> of <FEATURE_NAME>.",
  "activeForm": "Planning phase <N>"
}

TaskCreate {
  "subject": "execute-phase-<N>",
  "description": "Execute phase <N> by starting team-lead in tmux with the plan.",
  "activeForm": "Executing phase <N>"
}

TaskCreate {
  "subject": "review-phase-<N>",
  "description": "Review completed phase <N> implementation against design requirements.",
  "activeForm": "Reviewing phase <N>"
}
```

6. **Create finalize task:**
```json
TaskCreate {
  "subject": "finalize",
  "description": "Complete orchestration by presenting merge/PR/cleanup options.",
  "activeForm": "Finalizing orchestration"
}
```

7. **Set up dependencies (all at once after task creation):**

```
TaskUpdate: { taskId: "setup-worktree", addBlockedBy: ["validate-design"] }
TaskUpdate: { taskId: "plan-phase-1", addBlockedBy: ["setup-worktree"] }
TaskUpdate: { taskId: "execute-phase-1", addBlockedBy: ["plan-phase-1"] }
TaskUpdate: { taskId: "review-phase-1", addBlockedBy: ["execute-phase-1"] }

# For phase 2 onwards:
TaskUpdate: { taskId: "plan-phase-2", addBlockedBy: ["review-phase-1"] }
TaskUpdate: { taskId: "execute-phase-2", addBlockedBy: ["plan-phase-2"] }
TaskUpdate: { taskId: "review-phase-2", addBlockedBy: ["execute-phase-2"] }
# ... continue for all phases

TaskUpdate: { taskId: "finalize", addBlockedBy: ["review-phase-<TOTAL_PHASES>"] }
```

**Why create all tasks upfront:**
- Dependencies are explicit and visible
- TaskList shows full orchestration scope
- Recovery is simple: read task list, find incomplete tasks
- No hidden state to track

**Task metadata storage:**
When teammates complete, store results in task metadata:
```json
TaskUpdate {
  "taskId": "setup-worktree",
  "metadata": { "worktree_path": "/path/to/worktree", "branch": "tina/feature" }
}
```

Later tasks can read this metadata to get paths they need.

### Spawning Teammates

When a task becomes unblocked (all blockedBy tasks complete), spawn the appropriate teammate.

**Getting metadata from completed tasks:**

Before spawning, often need data from earlier tasks. Use TaskGet to retrieve:

```bash
# Example: Get worktree path for executor
WORKTREE_TASK=$(TaskGet { taskId: "setup-worktree" })
WORKTREE_PATH=$WORKTREE_TASK.metadata.worktree_path

# Example: Get plan path for executor
PLAN_TASK=$(TaskGet { taskId: "plan-phase-$N" })
PLAN_PATH=$PLAN_TASK.metadata.plan_path
```

**Design validator spawn:**

When: validate-design task is unblocked (always first)
```json
{
  "subagent_type": "tina:design-validator",
  "team_name": "<TEAM_NAME>",
  "name": "validator",
  "prompt": "Design doc: <DESIGN_DOC>\nOutput file: .claude/tina/validation/design-report.md\n\nValidate this design and write your report to the output file.\nReturn ONLY: VALIDATION_STATUS: Pass/Warning/Stop"
}
```
Then: Mark validate-design as in_progress

**Worktree setup spawn:**

When: validate-design complete with Pass or Warning
Prerequisites: None (uses design doc path from team description)
```json
{
  "subagent_type": "tina:worktree-setup",
  "team_name": "<TEAM_NAME>",
  "name": "worktree-setup",
  "prompt": "feature_name: <FEATURE_NAME>\ndesign_doc_path: <DESIGN_DOC>\n\nCreate worktree and provision statusline config.\nReport: setup-worktree complete. worktree_path: <PATH>, branch: <BRANCH>"
}
```
Then: Mark setup-worktree as in_progress

**Phase planner spawn:**

When: setup-worktree complete (for phase 1) OR review-phase-(N-1) complete with pass (for phase N>1)
Prerequisites: Need DESIGN_DOC from team description
```json
{
  "subagent_type": "tina:phase-planner",
  "team_name": "<TEAM_NAME>",
  "name": "planner-<N>",
  "prompt": "phase_num: <N>\ndesign_doc_path: <DESIGN_DOC>\nmodel_override: <MODEL_OVERRIDE or empty>\n\nCreate implementation plan for phase <N>.\nReport: plan-phase-<N> complete. PLAN_PATH: <PATH>"
}
```
Include `model_override` only if set from `--model` arg.
Then: Mark plan-phase-N as in_progress

**Phase executor spawn:**

When: plan-phase-N complete
Prerequisites: Need worktree_path (from setup-worktree metadata), plan_path (from plan-phase-N metadata)

Derive phase team name:
```
PHASE_TEAM_NAME="${FEATURE_NAME}-phase-${N}"
```

```json
{
  "subagent_type": "tina:phase-executor",
  "team_name": "<TEAM_NAME>",
  "name": "executor-<N>",
  "prompt": "phase_num: <N>\nworktree_path: <WORKTREE_PATH>\nplan_path: <PLAN_PATH>\nfeature_name: <FEATURE_NAME>\nphase_team_name: <PHASE_TEAM_NAME>\n\nStart team-lead in tmux and monitor until phase completes.\nReport: execute-<N> complete. Git range: <BASE>..<HEAD>"
}
```

Store phase team name in task metadata:
```json
TaskUpdate {
  "taskId": "execute-phase-N",
  "metadata": {
    "phase_team_name": "<PHASE_TEAM_NAME>"
  }
}
```

Then: Mark execute-phase-N as in_progress

**Phase reviewer spawn:**

When: execute-phase-N complete
Prerequisites: Need worktree_path, design_doc, git_range (from execute-phase-N metadata)
```json
{
  "subagent_type": "tina:phase-reviewer",
  "team_name": "<TEAM_NAME>",
  "name": "reviewer-<N>",
  "prompt": "phase_num: <N>\nworktree_path: <WORKTREE_PATH>\ndesign_doc_path: <DESIGN_DOC>\ngit_range: <GIT_RANGE>\n\nReview phase <N> implementation.\nReport: review-<N> complete (pass) OR review-<N> complete (gaps): <issue list>"
}
```
Then: Mark review-phase-N as in_progress

**Teammate lifecycle:**

1. Spawn teammate with Task tool
2. Mark task as in_progress via TaskUpdate
3. Wait for teammate message
4. Parse message content
5. Store relevant data in task metadata
6. Mark task as completed
7. Check TaskList for newly unblocked tasks
8. Spawn next teammate

### Phase Executor Monitoring

The phase executor monitors the phase execution team using `tina-monitor` CLI:

```bash
PHASE_TEAM_NAME="$1"  # from prompt

# Wait for team to be created
while ! tina-monitor status team "$PHASE_TEAM_NAME" --format=json &>/dev/null; do
  sleep 2
done

# Monitor until complete or blocked
while true; do
  STATUS=$(tina-monitor status team "$PHASE_TEAM_NAME" --format=json)
  TEAM_STATUS=$(echo "$STATUS" | jq -r '.status')

  case "$TEAM_STATUS" in
    complete)
      GIT_RANGE=$(echo "$STATUS" | jq -r '.metadata.git_range // empty')
      # Report completion to orchestrator
      break
      ;;
    blocked)
      REASON=$(echo "$STATUS" | jq -r '.blocked_reason')
      # Report blocked status to orchestrator
      break
      ;;
    *)
      sleep 10
      ;;
  esac
done
```

**Fallback:** If `tina-monitor` is not installed, fall back to reading `.claude/tina/phase-N/status.json` directly:

```bash
STATUS_FILE="${WORKTREE_PATH}/.claude/tina/phase-${PHASE_NUM}/status.json"
if [ -f "$STATUS_FILE" ]; then
  PHASE_STATUS=$(jq -r '.status' "$STATUS_FILE")
fi
```

### Task Metadata Convention

Orchestration tasks store metadata for monitoring and recovery:

| Task | Required Metadata |
|------|-------------------|
| `validate-design` | `validation_status: "pass"\|"warning"\|"stop"` |
| `setup-worktree` | `worktree_path`, `branch_name` |
| `plan-phase-N` | `plan_path` |
| `execute-phase-N` | `phase_team_name`, `started_at` |
| `execute-phase-N` (on complete) | `git_range`, `completed_at` |
| `review-phase-N` | `status: "pass"\|"gaps"`, `issues[]` (if gaps) |

The `phase_team_name` field links the orchestrator's task to the phase execution team. This enables:
- TUI to show nested task progress
- CLI to query phase status
- Recovery to find the right team

### Event Loop

The orchestrator is event-driven: it waits for teammate messages and reacts. No polling.

**Message delivery:**
Messages from teammates are automatically delivered when you're between turns. The UI shows "Queued teammate messages" when messages are waiting.

**Message parsing patterns:**

Each teammate sends a structured completion message. Parse these patterns:

| Teammate | Success Pattern | Failure Pattern |
|----------|----------------|-----------------|
| validator | `VALIDATION_STATUS: Pass` or `VALIDATION_STATUS: Warning` | `VALIDATION_STATUS: Stop` |
| worktree-setup | `setup-worktree complete. worktree_path: X, branch: Y` | `setup-worktree error: X` |
| planner-N | `plan-phase-N complete. PLAN_PATH: X` | `plan-phase-N error: X` |
| executor-N | `execute-N complete. Git range: X..Y` | `execute-N error: X` |
| reviewer-N | `review-N complete (pass)` or `review-N complete (gaps): X` | `review-N error: X` |

**Event handlers:**

**On validator message:**
```
if message contains "VALIDATION_STATUS: Pass" or "VALIDATION_STATUS: Warning":
    TaskUpdate: validate-design, status: completed
    TaskUpdate: validate-design, metadata: { validation_status: "pass" or "warning" }
    Spawn worktree-setup teammate
    Print: "Design validated. Setting up worktree..."

if message contains "VALIDATION_STATUS: Stop":
    TaskUpdate: validate-design, status: completed
    TaskUpdate: validate-design, metadata: { validation_status: "stop" }
    Print: "Design validation FAILED. See .claude/tina/validation/design-report.md"
    Exit orchestration
```

**On worktree-setup message:**
```
if message contains "setup-worktree complete":
    Parse: worktree_path from "worktree_path: X"
    Parse: branch from "branch: Y"
    TaskUpdate: setup-worktree, status: completed
    TaskUpdate: setup-worktree, metadata: { worktree_path: X, branch: Y }
    Spawn planner-1 teammate
    Print: "Worktree created at X. Planning phase 1..."

if message contains "error":
    TaskUpdate: setup-worktree, status: completed, metadata: { error: message }
    Print error and exit
```

**On planner-N message:**
```
if message contains "plan-phase-N complete":
    Parse: PLAN_PATH from "PLAN_PATH: X"
    TaskUpdate: plan-phase-N, status: completed
    TaskUpdate: plan-phase-N, metadata: { plan_path: X }

    # Get worktree path from earlier task
    worktree_task = TaskGet: setup-worktree
    worktree_path = worktree_task.metadata.worktree_path

    Spawn executor-N teammate with plan_path and worktree_path
    Print: "Phase N planned. Executing..."

if message contains "error":
    Retry once, then exit with error
```

**On executor-N message:**
```
if message contains "execute-N complete":
    Parse: git_range from "Git range: X..Y"
    TaskUpdate: execute-phase-N, status: completed
    TaskUpdate: execute-phase-N, metadata: { git_range: X..Y }

    # Get worktree path and design doc for reviewer
    worktree_task = TaskGet: setup-worktree
    worktree_path = worktree_task.metadata.worktree_path

    Spawn reviewer-N teammate
    Print: "Phase N executed. Reviewing..."

if message contains "session_died" or "error":
    Retry once, then exit with error
```

**On reviewer-N message:**
```
if message contains "review-N complete (pass)":
    TaskUpdate: review-phase-N, status: completed
    TaskUpdate: review-phase-N, metadata: { status: "pass" }

    if N < TOTAL_PHASES:
        Spawn planner-(N+1) teammate
        Print: "Phase N passed review. Planning phase N+1..."
    else:
        # Last phase - finalize
        Mark finalize as in_progress
        Invoke tina:finishing-a-development-branch
        Print: "All phases complete. Ready for merge/PR workflow."

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
        model_override: <MODEL_OVERRIDE or empty>
        remediation_for: phase ${N}
        issues: <issues list>

    Print: "Phase ${N} has gaps. Creating remediation phase ${REMEDIATION_PHASE}..."

if message contains "error":
    Exit with error
```

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
===============================================================
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
===============================================================
```

Do NOT clean up team or tasks automatically - preserve state for debugging.

### Remediation Flow

When a reviewer reports gaps, create a full remediation phase with plan/execute/review cycle.

**Trigger:** Message from reviewer-N containing `review-N complete (gaps): <issues>`

**Step-by-step remediation creation:**

1. **Parse the gaps from reviewer message:**
```
issues = parse issues from "review-N complete (gaps): test coverage below 80%, missing error handling"
# Result: ["test coverage below 80%", "missing error handling"]
```

2. **Create remediation tasks:**
```json
TaskCreate {
  "subject": "plan-phase-<N>.5",
  "description": "Plan remediation for phase <N> gaps: <issues>",
  "activeForm": "Planning phase <N>.5 remediation"
}

TaskCreate {
  "subject": "execute-phase-<N>.5",
  "description": "Execute remediation plan for phase <N>",
  "activeForm": "Executing phase <N>.5 remediation"
}

TaskCreate {
  "subject": "review-phase-<N>.5",
  "description": "Review remediation for phase <N>",
  "activeForm": "Reviewing phase <N>.5 remediation"
}
```

3. **Set up remediation dependencies:**
```
# Internal dependencies for remediation phase
TaskUpdate: execute-phase-N.5, addBlockedBy: [plan-phase-N.5]
TaskUpdate: review-phase-N.5, addBlockedBy: [execute-phase-N.5]

# Remediation blocks the next phase (or finalize)
if N < TOTAL_PHASES:
    # Update plan-phase-(N+1) to depend on remediation review
    TaskUpdate: plan-phase-(N+1), addBlockedBy: [review-phase-N.5]
    # Note: plan-phase-(N+1) was blocked by review-phase-N, now also by review-phase-N.5
else:
    # Last phase - finalize waits for remediation
    TaskUpdate: finalize, addBlockedBy: [review-phase-N.5]
```

4. **Store remediation context in metadata:**
```json
TaskUpdate {
  "taskId": "plan-phase-N.5",
  "metadata": {
    "parent_phase": N,
    "issues": ["test coverage below 80%", "missing error handling"],
    "original_review_task": "review-phase-N"
  }
}
```

5. **Spawn remediation planner:**
```json
{
  "subagent_type": "tina:phase-planner",
  "team_name": "<TEAM_NAME>",
  "name": "planner-<N>.5",
  "prompt": "phase_num: <N>.5\ndesign_doc_path: <DESIGN_DOC>\nmodel_override: <MODEL_OVERRIDE or empty>\nremediation_for: phase <N>\nissues: <issues list>\n\nCreate implementation plan to address these specific gaps.\nReport: plan-phase-<N>.5 complete. PLAN_PATH: <PATH>"
}
```
Include `model_override` only if set from `--model` arg.

**Remediation planner guidance:**

The planner for remediation phases receives extra context:
- `remediation_for`: The original phase number
- `issues`: Specific gaps to address

The plan should:
- Focus ONLY on the identified gaps
- Not redo work that passed review
- Be smaller scope than original phase

**Remediation review:**

The reviewer for N.5 checks ONLY:
- Were the specific gaps addressed?
- Did the remediation introduce new issues?

If remediation review also finds gaps, create another remediation (N.5.5). However, after 2 remediation cycles, escalate to user.

**Remediation limit tracking:**
```json
TaskUpdate {
  "taskId": "review-phase-N.5",
  "metadata": { "remediation_depth": 1 }
}
```

If `remediation_depth >= 2` and still finding gaps, exit with error requiring human intervention.

## Model Policy

| Agent | Model | Rationale |
|-------|-------|-----------|
| Orchestrator | opus | Coordinates team, handles complex decisions |
| Design Validator | opus | Analyzes feasibility, runs baseline commands |
| Worktree Setup | haiku | Straightforward provisioning tasks |
| Phase Planner | opus | Creates detailed plans, needs codebase understanding |
| Phase Executor | haiku | Tmux management and file monitoring |
| Phase Reviewer | opus | Analyzes implementation quality |

## Recovery

### Task List as Source of Truth

The task list IS the recovery mechanism. All orchestration state lives in:
- Task status (pending, in_progress, completed)
- Task metadata (worktree_path, plan_path, git_range, etc.)
- Task dependencies (blockedBy relationships)

No separate supervisor-state.json needed.

### Detecting Existing Orchestration

When orchestrate is invoked, check if orchestration already exists for this design doc:

```bash
# Extract feature name from design doc
FEATURE_NAME=$(basename "$DESIGN_DOC" | sed 's/^[0-9-]*//; s/-design\.md$//')
TEAM_NAME="${FEATURE_NAME}-orchestration"

# Check if team config exists
TEAM_CONFIG="$HOME/.claude/teams/${TEAM_NAME}.json"
if [ -f "$TEAM_CONFIG" ]; then
    echo "Found existing orchestration team: $TEAM_NAME"
    # Resume from task list
else
    echo "Starting new orchestration"
    # Create team and tasks from scratch
fi
```

### Resumption Logic

When resuming from existing task list:

**Step 1: Read task list**
```
TaskList
# Returns all tasks with their status and dependencies
```

**Step 2: Find current state**
```
for each task in TaskList:
    if task.status == "in_progress":
        CURRENT_TASK = task
        break
    if task.status == "pending" and task.blockedBy all complete:
        NEXT_TASK = task
```

**Step 3: Resume based on state**

| State | Action |
|-------|--------|
| in_progress task found | Check if teammate still active, respawn if not |
| No in_progress, have pending unblocked | Spawn teammate for next task |
| All tasks complete except finalize | Invoke finishing workflow |
| All tasks complete | Report completion |

**Step 4: Check teammate health**

If task is in_progress, the teammate might be:
- Still running (wait for message)
- Dead (respawn)
- Never started (spawn)

Check by looking at recent messages and task metadata.

### Crash Scenarios

**Orchestrator crashes mid-task:**
1. User reruns `/tina:orchestrate design.md`
2. Orchestrator finds existing team
3. Reads task list, finds in_progress task
4. Respawns teammate for that task
5. Continues normally

**Teammate crashes:**
1. Orchestrator doesn't receive completion message
2. After timeout (handled by orchestrator turning idle), orchestrator checks task status
3. Task still in_progress but no teammate messages -> respawn
4. Retry count tracked in metadata (max 1 retry)

**Tmux session crashes (executor's tmux):**
1. Executor teammate detects session died
2. Executor messages orchestrator: "execute-N error: session_died"
3. Orchestrator respawns executor
4. Executor checks for existing session, starts new one if needed
5. If phase was complete (status.json shows complete), proceed to reviewer

### Manual Recovery Commands

If automatic recovery fails, user can:

1. **Check current state:**
```
TaskList
# Shows all tasks with status
```

2. **Force respawn a teammate:**
```
# Mark task back to pending, then spawn manually
TaskUpdate { taskId: "execute-phase-1", status: "pending" }
# Then rerun orchestrate to pick it up
```

3. **Skip a task (mark complete without running):**
```
TaskUpdate { taskId: "review-phase-1", status: "completed", metadata: { manual_skip: true } }
```

4. **Clean up and restart:**
```
# Delete team config and task directory
rm -rf ~/.claude/teams/${TEAM_NAME}.json
rm -rf ~/.claude/tasks/${TEAM_NAME}/
# Then rerun orchestrate for fresh start
```

### Prevention

To minimize recovery needs:
- Each teammate is stateless and idempotent
- Task metadata persists across crashes
- Dependencies automatically gate execution
- Retries are built in (1 per task)

## Integration

**Spawns:**
- `tina:design-validator` - Validates design before work begins
- `tina:worktree-setup` - Creates isolated workspace
- `tina:phase-planner` - Creates implementation plans
- `tina:phase-executor` - Runs team-lead in tmux
- `tina:phase-reviewer` - Reviews completed phases

**Invokes:**
- `tina:finishing-a-development-branch` - Handles merge/PR/cleanup

**Uses:**
- TaskCreate, TaskUpdate, TaskList, TaskGet - Task management
- Teammate tool - Team creation and messaging

## Failure Modes and Handling

### Teammate Never Responds

**Symptoms:** Orchestrator waits indefinitely for teammate message.

**Cause:** Teammate crashed without sending error message, or teammate is stuck in infinite loop.

**Detection:** Manual observation (no automatic timeout in current design).

**Handling:**
1. User notices orchestration stalled
2. User checks task list: `TaskList`
3. User finds in_progress task with no recent activity
4. User manually marks task failed or respawns teammate

**Future improvement:** Add heartbeat messages from teammates, or orchestrator-side timeout.

### Tmux Session Dies Mid-Phase

**Symptoms:** Executor reports "session_died" error.

**Cause:** Claude CLI crashed, user killed session, system OOM.

**Detection:** Executor's `tmux has-session` check fails.

**Handling:**
1. Executor messages orchestrator with error
2. Orchestrator respawns executor
3. New executor checks status.json:
   - If complete: proceed to review
   - If executing: start new tmux session, team-lead detects existing team and resumes
   - If not started: start fresh

**Caveat:** If team-lead wrote partial work but didn't update status, work may be repeated.

### Review Fails Repeatedly (Remediation Loop)

**Symptoms:** Multiple N.5, N.5.5 phases created and all fail.

**Cause:** Fundamental design flaw, or reviewer has unreachable standards.

**Detection:** Remediation depth reaches 2.

**Handling:**
1. Orchestrator exits with "failed after 2 remediation attempts"
2. Tasks preserved for manual inspection
3. User must manually fix or adjust design

**Future improvement:** Surface specific issues to user for targeted intervention.

### Task Dependency Cycle

**Symptoms:** Tasks blocked indefinitely, no progress.

**Cause:** Bug in dependency setup (e.g., task A blocks B, B blocks A).

**Detection:** Manual observation - all tasks pending but none unblocked.

**Handling:**
1. User runs TaskList
2. User identifies circular dependencies
3. User manually updates task dependencies via TaskUpdate

**Prevention:** Orchestrator creates dependencies in strict phase order - no cross-phase back-dependencies.

### Out of Disk Space

**Symptoms:** Various failures - file writes fail, git commits fail.

**Cause:** Worktree, task files, or checkpoint files fill disk.

**Detection:** Error messages mentioning "no space left" or "disk full".

**Handling:**
1. Manual cleanup of old worktrees: `rm -rf .worktrees/old-feature`
2. Clean up old tasks: `rm -rf ~/.claude/tasks/old-orchestration/`
3. Resume orchestration

### Git Conflicts in Worktree

**Symptoms:** Git commands fail in team-lead session.

**Cause:** Main branch advanced while feature work ongoing, merge needed.

**Detection:** Git error messages in tmux output.

**Handling:**
1. Current design does not auto-handle conflicts
2. User must manually resolve in worktree
3. Then resume team-lead (if still running) or restart phase

**Future improvement:** Worktree setup could track main branch position, executor could detect divergence.

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

### Manual Testing Checklist

Before using orchestration on real work, verify these behaviors manually:

**Basic Flow:**
- [ ] Run `/tina:orchestrate docs/plans/test-fixtures/minimal-orchestration-test-design.md`
- [ ] Verify team created: `ls ~/.claude/teams/` shows orchestration team
- [ ] Verify tasks created: `TaskList` shows all expected tasks with dependencies
- [ ] Watch validator spawn and complete
- [ ] Watch worktree-setup create worktree and install config
- [ ] Watch planner create phase-1 plan
- [ ] Watch executor start tmux session
- [ ] Verify tmux session exists: `tmux list-sessions`
- [ ] Watch team-lead execute in tmux
- [ ] Verify reviewer runs and reports pass/gaps
- [ ] Verify finalize presents options

**Recovery (requires intentional interruption):**
- [ ] During plan-phase-1: Ctrl+C orchestrator, restart, verify planner respawns
- [ ] During execute-phase-1: Ctrl+C orchestrator, restart, verify executor resumes
- [ ] With tmux alive: Kill executor only, verify new executor attaches to existing session

**Remediation (requires design that fails review):**
- [ ] Create design with unreachable review criteria
- [ ] Run through execute, observe review fail with gaps
- [ ] Verify remediation tasks created (plan-1.5, execute-1.5, review-1.5)
- [ ] Verify dependencies updated correctly
- [ ] If second remediation needed, verify 1.5.5 created
- [ ] If third would be needed, verify orchestration exits with error

**Cleanup:**
- [ ] After testing: `rm -rf ~/.claude/teams/minimal-orchestration-test-orchestration.json`
- [ ] After testing: `rm -rf ~/.claude/tasks/minimal-orchestration-test-orchestration/`
- [ ] After testing: `rm -rf .worktrees/minimal-orchestration-test/`

## Red Flags

**Never:**
- Do teammate work yourself (that defeats the purpose)
- Read plan content (only track file paths)
- Poll for teammate completion (wait for messages)
- Skip task dependency setup

**Always:**
- Create all tasks upfront with dependencies
- Store data in task metadata, not separate files
- Spawn teammates as tasks become unblocked
- Handle all teammate message types

## Troubleshooting

Common issues and their resolutions:

### No message from teammate

**Symptom:** Orchestrator waits but teammate never responds.

**Possible causes:**
1. Teammate crashed during execution
2. Teammate is stuck in infinite loop
3. Teammate completed but message delivery failed

**Resolution:**
1. Check if teammate is still running: look for active claude processes
2. Check task metadata for any partial updates
3. If teammate dead: mark task as pending, re-run orchestrate to respawn
4. If teammate stuck: kill the process, mark task pending, re-run

### Team already exists error

**Symptom:** `spawnTeam` fails saying team already exists.

**Possible causes:**
1. Previous orchestration for same design doc exists
2. Incomplete cleanup from failed run

**Resolution:**
1. If resuming: skip team creation, go to STEP 5b (Resume Logic)
2. If starting fresh: clean up first:
   ```bash
   rm -rf ~/.claude/teams/<team-name>.json
   rm -rf ~/.claude/tasks/<team-name>/
   ```

### Tasks stuck in pending (none unblocked)

**Symptom:** `TaskList` shows all tasks pending but none have empty `blockedBy`.

**Possible causes:**
1. Circular dependency (bug in task creation)
2. Blocker task completed but not marked complete
3. Missing task in dependency chain

**Resolution:**
1. Run `TaskList` and examine dependencies
2. Find tasks that should be complete but aren't
3. Manually mark them: `TaskUpdate { taskId: "X", status: "completed" }`
4. Or fix circular dependency by removing blocker: `TaskUpdate { taskId: "X", blockedBy: [] }`

### Tmux session exists but executor doesn't see it

**Symptom:** `tmux list-sessions` shows session, but executor creates new one.

**Possible causes:**
1. Session name mismatch (typo in feature name)
2. Executor checking wrong session name pattern

**Resolution:**
1. Check actual session name: `tmux list-sessions`
2. Verify feature name derivation matches
3. If mismatch: kill orphan session, let executor create correct one

### Remediation keeps failing

**Symptom:** Remediation phases (1.5, 1.5.5) created but still failing.

**Possible causes:**
1. Fundamental design flaw
2. Reviewer has unreachable standards
3. Issues not actually fixable within scope

**Resolution:**
1. After 2 remediation cycles, orchestrator exits automatically
2. Read the review files to understand root cause
3. Either:
   - Fix design and restart
   - Adjust reviewer criteria
   - Accept current state and skip review: `TaskUpdate { taskId: "review-N", status: "completed", metadata: { manual_pass: true } }`

### Worktree path not found in metadata

**Symptom:** Executor or reviewer fails because worktree_path is missing.

**Possible causes:**
1. Worktree-setup task completed but didn't store metadata
2. Metadata storage failed

**Resolution:**
1. Check worktree exists: `ls .worktrees/`
2. Manually add metadata:
   ```
   TaskUpdate { taskId: "setup-worktree", metadata: { worktree_path: ".worktrees/feature" } }
   ```

### Git range invalid or missing

**Symptom:** Phase reviewer fails to analyze changes, git diff errors.

**Possible causes:**
1. Executor didn't capture commit range
2. No commits were made during phase
3. Range syntax wrong

**Resolution:**
1. In worktree, check git log: `git log --oneline -10`
2. Identify correct range (first phase commit to HEAD)
3. Manually update metadata:
   ```
   TaskUpdate { taskId: "execute-phase-N", metadata: { git_range: "abc123..def456" } }
   ```

### Teammate spawns but immediately exits

**Symptom:** Task tool returns but no work done, no error message.

**Possible causes:**
1. Teammate prompt missing required info
2. Agent definition has error
3. Permissions issue

**Resolution:**
1. Check the agent definition file exists and is valid
2. Verify prompt includes all required fields (phase_num, paths, etc.)
3. Try spawning manually with verbose output to see error
