# Ephemeral Mini-Teams Design

## Problem

Team members in the orchestration system accumulate context bloat across multiple tasks. Workers and reviewers are spawned once per phase and handle all tasks sequentially, carrying forward context from previous tasks. This defeats the purpose of the orchestration layer, which should manage context effectively.

## Solution

Replace long-lived workers and reviewers with ephemeral "mini-teams" spawned per task. Each mini-team starts with fresh context scoped to a single task, collaborates until the task is complete, then exits.

## Core Model

### Mini-Team Composition

A mini-team for each task consists of:
- **1 worker** - implements the task
- **0-2 reviewers** - spec-reviewer and/or code-quality-reviewer, based on task requirements

All members:
- Start with fresh context (only what's needed for this task)
- Collaborate until the task passes review (or completes if no review needed)
- Exit when done - they don't persist to handle another task

### Team Lead

The team lead remains long-lived and coordinates the phase:
- Creates tasks from the plan
- Spawns mini-teams for each task (sequentially)
- Tracks progress via TaskList
- Checkpoints when its own context grows (existing mechanism)

### Sequential Execution

One mini-team at a time for this iteration. Parallelism will be added later once this model is stable.

## Task Context Flow

Mini-team members receive context from two sources:

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

### Mini-Team Lifecycle with Reviews

1. Team lead spawns worker + required reviewers together
2. Worker implements the task
3. Worker signals completion to reviewers (via team messaging)
4. Both reviewers review in parallel
5. If issues found: reviewer sends feedback to worker, worker fixes, re-signals
6. Loop continues until both approve (or single reviewer if spec-only)
7. All mini-team members exit

### Review Escalation

If a "no review" task turns out complex:
- Worker signals team lead: "This was more involved than expected, requesting review"
- Team lead spawns reviewers to join the mini-team

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
- Mini-team escalates to team lead
- Team lead can: provide guidance, adjust scope, or mark task as blocked
- Prevents infinite fix loops

### Task Failure

If worker cannot complete the task:
- Worker signals team lead with reason
- Team lead marks task as blocked
- Mini-team exits
- Team lead decides next steps (skip task, revise plan, ask user)

## Team Lead Coordination

### Task Execution Loop

1. At phase start, team lead creates all tasks from the plan
2. Team lead spawns mini-team for first unblocked task
3. Waits for mini-team to complete (all members exit)
4. Marks task as completed in TaskList
5. Spawns mini-team for next unblocked task
6. Repeat until all tasks done

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
- Mini-teams are ephemeral anyway, so no special handling needed

### Phase Completion

1. All tasks complete
2. Team lead spawns phase-reviewer
3. If approved, team lead signals completion to orchestrator

## Changes from Current Implementation

### What Changes

| Aspect | Current | New |
|--------|---------|-----|
| Worker lifecycle | Long-lived, handles multiple tasks | Ephemeral, one task then exit |
| Reviewer lifecycle | Long-lived, reviews multiple tasks | Ephemeral, one review then exit |
| Team spawn | Once at phase start | Mini-team per task |
| Worker count | 2 workers (mostly idle) | 1 worker per mini-team |
| Review trigger | Worker notifies persistent reviewers | Team lead spawns reviewers with worker |
| Task assignment | Team lead assigns to idle worker | Team lead spawns fresh worker for task |

### What Stays the Same

- Team lead role and lifecycle (long-lived, checkpoints)
- TaskList for tracking progress
- Team messaging for mini-team internal communication
- Phase reviewer at end of phase
- Checkpoint/rehydrate mechanism for team lead
- Planner creates implementation plan with tasks

### New Planner Responsibility

Mark each task with review requirements:
- `review: full` (default if not specified)
- `review: spec-only`
- `review: none`

## Future Work (Out of Scope)

### Parallel Mini-Teams

Once sequential execution is stable:
- Planner sets `blockedBy` dependencies between tasks
- Team lead spawns multiple mini-teams for independent tasks
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
