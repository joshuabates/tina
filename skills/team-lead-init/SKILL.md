---
name: team-lead-init
description: Use when starting a team-lead session with a plan path to initialize phase execution
---

# EXECUTE THESE STEPS IN ORDER

You are a TEAM LEAD. You coordinate a team of workers and reviewers.

## FORBIDDEN ACTIONS
- Implementing tasks yourself
- Writing code directly
- Skipping team creation

---

## STEP 1: Extract phase number and team name from invocation

The invocation prompt contains:
- `team_name`: The team name to use (provided by executor)
- `plan_path`: Path to the phase plan

Example prompt:
```
team_name: auth-feature-phase-1
plan_path: docs/plans/2026-01-30-auth-feature-phase-1.md
```

Extract phase number from plan path:
Pattern: `-phase-(\d+(?:\.\d+)?)\.md$`
Example: `docs/plans/2026-01-26-feature-phase-1.md` -> PHASE_NUM = 1
Example: `docs/plans/2026-01-26-feature-phase-1.5.md` -> PHASE_NUM = 1.5

---

## STEP 1b: Resolve worktree path

Define `WORKTREE_PATH` before running any gates or CLI commands.

If `.claude/tina/supervisor-state.json` exists in the current directory, use its `worktree_path`. Otherwise default to the current directory.

```bash
if [ -f ".claude/tina/supervisor-state.json" ]; then
  WORKTREE_PATH="$(python3 - <<'PY'
import json
with open(".claude/tina/supervisor-state.json") as f:
    print(json.load(f).get("worktree_path", ""))
PY
)"
fi

if [ -z "$WORKTREE_PATH" ]; then
  WORKTREE_PATH="$(pwd)"
fi
```

---

## STEP 2: Initialize status file

```bash
mkdir -p ".claude/tina/phase-$PHASE_NUM"
```

Write to `.claude/tina/phase-$PHASE_NUM/status.json`:
```json
{
  "status": "executing",
  "started_at": "<current ISO timestamp>"
}
```

---

## STEP 3: CALL Teammate tool NOW to create team

```json
{
  "operation": "spawnTeam",
  "team_name": "<team_name from invocation>",
  "description": "Phase <N> execution team"
}
```

**IMPORTANT:** Use the team_name provided in the invocation. Do NOT generate your own name.

---

## STEP 3b: REMOVED

Team name file is no longer needed. The executor already knows the team name since it provided it in the invocation.

---

## STEP 4: Create tasks from plan with dependencies

Read the plan file and create tasks via TaskCreate for each task in the plan.

**Parse model and dependencies from each task:** Look for `**Model:** <model>` and `**Depends on:**` lines in each task section. Also load `review_policy` from `.claude/tina/supervisor-state.json` once and store it in task metadata:
```json
TaskCreate {
  "subject": "Task N: <description>",
  "description": "<full task content>",
  "metadata": { "model": "<model-string>", "task_number": N, "review_policy": { ... } }
}
```

**Record task_number -> task_id mapping** as you create tasks. You will need this to set up dependency relationships.

**After ALL tasks are created**, set up dependencies using TaskUpdate:

For each task, parse its `**Depends on:**` value:
- `"none"` → no blockedBy (task is immediately ready)
- `"1, 3"` → look up task IDs for task numbers 1 and 3, then:
```json
TaskUpdate({
  "taskId": "<this-task-id>",
  "addBlockedBy": ["<task-1-id>", "<task-3-id>"]
})
```

Do NOT spawn workers or reviewers yet. The team is just a container at this point.

---

## STEP 5: DAG scheduler - concurrent task execution

Replace the sequential task loop with a ready-queue DAG scheduler that runs independent tasks in parallel.

### 5.1 Find ready tasks

Query `TaskList` to find all tasks with status=pending and empty blockedBy list. These are "ready" tasks — their dependencies are satisfied.

### 5.2 Spawn workers for ALL ready tasks in parallel

For each ready task N, assign it and spawn a worker with a task-specific name:

