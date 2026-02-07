---
name: orchestrate
description: Use when you have a design document with multiple phases and want fully automated execution from design to implementation
---

# EXECUTE THESE STEPS IN ORDER

You are a TEAM LEAD coordinating TEAMMATES. Do not do the work yourself - spawn teammates.

## FORBIDDEN ACTIONS
- Doing work that teammates should do (validation, planning, execution)
- Reading plan content (only track file paths)
- Implementing code directly
- Using raw tmux commands directly (use tina-session CLI instead)

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

## STEP 1a: Check if design is pre-approved

Read the design doc and check for `## Architectural Context` section. If present, the design has already been reviewed by the architect skill and can skip validation:

```bash
if grep -q "^## Architectural Context" "$DESIGN_DOC"; then
    DESIGN_PRE_APPROVED=true
fi
```

This flag is used in STEP 4 to skip spawning the design validator.

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

## STEP 1c: Initialize orchestration and create worktree

Before creating the team, initialize the orchestration. This creates the git worktree, statusline config, supervisor-state.json, and SQLite record all at once:

```bash
WORKTREE_PATH=$(tina-session init \
  --feature "$FEATURE_NAME" \
  --cwd "$PWD" \
  --design-doc "$DESIGN_DOC" \
  --branch "tina/$FEATURE_NAME" \
  --total-phases "$TOTAL_PHASES")
```

The command prints the worktree path to stdout. Capture it - you'll store it in task metadata for later tasks to use.

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
2. For each phase N (1 to TOTAL_PHASES):
   - `plan-phase-N` - Blocked by: validate-design (if N=1) or review-phase-(N-1)
   - `execute-phase-N` - Blocked by: plan-phase-N
   - `review-phase-N` - Blocked by: execute-phase-N
3. `finalize` - Blocked by: review-phase-(TOTAL_PHASES)

Note: Worktree creation is handled by `tina-session init` in STEP 1c. There is no setup-worktree task.

Use TaskCreate for each, then TaskUpdate to set dependencies.

Example for 2-phase design:
```
TaskCreate: validate-design
TaskCreate: plan-phase-1
TaskCreate: execute-phase-1
TaskCreate: review-phase-1
TaskCreate: plan-phase-2
TaskCreate: execute-phase-2
TaskCreate: review-phase-2
TaskCreate: finalize

TaskUpdate: plan-phase-1, addBlockedBy: [validate-design]
TaskUpdate: execute-phase-1, addBlockedBy: [plan-phase-1]
TaskUpdate: review-phase-1, addBlockedBy: [execute-phase-1]
TaskUpdate: plan-phase-2, addBlockedBy: [review-phase-1]
TaskUpdate: execute-phase-2, addBlockedBy: [plan-phase-2]
TaskUpdate: review-phase-2, addBlockedBy: [execute-phase-2]
TaskUpdate: finalize, addBlockedBy: [review-phase-2]
```

---

## STEP 4: Spawn first teammate (or skip validation)

**If `DESIGN_PRE_APPROVED` is true:**
The design has `## Architectural Context` (added by `tina:architect` on approval). Skip validation:
1. Auto-complete the validate-design task:
   ```
   TaskUpdate: validate-design, status: completed
   TaskUpdate: validate-design, metadata: { validation_status: "pre-approved", worktree_path: "$WORKTREE_PATH" }
   ```
2. Print: `"Design pre-approved (has Architectural Context). Skipping validation."`
3. Check for `## Prerequisites` section in the design doc. If present, show prerequisites to user and ask for confirmation before continuing.
4. Proceed directly to spawning planner for phase 1 (same as the "validate complete" handler in STEP 5). The worktree was already created by `tina-session init` in STEP 1c.

**If `DESIGN_PRE_APPROVED` is false:**
The validate-design task has no blockers. Spawn the design validator:

Use Task tool:
```json
{
  "subagent_type": "tina:design-validator",
  "team_name": "<feature-name>-orchestration",
  "name": "validator",
  "prompt": "task_id: validate-design"
}
```

The agent reads task metadata to get design_doc_path and other parameters. Agent definitions carry methodology (HOW), tasks carry data (WHAT), spawn prompts are minimal (just task ID).

