# Ephemeral Team Members Design

## Problem

Team members in the orchestration system accumulate context bloat across multiple tasks. Workers and reviewers are spawned once per phase and handle all tasks sequentially, carrying forward context from previous tasks. This defeats the purpose of the orchestration layer, which should manage context effectively.

## Solution

Keep the existing team structure but make workers and reviewers ephemeral. For each task, team lead spawns fresh workers/reviewers into the team, they collaborate on the task, then team lead shuts them down. Next task gets fresh workers/reviewers with clean context.

## Core Model

### Team Structure (Unchanged)

One team per phase, same as today:
- Team created via `Teammate.spawnTeam()`
- Team lead coordinates the phase
- Workers and reviewers are team members
- Teammate messaging for communication

### Ephemeral Team Members

For each task, team lead spawns:
- **1 worker** - implements the task
- **0-2 reviewers** - spec-reviewer and/or code-quality-reviewer, based on task requirements

These members:
- Start with fresh context (only what's needed for this task)
- Collaborate until the task passes review
- Get shut down by team lead via `requestShutdown` when task completes
- Don't persist to handle another task

### Team Lead

The team lead remains long-lived and coordinates the phase:
- Creates tasks from the plan
- Spawns workers/reviewers for each task
- Shuts them down after task completes
- Spawns fresh workers/reviewers for next task
- Tracks progress via TaskList
- Checkpoints when its own context grows (existing mechanism)

### Sequential Execution

One set of workers/reviewers at a time for this iteration. Parallelism (multiple workers on independent tasks) will be added later once this model is stable.

## Task Context Flow

Workers and reviewers receive context from two sources:

### Task Description (Persistent)

Stored in TaskList, set by the planner:
- The specification: what to build, acceptance criteria, constraints
- Readable by anyone via TaskGet
- Survives crashes, checkpoints, restarts

### Spawn Message (Ephemeral)

Provided by team lead at spawn time:
- Operational context: relevant file paths, hints, discoveries from earlier tasks
- Tailored to the moment - can include dynamic info
- Lost if agent crashes (but task description survives for respawn)

### Example Flow

1. Planner writes task: "Add validation to user input form. Acceptance: email format validated, error shown on invalid input."
2. Team lead spawns worker with message: "Task 3 is ready. Relevant files: `src/components/UserForm.tsx`, `src/utils/validation.ts`. Pattern note: other forms use `useFormValidation` hook."
3. Worker reads task via TaskGet, has both spec and operational context
4. Worker implements with fresh context scoped to this task

## Review Flow

### Review Requirements

Planner marks review requirements per task:
- `review: full` - both spec-reviewer and code-quality-reviewer (default)
- `review: spec-only` - just spec-reviewer
- `review: none` - no reviewers (for mechanical tasks like file moves)

### Task Lifecycle with Reviews

1. Team lead spawns worker + required reviewers into the team
2. Worker implements the task
3. Worker signals completion to reviewers (via team messaging)
4. Both reviewers review in parallel
5. If issues found: reviewer sends feedback to worker, worker fixes, re-signals
6. Loop continues until both approve (or single reviewer if spec-only)
7. Team lead shuts down worker and reviewers

### Review Escalation

If a "no review" task turns out complex:
- Worker signals team lead: "This was more involved than expected, requesting review"
- Team lead spawns reviewers to join the worker

## Handling Review Failures

### Feedback Loop

1. Reviewer sends feedback to worker via team messaging
2. Worker fixes the issue
3. Worker re-signals reviewers: "Fixed, ready for re-review"
4. Reviewers re-review
5. Repeat until both approve

Context accumulation within a task is acceptable - it's all the same task.

### Iteration Limit

If review loop exceeds 3 iterations:
- Worker escalates to team lead
- Team lead can: provide guidance, adjust scope, or mark task as blocked
- Prevents infinite fix loops

### Task Failure

If worker cannot complete the task:
- Worker signals team lead with reason
- Team lead marks task as blocked
- Team lead shuts down worker and reviewers
- Team lead decides next steps (skip task, revise plan, ask user)

## Team Lead Coordination

### Task Execution Loop

1. At phase start, team lead creates all tasks from the plan
2. Team lead spawns worker + reviewers for first unblocked task
3. Waits for task to complete (reviews pass)
4. Team lead shuts down worker and reviewers
5. Marks task as completed in TaskList
6. Spawns fresh worker + reviewers for next unblocked task
7. Repeat until all tasks done

### Staying Lean

Team lead doesn't accumulate task implementation details. It tracks only:
- Which tasks are done
- Which task is in progress
- What's blocked and why

### Checkpoint Behavior

Existing mechanism continues:
- Team lead checkpoints when its own context grows too large
- Writes handoff file with TaskList state
- Rehydrates with fresh context, continues from where it left off
- Workers/reviewers are ephemeral anyway, so no special handling needed

### Phase Completion

1. All tasks complete
2. Team lead spawns phase-reviewer
3. If approved, team lead signals completion to orchestrator

## Changes from Current Implementation

### What Changes

| Aspect | Current | New |
|--------|---------|-----|
| Worker lifecycle | Long-lived, handles multiple tasks | Ephemeral, one task then shutdown |
| Reviewer lifecycle | Long-lived, reviews multiple tasks | Ephemeral, one review then shutdown |
| Team spawn | Once at phase start | Team once, members per task |
| Worker count | 2 workers (mostly idle) | 1 worker per task |
| Review trigger | Worker notifies persistent reviewers | Team lead spawns reviewers with worker |
| Task assignment | Team lead assigns to idle worker | Team lead spawns fresh worker with task context |

### What Stays the Same

- Team lead role and lifecycle (long-lived, checkpoints)
- TaskList for tracking progress
- Team messaging for worker/reviewer communication
- Phase reviewer at end of phase
- Checkpoint/rehydrate mechanism for team lead
- Planner creates implementation plan with tasks

### New Planner Responsibility

Mark each task with review requirements:
- `review: full` (default if not specified)
- `review: spec-only`
- `review: none`

## Future Work (Out of Scope)

### Parallel Workers

Once sequential execution is stable:
- Planner sets `blockedBy` dependencies between tasks
- Team lead spawns multiple workers for independent tasks
- As tasks complete, newly unblocked tasks become available
- Planner prevents file conflicts via dependencies

### Dynamic Team Composition

Not addressed in this design:
- Different worker types for different task types
- Scaling reviewer count based on task complexity
- Worker specialization

## Success Metrics

1. Team members start with fresh context for each task
2. No context bleeding between unrelated tasks
3. Existing orchestration flow continues to work
4. Phase completion quality maintained (reviews still catch issues)

## Architectural Context

**Patterns to follow:**
- Team spawning via Teammate tool: `skills/team-lead-init/SKILL.md:47-55`
- Agent spawning via Task tool: `skills/team-lead-init/SKILL.md:57-75`
- Agent definition format: `agents/implementer.md` (frontmatter + instructions)
- Review communication protocol: `agents/spec-reviewer.md:47-80`
- Shutdown protocol: `agents/implementer.md:58-72`

**Code to reuse:**
- `skills/executing-plans/SKILL.md` - Core execution flow (modify Team Mode sections)
- `skills/team-lead-init/SKILL.md` - Team initialization (change member spawning to per-task)
- `skills/checkpoint/SKILL.md` - Checkpoint protocol (simplify - shut down any active members first)
- `skills/rehydrate/SKILL.md` - Rehydration (simplify - no members to restore, just TaskList)
- `agents/implementer.md` - Worker agent (simplify team mode behavior)
- `agents/spec-reviewer.md` - Spec reviewer (simplify team mode behavior)
- `agents/code-quality-reviewer.md` - Quality reviewer (simplify team mode behavior)

**Anti-patterns:**
- Don't spawn workers then assign tasks - spawn worker WITH task context in prompt
- Don't keep workers alive between tasks - shut them down after each task
- Don't track review state in team lead - worker/reviewer handle internally

**Integration:**
- Entry: `skills/team-lead-init/SKILL.md` - creates team once, spawns members per task
- Entry: `skills/executing-plans/SKILL.md` - Team Mode sections need rewrite for ephemeral model
- Connects to: `agents/planner.md` - needs `review:` field in task format
- Connects to: `skills/checkpoint/SKILL.md` - shut down active members before checkpoint
- Connects to: `skills/rehydrate/SKILL.md` - restore TaskList only, no members to restore

**Key architectural decisions:**
1. One team per phase via `Teammate.spawnTeam()` (unchanged)
2. Workers/reviewers spawned per task via Task tool with `team_name` parameter
3. Team lead shuts down workers/reviewers via `requestShutdown` after task completes
4. Worker spawns with task context in prompt (not via TaskUpdate assignment)
5. Reviewers spawned alongside worker, receive task ID in spawn prompt
6. All members use same team_name for Teammate messaging