```json
TaskUpdate({
  "taskId": "<task-N-id>",
  "status": "in_progress",
  "owner": "worker-N"
})
```

Get the model from task metadata (via TaskGet), then run a routing check:
```bash
MODEL=$(TaskGet metadata.model)
CLI=$(tina-session config cli-for-model --model "$MODEL")
```

If `CLI == "claude"` (or no model specified):
```json
{
  "subagent_type": "tina:implementer",
  "team_name": "<team-name>",
  "name": "worker-N",
  "model": "<model from task metadata>",
  "prompt": "Implement task: <task subject and description>. Use TDD."
}
```

If `CLI == "codex"`:
```json
{
  "subagent_type": "tina:codex-cli",
  "team_name": "<team-name>",
  "name": "worker-N",
  "prompt": "feature: <FEATURE_NAME>\nphase: <PHASE_NUM>\ntask_id: <task-id>\nrole: executor\ncwd: <WORKTREE_PATH>\nmodel: <MODEL>\nprompt_content: |\n  <full task text and context>"
}
```

**Worker/reviewer naming:** Use task-number suffixes: `worker-1`, `worker-2`, `spec-reviewer-1`, `code-quality-reviewer-1`, etc. This avoids name collisions when multiple tasks run in parallel.

### 5.3 Wait for ANY worker to complete

Monitor for Teammate messages from any active worker indicating completion. Track active workers in a map: task-number -> worker-name.

### 5.4 Review the completed task

When worker-N reports completion, spawn reviewers for task N. Run a routing check using the task's model:

```bash
MODEL=$(TaskGet metadata.model for task N)
CLI=$(tina-session config cli-for-model --model "$MODEL")
```

If `CLI == "claude"` (or no model specified):
```json
{
  "subagent_type": "tina:spec-reviewer",
  "team_name": "<team-name>",
  "name": "spec-reviewer-N",
  "prompt": "Review implementation for task: <task subject>. Check spec compliance and enforce review_policy detector gates."
}
```

```json
{
  "subagent_type": "tina:code-quality-reviewer",
  "team_name": "<team-name>",
  "name": "code-quality-reviewer-N",
  "prompt": "Review code quality for task: <task subject>. Check architecture, reuse, and review_policy detector gates."
}
```

If `CLI == "codex"`:
```json
{
  "subagent_type": "tina:codex-cli",
  "team_name": "<team-name>",
  "name": "spec-reviewer-N",
  "prompt": "feature: <FEATURE_NAME>\nphase: <PHASE_NUM>\ntask_id: <task-id>\nrole: reviewer\ncwd: <WORKTREE_PATH>\nmodel: <MODEL>\nprompt_content: |\n  Review implementation for task: <task subject>. Check spec compliance.\n  Git range: <range>\n  Files changed: <list>"
}
```

```json
{
  "subagent_type": "tina:codex-cli",
  "team_name": "<team-name>",
  "name": "code-quality-reviewer-N",
  "prompt": "feature: <FEATURE_NAME>\nphase: <PHASE_NUM>\ntask_id: <task-id>\nrole: reviewer\ncwd: <WORKTREE_PATH>\nmodel: <MODEL>\nprompt_content: |\n  Review code quality for task: <task subject>. Check architecture and patterns.\n  Git range: <range>\n  Files changed: <list>"
}
```

Wait for both reviewers to approve.

### 5.5 Shut down task-N's agents

After reviews pass for task N, shut down that task's agents only:

```json
SendMessage({ type: "shutdown_request", recipient: "worker-N", content: "Task complete" })
SendMessage({ type: "shutdown_request", recipient: "spec-reviewer-N", content: "Review complete" })
SendMessage({ type: "shutdown_request", recipient: "code-quality-reviewer-N", content: "Review complete" })
```

**Wait for acknowledgments** (30s timeout per agent). Do NOT wait for other tasks' agents.

### 5.6 Mark task complete and check for newly ready tasks

Mark task N complete:
```json
TaskUpdate({ "taskId": "<task-N-id>", "status": "completed" })
```

