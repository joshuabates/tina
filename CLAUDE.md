# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TINA (**Teams Iterating, Not Accumulating**) is a development workflow system for Claude Code that orchestrates multi-phase implementations. It spawns workers in isolated tmux sessions, monitors progress, checkpoints to prevent context growth, and recovers from failures. All state flows through Convex (cloud DB) — there is no REST API.

## Build & Development Commands

Task runner: [mise](https://mise.jdx.dev). Run `mise tasks` for the full list.

```bash
# Build
mise run check                    # fast cargo check, all crates (use during development)
mise run build                    # release build, all crates
mise run install                  # release build + symlink CLIs to ~/.local/bin

# Test
mise run test                     # cargo test across all Rust crates
mise run test:session             # test a single crate (also: test:data, test:daemon, test:monitor, test:harness)
npm test                          # Convex function tests (vitest, edge-runtime)
mise run test:skills              # Claude Code skill tests

# Single Rust test
cargo test --manifest-path tina-session/Cargo.toml -- test_name

# Dev servers
mise run dev                      # start all services via Overmind (web + convex + daemon)
mise run dev:web                  # frontend only (prod Convex)
mise run dev:web:dev              # frontend only (dev Convex)

# Harness (e2e scenario testing)
mise run harness:run 01-single-phase-feature         # mock mode
mise run harness:run 01-single-phase-feature -- --full  # real orchestration (~20 min)
```

**Before e2e testing:** Always rebuild binaries first. Symlinks at `~/.local/bin/` point to `target/debug/` — stale binaries cause silent failures.
```bash
cargo build -p tina-session -p tina-daemon && tina-session daemon stop && tina-session daemon start
```

## Architecture

Mixed Rust/TypeScript monorepo. No Cargo workspace — each crate has its own `Cargo.toml`.

### Crates

| Crate | Purpose |
|-------|---------|
| `tina-session` | Phase lifecycle CLI: init, start, wait, stop, config, daemon control, orchestrate state machine |
| `tina-daemon` | Background process watching `~/.claude/teams/` and `~/.claude/tasks/`, syncs to Convex |
| `tina-data` | Shared Convex client wrapper + types |
| `tina-monitor` | TUI for monitoring orchestrations (ratatui) |
| `tina-harness` | Test harness for running orchestration scenarios |
| `tina-web` | React 19 + Vite frontend — pure client, reads from Convex via subscriptions |

### Data Flow

```
tina-session → Convex (orchestrations, phases, supervisor state)
tina-daemon  → Convex (teams, tasks via filesystem watching)
tina-web     ← Convex (React useQuery subscriptions, real-time)
```

### Convex (Serverless Backend)

Schema in `convex/schema.ts`. Key tables: `orchestrations`, `phases`, `taskEvents`, `teamMembers`, `teams`, `nodes`, `supervisorStates`. Functions in `convex/*.ts`. Tests use `vitest` + `convex-test` with `edge-runtime` environment.

### Skills & Agents

- `skills/*/SKILL.md` — 28 skill definitions (workflow instructions invoked via `/tina:skill-name`)
- `agents/*.md` — 23 agent definitions (subagent types for the Task tool)

### Key File Locations

| What | Where |
|------|-------|
| Config (macOS) | `~/Library/Application Support/tina/config.toml` |
| Worktrees | `{project}/.worktrees/{feature}/` |
| Plans | `docs/plans/YYYY-MM-DD-{feature}-phase-{N}.md` |
| Team configs | `~/.claude/teams/{team-name}.json` |
| Task lists | `~/.claude/tasks/{team-name}/` |
| Supervisor state | `{worktree}/.claude/tina/supervisor-state.json` |
| Harness scenarios | `tina-harness/scenarios/` |

## Conventions

- **Profiles:** Config supports `prod` (default) and `dev` profiles. Override with `TINA_ENV=dev` or `--env dev`.
- **Naming:** Features are `kebab-case`, branches are `tina/{feature}`, teams are `{feature}-orchestration`.
- **State machine:** Orchestration status progresses: Planning → Executing → Reviewing → Complete/Blocked. Transitions delegated to `tina-session orchestrate advance`.
- **Claude CLI:** Use interactive mode (no `-p` flag) for orchestration. `claude -p` is one-shot only.
- **tmux:** One session per phase. Use `capture-pane -p -S -` for full scrollback. `send-keys` needs `-l` for literal text.
- **Rust edition:** 2021. Debug profile uses `debug = "line-tables-only"` for faster builds.
