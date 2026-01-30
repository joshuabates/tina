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

## STEP 1: Count phases and extract feature name

```bash
DESIGN_DOC="<path from invocation>"
TOTAL_PHASES=$(grep -cE "^##+ Phase [0-9]" "$DESIGN_DOC")
FEATURE_NAME=$(basename "$DESIGN_DOC" | sed 's/^[0-9-]*//; s/-design\.md$//')
```

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
  "prompt": "phase_num: 1\ndesign_doc_path: <DESIGN_DOC>"
}
```

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
  "prompt": "phase_num: <N>\ndesign_doc_path: <DESIGN_DOC>\n\nCreate implementation plan for phase <N>.\nReport: plan-phase-<N> complete. PLAN_PATH: <PATH>"
}
```
Then: Mark plan-phase-N as in_progress

**Phase executor spawn:**

When: plan-phase-N complete
Prerequisites: Need worktree_path (from setup-worktree metadata), plan_path (from plan-phase-N metadata)
```json
{
  "subagent_type": "tina:phase-executor",
  "team_name": "<TEAM_NAME>",
  "name": "executor-<N>",
  "prompt": "phase_num: <N>\nworktree_path: <WORKTREE_PATH>\nplan_path: <PLAN_PATH>\nfeature_name: <FEATURE_NAME>\n\nStart team-lead in tmux and monitor until phase completes.\nReport: execute-<N> complete. Git range: <BASE>..<HEAD>"
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

### Event Loop

The orchestrator waits for teammate messages and reacts:

```
On teammate message:
+-- validator says "VALIDATION_STATUS: Pass/Warning"
|   -> Mark task complete, spawn worktree-setup
+-- validator says "VALIDATION_STATUS: Stop"
|   -> Mark task complete, report failure, exit
+-- worktree-setup says "complete" with worktree_path
|   -> Store path in metadata, spawn planner-1
+-- planner-N says "complete" with PLAN_PATH
|   -> Store path in metadata, spawn executor-N
+-- executor-N says "complete" with git_range
|   -> Store range in metadata, spawn reviewer-N
+-- reviewer-N says "pass"
|   -> If more phases: spawn planner-(N+1)
|   -> If last phase: invoke finishing workflow
+-- reviewer-N says "gaps" with issues
|   -> Create remediation phase N.5
|   -> Update dependencies
|   -> Spawn planner-N.5
+-- Any teammate says "error"
    -> Retry once, then escalate
```

### Remediation Flow

If reviewer finds gaps:

1. Create remediation tasks:
   - `plan-phase-N.5`
   - `execute-phase-N.5`
   - `review-phase-N.5`

2. Update dependencies:
   - `review-phase-N.5` blocked by `execute-phase-N.5`
   - `execute-phase-N.5` blocked by `plan-phase-N.5`
   - `plan-phase-N.5` blocked by nothing (starts immediately)
   - `plan-phase-(N+1)` blocked by `review-phase-N.5` (replaces old dependency)

3. Spawn planner for N.5

Remediation gets full plan/execute/review treatment.

## Model Policy

| Agent | Model | Rationale |
|-------|-------|-----------|
| Orchestrator | opus | Coordinates team, handles complex decisions |
| Design Validator | opus | Analyzes feasibility, runs baseline commands |
| Worktree Setup | sonnet | Straightforward provisioning tasks |
| Phase Planner | opus | Creates detailed plans, needs codebase understanding |
| Phase Executor | sonnet | Tmux management and file monitoring |
| Phase Reviewer | opus | Analyzes implementation quality |

## Recovery

### Task List as Source of Truth

The task list IS the recovery mechanism. No separate state file needed.

### Orchestrator Crash

1. User reruns `/tina:orchestrate design.md`
2. Orchestrator finds existing team matching design doc
3. Reads task list, identifies incomplete tasks
4. Resumes: respawns teammate for current incomplete task

### Teammate Crash

1. Orchestrator notices no messages for extended period
2. Orchestrator respawns same teammate type for same task
3. Teammates are stateless - they read task description and execute

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