Then **re-check the ready queue**: query `TaskList` again. Tasks that were blocked by task N may now be unblocked. Spawn workers for any newly ready tasks (go to 5.2 for those tasks).

### 5.7 Loop until all tasks complete

Continue the wait-for-any/review/shutdown/re-check cycle until `TaskList` shows all tasks completed. At any point, multiple tasks may be executing in parallel.

**Key invariant:** A task's agents are independent of other tasks' agents. Shutting down task-1's agents does not affect task-2's agents.

### Error handling per task

Current retry/escalation logic applies per-task:
- Worker fails → shut down, retry with fresh `worker-N` (one retry)
- Reviewer rejects 3x → escalate, set status=blocked
- A blocked task does NOT block unrelated tasks — only its dependents stay blocked

---

## STEP 6: Run completion gates (HARD GATE - BLOCKING)

**CRITICAL: These gates are HARD requirements. Phase CANNOT complete if any gate fails.**

Before marking phase complete, you MUST run verification gates. Partial completion is NOT acceptable.

### 6.1 Run test and lint verification

```bash
tina-session check verify --cwd "$WORKTREE_PATH"
```

**If exit code is non-zero, the phase is BLOCKED:**

Update status.json:
```json
{
  "status": "blocked",
  "started_at": "<original timestamp>",
  "blocked_at": "<current ISO timestamp>",
  "reason": "Verification gate failed",
  "gate": "verify",
  "context": {
    "command": "tina-session check verify",
    "output": "<first 500 chars of command output>",
    "exit_code": 1
  }
}
```

Do NOT proceed to completion. Do NOT attempt workarounds.

### 6.2 Run complexity checks

Parse Complexity Budget from plan file to get limits, then run:

```bash
tina-session check complexity \
  --cwd "$WORKTREE_PATH" \
  --max-file-lines 400 \
  --max-total-lines <from plan> \
  --max-function-lines 50
```

**If exit code is non-zero, the phase is BLOCKED:**

Update status.json:
```json
{
  "status": "blocked",
  "started_at": "<original timestamp>",
  "blocked_at": "<current ISO timestamp>",
  "reason": "Complexity gate failed",
  "gate": "complexity",
  "context": {
    "command": "tina-session check complexity",
    "output": "<first 500 chars of command output>",
    "exit_code": 1
  }
}
```

Do NOT proceed to completion. Do NOT attempt workarounds.

### 6.3 Complete phase

**Completion Checklist - verify ALL before setting status = complete:**

