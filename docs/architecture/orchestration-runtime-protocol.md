# Orchestration Runtime Protocol

_Last updated: 2026-02-13_

This document is the canonical runtime contract for Tina orchestration behavior.

## Source of Truth

Control-plane state is authoritative in Tina/Convex through `tina-session`:

- Orchestration and phase transitions: `tina-session orchestrate next|advance`
- Supervisor state: `supervisorStates` in Convex (plus local mirror at `{worktree}/.claude/tina/supervisor-state.json`)
- Review state: `tina-session review ...` commands

Runtime observations (team membership/task events) are projected by `tina-daemon` from:

- `~/.claude/teams/<team>/config.json`
- `~/.claude/tasks/<team>/`

Skills and phase agents should use `tina-session` command contracts instead of directly parsing those filesystem internals.

## Canonical Phase Loop

1. `tina-session init` creates orchestration state/worktree.
2. `tina-session orchestrate next` returns the next typed action.
3. Orchestrator dispatches planner/executor/reviewer/validator agents.
4. Teammate completion messages are translated into `tina-session orchestrate advance`.
5. `tina-session start` starts phase execution; `tina-session wait` is the terminal wait primitive.

No separate polling loop is required for phase completion in orchestration skills.

## Event Contract (`orchestrate advance`)

Allowed events:

- `validation_pass`
- `validation_warning`
- `validation_stop`
- `plan_complete`
- `execute_started`
- `execute_complete`
- `review_pass`
- `review_gaps`
- `retry`
- `error`

Required payloads:

- `plan_complete` requires `--plan-path`
- `execute_complete` requires `--git-range`
- `review_gaps`, `retry`, and `error` may provide `--issues`

## Teammate Message Grammar

- Validator: `VALIDATION_STATUS: Pass|Warning|Stop`
- Planner: `plan-phase-N complete. PLAN_PATH: <path>`
- Executor: `execute-N started` / `execute-N complete. Git range: <A..B>`
- Reviewer: `review-N complete (pass)` / `review-N complete (gaps): <issues>`
- Error path: `<stage>-N error: <reason>`

## Drift Guardrails

Run these before e2e or orchestration debugging:

```bash
mise run install
tina-session check doctor
```

CLI/doc parity is validated with:

```bash
mise run check:cli-parity
```

Use this document plus `docs/architecture/orchestration-architecture.md` for runtime behavior.
