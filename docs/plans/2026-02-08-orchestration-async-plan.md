# Orchestration Async Improvements Plan

## Goal
Improve orchestration throughput without running phases in parallel by overlapping planning and review work, running consensus reviews concurrently, and enabling intra-phase task parallelism with explicit dependencies.

## Rationale
The current orchestration loop is serialized across phases and tasks, which creates idle time and longer end-to-end latency. We can safely add concurrency in three places that do not change the phase execution order.

- Plan-ahead during review overlaps planning with review, reducing idle time while minimizing plan staleness.
- Parallel consensus review eliminates a sequential bottleneck without changing correctness rules.
- Intra-phase task parallelism speeds execution when tasks are independent, but requires explicit dependencies to avoid conflicts.

We explicitly avoid phase parallelism because it increases cross-phase coupling and risk without proportional benefit.

## Scope
- Plan-ahead for the next phase only, triggered when the current phase enters review.
- Lightweight plan staleness validation before reusing a plan.
- Parallel consensus review with configurable secondary reviewer model.
- Required task dependencies in plans and unbounded intra-phase task scheduling.

## Non-goals
- Running phases in parallel.
- Backward compatibility for plans without dependencies.
- Redesigning the state machine beyond consensus handling and action payloads.

## Decisions
- Plan-ahead starts only when the current phase is in review.
- Plan-ahead is limited to the next phase only.
- Every plan task must include `Depends on`.
- Consensus review spawns two reviewers immediately when enabled.
- Secondary reviewer model is configurable.
- No concurrency cap for intra-phase task scheduling.
- Plan staleness thresholds are fixed to:
  - Warning if any plan target file changed since baseline.
  - Stop if more than 30% of plan target files changed since baseline.

## Plan of Record

### Step 1: Orchestrator skill updates
Update the orchestration flow to support plan-ahead during review and plan reuse validation.

Changes:
- Task dependency graph
  - `plan-phase-N` blocked by `validate-design` only.
  - `execute-phase-N` blocked by `plan-phase-N`.
  - `review-phase-N` blocked by `execute-phase-N`.
- Plan-ahead trigger
  - When executor reports `execute-N complete`, spawn reviewer N and then spawn planner for phase N+1 if it exists and is pending.
  - For plan-ahead planners, store `PLAN_PATH` in metadata and mark the plan task complete without calling `tina-session orchestrate advance`.
- Planner completion handling
  - Use `tina-session orchestrate next --feature X` to determine if phase N is active.
  - If active, call `advance plan_complete`.
  - If not active, treat as plan-ahead and only store metadata.
- Reuse plan gate
  - On `reuse_plan` action, run `tina:plan-validator`.
  - Pass or Warning proceeds to executor.
  - Stop triggers a replan for that phase.
- Parallel consensus review dispatch
  - If consensus enabled, spawn two reviewers immediately using primary and secondary models.

Files:
- /Users/joshua/Projects/tina/skills/orchestrate/SKILL.md

### Step 2: State machine changes for parallel consensus
Enable parallel consensus review in the core action and consensus logic.

Changes:
- Add `reviewer_secondary` to the model policy.
- Include `secondary_model` in `Action::SpawnReviewer` when consensus is enabled.
- Consensus logic stores the first verdict and returns `Wait`.
- The second verdict resolves pass, remediate, or disagreement.

Files:
- /Users/joshua/Projects/tina/tina-session/src/state/schema.rs
- /Users/joshua/Projects/tina/tina-session/src/state/orchestrate.rs

### Step 3: Planner requirements for dependencies and baseline
Make dependency and baseline information mandatory in plans.

Changes:
- Require `**Depends on:**` in every task.
- Require `**Plan Baseline:** <git sha>` in the plan header.
- Add plan lint rules for both.

Files:
- /Users/joshua/Projects/tina/agents/phase-planner.md

### Step 4: Lightweight plan staleness validation
Validate plan reuse against repository drift since plan creation.

Changes:
- Parse `Plan Baseline` from the plan file.
- Compute changed files: `git diff --name-only <baseline>..HEAD`.
- Extract plan target files from tasks.
- Emit status based on thresholds.

Files:
- /Users/joshua/Projects/tina/agents/plan-validator.md

### Step 5: Team lead DAG scheduler
Enable concurrent task execution inside a phase based on explicit dependencies.

Changes:
- Parse `Depends on` values into `blockedBy` during task creation.
- Replace the sequential loop with a ready-queue scheduler.
- Spawn workers for all ready tasks with no cap.
- Track worker and reviewer lifecycles per task.

Files:
- /Users/joshua/Projects/tina/skills/team-lead-init/SKILL.md

### Step 6: Optional status visibility improvement
Expose parallel progress in streaming updates.

Changes:
- Add `tasks_in_progress` to status update payloads.

Files:
- /Users/joshua/Projects/tina/tina-session/src/watch/status.rs

### Step 7: Tests
Update or add tests for consensus behavior and model policy propagation.

Changes:
- Update consensus tests for immediate dual reviewer spawn and `Wait` on first verdict.
- Add model policy serialization tests for `reviewer_secondary`.

Files:
- /Users/joshua/Projects/tina/tina-session/src/state/orchestrate.rs
- /Users/joshua/Projects/tina/tina-session/src/state/schema.rs

## Validation
- Run existing state machine tests in `tina-session`.
- Add or update tests for consensus flow and model policy.
- Run plan-validator against a plan with a known baseline and deliberate file drift.

## Rollout Strategy
- Merge in small steps by component to reduce risk.
- Start with parallel consensus review and plan-validator changes.
- Follow with plan-ahead during review and team-lead scheduler.
- Monitor early runs for plan staleness Stop rate and adjust thresholds if needed.

## Risks and Mitigations
- Risk: plan-ahead staleness. Mitigation: baseline tracking and validator gate.
- Risk: task conflicts with unbounded concurrency. Mitigation: required dependencies and explicit `Depends on`.
- Risk: consensus disagreement increases block rate. Mitigation: clear escalation path already in state machine.