---

## STEP 5b: Resume Logic (when existing team found)

When team already exists, resume from current state using the CLI:

**Step 5b.1: Query CLI for next action**
```bash
NEXT_ACTION=$(tina-session orchestrate next --feature "$FEATURE_NAME")
```

The CLI examines `supervisor-state.json` and returns the correct action based on current phase states.

**Step 5b.2: Also check task list for consistency**
```
TaskList
```
Compare task statuses with the CLI action. The CLI (supervisor-state.json) is authoritative for phase state.

**Step 5b.3: Dispatch the action**

Parse the returned JSON and dispatch the action using the Action Dispatch table in STEP 5.

For example, if the CLI returns `{"action": "spawn_executor", "phase": "2", "plan_path": "/path/to/plan.md"}`, then:
1. Update execute-phase-2 task metadata with plan_path
2. Spawn `tina:phase-executor` for execute-phase-2
3. Continue to the event loop (STEP 5)

**Step 5b.4: Continue to STEP 5 (Event loop)**

After spawning the resumed teammate, continue with normal event loop processing.

---

## STEP 5: Event loop - React to teammate messages (CLI-delegated)

After spawning a teammate, wait for their message. When a message arrives:

1. **Parse the message** to determine the event type
2. **Call the CLI** to advance state and get the next action
3. **Dispatch** the action (spawn teammate, create tasks, etc.)

### CLI Delegation Pattern

Instead of computing state transitions yourself, delegate to the CLI:

```bash
# After receiving a teammate message, advance the state machine:
NEXT_ACTION=$(tina-session orchestrate advance \
  --feature "$FEATURE_NAME" \
  --phase "$PHASE" \
  --event "$EVENT_TYPE" \
  [--plan-path "$PLAN_PATH"] \
  [--git-range "$GIT_RANGE"] \
  [--issues "$ISSUES"])

# Parse the JSON response and dispatch
ACTION=$(echo "$NEXT_ACTION" | jq -r '.action')
```

### Message-to-Event Mapping

| Teammate Message | CLI Event | Extra Args |
|------------------|-----------|------------|
| `VALIDATION_STATUS: Pass` | `validation_pass` | |
| `VALIDATION_STATUS: Warning` | `validation_warning` | |
| `VALIDATION_STATUS: Stop` | `validation_stop` | |
| `plan-phase-N complete. PLAN_PATH: X` | `plan_complete` | `--plan-path X` |
| `execute-N complete. Git range: X..Y` | `execute_complete` | `--git-range X..Y` |
| `review-N complete (pass)` | `review_pass` | |
| `review-N complete (gaps): issues` | `review_gaps` | `--issues "issue1,issue2"` |
| `error: reason` or `session_died` | `error` | `--issues "reason"` |

### Action Dispatch

The CLI returns a JSON object with an `action` field. Dispatch based on action type:

| Action | What to Do |
|--------|------------|
| `spawn_validator` | Spawn `tina:design-validator` teammate (model from `.model` if present) |
| `spawn_planner` | Spawn `tina:phase-planner` for `.phase` (model from `.model` if present) |
| `spawn_executor` | Spawn `tina:phase-executor` for `.phase` (plan at `.plan_path`, model from `.model` if present) |
| `spawn_reviewer` | Spawn `tina:phase-reviewer` for `.phase` (range at `.git_range`, model from `.model` if present) |
| `consensus_disagreement` | Surface to user: "Reviewers disagree on phase `.phase`. Verdict 1: `.verdict_1`, Verdict 2: `.verdict_2`. Please resolve manually." |
| `reuse_plan` | Skip planning, auto-complete plan task, dispatch executor |
| `finalize` | Invoke `tina:finishing-a-development-branch` |
| `complete` | Report orchestration complete |
| `stopped` | Report validation failure and exit |
| `error` | If `.can_retry`, retry once; else escalate to user |
| `remediate` | Create remediation tasks and spawn planner for `.remediation_phase` |

### Handling Each Message

**On validator message:**
1. Determine event: `validation_pass`, `validation_warning`, or `validation_stop`
2. Check for prerequisites in design doc before calling advance (ask user to confirm)
3. Call: `tina-session orchestrate advance --feature X --phase validation --event <event>`
4. Mark validate-design task complete
5. Dispatch returned action

