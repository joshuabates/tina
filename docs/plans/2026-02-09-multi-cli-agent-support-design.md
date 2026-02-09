# Multi-CLI Agent Support

## Overview

Add the ability to dispatch tasks to Codex CLI from within TINA orchestrations, while keeping Claude Code as the sole orchestrator. The model name in `ModelPolicy` determines dispatch routing: Anthropic models run as Claude subagents (default), Codex models dispatch via `tina-session exec-codex`.

## Deliverables

1. **`tina-session exec-codex`** -- Rust subcommand that spawns `codex exec` (or interactive codex in tmux), captures output, writes run events to Convex.

2. **`codex-cli` skill** -- TINA skill teaching Claude teammates how to dispatch Codex-routed tasks via `tina-session exec-codex`.

3. **`ModelPolicy` extension** -- Existing struct accepts Codex model names. A `cli_for_model()` function routes dispatch based on model name.

4. **`AGENTS.md` generation** -- Step in `tina-session init` that generates a lightweight `AGENTS.md` in the worktree with project context (architecture, build commands, conventions). No orchestration details.

5. **`[codex]` config section** -- Codex-specific defaults in `config.toml`.

6. **Task-level model override** -- Set `model: "gpt-5.3-codex"` in task metadata to route a single pending task to Codex.

## Out of Scope

- Codex as orchestrator
- Codex joining Claude's team protocol (SendMessage, TeamCreate)
- UI for CLI routing config
- Interactive brainstorming setup (user runs codex directly with their own AGENTS.md)

## Design

### `tina-session exec-codex` Command

Spawns a Codex CLI run, tracks it in Convex, returns the output.

```
tina-session exec-codex \
  --feature <feature-name> \
  --phase <phase-number> \
  --task-id <task-id> \
  --prompt <prompt-text or @file> \
  --cwd <worktree-path> \
  [--model gpt-5.3-codex] \
  [--sandbox yolo] \
  [--tmux] \
  [--output <path>]
```

Behavior:

1. Write `codex_run_started` orchestration event to Convex (task ID, model, timestamp).
2. Spawn Codex:
   - Default: `codex exec --model <model> --yolo -o <output-path> "<prompt>"` as a subprocess, capture output.
   - With `--tmux`: create a tmux session, run interactive `codex` with the prompt as initial input. Useful for longer tasks or monitoring.
3. Wait for completion, capture exit code and output.
4. Write `codex_run_completed` orchestration event to Convex (duration, exit code, output summary).
5. Register as team member in Convex (`agentType: "codex"`, model name).
6. Return output to stdout for the calling Claude agent to read.

### `codex-cli` Skill

Location: `skills/codex-cli/SKILL.md`

Loaded when the executing-plans skill encounters a task with a Codex model. Instructs the Claude teammate to:

1. Read the task description and any referenced files (design doc, plan, source files).
2. Read the relevant review/work skill (e.g., spec-reviewer instructions) to pass inline.
3. Assemble context into a prompt: task instructions + skill content + file contents.
4. Call `tina-session exec-codex` via Bash with the assembled prompt.
5. Read the output.
6. Report the result back (update task status, post findings to the team lead).

The Claude agent interprets the result and handles orchestration responses (blocking the phase, reporting issues, etc.). Codex never needs to know about TINA's coordination machinery.

### Model-Based Dispatch Routing

Uses the existing `ModelPolicy` struct on `SupervisorState`. Model values determine which CLI handles the step:

```rust
fn cli_for_model(model: &str) -> AgentCli {
    if model.starts_with("gpt-") || model == "codex" {
        AgentCli::Codex
    } else {
        AgentCli::Claude  // opus, sonnet, haiku, etc.
    }
}
```

`ModelPolicy` fields (`validator`, `planner`, `executor`, `reviewer`) accept any model name. Anthropic names route to Claude subagents, Codex names route through `tina-session exec-codex`.

Set via `tina-session init` flags:

