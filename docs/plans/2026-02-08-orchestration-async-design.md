# Orchestration Async Improvements

## Problem

The current orchestration loop is fully serialized across phases and tasks, creating idle time and longer end-to-end latency. Three safe concurrency opportunities exist that don't change phase execution order:

1. **Plan-ahead during review** - overlap next-phase planning with current-phase review
2. **Parallel consensus review** - spawn two reviewers simultaneously instead of sequentially
3. **Intra-phase task parallelism** - run independent tasks concurrently within a phase

## Success Metrics

- Plan-ahead reduces inter-phase idle time (planning starts before review completes)
- Consensus review runs two reviewers in parallel when enabled
- Intra-phase tasks with no dependencies execute concurrently
- Plan staleness validator gates reuse of pre-computed plans
- All existing state machine tests continue to pass

## Non-goals

- Running phases in parallel
- Backward compatibility for plans without dependencies
- Redesigning the state machine beyond consensus handling and action payloads

## Decisions

- Plan-ahead starts only when the current phase enters review
- Plan-ahead is limited to the next phase only
- Every plan task must include `Depends on`
- Consensus review spawns two reviewers immediately when enabled
- Secondary reviewer model is configurable via `reviewer_secondary` in model policy
- No concurrency cap for intra-phase task scheduling
- Plan staleness thresholds: Warning if any target file changed; Stop if >30% changed

## Phase 1: Parallel Consensus Review + State Machine

Combine the state machine changes and orchestrator dispatch for parallel consensus review.

### 1a. State machine changes (tina-session)

**Files:** `tina-session/src/state/schema.rs`, `tina-session/src/state/orchestrate.rs`

- Add `reviewer_secondary` to model policy in schema
- Include `secondary_model` in `Action::SpawnReviewer` when consensus enabled
- Consensus logic: first verdict stores result and returns `Wait`; second verdict resolves pass/remediate/disagreement
- Add tests for dual reviewer spawn and `Wait` on first verdict
- Add model policy serialization tests for `reviewer_secondary`

### 1b. Orchestrator skill dispatch for consensus

**Files:** `skills/orchestrate/SKILL.md`

- When consensus enabled and review phase starts, spawn two reviewers (primary + secondary model)
- Handle two reviewer messages: first returns `Wait`, second resolves

## Phase 2: Plan-Ahead During Review

Enable overlapping next-phase planning with current-phase review.

### 2a. Orchestrator skill updates

**Files:** `skills/orchestrate/SKILL.md`

- Change task dependency graph: `plan-phase-N` blocked by `validate-design` only (not `review-phase-(N-1)`)
- Plan-ahead trigger: when executor reports `execute-N complete`, spawn reviewer N AND planner N+1 if pending
- Planner completion handling: use `tina-session orchestrate next` to determine if phase is active; if not, treat as plan-ahead (store metadata only, no `advance` call)

### 2b. Plan reuse gate

**Files:** `skills/orchestrate/SKILL.md`

- On `reuse_plan` action from CLI, run `tina:plan-validator` agent
- Pass or Warning: proceed to executor
- Stop: trigger replan for that phase

## Phase 3: Plan Dependencies and Staleness Validation

Make dependency and baseline information mandatory, and add staleness validation.

### 3a. Planner requirements

**Files:** `agents/phase-planner.md`

- Require `**Depends on:**` in every task (use "none" for independent tasks)
- Require `**Plan Baseline:** <git sha>` in plan header
- Add plan lint rules to validate both requirements

### 3b. Plan staleness validator

**Files:** `agents/plan-validator.md`

- Parse `Plan Baseline` from plan file
- Compute changed files: `git diff --name-only <baseline>..HEAD`
- Extract plan target files from tasks
- Emit Pass/Warning/Stop based on thresholds (any change = Warning, >30% = Stop)

## Phase 4: Team Lead DAG Scheduler + Status Visibility

Enable concurrent task execution inside a phase and expose progress.

### 4a. DAG scheduler

**Files:** `skills/team-lead-init/SKILL.md`

- Parse `Depends on` values from plan tasks into `blockedBy` during task creation
- Replace sequential task loop with ready-queue scheduler
- Spawn workers for all ready tasks (no concurrency cap)
- Track worker and reviewer lifecycles per task

### 4b. Status visibility

**Files:** `tina-session/src/watch/status.rs`

- Add `tasks_in_progress` array to status update payloads
- Enables tina-web and monitoring to show parallel task progress

## Dependencies

- Phases 1-3 are independent and can proceed in any order
- Phase 4 depends on Phase 3 (DAG scheduler needs `Depends on` in plans)

## Estimated Scope

- Phase 1: Medium (Rust state machine + skill updates)
- Phase 2: Small-Medium (skill-only changes + reuse gate logic)
- Phase 3: Small (agent definition updates + lint rules)
- Phase 4: Medium (scheduler rewrite + status field)

## Architectural Context

**Patterns to follow:**
- CLI subcommands: `tina-session/src/main.rs:24-240` (clap derive pattern with `Commands` enum)
- State machine transitions: `tina-session/src/state/orchestrate.rs:124-541` (`advance_state()` takes event, returns Action)
- Action enum: `tina-session/src/state/orchestrate.rs:20-96` (each variant carries its own data)
- Model policy: `tina-session/src/state/schema.rs:246-295` (fields with defaults, serde rename)
- ReviewVerdict: `tina-session/src/state/schema.rs:297-303` (vec stored in PhaseState for consensus)
- Plan reuse: `tina-session/src/state/orchestrate.rs:165-200` (`reuse_plan_if_present` checks two locations)
- Orchestrator event loop: `skills/orchestrate/SKILL.md:238-337` (CLI-delegated state transitions)
- Team lead task scheduling: `skills/team-lead-init/SKILL.md:110-191` (sequential: spawn→wait→review→shutdown→next)
- Plan lint rules: `agents/phase-planner.md:210-243` (error vs warning severity)
- StatusUpdate struct: `tina-session/src/watch/status.rs:24-48`

**Code to reuse:**
- `tina-session/src/state/orchestrate.rs:420-541` - existing consensus handling (refactor from sequential to parallel)
- `tina-session/src/state/orchestrate.rs:165-200` - `reuse_plan_if_present()` for plan-ahead reuse gate
- `agents/plan-validator.md:30-167` - existing validation checks (add staleness as new check type)
- `tina-session/src/watch/status.rs:316-376` - task progress tracking (extend for parallel tasks)

**Anti-patterns:**
- Don't hardcode haiku as second reviewer model: `tina-session/src/state/orchestrate.rs:429` (use `reviewer_secondary` from policy instead)
- Don't spawn second reviewer from `advance_state`: current flow returns `SpawnReviewer` for second reviewer from inside `advance_state` (line 428). For parallel spawn, the orchestrator skill should spawn both; `advance_state` should return `Wait` on first verdict and resolve on second.

**Integration:**
- Phase 1 entry: `tina-session/src/state/orchestrate.rs:416` (ReviewPass handler) and `orchestrate.rs:498` (ReviewGaps handler)
- Phase 1 schema: `tina-session/src/state/schema.rs:246-295` (add `reviewer_secondary` to ModelPolicy)
- Phase 2 entry: `skills/orchestrate/SKILL.md` STEP 5 event loop (executor-N complete handler)
- Phase 3 entry: `agents/phase-planner.md:210-243` (add lint rules for `Depends on` and `Plan Baseline`)
- Phase 4 entry: `skills/team-lead-init/SKILL.md:110-191` (replace sequential loop with DAG scheduler)
