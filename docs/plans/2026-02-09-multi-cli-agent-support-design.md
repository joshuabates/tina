# Multi-CLI Agent Support

## Executive Summary

Add Codex CLI execution to TINA while keeping Claude Code as the only orchestrator and state owner. Routing is model-driven: Claude-family models stay on existing teammate dispatch, Codex-family models execute through `tina-session exec-codex` via a Claude adapter skill.

This revision includes a full architecture review against the current codebase and closes gaps required for an implementation-ready design.

## Team Research Findings (Closed Gaps)

| Perspective | Finding in current draft | Required correction |
|-------------|--------------------------|---------------------|
| Runtime | `tina-session check plan` currently rejects anything except `opus`/`haiku` | Expand plan validation so Codex model names are valid |
| Workflow | `skills/team-lead-init/SKILL.md` hardcodes `model: "<haiku|opus>"` | Make model parsing free-form and route by CLI family |
| Data | `register_team()` writes `teams`, not `teamMembers` | Add dedicated `upsert_team_member` path for Codex executions |
| Reliability | `exec-codex` contract had no timeout/cancel/idempotency definition | Define strict synchronous v1 contract with run IDs and failure semantics |
| Cohesion | Routing logic location was ambiguous | Make `tina-session` the source of truth and have skills consume it |

## Goals

- Route selected tasks/roles to Codex without changing the orchestration state machine.
- Keep Claude responsible for task transitions, retries, consensus logic, and user messaging.
- Track Codex runs in Convex with the same observability quality as Claude teammates.
- Preserve backward compatibility for existing `opus`/`haiku` workflows.

## Non-Goals

- Codex as orchestrator.
- Codex participating directly in Team protocol primitives (`TeamCreate`, `SendMessage`, `TaskUpdate`).
- New UI for routing configuration in this phase.
- Interactive tmux Codex sessions in v1 (deferred until lifecycle tracking exists).

## Revised Architecture

### 1. Routing (Single Source of Truth)

Routing logic lives in `tina-session` and is reused by skills.

```rust
enum AgentCli {
    Claude,
    Codex,
}

fn cli_for_model(model: &str, routing: &CliRouting) -> AgentCli {
    if routing.codex_exact.iter().any(|m| m == model)
        || routing.codex_prefixes.iter().any(|p| model.starts_with(p))
    {
        AgentCli::Codex
    } else {
        AgentCli::Claude
    }
}
```

Model normalization rules:

1. `codex` alias resolves to `config.codex.default_model`.
2. Empty model is invalid.
3. Routing uses exact/prefix config, not hardcoded string checks.

Expose routing to skills via:

```bash
tina-session config cli-for-model --model "<model>"
# stdout: "claude" or "codex"
```

This removes duplicated model-family logic from skill prompts.

### 2. Codex Execution Adapter (`tina-session exec-codex`)

v1 is synchronous and blocking (no tmux mode).

```
tina-session exec-codex \
  --feature <feature-name> \
  --phase <phase-number> \
  --task-id <task-id> \
  --prompt <prompt-text or @file> \
  --cwd <worktree-path> \
  [--model gpt-5.3-codex] \
  [--sandbox <mode>] \
  [--timeout-secs 1800] \
  [--output <path>]
```

Behavior:

1. Resolve model (`--model` or config default) and validate routing => `Codex`.
2. Emit `codex_run_started` event with `runId`.
3. Spawn configured Codex binary as subprocess; capture stdout/stderr separately.
4. Enforce timeout; kill process group on timeout.
5. Emit terminal event: `codex_run_completed`, `codex_run_failed`, or `codex_run_timed_out`.
6. Upsert `teamMembers` row for Codex actor.
7. Return a structured JSON envelope to stdout.

Returned envelope:

```json
{
  "run_id": "codex_20260209_abc123",
  "status": "completed",
  "model": "gpt-5.3-codex",
  "exit_code": 0,
  "duration_secs": 42.7,
  "stdout": "...",
  "stderr": "...",
  "output_path": "/tmp/codex-out.txt"
}
```

### 3. Claude Adapter Skill (`skills/codex-cli/SKILL.md`)

Codex is invoked by a Claude teammate, not directly by orchestration state logic.

Responsibilities:

1. Gather task context (task body, relevant files, required reviewer rubric).
2. Build Codex prompt payload.
3. Call `tina-session exec-codex`.
4. Parse JSON envelope and convert result into orchestration-compatible status (`pass`, `gaps`, `error`).
5. Post findings back through normal Claude task flow.

### 4. Dispatch Flow by Layer

1. `ModelPolicy` (or task metadata override) provides requested model.
2. Skill asks `tina-session config cli-for-model`.
3. If `claude`: existing teammate spawn flow unchanged.
4. If `codex`: spawn `tina:codex-cli` Claude teammate.
5. `tina:codex-cli` runs `tina-session exec-codex` and reports normalized result.

This keeps all orchestration transitions in Claude while enabling Codex execution.

## Data and Tracking

### Orchestration Events

Use existing `orchestrationEvents` table with new event types:

- `codex_run_started`
- `codex_run_completed`
- `codex_run_failed`
- `codex_run_timed_out`

`detail` payload should be JSON string with:

```json
{
  "runId": "codex_20260209_abc123",
  "taskId": "review-phase-1",
  "model": "gpt-5.3-codex",
  "sandbox": "workspace-write",
  "promptLength": 18234,
  "stdoutBytes": 10321,
  "stderrBytes": 812,
  "exitCode": 0
}
```

Do not persist full prompt text in Convex events.

### Team Members

Correction to prior draft: `register_team()` is for the `teams` table only and cannot set `agentType/model` fields for members.

