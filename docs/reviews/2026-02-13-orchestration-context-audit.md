# Orchestration Context Audit (Agents / Skills / Prompts / CLI)

Date: 2026-02-13  
Scope: `AGENTS.md`, `CLAUDE.md`, orchestration-critical skills, phase agent prompts, and `tina-session`/`tina-monitor` command surface.

## Objective

Audit the context given to orchestration agents and answer:

1. Is there a good big-picture overview and organized docs for `tina-*` helpers (especially `tina-session`)?
2. Do instructed CLI commands have discoverable interfaces and self-correcting errors?
3. What self-correction mechanisms exist throughout the process?
4. Are there legacy commands/flows we no longer need?
5. Is there extraneous or unhelpful context?
6. Are there hardcoded values that should be configurable?
7. What changes improve compliance, effectiveness, and speed?

## Non-Negotiable Direction

Control/state source-of-truth should be Tina/Convex, not direct reads of Claude team/task filesystem internals unless no CLI/API alternative exists.

## Files Reviewed

- `/Users/joshua/Projects/tina/AGENTS.md`
- `/Users/joshua/Projects/tina/CLAUDE.md`
- `/Users/joshua/Projects/tina/README.md`
- `/Users/joshua/Projects/tina/docs/architecture/orchestration-architecture.md`
- `/Users/joshua/Projects/tina/docs/architecture/orchestration-vision.md`
- `/Users/joshua/Projects/tina/skills/orchestrate/SKILL.md`
- `/Users/joshua/Projects/tina/skills/team-lead-init/SKILL.md`
- `/Users/joshua/Projects/tina/skills/executing-plans/SKILL.md`
- `/Users/joshua/Projects/tina/skills/checkpoint/SKILL.md`
- `/Users/joshua/Projects/tina/skills/rehydrate/SKILL.md`
- `/Users/joshua/Projects/tina/skills/codex-cli/SKILL.md`
- `/Users/joshua/Projects/tina/agents/phase-executor.md`
- `/Users/joshua/Projects/tina/agents/phase-planner.md`
- `/Users/joshua/Projects/tina/agents/phase-reviewer.md`
- `/Users/joshua/Projects/tina/agents/design-validator.md`
- `/Users/joshua/Projects/tina/agents/planner.md`
- `/Users/joshua/Projects/tina/agents/monitor.md`
- `/Users/joshua/Projects/tina/tina-session/src/main.rs`
- `/Users/joshua/Projects/tina/tina-session/src/commands/orchestrate.rs`
- `/Users/joshua/Projects/tina/tina-session/src/commands/start.rs`
- `/Users/joshua/Projects/tina/tina-session/src/commands/wait.rs`
- `/Users/joshua/Projects/tina/tina-session/src/commands/check.rs`
- `/Users/joshua/Projects/tina/tina-session/src/watch/status.rs`
- `/Users/joshua/Projects/tina/tina-session/src/session/naming.rs`
- `/Users/joshua/Projects/tina/scripts/install.sh`
- `/Users/joshua/Projects/tina/scripts/link-binaries.sh`

## Executive Summary

The architecture is strong, but orchestration context is fragmented and drift-prone. The biggest reliability risk is runtime/doc skew (especially stale PATH binaries) causing agent instructions to mismatch available CLI behavior. There is also repeated leakage of legacy filesystem assumptions (`~/.claude/teams/*.json`) that conflicts with current directory-based team config and Convex-centric orchestration.

## Findings by Question

### 1) Big picture + helper docs quality

Good:
- Clear modern architecture doc exists: `/Users/joshua/Projects/tina/docs/architecture/orchestration-architecture.md:1`.

Gaps:
- Conflicting high-level docs remain, e.g. `/Users/joshua/Projects/tina/docs/architecture/orchestration-vision.md:91` says orchestrator is "Not started".
- No single authoritative `tina-session` operator guide; behavior is split across CLI help + skills + prompts.
- Team config path mismatch in core context:
  - `/Users/joshua/Projects/tina/AGENTS.md:73`
  - `/Users/joshua/Projects/tina/CLAUDE.md:88`
  - both show `~/.claude/teams/{team-name}.json`, while runtime uses `~/.claude/teams/<team>/config.json`.

### 2) CLI discoverability + self-corrective errors

Good:
- Strong phase validation guidance in naming errors:
  - `/Users/joshua/Projects/tina/tina-session/src/session/naming.rs:49`
- `orchestrate advance` has explicit required-arg errors for event payloads:
  - `/Users/joshua/Projects/tina/tina-session/src/commands/orchestrate.rs:123`

