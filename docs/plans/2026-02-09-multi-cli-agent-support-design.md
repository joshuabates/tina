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