Required change:

- Add `ConvexWriter::upsert_team_member(...)` in `tina-session/src/convex.rs`.
- Call `teamMembers:upsertTeamMember` mutation.
- Use deterministic agent naming: `codex-<role>-<phase>-<taskHash8>`.

## Configuration

Location: `~/Library/Application Support/tina/config.toml`

```toml
[codex]
enabled = true
binary = "codex"
default_model = "gpt-5.3-codex"
default_sandbox = "workspace-write"
timeout_secs = 1800
max_output_bytes = 200000

[cli_routing]
codex_exact = ["codex"]
codex_prefixes = ["gpt-", "o1-", "o3-", "o4-"]
```

Notes:

- `enabled` acts as a kill switch.
- If `enabled = false`, Codex-routed requests fail fast with clear error text.
- Environment overrides may be added later (`TINA_CODEX_BINARY`, etc.).

## Model Precedence and Overrides

Most specific wins:

1. Task metadata `model` (pending tasks only)
2. `ModelPolicy` role field (`validator`, `planner`, `executor`, `reviewer`)
3. Built-in defaults

Shorthand `model: "codex"` resolves to configured default model before routing.

## Required Cross-Cutting Updates (Missing Areas Filled)

### Skill Updates

1. `skills/orchestrate/SKILL.md`
   - Route by `tina-session config cli-for-model`.
   - Use `tina:codex-cli` for Codex-family models.
2. `skills/team-lead-init/SKILL.md`
   - Replace `<haiku|opus>` model assumption with free-form model strings.
   - Route implementer/reviewer execution through `codex-cli` when needed.
3. `skills/executing-plans/SKILL.md`
   - Add same routing behavior for direct plan execution mode.

### Validator Updates

1. `tina-session/src/commands/check.rs` (`check plan`)
   - Keep "model required per task" check.
   - Replace strict `opus|haiku` whitelist with routing-aware validation:
     - valid alias (`codex`) or
     - non-empty model token accepted by `cli_for_model`.
2. Update tests that currently assert `"sonnet"` must fail for all cases.

## AGENTS.md Generation

Add a best-effort step to `tina-session init`:

- Generate worktree-root `AGENTS.md` with project context only.
- Exclude orchestration internals and private operational instructions.
- If missing source docs or parse failure, log warning and continue.

Template:

```markdown
# Project Context

## Overview
...

## Build and Test
...

## Architecture
...

## Conventions
...
```

## Failure Semantics

| Condition | Command result | Event | Retry guidance |
|-----------|----------------|-------|----------------|
| Codex binary missing | non-zero exit + clear error | `codex_run_failed` | no automatic retry |
| Timeout | status=`timed_out` | `codex_run_timed_out` | optional single retry |
| Non-zero Codex exit | status=`failed` | `codex_run_failed` | retry depends on task type |
| Convex write failure | command still returns run result; warns on stderr | best effort | no retry loop in command |

Idempotency:

- Every run gets a `run_id`.
- Retries create new run IDs but deterministic `agentName`.

## Security and Privacy

- No prompt body stored in Convex events; store hash/length only.
- Default sandbox should be least-privileged from config (not hardcoded yolo).
- Truncate captured output to `max_output_bytes` before persisting event details.
- Avoid shell interpolation of prompt content by using args/file inputs.

## Implementation Plan (Reordered)

1. Add routing/config primitives (`cli_for_model`, config structs, `config cli-for-model` command).
2. Implement `exec-codex` synchronous command with timeout and JSON envelope.
3. Add Convex team-member upsert support in `tina-session`.
4. Add `skills/codex-cli/SKILL.md`.
5. Integrate routing into `orchestrate`, `team-lead-init`, and `executing-plans` skills.
6. Update `check plan` model validation and tests.
7. Add init model flags and AGENTS.md generation.
8. Add harness scenario for end-to-end Codex reviewer flow.

## Test Strategy

### Unit

- `cli_for_model()` exact/prefix coverage.
- model alias normalization (`codex` -> default model).
- config parse defaults and overrides.

### Integration

- `exec-codex` with a fake codex binary fixture:
  - success,
  - non-zero exit,
  - timeout.
- Convex write calls for events and team-member upsert.

### End-to-End

- Orchestration with `--reviewer-model codex` routes review through `codex-cli`.
- Task metadata override routes one pending task to Codex while others stay Claude.
- Existing all-Claude orchestration remains unchanged.

## Rollout

1. Ship behind `codex.enabled`.
2. Dogfood on reviewer role only.
3. Expand to planner/validator after telemetry is stable.
4. Keep instant rollback via config flag.

## Success Metrics

- Codex runs produce start + terminal events and team-member records.
- `--reviewer-model codex` reliably routes review tasks through Codex adapter.
- No regression in all-Claude orchestration paths.
- Timeout/failure events are observable and actionable in timeline data.

## Architectural Context (Codebase Alignment, 2026-02-09)

Validated against:

- `tina-session/src/state/orchestrate.rs` (model propagation already supports free-form strings)
- `tina-session/src/state/schema.rs` (`ModelPolicy` already stores strings)
- `tina-session/src/main.rs` (new subcommand/flags required)
- `tina-session/src/config.rs` (extend for codex/routing sections)
- `tina-session/src/convex.rs` (add team-member upsert path)
- `convex/schema.ts`, `convex/teamMembers.ts`, `convex/events.ts` (schema already sufficient)
- `skills/orchestrate/SKILL.md`, `skills/team-lead-init/SKILL.md`, `skills/executing-plans/SKILL.md` (routing and model assumptions need updates)

This design now reflects current implementation constraints and provides a cohesive, end-to-end path for multi-CLI support.
