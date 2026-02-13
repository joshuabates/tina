# Project Context

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

# Dev servers
mise run dev                      # start all services via Overmind (web + convex + daemon)
mise run dev:web                  # frontend only (prod Convex)
mise run dev:web:dev              # frontend only (dev Convex)

# Harness (e2e scenario testing)
mise run harness:run 01-single-phase-feature         # mock mode
mise run harness:run 01-single-phase-feature -- --full  # real orchestration (~20 min)
```

**Before e2e testing:** Always rebuild binaries first. Symlinks at `~/.local/bin/` should point to release artifacts, and stale PATH resolution causes silent failures.
```bash
mise run install
tina-session check doctor
```

## Architecture

Mixed Rust/TypeScript monorepo. No Cargo workspace — each crate has its own `Cargo.toml`.

Runtime protocol (canonical): `docs/architecture/orchestration-runtime-protocol.md`

### Crates

| Crate | Purpose |
|-------|---------|
| `tina-data` | Shared Convex client wrapper + types |
| `tina-monitor` | TUI for monitoring orchestrations (ratatui) |
| `tina-harness` | Test harness for running orchestration scenarios |
| `tina-web` | React 19 + Vite frontend — pure client, reads from Convex via subscriptions |

### Data Flow

```
tina-web     ← Convex (React useQuery subscriptions, real-time)
```

### Convex (Serverless Backend)

Schema in `convex/schema.ts`. Key tables: `orchestrations`, `phases`, `taskEvents`, `teamMembers`, `teams`, `nodes`, `supervisorStates`, `commits`, `plans`, `orchestrationEvents`. Functions in `convex/*.ts`. Tests use `vitest` + `convex-test` with `edge-runtime` environment.

**Real-time features:**
- Team member shutdowns detected via team config diffs, recorded as events
- All data flows through Convex subscriptions (no polling)

### Skills & Agents

- `skills/*/SKILL.md` — 28 skill definitions (workflow instructions invoked via `/tina:skill-name`)
- `agents/*.md` — 23 agent definitions (subagent types for the Task tool)

### Key File Locations

| What | Where |
|------|-------|
| Config (macOS) | `~/Library/Application Support/tina/config.toml` |
| Plans | `docs/plans/YYYY-MM-DD-{feature}-phase-{N}.md` |
| Team configs | `~/.claude/teams/{team-name}/config.json` |
| Task lists | `~/.claude/tasks/{team-name}/` |
| Harness scenarios | `tina-harness/scenarios/` |
| Git commits (Convex) | `convex/commits.ts` (commits table) |
| Plans (Convex) | `convex/plans.ts` (plans table) |
| Shutdown events | `orchestrationEvents` table (eventType: "agent_shutdown") |

## Conventions

- **Profiles:** Config supports `prod` (default) and `dev` profiles. Override with `TINA_ENV=dev` or `--env dev`.
- **Naming:** Features are `kebab-case`, branches are `tina/{feature}`, teams are `{feature}-orchestration`.
- **Claude CLI:** Use interactive mode (no `-p` flag) for orchestration. `claude -p` is one-shot only.
- **Rust edition:** 2021. Debug profile uses `debug = "line-tables-only"` for faster builds.
