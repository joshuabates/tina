# TINA

**Teams Iterating, Not Accumulating**

A development workflow system for Claude Code with an orchestration layer that manages context across multi-phase projects. Based on [Superpowers](https://github.com/anthropics/superpowers) with added automation: TINA spawns workers in isolated tmux sessions, monitors progress, pre-emptively checkpoints to prevent phase contexts from growing, and recovers from failures.

<p align="center">
  <img src="assets/tina.png" alt="Tina" width="200">
</p>

## Why TINA?

The Superpowers workflow (brainstorm → design → plan → implement/review) works well for single-phase projects. But complex work requires multiple phases, and Claude's context window becomes the bottleneck.

TINA's orchestration layer solves this:
- **Fresh context per phase** - Workers run in tmux with clean context
- **Pre-emptive checkpoints** - Saves state within phases to prevent individual phase contexts from growing
- **Failure recovery** - Detects crashed sessions, diagnoses issues, attempts recovery
- **Resumable** - Pick up where you left off after interruptions

## The Workflow

### Phase 1: Design (Interactive)
```
You ←→ /tina:brainstorm
         One question at a time, refining ideas
              ↓
         Design Doc (.md saved to docs/plans/)
              ↓
         Architect Review
         Validates design before implementation
```

### Phase 2: Implementation (Automated)
```
/tina:orchestrate docs/plans/your-design.md

For each phase in design doc:

  1. Planner → Implementation plan with tasks

  2. Team-lead spawns in tmux session
     ├─ Spawns implementer agents for tasks
     ├─ Each task: implement → spec review → code review
     ├─ Pre-emptive checkpoints (context management)
     └─ Crash recovery if workers fail

  3. Phase reviewer validates completed phase
     Checks against design doc + integration

All phases complete:

  4. /tina:finishing-a-development-branch
     Choose: merge to main, create PR, or manual finish
```

**Manual mode:** Run individual skills yourself (`/tina:write-plan`, `/tina:execute-plan`, etc.)
**Automated mode:** `/tina:orchestrate` runs the full pipeline

> **Note:** Automated mode requires the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable for team-based execution.
>
> **Important:** Set `teammateMode` to `tmux` for Tina orchestration runs. In-process teammate mode can silently fall back to generic prompts (look for `handleSpawnInProcess ... found=false` in `~/.claude/debug/*.txt`), which breaks `tina:*` phase agent behavior.

## Skills

### Orchestration
- **orchestrate** - Automated pipeline from design doc to implementation
- **team-lead-init** - Initializes team-lead in tmux session for phase execution
- **checkpoint** - Pre-emptively saves phase state to prevent context growth
- **rehydrate** - Restores state after context clear

### Design & Planning
- **brainstorming** - Refine ideas into designs through one-question-at-a-time dialogue
- **architect** - Reviews design docs before implementation
- **writing-plans** - Creates detailed implementation plans from specs

### Execution
- **executing-plans** - Runs through plan tasks with implement/review cycles
- **test-driven-development** - RED-GREEN-REFACTOR cycle enforcement
- **dispatching-parallel-agents** - Concurrent subagent workflows

### Quality
- **verification-before-completion** - Verify before claiming done
- **requesting-code-review** - Request review against plan
- **receiving-code-review** - Handle review feedback with rigor
- **deep-review** - Find refactoring opportunities through investigation
- **analytics** - Data-driven analysis and investigation

### Git & Workflow
- **using-git-worktrees** - Isolated development branches
- **finishing-a-development-branch** - Merge/PR decision workflow
- **systematic-debugging** - 4-phase root cause process

### Meta
- **writing-skills** - Create and test new skills
- **using-tina** - Introduction to the skills system

## Development

### Prerequisites

- [mise](https://mise.jdx.dev) for task running and tool management
- Rust toolchain (via rustup)
- Claude Code CLI

### Setup

```bash
mise install        # install tool versions (node, etc.)
mise run check      # verify everything compiles
```

Project-local Claude setting:

```json
// .claude/settings.local.json
{
  "teammateMode": "tmux"
}
```

### Common Tasks

```bash
mise run dev                    # start tina-web backend + frontend
mise run dev:web:dev            # start tina-web against dev Convex profile
mise run test                   # cargo test across all crates
mise run check                  # fast cargo check, all crates
mise run build                  # release build, all crates
mise run install                # build + symlink CLIs to ~/.local/bin
mise run plugin:bundle          # build minimal local plugin bundle (no target artifacts)
mise run plugin:install         # bundle + install plugin + refresh symlinks + restart daemon if running
mise run plugin:update          # bundle + update plugin + refresh symlinks + restart daemon if running

mise run test:web               # test a single crate
mise run test:skills            # run skill test suite
mise run harness:run <scenario> # run a harness scenario
mise run validate <path>        # validate orchestration state files

mise run bump:version 0.2.0    # set version across all Cargo.tomls
mise run analyze:tokens <file>  # token usage analysis
```

Run `mise tasks` for the full list.

### Project Structure

| Crate | Description |
|-------|-------------|
| `tina-session` | Phase lifecycle CLI (init, start, wait, stop, state management) |
| `tina-data` | Shared data layer for orchestration discovery |
| `tina-web` | Web dashboard (Axum backend + React frontend) |
| `tina-monitor` | TUI for monitoring orchestrations |
| `tina-harness` | Test harness for running scenarios |

### Convex Profiles

TINA supports two Convex profiles:
- `prod` (default) - used unless explicitly overridden
- `dev` - used for orchestration testing and local iteration

Set the runtime profile with `TINA_ENV` or per-command flags:

```bash
# Default (prod)
tina-session config show

# Explicit dev
tina-session config show --env dev
TINA_ENV=dev tina-session daemon start
```

### Daemon Control and Update Policy

- `tina-session daemon start` now launches the external `tina-daemon` binary (not an embedded daemon).
- Default behavior is `prod` profile unless `--env dev` or `TINA_ENV=dev` is set.
- For unreleased testing, run with an explicit binary path:

```bash
tina-session daemon start --env dev --daemon-bin /absolute/path/to/tina-daemon/target/debug/tina-daemon
```

- For plugin usage, ship released binaries in the plugin bundle and use defaults (`prod`).

Config file supports legacy flat fields and profile-based fields:

```toml
active_env = "prod"

[prod]
convex_url = "https://your-prod.convex.cloud"
auth_token = "prod-token"
node_name = "my-laptop"

[dev]
convex_url = "https://your-dev.convex.cloud"
auth_token = "dev-token"
node_name = "my-laptop-dev"
```

## Testing

### tina-harness

A test harness for validating tina-monitor and orchestration work correctly together:

```bash
mise run harness:run 01-single-phase-feature    # mock orchestration
mise run harness:run 01-single-phase-feature -- --full  # real orchestration
mise run validate /path/to/.claude/tina         # validate state files
```

**Failure categories:** Setup (compilation), Orchestration (state files), Monitor (display), Outcome (results)

**Scenarios included:**
- `01-single-phase-feature` - Add a verbose flag
- `02-two-phase-refactor` - Extract utils module
- `03-failing-tests` - Fix broken edge case

See `skills/test-harness/SKILL.md` for full documentation.

## Agents

Subagent types for the Task tool:

- **tina:planner** - Creates implementation plans for a design doc phase
- **tina:implementer** - Implements a single task from a plan
- **tina:spec-reviewer** - Verifies implementation matches spec
- **tina:code-quality-reviewer** - Reviews architecture, patterns, maintainability
- **tina:code-reviewer** - Full review for completed work
- **tina:phase-reviewer** - Validates completed phase against design

## Installation

For local production-like plugin installs (without copying Cargo artifacts), use:

```bash
mise run plugin:install
```

To pick up new local changes later:

```bash
mise run plugin:update
```

If you only want to build the bundle (without installing/updating):

```bash
mise run plugin:bundle
```

Requires:
- Claude Code CLI
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` environment variable (for automated orchestration mode)

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/tina:brainstorm` | Start interactive design refinement |
| `/tina:orchestrate <design-doc>` | Run automated pipeline on a design |
| `/tina:write-plan` | Create implementation plan manually |
| `/tina:execute-plan` | Execute plan with subagents |

### Typical Flow

1. **Brainstorm** - `/tina:brainstorm` to refine your idea into a design doc
2. **Architect review** - Design gets validated before implementation
3. **Orchestrate** - `/tina:orchestrate docs/plans/my-design.md` runs everything else

Or run steps manually if you prefer more control.

## Credits

Based on [Superpowers](https://github.com/anthropics/superpowers) by Jesse Vincent. TINA extends the brainstorm → design → plan → implement workflow with an orchestration layer for multi-phase projects.

## License

MIT
