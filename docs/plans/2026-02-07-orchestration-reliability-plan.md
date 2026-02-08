# Orchestration Reliability, CLI Control, and Monitoring Plan

## Overview

This plan converts the audit findings into a phased implementation roadmap. It preserves the current `/tina:orchestrate` UX while making CLI-managed state transitions authoritative. Each phase includes explicit problem framing and a concrete solution strategy to reduce agent error surface, unify data contracts, and improve monitoring and operator control.

## Problem Statement

The orchestration stack has systemic issues that cause stalls, silent failures, and inconsistent observability:

1. **Contract mismatches** between orchestrator, agents, and metadata prevent the event loop from advancing.
2. **Naming and directory conventions diverge** across `tina-session`, `tina-data`, and skills, breaking discovery and monitoring.
3. **Message formats are underspecified**, making error handling and retries unreliable.
4. **Critical orchestration state lives in agent memory**, not CLI-managed files.
5. **Monitoring lacks authoritative event history**, so post-mortems and live triage are weak.
6. **Model delegation is manual and inconsistent**, so quality gates are uneven.

## Goals

1. Orchestration progresses deterministically without manual task edits.
2. CLI is the source of truth for phase lifecycle and state transitions.
3. Monitoring surfaces accurate real-time and historical execution state.
4. Resume and recovery are reliable after crashes or timeouts.
5. Model delegation is explicit and enforceable.
6. `/tina:orchestrate` remains the standard entry point.

## Non-Goals

- Replacing tmux-based execution.
- Rewriting the task/team data model.
- Changing the overall design → plan → execute → review workflow.

---

## Success Metrics

**Goal:** 95% of orchestration runs complete without manual task edits across 10 harness runs.

**Baseline command:**
```bash
mise run harness:run 01-single-phase-feature -- --full | tee /tmp/tina-baseline.log
```

**Progress command:**
```bash
mise run harness:run 01-single-phase-feature -- --full | tee /tmp/tina-progress.log
```

**ROI threshold:** ≥ 0.7 (ratio of fixed issues to new regressions).

---

## Phase Estimates

| Phase | Focus | Est. Dev Days |
|------|------|---------------|
| Phase 1 | Contract + metadata fixes | 2–3 |
| Phase 2 | Naming + directory unification | 2 |
| Phase 3 | Reliability hardening | 3–4 |
| Phase 4 | CLI orchestrator core | 4–6 |
| Phase 5 | Monitoring + interaction tooling | 4–6 |
| Phase 6 | Model delegation upgrades | 2–3 |

---

## Phase 1: Contract and Metadata Fixes (Unblock Pipeline)

### Problem

The orchestration event loop assumes specific metadata fields and completion message formats, but current agent and task definitions do not provide them. This causes stalls and broken remediation paths:
- Validators and reviewers can’t write reports because `output_path` is missing.
- Reviewers can’t compute metrics because `plan_path` is missing.
- Orchestrator expects `VALIDATION_STATUS:` messages that validators don’t emit.
- Planner/executor error formats are not standardized, so retries are unreliable.
- Team lead initialization expects `team_name`, but the CLI does not supply it.
- Plan reuse checks a path that the planner never writes.

### Solution

Make metadata and message formats explicit and consistent across skills, agents, and CLI prompts. This phase focuses on correctness of handoffs, not architectural changes.

### Implementation Details

- Extend orchestrator task metadata to include required fields for validator and reviewer.
- Add explicit completion and error formats in agent instructions.
- Ensure the CLI passes `team_name` and `worktree_path` into the team-lead-init prompt (or update team-lead-init to derive them from `supervisor-state.json`).
- Align plan reuse logic with the actual plan output path.

### Tasks

1. Add `output_path` to `validate-design` metadata in `/Users/joshua/Projects/tina/skills/orchestrate/SKILL.md`.
2. Add `plan_path` and `output_path` to `review-phase-N` metadata in `/Users/joshua/Projects/tina/skills/orchestrate/SKILL.md`.
3. Define `VALIDATION_STATUS: Pass|Warning|Stop` completion message format in `/Users/joshua/Projects/tina/agents/design-validator.md`.
4. Define `plan-phase-N error: <reason>` and `execute-N error: <reason>` formats in `/Users/joshua/Projects/tina/agents/phase-planner.md` and `/Users/joshua/Projects/tina/agents/phase-executor.md`.
5. Pass `team_name` and `worktree_path` into the team lead invocation by updating `/Users/joshua/Projects/tina/tina-session/src/commands/start.rs`.
6. Fix plan reuse checks in `/Users/joshua/Projects/tina/skills/orchestrate/SKILL.md` to match planner output.

### Deliverables

- Updated skills and agents with consistent metadata and message contracts.
- Updated `tina-session start` prompt format.

### Validation

- Single-phase harness run completes without manual task edits.
- Orchestrator event loop advances on validator/planner/executor messages.

---

## Phase 2: Naming and Directory Unification

### Problem

Monitoring and task discovery fail because naming conventions are inconsistent:
- Orchestrator uses `<feature>-orchestration`, but data loaders look for `<feature>-orchestrator` or `<feature>-phase`.
- Task directories are read by team name in `tina-data` but by `lead_session_id` in daemon sync.
- Resume detection checks for `~/.claude/teams/<team>.json`, but teams are stored as directories with `config.json`.

### Solution

Introduce a canonical naming utility and make all code paths use it. Align task directory resolution across data loaders and daemon sync. Update fixtures to reflect the unified naming scheme.

### Implementation Details

