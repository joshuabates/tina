# Verification: Orchestration Context Audit Closure

Date: 2026-02-13  
Source audit: `docs/reviews/2026-02-13-orchestration-context-audit.md`

## Verdict

Most findings are addressed. Remaining gaps are **partial** (not blockers, but still open):

1. Hardcoded timeout values in orchestration skills are still not configurable.
2. Prompt-size reduction/splitting is still partial; runtime-critical and troubleshooting content are still heavily co-located.

## Evidence-Based Closure Matrix

### Q1) Big picture + helper docs

- **Conflicting high-level docs**: **Addressed**  
  Evidence: `docs/architecture/orchestration-vision.md:91` now states orchestrator is implemented.
- **Canonical runtime protocol doc**: **Addressed**  
  Evidence: `docs/architecture/orchestration-runtime-protocol.md:5`, referenced by `AGENTS.md:41` and `CLAUDE.md:49`.
- **Team config path mismatch (`.json` vs `config.json`)**: **Addressed**  
  Evidence: `AGENTS.md:77`, `CLAUDE.md:92`.

### Q2) CLI discoverability + self-corrective errors

- **PATH/binary drift risk**: **Addressed**  
  Evidence: `tina-session/src/commands/check.rs:356` (`doctor`), `tina-session/src/commands/check.rs:442` (cargo/local target match pass), `scripts/link-binaries.sh:7` and `scripts/link-binaries.sh:32` (optional cargo-bin sync).
- **Command surface drift (e.g., missing `review start`)**: **Addressed**  
  Evidence: `tina-session/src/commands/check.rs:323` (`DOCTOR_REQUIRED_COMMANDS` includes `review start`), parity script validates command references (`scripts/check-cli-doc-parity.sh:25`) and is wired into `mise` (`mise.toml:133`, `mise.toml:136`).
- **`start` one-of semantics confusing**: **Addressed**  
  Evidence: clap arg group usage in `tina-session/src/main.rs` (usage enforces `<--plan|--design-id>`), validated via CLI behavior.
- **Raw Convex validation error leakage**: **Addressed (for design id path)**  
  Evidence: `tina-session/src/commands/work/design.rs:5`, `tina-session/src/commands/work/design.rs:171`, `tina-session/src/commands/work/design.rs:211`; invalid design id now returns friendly normalized error.

### Q3) Self-correction mechanisms

- **Teammate stall described as manual-only**: **Addressed**  
  Evidence: stall detection now ties to `orchestrate next == wait` in `skills/orchestrate/SKILL.md:1441`.

### Q4) Legacy commands/flows

- **Planner vs phase-planner ambiguity**: **Addressed**  
  Evidence: runtime role clarified in `README.md:227` and `README.md:228`; standalone scope note in `agents/planner.md:11`.
- **Legacy polling/monitor flow in active orchestration context**: **Addressed**  
  Evidence: event-driven/no-polling contract in `skills/orchestrate/SKILL.md:952`; `agents/monitor.md` now points to runtime command contracts.
- **Historical docs referencing non-implemented commands**: **Addressed**  
  Evidence: warning banners in `docs/handoff-team-orchestration-linking.md:3` and `docs/handoff-eliminate-filesystem-state.md:3`.

### Q5) Extraneous / unhelpful context

- **Historical guidance mixed with active docs**: **Addressed**  
  Evidence: explicit historical-warning banners (handoff docs above).
- **Prompt corpus size/overlap**: **Partially addressed**  
  Evidence: files remain large (`skills/orchestrate/SKILL.md` 1749 lines, `skills/team-lead-init/SKILL.md` 959, `skills/executing-plans/SKILL.md` 793).

### Q6) Hardcoded values vs configurable

- **Hardcoded branch naming**: **Addressed**  
  Evidence: configurable prefix `TINA_BRANCH_PREFIX` in `skills/orchestrate/SKILL.md:103`.
- **Model allowlist hardcoding**: **Addressed**  
  Evidence: routing through config-based `cli_for_model` in `tina-session/src/commands/config.rs:40` and configurable `cli_routing` in `tina-session/src/config.rs:351`.
- **Hardcoded timeout constants in skills**: **Partially addressed / open**  
  Evidence: repeated fixed `30s` values remain in `skills/orchestrate/SKILL.md:400` and `skills/team-lead-init/SKILL.md:426` (plus multiple other lines).

### Q7) Compliance / effectiveness / speed improvements

- **Convex/Tina as authority in active runtime protocol**: **Addressed**  
  Evidence: `docs/architecture/orchestration-runtime-protocol.md:7` and `docs/architecture/orchestration-runtime-protocol.md:11`.
- **Replace direct team-json usage in active context**: **Addressed**  
  Evidence: active docs now reference `~/.claude/teams/{team}/config.json` and orchestration skills use `tina-session` controls (no `~/.claude/teams/*.json` patterns in active skills/agents/AGENTS/CLAUDE).
- **CLI/doc parity guardrail in CI/check flow**: **Addressed**  
  Evidence: `scripts/check-cli-doc-parity.sh` + `mise.toml:133`.
- **Doctor preflight guardrail**: **Addressed**  
  Evidence: `tina-session check doctor` in `tina-session/src/commands/check.rs:356` and pre-e2e guidance in `AGENTS.md:34`, `CLAUDE.md:41`.
- **Prompt split for speed/context efficiency**: **Partially addressed**  
  Evidence: runtime protocol added, but major skill files are still large and mostly monolithic.

## Runtime Verification Commands Executed

- `cargo check --manifest-path tina-session/Cargo.toml` (pass)
- `mise run check:cli-parity` (pass)
- `tina-session check doctor` (pass with 1 warning: PATH entries missing one side, no fail)
- `tina-session work design resolve-to-file --design-id bad --output /tmp/tina-bad-design.md --json` (friendly normalized error)
- `tina-session cleanup --feature does-not-exist` (local cleanup behavior message confirmed)

## Final Assessment

- **Closed:** 17 findings
- **Partial/Open:** 2 findings
- **Blocked:** 0

Open items are narrow and can be resolved with a focused follow-up pass on skill configurability/splitting.