Gaps:
- PATH skew risk: `~/.cargo/bin` precedes `~/.local/bin`, enabling stale binaries.
- Previously observed stale `tina-session` without `review` conflicted with reviewer prompt contract.
- `start` CLI one-of semantics are confusing in usage/error presentation:
  - `/Users/joshua/Projects/tina/tina-session/src/main.rs:137`
  - `/Users/joshua/Projects/tina/tina-session/src/main.rs:141`
- Some raw Convex validation errors leak without friendly normalization.

### 3) Self-correction mechanisms present

Implemented:
- State-machine-driven actioning (`next`/`advance`), including retry/remediation.
- Consensus workflow with wait/disagreement transitions:
  - `/Users/joshua/Projects/tina/tina-session/src/state/orchestrate.rs:439`
- Remediation depth cap:
  - `/Users/joshua/Projects/tina/tina-session/src/state/orchestrate.rs:692`
- Session death detection in wait:
  - `/Users/joshua/Projects/tina/tina-session/src/watch/status.rs:80`
- Dual-grammar parsing + retry policy in team-lead:
  - `/Users/joshua/Projects/tina/skills/team-lead-init/SKILL.md:157`
  - `/Users/joshua/Projects/tina/skills/team-lead-init/SKILL.md:294`
- Hard completion gates (`verify`, `complexity`) in phase execution skill:
  - `/Users/joshua/Projects/tina/skills/team-lead-init/SKILL.md:464`
  - `/Users/joshua/Projects/tina/skills/team-lead-init/SKILL.md:492`

Gaps:
- Some skill text still says teammate hangs are "manual observation":
  - `/Users/joshua/Projects/tina/skills/orchestrate/SKILL.md:1477`

### 4) Legacy commands/flows

Likely legacy or stale:
- `agents/planner.md` overlaps with `agents/phase-planner.md` but orchestration context points to phase-planner path.
- `agents/monitor.md` polling contract appears disconnected from current `phase-executor` + `tina-session wait` flow.
- Historical docs mention commands not in current CLI:
  - `tina-session link-team`
  - `tina-session phase update`
- Stale or contradictory guidance persists in skills:
  - `skills/orchestrate` still includes `tina-monitor status team` polling section:
    - `/Users/joshua/Projects/tina/skills/orchestrate/SKILL.md:922`

### 5) Extraneous / unhelpful context

- Very large orchestration prompt corpus with overlap:
  - `skills/orchestrate` 1787 lines
  - `skills/team-lead-init` 959 lines
  - `skills/executing-plans` 793 lines
- Contradictions between docs/skills create policy ambiguity (parallel vs sequential, no-polling vs polling snippets).
- Historical/handoff docs are mixed near active guidance, increasing accidental use of stale instructions.

### 6) Hardcoded values that should be configurable

- Hardcoded branch naming in orchestration examples.
- Repeated hardcoded timeouts (`30s`, fixed polling intervals, CLAUDE ready timeout).
- Model allowlists are partially hardcoded in command logic:
  - `/Users/joshua/Projects/tina/tina-session/src/commands/orchestrate.rs:347`
- Filesystem path assumptions hardcoded in many skills.

### 7) Changes to improve compliance/effectiveness/speed

Priority changes:

1. Make Convex/Tina the only authoritative source in orchestration skills/prompts.
2. Remove/replace direct `~/.claude/teams/*.json` references with `tina-session`/Convex-backed flows.
3. Consolidate orchestration docs into one canonical runtime protocol doc and mark historical docs clearly.
4. Add CLI/doc parity checks in CI for commands referenced by skills/prompts.
5. Add preflight doctor checks for binary path/version/command-surface mismatches.
6. Reduce prompt bloat by splitting runtime-critical protocol from long troubleshooting appendices.

## Coverage Checklist

- [x] Q1 big-picture and docs quality covered
- [x] Q2 CLI discoverability/error self-correction covered
- [x] Q3 self-correction mechanisms inventory covered
- [x] Q4 legacy/unused commands and flows covered
- [x] Q5 extraneous/unhelpful context covered
- [x] Q6 hardcoded vs configurable covered
- [x] Q7 concrete changes for compliance/effectiveness/speed covered

## Implementation Status (2026-02-13)

1. Context cleanup pass (`AGENTS.md`, `CLAUDE.md`, orchestration skills/agents): **implemented** (filesystem contract cleanup, legacy monitor deprecation, canonical runtime protocol linkouts).
2. CLI contract pass (`tina-session`): **implemented** (start arg one-of enforcement, model allowlist hardcoding removed, preflight doctor command added).
3. Guardrails pass: **implemented** (`scripts/check-cli-doc-parity.sh`, wired into `mise run check`, plus `check:cli-parity` task).
4. Size reduction pass: **partially implemented** (legacy monitor prompt collapsed; large orchestration skill remains and can be split further in follow-up).

Status: `implemented`.