**On planner-N message:**
1. Parse PLAN_PATH from message
2. Call: `tina-session orchestrate advance --feature X --phase N --event plan_complete --plan-path P`
3. Mark plan-phase-N task complete, store plan_path in metadata
4. Dispatch returned action (spawn executor)

**On executor-N message:**
1. Parse git_range from message
2. Call: `tina-session orchestrate advance --feature X --phase N --event execute_complete --git-range R`
3. Mark execute-phase-N task complete, store git_range in metadata
4. Dispatch returned action (spawn reviewer)

**On reviewer-N message:**
1. Determine if pass or gaps
2. Call: `tina-session orchestrate advance --feature X --phase N --event review_pass` (or `review_gaps --issues "..."`)
3. Mark review-phase-N task complete
4. Dispatch returned action (spawn next planner, finalize, or create remediation)

**On error message:**
1. Call: `tina-session orchestrate advance --feature X --phase N --event error --issues "reason"`
2. If action says `can_retry: true`, re-spawn the teammate
3. If `can_retry: false`, escalate to user

### Resume via CLI

When resuming (existing team found in STEP 1b), use:
```bash
NEXT_ACTION=$(tina-session orchestrate next --feature "$FEATURE_NAME")
```

This examines supervisor-state.json and returns the correct action to take (spawn whichever teammate is needed for the current state).

---

## STEP 6: Finalize

When the CLI returns `{"action": "finalize"}`:

1. Invoke `tina:finishing-a-development-branch` skill
2. Present merge/PR/cleanup options to user
3. Mark finalize task complete when user chooses

---

The full skill with details follows.

---

# Team-Based Orchestration

## Overview

Automates the full development pipeline from design document to implementation using a team-based model. The orchestrator is a team lead that coordinates teammates, not a single agent doing everything.

**Core principle:** Orchestrator maintains minimal context - it only sees teammate messages, not implementation details. Each teammate (validator, planner, executor, reviewer) handles one specific responsibility.

**Announce at start:** "I'm using the orchestrate skill to coordinate a team for implementing this design."

## Orchestrator as Team Lead

The orchestrator creates a team (e.g., `auth-feature-orchestration`) and populates it with tasks:

```
[] validate-design
[] plan-phase-1            (blocked by: validate-design)
[] execute-phase-1         (blocked by: plan-1)
[] review-phase-1          (blocked by: execute-1)
[] plan-phase-2            (blocked by: review-1)
...
[] finalize                (blocked by: review-N)
```

Note: Worktree creation is handled by `tina-session init` before the team is created. There is no setup-worktree task.

Dependencies enforce sequencing automatically.

## Teammate Types

| Agent | Claims | Responsibility |
|-------|--------|----------------|
| `tina:design-validator` | validate-design | Validate design doc, capture baseline metrics |
| `tina:phase-planner` | plan-phase-N | Create implementation plan, validate plan |
| `tina:phase-executor` | execute-phase-N | Execute phase plan, report completion |
| `tina:phase-reviewer` | review-phase-N | Review completed phase, report pass/fail/gaps |

## Task Metadata as State

Task metadata carries orchestration state:

| Data | Location |
|------|----------|
| Design doc path | Team description |
| Worktree path | validate-design task metadata (set during init) |
| Plan path | plan-phase-N task metadata |
| Git range | execute-phase-N task metadata |
| Review findings | review-phase-N task metadata |
| Supervisor state | `{worktree}/.claude/tina/supervisor-state.json` (written by tina-session init)

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
  "description": "Validate design document",
  "activeForm": "Validating design document",
  "metadata": {
    "design_doc_path": "<DESIGN_DOC>",
    "worktree_path": "<WORKTREE_PATH>"
  }
}
```

Note: `worktree_path` is captured from `tina-session init` output in STEP 1c. It's stored in validate-design metadata so all downstream tasks can access it.

4. **Create phase tasks (for each phase 1 to N):**
```json
TaskCreate {
  "subject": "plan-phase-<N>",
  "description": "Create implementation plan",
  "activeForm": "Planning phase <N>",
  "metadata": {
    "phase_num": <N>,
    "design_doc_path": "<DESIGN_DOC>",
    "model_override": "<MODEL_OVERRIDE or empty>"
  }
}