1. [ ] All tasks marked complete
2. [ ] No active workers (last task's agents shut down and acknowledged)
3. [ ] No active reviewers
4. [ ] Verification gate passed (Step 6.1)
5. [ ] Complexity gate passed (Step 6.2)

**Do NOT clean up the team.** Phase team/task directories must persist so the daemon can sync them to Convex. Cleanup is the orchestrator's responsibility after verification.

**Only after ALL items verified:**

Update status.json:
```json
{
  "status": "complete",
  "started_at": "<original timestamp>",
  "completed_at": "<current ISO timestamp>"
}
```

Wait for supervisor to detect completion and kill session.

---

The full skill with details follows. EXECUTE THE STEPS - don't just read them.

---

# Team Lead Initialization

## Overview

Initialize a team-lead session for phase execution. Reads the plan, sets up phase status, and delegates to the execution workflow.

**Core principle:** Team-lead manages one phase. Reads plan once, executes all tasks, reports completion.

**Announce at start:** "I'm initializing team-lead for this phase."

## When to Use

- Invoked by `tina:orchestrate` supervisor when starting phase execution
- Never invoke manually - orchestrate manages the lifecycle

## When NOT to Use

- Don't use for manual plan execution (use `tina:executing-plans` directly)
- Don't use outside orchestrated multi-phase workflows

## Invocation

Called by supervisor when spawning team-lead in tmux:

```
/tina:team-lead-init team_name: feature-phase-1 plan_path: docs/plans/2026-01-26-feature-phase-1.md
```

## Phase Number Extraction

Extract phase number from plan path:
- `docs/plans/2026-01-26-feature-phase-1.md` → Phase 1
- Pattern: `-phase-(\d+)\.md$`

## Status Updates

**On start:**
```json
{
  "status": "executing",
  "started_at": "2026-01-26T10:00:00Z"
}
```

**On completion:**
```json
{
  "status": "complete",
  "started_at": "2026-01-26T10:00:00Z",
  "completed_at": "2026-01-26T10:30:00Z"
}
```

**On blocked:**
```json
{
  "status": "blocked",
  "started_at": "2026-01-26T10:00:00Z",
  "reason": "Phase reviewer rejected 3 times"
}
```

## The Process (DAG Scheduler)

```dot
digraph team_lead_dag {
    rankdir=TB;

    "Read plan file" [shape=box];
    "Extract phase number from path" [shape=box];
    "Initialize status.json" [shape=box];
    "Create team container" [shape=box];
    "Create tasks with dependencies" [shape=box];
    "Check ready queue" [shape=diamond];
    "Spawn workers for ready tasks" [shape=box];
    "Wait for any completion" [shape=box];
    "Review completed task" [shape=box];
    "Shut down task agents" [shape=box];
    "Mark task complete" [shape=box];
    "All tasks done?" [shape=diamond];
    "Set status = complete" [shape=box];
    "Wait for supervisor" [shape=box];

    "Read plan file" -> "Extract phase number from path";
    "Extract phase number from path" -> "Initialize status.json";
    "Initialize status.json" -> "Create team container";
    "Create team container" -> "Create tasks with dependencies";
    "Create tasks with dependencies" -> "Check ready queue";
    "Check ready queue" -> "Spawn workers for ready tasks" [label="ready tasks exist"];
    "Spawn workers for ready tasks" -> "Wait for any completion";
    "Wait for any completion" -> "Review completed task";
    "Review completed task" -> "Shut down task agents";
    "Shut down task agents" -> "Mark task complete";
    "Mark task complete" -> "All tasks done?";
    "All tasks done?" -> "Check ready queue" [label="no"];
    "All tasks done?" -> "Set status = complete" [label="yes"];
    "Set status = complete" -> "Wait for supervisor";
}
```

## Team Spawning (DAG Scheduler)

Team-lead uses an ephemeral spawning model where workers and reviewers are created per-task, not per-phase. With the DAG scheduler, multiple tasks' agents can be active simultaneously.

**Why ephemeral?**
- Fresh context window for each task (no accumulated context)
- Cleaner handoffs between tasks
- Simpler checkpoint/recovery (no team composition to save)
- Each worker starts with full context budget for their specific task

**Phase initialization (once):**

Use the Teammate tool with operation "spawnTeam":
- team_name: "<team_name from invocation>" (use exactly what was provided)
- agent_type: "team-lead"
- description: "Phase N execution team"

This creates the team container. NO workers or reviewers are spawned yet.

**Team name coordination:**

The team name is provided by the phase executor in the invocation prompt. The executor spawns team-lead-init with a specific team name, then monitors that team using `tina-monitor status team <name>`.

No file-based discovery is needed - the executor knows the team name because it defined it.

**Parallel task spawning (DAG-driven):**

When the ready queue has tasks, spawn workers for ALL of them:

1. For each ready task N: spawn `worker-N`
2. Wait for ANY worker to complete
3. Spawn `spec-reviewer-N` and `code-quality-reviewer-N` for completed task
4. Wait for reviews to pass
5. Shut down task-N's agents (`worker-N`, `spec-reviewer-N`, `code-quality-reviewer-N`)
6. Mark task N complete, re-check ready queue for newly unblocked tasks
7. Spawn workers for any newly ready tasks (repeat from step 1 for those)

**Worker spawn (per task N):**

First, assign the task before spawning:
```json
TaskUpdate({
  "taskId": "<task-N-id>",
  "status": "in_progress",
  "owner": "worker-N"
})
```

Then get the model from the task's metadata:
```json
TaskGet { "taskId": "<task-N-id>" }
# Read metadata.model from response
```

Then spawn with task-specific name:
```json
{
  "subagent_type": "tina:implementer",
  "team_name": "<team-name>",
  "name": "worker-N",
  "model": "<metadata.model>",
  "prompt": "Implement task: <task subject and description>. Use TDD and follow review_policy."
}
```

The model field accepts any model string supported by `tina-session config cli-for-model` (e.g., `opus`, `haiku`, `codex`, `gpt-5.3-codex`, etc.). This is parsed from the `**Model:**` line in the plan file during task creation (STEP 4). The routing decision happens at spawn time, not at plan parse time.

**Reviewer spawns (per task N):**
```json
{
  "subagent_type": "tina:spec-reviewer",
  "team_name": "<team-name>",
  "name": "spec-reviewer-N",
  "prompt": "Review implementation for task: <task subject>. Check spec compliance and enforce review_policy detector gates."
}
```

```json
{
  "subagent_type": "tina:code-quality-reviewer",
  "team_name": "<team-name>",
  "name": "code-quality-reviewer-N",
  "prompt": "Review code quality for task: <task subject>. Check architecture, reuse, and review_policy detector gates."
}
```

## Team Shutdown

With the DAG scheduler, shutdown happens per-task independently:

**Per-task shutdown (after task N's reviews pass):**

Shut down task-N's agents only — do NOT touch other tasks' agents:

```json
SendMessage({ type: "shutdown_request", recipient: "worker-N", content: "Task complete" })
SendMessage({ type: "shutdown_request", recipient: "spec-reviewer-N", content: "Review complete" })
SendMessage({ type: "shutdown_request", recipient: "code-quality-reviewer-N", content: "Review complete" })
```

Monitor for shutdown acknowledgment messages. Other tasks' workers continue running during this shutdown.

**Phase-end:**

When all tasks complete:
- No workers/reviewers to shut down (already cleaned up per-task)
- Do NOT clean up team resources — the daemon needs the team/task dirs to sync to Convex
- Update status.json to "complete"

## Shutdown Verification

Shutdown is a two-step process, applied per-task:

### Step 1: Request Shutdown

For each of task N's agents (`worker-N`, `spec-reviewer-N`, `code-quality-reviewer-N`):

```json
SendMessage({
  type: "shutdown_request",
  recipient: "worker-N",
  content: "Task complete"
})
```

### Step 2: Verify Shutdown

After requesting shutdown, monitor for acknowledgment message from each agent:

```json
{
  "type": "shutdown_acknowledged",
  "from": "worker-N",
  "requestId": "<request-id>"
}
```

**Timeout:** If acknowledgment not received within 30 seconds:
1. Log warning: "Agent worker-N did not acknowledge shutdown within timeout"
2. Proceed anyway (agent process may have already terminated)

**IMPORTANT:** Task-N's shutdown is independent of other tasks. Other tasks' workers continue running during shutdown. You do NOT need to wait for task-N's shutdown before spawning workers for newly unblocked tasks.

## Checkpoint Protocol

With ephemeral spawning, checkpoint is simpler because there's no long-lived team composition to save.

**When checkpoint is triggered:**

1. Supervisor detects context threshold exceeded
2. Supervisor sends `/checkpoint` via tmux
3. If worker/reviewers are active for current task, shut them down first
4. Team-lead invokes `checkpoint` skill
5. Checkpoint writes handoff (only TaskList state matters, no team composition)
6. Team-lead outputs "CHECKPOINT COMPLETE"
7. Supervisor sends `/clear`, then `/rehydrate`
8. Fresh session invokes `rehydrate` skill
9. Rehydrate reads TaskList, resumes at current task
10. Fresh worker/reviewers spawned for resumed task

**Why simpler:**
- No team composition to save/restore
- Only task state matters (which tasks complete, which in-progress)
- Fresh session spawns new ephemeral agents as needed

**Important:** The `/checkpoint` and `/rehydrate` commands are slash commands that invoke the respective skills. Team-lead doesn't implement checkpoint logic directly - it delegates to the skills.

See: `skills/checkpoint/SKILL.md` and `skills/rehydrate/SKILL.md`

## Error Handling

**Plan file not found:**
- Set status = blocked with reason: "Plan file not found: <path>"
- Do NOT spawn team
- Exit (supervisor will detect blocked status)

**Team spawn fails:**
- Retry team spawn once
- If still fails: Set status = blocked with reason: "Failed to spawn team: <error>"
- Exit

**Worker-N fails during task:**
- Shut down failed worker-N
- Retry with fresh worker-N (one retry)
- If still fails: Mark task N blocked. Other tasks continue unaffected.
- Only set phase status=blocked if a blocked task blocks all remaining tasks.

**Reviewer rejects repeatedly for task N:**
- After 3 rejections for same task, escalate
- Shut down task-N's active worker/reviewers
- Mark task N blocked. Dependents of task N remain blocked; unrelated tasks continue.

**Worker/reviewer unresponsive:**
- Shut down unresponsive agent
- Spawn replacement with same name (ephemeral model makes this easy)
- If replacement also fails: Mark task blocked

**Shutdown request not acknowledged:**
- Wait 30 seconds for acknowledgment
- Log warning: "Agent worker-N did not acknowledge shutdown"
- Proceed (agent may have already terminated)

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
See .claude/tina/phase-N/status.json for details
Handoff written to .claude/tina/phase-N/handoff.md
```

**What NOT to do:**
- Don't silently fail (always update status)
- Don't retry endlessly (max 3 attempts then escalate)
- Don't omit context (helper agent needs it)

## Integration

**Invoked by:**
- `tina:orchestrate` - Spawns team-lead-init in tmux for each phase

**Spawns (per-task, with task-number suffix):**
- `tina:implementer` as `worker-N` - Worker to implement task N (when model routes to claude)
- `tina:spec-reviewer` as `spec-reviewer-N` - Reviews task N implementation against spec (when model routes to claude)
- `tina:code-quality-reviewer` as `code-quality-reviewer-N` - Reviews task N code quality (when model routes to claude)
- `tina:codex-cli` as `worker-N` / `spec-reviewer-N` / `code-quality-reviewer-N` - Adapter for executing tasks via Codex CLI (when model routes to codex)

**Responds to:**
- `/checkpoint` - Invokes checkpoint skill for context management
- `/rehydrate` - Invokes rehydrate skill after context reset

**State files:**
- `.claude/tina/phase-N/status.json` - Phase execution status (fallback for monitoring)

Note: `team-name.txt` is no longer used. Team names are passed explicitly from orchestrator to executor to team-lead.

## Red Flags

**Never:**
- Start executing without setting status to "executing"
- Finish without setting status to "complete" or "blocked"
- Swallow errors (always update status with reason)
- Mark phase complete if verify gate fails (tests or linter)
- Mark phase complete if complexity gate fails
- Skip or bypass completion gates for any reason
- Claim success without running `tina-session check verify`
- Skip shutdown verification (always wait for acknowledgment or timeout)
- Leave teammates running after phase completes
- Proceed without requesting shutdown for ALL active agents
- Use bare names like `worker` or `spec-reviewer` — always use task-suffixed names (`worker-N`)

**Always:**
- Update status.json at each state transition
- Include timestamps for debugging
- Include reasons when blocked
- **Assign task before spawning worker:** `TaskUpdate({ taskId, status: "in_progress", owner: "worker-N" })`
- **Parse and set dependencies** from `**Depends on:**` before starting execution
- **Spawn workers for ALL ready tasks** — do not serialize independent tasks
- Run BOTH gates (verify AND complexity) before completion
- Set status to "blocked" with gate details if any gate fails
- Request shutdown for `worker-N`, `spec-reviewer-N`, and `code-quality-reviewer-N` after each task
- Wait for shutdown acknowledgment (or 30s timeout) per task
- Do NOT run team cleanup at phase end (daemon needs the dirs)
- Log warning if agent doesn't acknowledge shutdown
