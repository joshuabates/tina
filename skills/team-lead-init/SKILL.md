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

## STEP 3b: Write team name to file for executor discovery

After team creation succeeds, write the team name to a file that the phase executor can discover:

```bash
TEAM_NAME="phase-$PHASE_NUM-execution"
TEAM_NAME_FILE=".claude/tina/phase-$PHASE_NUM/team-name.txt"
echo "$TEAM_NAME" > "$TEAM_NAME_FILE"
```

This enables the phase executor (from the orchestrator's team) to monitor the team-lead's task progress.

---

## STEP 4: Create tasks from plan (NO worker spawn yet)

Read the plan file and create tasks via TaskCreate for each task in the plan.

**Parse model from each task:** Look for `**Model:** <model>` line in each task section. Store in task metadata:
```json
TaskCreate {
  "subject": "Task N: <description>",
  "description": "<full task content>",
  "metadata": { "model": "<haiku|sonnet|opus>" }
}
```

Do NOT spawn workers or reviewers yet. The team is just a container at this point.

---

## STEP 5: Begin task execution loop

For each task in priority order:

1. **Spawn worker for this task:**
   Get the model from task metadata (via TaskGet), then spawn with that model:
   ```json
   {
     "subagent_type": "tina:implementer",
     "team_name": "phase-<N>-execution",
     "name": "worker",
     "model": "<model from task metadata>",
     "prompt": "Implement task: <task subject and description>. Use TDD."
   }
   ```
   The `model` field controls which model the implementer uses (haiku, sonnet, or opus).

2. **Wait for worker to complete implementation**
   Monitor for Teammate messages from worker indicating completion.

3. **Spawn reviewers for this task:**
   - spec-reviewer: Review implementation against spec
   - code-quality-reviewer: Review code quality

4. **Wait for both reviews to pass**
   Monitor for Teammate messages from spec-reviewer and code-quality-reviewer.

5. **Shut down worker and reviewers:**
   ```json
   {
     "operation": "requestShutdown",
     "target_agent_id": "worker",
     "reason": "Task complete"
   }
   ```
   Repeat for each agent (worker, spec-reviewer, code-quality-reviewer if spawned).
   Wait for shutdown acknowledgment from each before proceeding.

6. **Mark task complete, loop to next task**

This ephemeral model gives each task a fresh context window.

---

## STEP 6: On completion

1. All tasks complete (workers/reviewers already shut down per-task)
2. Clean up team resources at phase end: `Teammate { operation: "cleanup" }`
   (Required unless supervisor will reuse the team for another phase)
3. Update status.json to "complete"
4. Wait for supervisor to kill session

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
/team-lead-init docs/plans/2026-01-26-feature-phase-1.md
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

## The Process (Ephemeral Model)

```dot
digraph team_lead_init_ephemeral {
    rankdir=TB;

    "Read plan file" [shape=box];
    "Extract phase number from path" [shape=box];
    "Initialize status.json" [shape=box];
    "Create team container" [shape=box];
    "Create tasks from plan" [shape=box];
    "More tasks?" [shape=diamond];
    "Spawn worker for task" [shape=box];
    "Wait for implementation" [shape=box];
    "Spawn reviewers" [shape=box];
    "Wait for reviews" [shape=box];
    "Shut down worker + reviewers" [shape=box];
    "Mark task complete" [shape=box];
    "Set status = complete" [shape=box];
    "Wait for supervisor" [shape=box];

    "Read plan file" -> "Extract phase number from path";
    "Extract phase number from path" -> "Initialize status.json";
    "Initialize status.json" -> "Create team container";
    "Create team container" -> "Create tasks from plan";
    "Create tasks from plan" -> "More tasks?";
    "More tasks?" -> "Spawn worker for task" [label="yes"];
    "More tasks?" -> "Set status = complete" [label="no"];
    "Spawn worker for task" -> "Wait for implementation";
    "Wait for implementation" -> "Spawn reviewers";
    "Spawn reviewers" -> "Wait for reviews";
    "Wait for reviews" -> "Shut down worker + reviewers";
    "Shut down worker + reviewers" -> "Mark task complete";
    "Mark task complete" -> "More tasks?";
    "Set status = complete" -> "Wait for supervisor";
}
```

## Team Spawning (Ephemeral Model)

Team-lead uses an ephemeral spawning model where workers and reviewers are created per-task, not per-phase.

**Why ephemeral?**
- Fresh context window for each task (no accumulated context)
- Cleaner handoffs between tasks
- Simpler checkpoint/recovery (no team composition to save)
- Each worker starts with full context budget for their specific task

**Phase initialization (once):**

Use the Teammate tool with operation "spawnTeam":
- team_name: "phase-N-execution" (replace N with actual phase number)
- agent_type: "team-lead"
- description: "Phase N execution team"

This creates the team container. NO workers or reviewers are spawned yet.

**Write team name for executor discovery:**

After team creation, write the team name to a discoverable file:

```bash
mkdir -p ".claude/tina/phase-$PHASE_NUM"
echo "phase-$PHASE_NUM-execution" > ".claude/tina/phase-$PHASE_NUM/team-name.txt"
```

This file is read by the phase executor to know which team's tasks to monitor.

**Per-task spawning:**

For each task:

1. Spawn ONE worker for the current task
2. Wait for implementation
3. Spawn reviewers (spec-reviewer, code-quality-reviewer)
4. Wait for reviews to pass
5. Shut down all three agents
6. Move to next task

**Worker spawn:**

Get the model from the current task's metadata first:
```json
TaskGet { "taskId": "<current-task-id>" }
# Read metadata.model from response
```

Then spawn with that model:
```json
{
  "subagent_type": "tina:implementer",
  "team_name": "phase-N-execution",
  "name": "worker",
  "model": "<metadata.model>",
  "prompt": "Implement task: <task subject and description>. Use TDD."
}
```

The model field accepts: `haiku`, `sonnet`, or `opus`. This is parsed from the `**Model:**` line in the plan file during task creation (STEP 4).

**Reviewer spawns:**
```json
{
  "subagent_type": "tina:spec-reviewer",
  "team_name": "phase-N-execution",
  "name": "spec-reviewer",
  "prompt": "Review implementation for task: <task subject>. Check spec compliance."
}
```

```json
{
  "subagent_type": "tina:code-quality-reviewer",
  "team_name": "phase-N-execution",
  "name": "code-quality-reviewer",
  "prompt": "Review code quality for task: <task subject>. Check architecture and patterns."
}
```

## Team Shutdown

With the ephemeral model, shutdown happens at two levels:

**Per-task shutdown (after each task completes):**

After reviews pass for a task, shut down worker and reviewers:

```json
{
  "operation": "requestShutdown",
  "target_agent_id": "worker",
  "reason": "Task complete"
}
```

Repeat for each agent (worker, spec-reviewer, code-quality-reviewer if spawned).
Monitor for Teammate messages confirming shutdown acknowledgment before spawning agents for the next task.

**Phase-end cleanup:**

When all tasks complete:
- No workers/reviewers to shut down (already cleaned up per-task)
- Clean up team resources with Teammate `cleanup` operation (required unless supervisor will reuse the team)
- Update status.json to "complete"

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

**Worker fails during task:**
- Shut down failed worker
- Retry with fresh worker (one retry)
- If still fails: Set status = blocked with reason
- Exit

**Reviewer rejects repeatedly:**
- After 3 rejections for same task, escalate
- Shut down active worker/reviewers
- Set status = blocked with rejection context
- Exit

**Worker/reviewer unresponsive:**
- Shut down unresponsive agent
- Spawn replacement (ephemeral model makes this easy)
- If replacement also fails: Set status = blocked

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

**Spawns (per-task):**
- `tina:implementer` - Worker to implement current task
- `tina:spec-reviewer` - Reviews implementation against spec
- `tina:code-quality-reviewer` - Reviews code quality

**Responds to:**
- `/checkpoint` - Invokes checkpoint skill for context management
- `/rehydrate` - Invokes rehydrate skill after context reset

**State files:**
- `.claude/tina/phase-N/status.json` - Phase execution status
- `.claude/tina/phase-N/team-name.txt` - Team name for executor discovery

## Red Flags

**Never:**
- Start executing without setting status to "executing"
- Finish without setting status to "complete" or "blocked"
- Swallow errors (always update status with reason)

**Always:**
- Update status.json at each state transition
- Include timestamps for debugging
- Include reasons when blocked