TaskCreate {
  "subject": "execute-phase-<N>",
  "description": "Execute phase plan",
  "activeForm": "Executing phase <N>",
  "metadata": {
    "phase_num": <N>,
    "feature_name": "<FEATURE_NAME>"
  }
}

TaskCreate {
  "subject": "review-phase-<N>",
  "description": "Review completed phase implementation",
  "activeForm": "Reviewing phase <N>",
  "metadata": {
    "phase_num": <N>,
    "design_doc_path": "<DESIGN_DOC>"
  }
}
```

5. **Create finalize task:**
```json
TaskCreate {
  "subject": "finalize",
  "description": "Complete orchestration",
  "activeForm": "Finalizing orchestration"
}
```

6. **Set up dependencies (all at once after task creation):**

```
TaskUpdate: { taskId: "plan-phase-1", addBlockedBy: ["validate-design"] }
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
When teammates complete, store results in task metadata. The `worktree_path` is stored in validate-design metadata from STEP 1c. Later tasks read it from there:
```json
TaskGet { "taskId": "validate-design" }
// metadata.worktree_path = "/path/to/.worktrees/feature"
```

### Spawning Teammates

When a task becomes unblocked (all blockedBy tasks complete), spawn the appropriate teammate.

**Spawn principle:** Tasks carry WHAT (metadata), agent definitions carry HOW (methodology), spawn prompts are minimal (just task ID).

**Before spawning, update task metadata:**

Propagate data from completed tasks to the task being spawned. This way the spawned agent can read everything from its own task:

```bash
# Example: Before spawning executor, update its task with paths from earlier tasks
WORKTREE_PATH=$(TaskGet { taskId: "validate-design" }).metadata.worktree_path
PLAN_PATH=$(TaskGet { taskId: "plan-phase-$N" }).metadata.plan_path

TaskUpdate {
  taskId: "execute-phase-$N",
  metadata: { worktree_path: WORKTREE_PATH, plan_path: PLAN_PATH }
}
```

**Design validator spawn:**

When: validate-design task is unblocked (always first)
```json
{
  "subagent_type": "tina:design-validator",
  "team_name": "<TEAM_NAME>",
  "name": "validator",
  "prompt": "task_id: validate-design"
}
```
Then: Mark validate-design as in_progress

**Phase planner spawn (with plan reuse check):**

When: validate-design complete (for phase 1) OR review-phase-(N-1) complete with pass (for phase N>1)

Before spawning, check if a plan already exists:
```bash
PLAN_FILE="${WORKTREE_PATH}/.claude/tina/phase-${N}/plan.md"
if [ -f "$PLAN_FILE" ]; then
    # Reuse existing plan - skip planning entirely
    TaskUpdate: plan-phase-N, status: completed, metadata: { plan_path: "$PLAN_FILE" }
    # Proceed to spawning executor for phase N (same as "plan-phase-N complete" handler)
else
    # Spawn planner as normal
fi
```

If no existing plan:
```json
{
  "subagent_type": "tina:phase-planner",
  "team_name": "<TEAM_NAME>",
  "name": "planner-<N>",
  "prompt": "task_id: plan-phase-<N>"
}
```
Then: Mark plan-phase-N as in_progress

**Phase executor spawn:**

When: plan-phase-N complete
Before spawning: Update execute-phase-N metadata with worktree_path and plan_path
```json
{
  "subagent_type": "tina:phase-executor",
  "team_name": "<TEAM_NAME>",
  "name": "executor-<N>",
  "prompt": "task_id: execute-phase-<N>"
}
```
Then: Mark execute-phase-N as in_progress

**Phase reviewer spawn:**

When: execute-phase-N complete
Before spawning: Update review-phase-N metadata with worktree_path, design_doc_path, and git_range
```json
{
  "subagent_type": "tina:phase-reviewer",
  "team_name": "<TEAM_NAME>",
  "name": "reviewer-<N>",
  "prompt": "task_id: review-phase-<N>"
}
```
Then: Mark review-phase-N as in_progress