```
tina-session init \
  --reviewer-model gpt-5.3-codex \
  --validator-model gpt-5.3-codex
```

Shorthand `"codex"` resolves to `config.codex.default_model`.

### Task-Level Model Override

Set `model: "gpt-5.3-codex"` in a pending task's metadata to override the orchestration-level routing for a single task. Errors if the task is already `in_progress` or `completed`.

Precedence (most specific wins):

1. Task metadata `model` field
2. `ModelPolicy` for the current step type
3. Default (Claude subagent)

### AGENTS.md Generation

During `tina-session init`, generate a lightweight `AGENTS.md` in the worktree root. Content derived from CLAUDE.md but filtered to exclude orchestration details:

```markdown
# Project Context

## Overview
[Project description]

## Build & Test
[Build commands, test commands, dev server commands]

## Architecture
[Crate/package layout, data flow summary]

## Conventions
[Naming, code style, testing approach]
```

Excluded: TINA orchestration details, Claude-specific tool usage instructions, internal file locations.

If no CLAUDE.md exists or generation fails, Codex still works -- the inline prompt from the skill carries task-specific instructions regardless.

### Convex Tracking

Uses existing tables, no schema changes needed.

**`orchestrationEvents` table:**

```json
// Start event
{
  "eventType": "codex_run_started",
  "source": "tina-session",
  "summary": "Codex design review started",
  "detail": "{ taskId, model, sandbox, promptLength }"
}

// Completion event
{
  "eventType": "codex_run_completed",
  "source": "tina-session",
  "summary": "Codex design review completed (pass/fail)",
  "detail": "{ taskId, model, durationSecs, exitCode, outputLength }"
}
```

**`teamMembers` table:**

```json
{
  "agentName": "codex-reviewer-1",
  "agentType": "codex",
  "model": "gpt-5.3-codex"
}
```

Codex runs appear in the same timeline and team member list as Claude agents.

### Config

Location: `~/Library/Application Support/tina/config.toml`

```toml
[codex]
binary = "codex"
default_sandbox = "yolo"
default_model = "gpt-5.3-codex"
```

## Build Order

1. Config section + `cli_for_model()` detection
2. `tina-session exec-codex` command (core dispatch + Convex tracking)
3. `codex-cli` skill
4. `ModelPolicy` integration + `tina-session init` flags
5. `AGENTS.md` generation
6. Task-level model override

## Success Metrics

- A design review dispatched to Codex appears in the Convex event timeline with start/complete events and team member registration.
- An orchestration configured with `--reviewer-model codex` routes all phase reviews through Codex automatically, with results fed back into the orchestration flow.

## Architectural Context

Reviewed against the TINA codebase on 2026-02-09. This design integrates cleanly with the existing architecture.

### How It Integrates

**State machine (unchanged).** The orchestration state machine in `tina-session/src/state/orchestrate.rs` already propagates model names through `Action` variants (`SpawnValidator`, `SpawnPlanner`, `SpawnExecutor`, `SpawnReviewer`) via `Option<String>` model fields. The `non_default_model()` helper passes through any non-default model string. Codex model names (e.g., `"gpt-5.3-codex"`) will naturally flow through as `Some("gpt-5.3-codex")` without any state machine changes. The routing decision (`cli_for_model()`) happens at the dispatch layer -- either in the skill (for Claude-orchestrated dispatch) or in the new `exec-codex` command -- not in the state machine itself. This separation is correct.

**ModelPolicy struct** (`tina-session/src/state/schema.rs`) already stores model names as free-form strings with serde defaults. No structural changes are needed. The existing defaults (`"opus"`, `"haiku"`) continue working. Setting `reviewer: "gpt-5.3-codex"` just stores a different string -- the struct is model-name-agnostic by design.

**Command registration** follows the established pattern: a new variant in the `Commands` enum in `main.rs`, delegating to a new `commands/exec_codex.rs` module. The 18 existing subcommands provide a clear template.