- Centralize naming in `tina-session` and export helper functions for team name, session name, and task directory identifiers.
- Update `tina-data` and `tina-session` daemon sync to use the same rule for task directories.
- Update resume detection and cleanup logic to look for directory-based team configs.

### Tasks

1. Add naming helpers in `tina-session` and reuse them in skills and data access.
2. Align orchestrator team naming in `/Users/joshua/Projects/tina/tina-data/src/lib.rs` with `<feature>-orchestration`.
3. Unify task directory resolution in `/Users/joshua/Projects/tina/tina-data/src/lib.rs` and `/Users/joshua/Projects/tina/tina-session/src/daemon/sync.rs`.
4. Update fixtures in `tina-monitor` tests to match the unified convention.

### Deliverables

- Single naming convention enforced across the stack.
- Monitoring tools show correct task counts and current task for a live run.

### Validation

- `tina-monitor` and `tina-web` display accurate orchestration data during a harness run.

---

## Phase 3: Reliability Hardening

### Problem

Long-running phases and crashes lead to ambiguous states:
- `tina-session wait` times out without clear error semantics.
- Sessions can die without explicit state transitions.
- Dependency installs run unconditionally and can mutate repos.

### Solution

Add explicit heartbeat and failure states, make timeouts first-class, and reduce hidden side effects during phase start.

### Implementation Details

- Add heartbeat timestamps in phase status files.
- Make `tina-session wait` emit a clear `timeout` or `session_died` status.
- Track retry metadata in task updates so orchestrator decisions are deterministic.
- Make dependency installation opt-in or gated by a flag.

### Tasks

1. Add heartbeat timestamps in `.claude/tina/phase-N/status.json` updates.
2. Extend `/Users/joshua/Projects/tina/tina-session/src/commands/wait.rs` to emit explicit timeout and session death results.
3. Add retry metadata tracking and limit enforcement in `/Users/joshua/Projects/tina/skills/orchestrate/SKILL.md`.
4. Gate dependency installation in `/Users/joshua/Projects/tina/tina-session/src/commands/start.rs`.

### Deliverables

- Clear timeout detection with explicit error states.
- Reduced false positives on long phases.

### Validation

- Simulated tmux crash yields `execute-N error: session_died` and clean orchestration exit.

---

## Phase 4: CLI Orchestrator Core

### Problem

Critical orchestration logic lives in agent prompt parsing and manual task updates. This is error-prone and hard to resume after crashes.

### Solution

Move the orchestration state machine into a CLI command so skills only trigger it, not implement it. Store canonical state in `supervisor-state.json` and SQLite.

### Implementation Details

- Add a `tina-session orchestrate` command that creates tasks, wires dependencies, updates metadata, and handles resume/retry logic.
- Store plan paths and phase state in `supervisor-state.json` so the CLI can resume without agent memory.
- Add CLI helpers for `task get`, `task update`, and `phase status`.
- Update `/tina:orchestrate` skill to call CLI rather than perform the loop itself.

### Tasks

1. Implement `tina-session orchestrate` in `/Users/joshua/Projects/tina/tina-session/src/commands/`.
2. Store plan paths and phase state in `supervisor-state.json`.
3. Add CLI helpers for task metadata and phase status.
4. Update `/Users/joshua/Projects/tina/skills/orchestrate/SKILL.md` to delegate to CLI.

### Deliverables

- CLI-driven orchestration state machine.
- Skills become a thin wrapper over CLI actions.

### Validation

- Orchestration runs through CLI even after a forced restart.

---

## Phase 5: Monitoring and Interaction Tooling

### Problem

Monitoring lacks an authoritative event history and operator controls. Troubleshooting requires manual inspection of files and tmux panes.

### Solution

Persist task and message events in SQLite and expose operator controls in `tina-web` and `tina-monitor`.

### Implementation Details

- Add an event log table to SQLite for agent messages and task transitions.
- Expose pause/resume/retry actions in `tina-web`.
- Add stuck-task detection with explicit alerts and suggested remediation.

### Tasks

1. Store agent messages and task state changes as events in SQLite.
2. Add pause/resume/retry/attach controls to `tina-web`.
3. Add stuck-task detection and alerts to `tina-monitor` and `tina-web`.

### Deliverables

- Timeline view in `tina-web` with per-phase history.
- Operator controls to manage stuck phases.

### Validation

- Full run shows complete history and actionable controls.

---

## Phase 6: Model Delegation Upgrades

### Problem

Model use is inconsistent and under-enforced, so quality gates vary across phases and reviewers.

### Solution

Add deterministic routing rules and optional multi-model consensus for critical review steps.

### Implementation Details

- Add a Codex-based “plan lint” step before execution.
- Use dual-model validation for design reviews.
- Require consensus before marking `review-N complete (pass)`.

### Tasks

1. Add a plan lint step in the pipeline using Codex.
2. Add dual-model validation for design review reports.
3. Add optional consensus enforcement before approving phase review.

### Deliverables

- Configurable model routing policy.
- Plan lint report artifact produced before execution.

### Validation

- A plan missing model tags fails lint before execution.

---

## Risks and Mitigations

1. **Risk:** CLI orchestrator changes break existing flows.
   Mitigation: ship Phase 4 behind a flag and keep `/tina:orchestrate` stable.

2. **Risk:** Monitoring data becomes inconsistent during transition.
   Mitigation: backfill via daemon sync and keep dual read paths during migration.

3. **Risk:** Additional gating slows execution too much.
   Mitigation: make lint/consensus configurable and default to opt-in.

---

## Next Step

If this plan looks right, I can convert Phase 1 into a concrete implementation plan (task-by-task with exact file edits and commands).