**Model override from CLI:**

If the action response includes a `model` field, pass it to the spawn:
```json
{
  "subagent_type": "tina:phase-planner",
  "team_name": "<TEAM_NAME>",
  "name": "planner-<N>",
  "model": "<model from action>",
  "prompt": "task_id: plan-phase-<N>"
}
```

If no `model` field is present, omit it and the agent definition's default model will be used.

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
| `validate-design` | `validation_status: "pass"\|"warning"\|"stop"`, `worktree_path` |
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
| planner-N | `plan-phase-N complete. PLAN_PATH: X` | `plan-phase-N error: X` |
| executor-N | `execute-N complete. Git range: X..Y` | `execute-N error: X` |
| reviewer-N | `review-N complete (pass)` or `review-N complete (gaps): X` | `review-N error: X` |

**Event handlers (CLI-delegated):**

For each teammate message, parse the event type, then call the CLI to advance state:

**On validator message:**
```
if message contains "VALIDATION_STATUS: Pass" or "VALIDATION_STATUS: Warning":
    EVENT = "validation_pass" (or "validation_warning")

    # Check for prerequisites BEFORE advancing state
    Read design doc, look for "## Prerequisites" section
    If prerequisites exist:
        Print each prerequisite to user
        Ask: "These prerequisites must be in place before starting. Are they all set up?"
        Wait for user confirmation before continuing

    # Advance state via CLI
    NEXT_ACTION = tina-session orchestrate advance --feature $FEATURE_NAME --phase validation --event $EVENT
    TaskUpdate: validate-design, status: completed
    TaskUpdate: validate-design, metadata: { validation_status: "pass", worktree_path: "$WORKTREE_PATH" }
    # Dispatch NEXT_ACTION (see Action Dispatch table above)

if message contains "VALIDATION_STATUS: Stop":
    NEXT_ACTION = tina-session orchestrate advance --feature $FEATURE_NAME --phase validation --event validation_stop
    TaskUpdate: validate-design, status: completed, metadata: { validation_status: "stop" }
    Print: "Design validation FAILED."
    Exit orchestration
```

**On planner-N message:**
```
if message contains "plan-phase-N complete":
    Parse: PLAN_PATH from "PLAN_PATH: X"
    NEXT_ACTION = tina-session orchestrate advance --feature $FEATURE_NAME --phase N --event plan_complete --plan-path $PLAN_PATH
    TaskUpdate: plan-phase-N, status: completed, metadata: { plan_path: $PLAN_PATH }
    # Dispatch NEXT_ACTION (spawn executor)

if message contains "error":
    NEXT_ACTION = tina-session orchestrate advance --feature $FEATURE_NAME --phase N --event error --issues "reason"
    # If can_retry: respawn planner; else escalate
```

**On executor-N message:**
```
if message contains "execute-N complete":
    Parse: git_range from "Git range: X..Y"
    NEXT_ACTION = tina-session orchestrate advance --feature $FEATURE_NAME --phase N --event execute_complete --git-range $GIT_RANGE
    TaskUpdate: execute-phase-N, status: completed, metadata: { git_range: $GIT_RANGE }
    # Dispatch NEXT_ACTION (spawn reviewer)

if message contains "session_died" or "error":
    NEXT_ACTION = tina-session orchestrate advance --feature $FEATURE_NAME --phase N --event error --issues "reason"
    # If can_retry: respawn executor; else escalate
```

**On reviewer-N message:**
```
if message contains "review-N complete (pass)":
    NEXT_ACTION = tina-session orchestrate advance --feature $FEATURE_NAME --phase N --event review_pass
    TaskUpdate: review-phase-N, status: completed, metadata: { status: "pass" }
    # Dispatch NEXT_ACTION (spawn next planner, finalize, or complete)

if message contains "review-N complete (gaps)":
    Parse: issues from message
    NEXT_ACTION = tina-session orchestrate advance --feature $FEATURE_NAME --phase N --event review_gaps --issues "issue1,issue2"
    TaskUpdate: review-phase-N, status: completed, metadata: { status: "gaps", issues: [...] }

    # If NEXT_ACTION is "remediate":
    #   Create remediation tasks (plan/execute/review for .remediation_phase)
    #   Set up dependencies
    #   Spawn planner for .remediation_phase
    # If NEXT_ACTION is "error" with can_retry: false:
    #   Print: "ERROR: Phase N failed after 2 remediation attempts"
    #   Exit orchestration

if message contains "error":
    NEXT_ACTION = tina-session orchestrate advance --feature $FEATURE_NAME --phase N --event error --issues "reason"
    # If can_retry: respawn reviewer; else escalate
```

