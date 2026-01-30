# Team-Based Orchestration Phase 2 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Rewrite the orchestrate skill to use the team-based model where the orchestrator is a team lead coordinating teammates rather than a single agent doing everything.

**Architecture:** The orchestrator becomes an event-driven coordinator that creates a team and tasks with dependencies, spawns teammates as tasks become unblocked, and reacts to teammate messages. Task metadata carries orchestration state instead of supervisor-state.json. The orchestrator's context stays minimal because it only sees teammate messages, not implementation details.

**Phase context:** Phase 1 created the three agent definitions (phase-executor, worktree-setup, phase-planner) and updated team-lead-init to write team name files. Phase 2 rewrites the orchestrate skill to use these teammates.

---

### Task 1: Create new orchestrate skill file structure

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Step 1: Read the current orchestrate skill**

Read the entire current skill to understand its structure before replacing it.

**Step 2: Replace the entire skill with the team-based version**

Replace the entire contents of `skills/orchestrate/SKILL.md` with:

```markdown
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
═══════════════════════════════════════════════════════════
ORCHESTRATING: <design doc name>
Team: <team-name>-orchestration
Phases: <N> total
═══════════════════════════════════════════════════════════
```

**When teammate completes:**
```
───────────────────────────────────────────────────────────
<TASK NAME>: Complete
  Next: <next task being spawned>
───────────────────────────────────────────────────────────
```

**At orchestration completion:**
```
═══════════════════════════════════════════════════════════
ORCHESTRATION COMPLETE
All <N> phases finished successfully.
Ready for merge/PR workflow.
═══════════════════════════════════════════════════════════
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

Create all tasks upfront with proper dependencies:

```bash
# Extract info from design doc
DESIGN_DOC="$1"
TOTAL_PHASES=$(grep -cE "^##+ Phase [0-9]" "$DESIGN_DOC")
FEATURE_NAME=$(basename "$DESIGN_DOC" | sed 's/^[0-9-]*//; s/-design\.md$//')

# Create team
# Teammate { operation: "spawnTeam", team_name: "$FEATURE_NAME-orchestration", description: "..." }

# Create tasks
# TaskCreate: validate-design, description: "Validate design doc at $DESIGN_DOC"
# TaskCreate: setup-worktree, description: "Create worktree for $FEATURE_NAME"

# Create phase tasks in loop
for PHASE in $(seq 1 $TOTAL_PHASES); do
  # TaskCreate: plan-phase-$PHASE
  # TaskCreate: execute-phase-$PHASE
  # TaskCreate: review-phase-$PHASE
done

# TaskCreate: finalize, description: "Complete orchestration via finishing workflow"

# Set dependencies
# TaskUpdate: setup-worktree, addBlockedBy: [validate-design]
# TaskUpdate: plan-phase-1, addBlockedBy: [setup-worktree]
# etc.
```

### Spawning Teammates

When a task becomes unblocked, spawn the appropriate teammate:

**Design validator:**
```json
{
  "subagent_type": "tina:design-validator",
  "team_name": "feature-orchestration",
  "name": "validator",
  "prompt": "Design doc: path\nOutput file: .claude/tina/validation/design-report.md"
}
```

**Worktree setup:**
```json
{
  "subagent_type": "tina:worktree-setup",
  "team_name": "feature-orchestration",
  "name": "worktree-setup",
  "prompt": "feature_name: feature\ndesign_doc_path: path"
}
```

**Phase planner:**
```json
{
  "subagent_type": "tina:phase-planner",
  "team_name": "feature-orchestration",
  "name": "planner-N",
  "prompt": "phase_num: N\ndesign_doc_path: path"
}
```

**Phase executor:**
```json
{
  "subagent_type": "tina:phase-executor",
  "team_name": "feature-orchestration",
  "name": "executor-N",
  "prompt": "phase_num: N\nworktree_path: path\nplan_path: path\nfeature_name: feature"
}
```

**Phase reviewer:**
```json
{
  "subagent_type": "tina:phase-reviewer",
  "team_name": "feature-orchestration",
  "name": "reviewer-N",
  "prompt": "phase_num: N\nworktree_path: path\ndesign_doc_path: path\ngit_range: base..head"
}
```

### Event Loop

The orchestrator waits for teammate messages and reacts:

```
On teammate message:
├── validator says "VALIDATION_STATUS: Pass/Warning"
│   → Mark task complete, spawn worktree-setup
├── validator says "VALIDATION_STATUS: Stop"
│   → Mark task complete, report failure, exit
├── worktree-setup says "complete" with worktree_path
│   → Store path in metadata, spawn planner-1
├── planner-N says "complete" with PLAN_PATH
│   → Store path in metadata, spawn executor-N
├── executor-N says "complete" with git_range
│   → Store range in metadata, spawn reviewer-N
├── reviewer-N says "pass"
│   → If more phases: spawn planner-(N+1)
│   → If last phase: invoke finishing workflow
├── reviewer-N says "gaps" with issues
│   → Create remediation phase N.5
│   → Update dependencies
│   → Spawn planner-N.5
└── Any teammate says "error"
    → Retry once, then escalate
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
```

**Step 3: Verify the new skill structure**

Run: `head -50 /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should show the new team-based skill header

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: rewrite orchestrate skill for team-based model"
```

---

### Task 2: Implement task creation with dependencies

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Step 1: Read the current task creation section**

Read the file to find the task creation section.

**Step 2: Add detailed task creation implementation**

Add the following section after the "Implementation Details" heading, before "### Spawning Teammates":

Find this text:

```markdown
### Task Creation