**Convex tracking** uses existing tables with no schema changes. The `orchestrationEvents` table accepts arbitrary `eventType` strings (`v.string()`), so `"codex_run_started"` / `"codex_run_completed"` work immediately. The `teamMembers` table already has optional `agentType` and `model` fields. The `ConvexWriter` has `record_event()` and the Convex `EventArgs` struct ready to use.

**Config extension** adds a `[codex]` section to the TOML config. The current `ConfigFile` struct in `tina-session/src/config.rs` uses `serde(Deserialize)` on a flat struct -- adding an optional `codex: Option<CodexConfig>` field follows the same pattern as the existing `prod`/`dev` profile sections.

**Init command** (`tina-session/src/commands/init.rs`) already has a well-defined sequence: validate inputs, create worktree, write statusline config, create supervisor state, write to Convex, register team, output JSON. AGENTS.md generation slots in after worktree creation and before Convex writes, as a new step alongside `write_statusline_config()`.

**Skill layer** is where the routing decision actually executes. The `executing-plans` skill already dispatches subagents per task with full context in the prompt. The new `codex-cli` skill follows the same pattern but calls `tina-session exec-codex` via Bash instead of spawning a Claude subagent. Claude interprets results and manages orchestration state -- Codex is treated as a subprocess tool, not a team participant. This keeps the team protocol (SendMessage, TaskUpdate) entirely within Claude Code, which is the right boundary.

### Key Integration Points

| Component | File | Change Type |
|-----------|------|-------------|
| `cli_for_model()` routing | `tina-session/src/state/orchestrate.rs` (or new module) | New function, no changes to existing state machine |
| `exec-codex` command | `tina-session/src/commands/exec_codex.rs` + `main.rs` | New subcommand, new module |
| `[codex]` config | `tina-session/src/config.rs` | Add `CodexConfig` struct + optional field on `ConfigFile` |
| AGENTS.md generation | `tina-session/src/commands/init.rs` | New step in `run()` |
| `codex-cli` skill | `skills/codex-cli/SKILL.md` | New skill file |
| `--reviewer-model` etc. | `main.rs` Init command args | New CLI flags, wired to `ModelPolicy` |
| Team member registration | Existing `ConvexWriter::register_team()` path | Data-only: `agentType: "codex"` |

### Caveats and Recommendations

1. **Add a timeout to `exec-codex`.** The design specifies "wait for completion" but does not address hangs. Add a `--timeout` flag (default 30 minutes) with clear error reporting on timeout. The `--tmux` mode is especially risky without this.

2. **Codex team member naming must be deterministic.** The `agentName` field (e.g., `"codex-reviewer-1"`) should be derived from task ID or phase+role to avoid duplicate registrations on retries. The Convex `teamMembers` table has a unique index on `[orchestrationId, phaseNumber, agentName]`, so collisions would cause upsert rather than duplicates -- but the name should still be predictable.

3. **`cli_for_model()` prefix matching is brittle.** `starts_with("gpt-")` works for current OpenAI naming but may break with future models. Consider making the routing explicit in config (e.g., `[cli_routing] codex_prefixes = ["gpt-", "o1-", "o3-"]`) as a follow-up if more model families are added.

4. **Task-level model override validation** belongs in the skill layer, not in Rust. The `executing-plans` skill reads task metadata before dispatch -- it should check the `model` field there and route accordingly. No Rust validation needed since task metadata is a JSON blob managed by Claude's TaskUpdate tool.

5. **AGENTS.md generation can be best-effort.** If CLAUDE.md parsing fails or produces empty output, skip silently. The inline prompt from the `codex-cli` skill carries task-specific instructions regardless, so AGENTS.md is a convenience, not a requirement.

6. **The `exec-codex` command should capture stderr separately.** Codex CLI may write progress/status to stderr and results to stdout. The command should capture both and include stderr in the Convex event detail for debugging, while returning only stdout to the calling Claude agent.