**On consensus disagreement (from CLI):**
```
if NEXT_ACTION is "consensus_disagreement":
    Print:
    ---------------------------------------------------------------
    REVIEW CONSENSUS DISAGREEMENT: Phase <phase>
      Reviewer 1: <verdict_1>
      Reviewer 2: <verdict_2>
      Issues: <issues>

    Please resolve manually:
      - To accept as pass: TaskUpdate review-phase-N, status: completed, metadata: { status: "pass" }
      - To accept as gaps: TaskUpdate review-phase-N, status: completed, metadata: { status: "gaps", issues: [...] }
    ---------------------------------------------------------------
```

**Error handling and retry tracking:**

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

2. **Create remediation tasks with metadata:**
```json
TaskCreate {
  "subject": "plan-phase-<N>.5",
  "description": "Plan remediation",
  "activeForm": "Planning phase <N>.5 remediation",
  "metadata": {
    "phase_num": "<N>.5",
    "parent_phase": <N>,
    "issues": ["test coverage below 80%", "missing error handling"],
    "design_doc_path": "<DESIGN_DOC>",
    "model_override": "<MODEL_OVERRIDE or empty>"
  }
}

TaskCreate {
  "subject": "execute-phase-<N>.5",
  "description": "Execute remediation plan",
  "activeForm": "Executing phase <N>.5 remediation",
  "metadata": {
    "phase_num": "<N>.5",
    "feature_name": "<FEATURE_NAME>"
  }
}

TaskCreate {
  "subject": "review-phase-<N>.5",
  "description": "Review remediation",
  "activeForm": "Reviewing phase <N>.5 remediation",
  "metadata": {
    "phase_num": "<N>.5",
    "design_doc_path": "<DESIGN_DOC>"
  }
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

4. **Spawn remediation planner** (metadata already set during TaskCreate):
```json
{
  "subagent_type": "tina:phase-planner",
  "team_name": "<TEAM_NAME>",
  "name": "planner-<N>.5",
  "prompt": "task_id: plan-phase-<N>.5"
}
```

**Remediation planner guidance:**

The planner reads remediation context from task metadata:
- `parent_phase`: The original phase number
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

Model assignments come from `model_policy` in `supervisor-state.json`. Defaults:

| Agent | Default Model | Rationale |
|-------|---------------|-----------|
| Orchestrator | opus | Coordinates team, handles complex decisions |
| Design Validator | opus | Analyzes feasibility, runs baseline commands |
| Phase Planner | opus | Creates detailed plans, needs codebase understanding |
| Phase Executor | haiku | Tmux management and file monitoring |
| Phase Reviewer | opus | Analyzes implementation quality |

To override, set `model_policy` in `supervisor-state.json` before starting orchestration, or pass `--model <model>` to override all agents.

## Recovery

### Task List as Source of Truth

The task list IS the recovery mechanism. All orchestration state lives in:
- Task status (pending, in_progress, completed)
- Task metadata (worktree_path, plan_path, git_range, etc.)
- Task dependencies (blockedBy relationships)

**Note:** `supervisor-state.json` is written by `tina-session init` during worktree setup. This file enables tina-monitor to discover and track orchestrations.

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
- `tina:phase-planner` - Creates implementation plans
- `tina:phase-executor` - Executes phase plans
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
- [ ] Verify worktree was created by tina-session init (before team creation)
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
1. validate-design task metadata doesn't have worktree_path
2. `tina-session init` failed before team creation

**Resolution:**
1. Check worktree exists: `ls .worktrees/`
2. Manually add metadata:
   ```
   TaskUpdate { taskId: "validate-design", metadata: { worktree_path: ".worktrees/feature" } }
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