Create all tasks upfront with proper dependencies:

```bash
# Extract info from design doc
```

Replace with more detailed implementation:

```markdown
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
```

**Step 3: Verify the changes**

Run: `grep -n "Why create all tasks upfront" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new section

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: add detailed task creation implementation to orchestrate skill"
```

---

### Task 3: Implement teammate spawning logic

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Step 1: Read the spawning section**

Read the current "Spawning Teammates" section.

**Step 2: Enhance teammate spawning with metadata retrieval**

Find the section starting with `### Spawning Teammates` and enhance it with metadata retrieval logic.

Find this text:

```markdown
### Spawning Teammates

When a task becomes unblocked, spawn the appropriate teammate:

**Design validator:**
```json
{
  "subagent_type": "tina:design-validator",
```

Replace the entire "Spawning Teammates" section up to "### Event Loop" with:

```markdown
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
```

**Step 3: Verify the changes**

Run: `grep -n "Teammate lifecycle" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new section

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: add detailed teammate spawning logic to orchestrate skill"
```

---

### Task 4: Implement message handling event loop

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Step 1: Read the event loop section**

Read the current "Event Loop" section.

**Step 2: Enhance event loop with detailed message parsing**

Find the section starting with `### Event Loop` and enhance it.

Find this text:

```markdown
### Event Loop

The orchestrator waits for teammate messages and reacts:

```
On teammate message:
├── validator says "VALIDATION_STATUS: Pass/Warning"
```

Replace the entire "Event Loop" section up to "### Remediation Flow" with:

```markdown
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

    Create remediation tasks (see Remediation Flow)
    Spawn planner-N.5
    Print: "Phase N has gaps. Creating remediation phase N.5..."

if message contains "error":
    Exit with error
```

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

**Step 3: Verify the changes**

Run: `grep -n "Error handling:" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new section

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: add detailed message handling event loop to orchestrate skill"
```

---

### Task 5: Implement remediation flow

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Step 1: Read the remediation section**

Read the current "Remediation Flow" section.

**Step 2: Enhance remediation with detailed steps**

Find the section starting with `### Remediation Flow` and enhance it.

Find this text:

```markdown
### Remediation Flow

If reviewer finds gaps:

1. Create remediation tasks:
```

Replace the entire "Remediation Flow" section up to "## Model Policy" with:

```markdown
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
  "prompt": "phase_num: <N>.5\ndesign_doc_path: <DESIGN_DOC>\nremediation_for: phase <N>\nissues: <issues list>\n\nCreate implementation plan to address these specific gaps.\nReport: plan-phase-<N>.5 complete. PLAN_PATH: <PATH>"
}
```

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
```

**Step 3: Verify the changes**

Run: `grep -n "Remediation limit tracking" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new section

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: add detailed remediation flow to orchestrate skill"
```

---

### Task 6: Add recovery and resumption logic

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Step 1: Read the recovery section**

Read the current "Recovery" section.

**Step 2: Enhance recovery with detailed resumption logic**

Find the section starting with `## Recovery` and enhance it.

Find this text:

```markdown
## Recovery

### Task List as Source of Truth

The task list IS the recovery mechanism. No separate state file needed.
```

Replace the entire "Recovery" section up to "## Integration" with:

```markdown
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
3. Task still in_progress but no teammate messages → respawn
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
```

**Step 3: Verify the changes**

Run: `grep -n "Manual Recovery Commands" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new section

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat: add detailed recovery and resumption logic to orchestrate skill"
```

---

### Task 7: Final review and cleanup

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Step 1: Read the full updated skill**

Read the entire skill to verify consistency.

**Step 2: Verify all sections are present**

Run: `grep -E "^##" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`

Expected sections:
- EXECUTE THESE STEPS IN ORDER
- FORBIDDEN ACTIONS
- ALLOWED ACTIONS
- STEP 1-6
- Team-Based Orchestration (Overview)
- Orchestrator as Team Lead
- Teammate Types
- Task Metadata as State
- User Status Display
- When to Use / When NOT to Use
- Invocation
- Implementation Details
- Task Creation
- Spawning Teammates
- Event Loop
- Remediation Flow
- Model Policy
- Recovery
- Integration
- Red Flags

**Step 3: Run a syntax check on markdown**

Run: `wc -l /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: File should be substantial (500+ lines for all the detailed content)

**Step 4: Final commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs: complete orchestrate skill rewrite for team-based model"
```

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Skill lines | ~600 | `wc -l skills/orchestrate/SKILL.md` |
| Files touched | 1 | `git diff --name-only base..HEAD \| wc -l` |
| Sections added | 10+ | `grep -cE "^###" skills/orchestrate/SKILL.md` |

**Target files:**
- `skills/orchestrate/SKILL.md` - Complete team-based orchestration skill

**ROI expectation:** One file rewrite that transforms the orchestrator from a monolithic agent to a team coordinator. This enables the core benefits from the design: minimal orchestrator context, reliable monitoring via executor teammate, clean recovery via task list.
