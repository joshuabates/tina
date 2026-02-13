# Codex Worker And Reviewer Functional Parity Implementation Plan

Date: 2026-02-13
Status: Draft for execution
Owner: Orchestration runtime

## 1. Goal

Integrate Codex-backed worker and reviewer teammates into phase execution so they behave the same as Claude-backed teammates from the team-lead perspective.

Functional parity means:
- Same task lifecycle and orchestration state transitions.
- Same quality gate expectations.
- Same retry and failure handling semantics.
- Same team-lead authority (team lead launches reviews and controls progression).

## 2. Locked Decisions

1. Parity target: functional parity.
2. Contract strategy: hybrid.
   - Shared baseline contract for both engines.
   - Small engine-specific addenda.
3. Execution loop: turn-based one-shot runs for Codex members.
4. Result format: hybrid output.
   - Required machine-readable headers.
   - Freeform explanatory body.
5. Instruction bundle: core parity pack.
   - Review policy gates.
   - TDD and verification expectations.
   - Repo and worktree constraints.
   - Completion grammar requirements.
6. Invalid result handling: retry once, then fallback to Claude for that run only.
7. Fallback stickiness: per-run only (non-sticky).
8. Responsibility split:
   - Adapter normalizes result shape.
   - Team lead enforces retry and fallback policy.
9. Rollout scope: worker plus both reviewers from day one.
10. Guardrail storage: docs plus tests.

## 3. Scope

### In Scope

- `worker-N`, `spec-reviewer-N`, and `code-quality-reviewer-N` Codex routing and execution.
- Shared role contract across Claude and Codex for those three roles.
- Parser support for both legacy Claude message grammar and new normalized grammar.
- Retry and fallback behavior in team-lead loop.

### Out Of Scope

- Planner, validator, phase-executor, or phase-reviewer parity.
- Replacing orchestration state machine behavior.
- Redesigning Convex event schema beyond what is needed for observability of this rollout.

## 4. Runtime Model

### 4.1 Team-lead authority stays unchanged

Team lead remains the control authority for:
- task scheduling
- spawning worker and reviewers
- interpreting completion results
- applying retry and fallback decisions
- updating task and phase status

### 4.2 Codex members run as one-shot turns

Codex worker and reviewer members execute one run and return a normalized result.
If additional work is needed, team lead starts a new turn with updated context.

This avoids dependency on live worker to reviewer messaging loops while preserving the same external outcomes.

## 5. Shared Result Contract (v2)

All worker and reviewer outputs should normalize to the same internal schema.

Required header fields:
- `role`: `worker|spec-reviewer|code-quality-reviewer`
- `task_id`: numeric task id
- `status`: `pass|gaps|error`
- `git_range`: required for `role=worker` and `status=pass`
- `issues`: required for `status=gaps|error`
- `files_changed`: optional
- `confidence`: optional for reviewers

A freeform body remains allowed and expected for context and evidence.

### 5.1 Acceptance matrix

- worker + pass: require `task_id`, `status`, `git_range`
- worker + gaps or error: require `task_id`, `status`, `issues`
- reviewer + pass: require `task_id`, `status`
- reviewer + gaps or error: require `task_id`, `status`, `issues`
- unknown or mismatched `task_id`: invalid result

### 5.2 Transitional compatibility

Team lead parser accepts:
- legacy Claude grammar (current messages)
- v2 normalized contract

Legacy outputs are mapped to the same internal shape before policy decisions.

## 6. Retry And Fallback Policy

For invalid or ambiguous results:
1. Adapter attempts normalization first.
2. Team lead retries Codex once with stricter instructions.
3. If still invalid, fallback to Claude for that run only.
4. Next run remains eligible for Codex routing.

For valid results with `status=gaps|error`, team lead follows normal remediation loop and spawns the next role as usual.

## 7. Instruction Parity Pack

Every worker and reviewer run (Claude or Codex) must include a shared baseline:
- Review policy detector gates (`test_integrity`, `reuse_drift`, `architecture_drift`).
- TDD and verification expectations.
- Worktree and repository constraints.
- Output contract requirements.

Engine-specific addenda are limited to execution mechanics and formatting details.

## 8. Documentation Changes

Update these docs to reflect the shared contract and split responsibilities:
- `skills/team-lead-init/SKILL.md`
- `skills/codex-cli/SKILL.md`
- `skills/executing-plans/SKILL.md`
- optional architecture alignment note in `docs/architecture/orchestration-architecture.md`

Expected doc outcomes:
- clear v2 contract definition
- compatibility rules for legacy grammar
- clear retry and fallback decision flow
- explicit statement that team lead launches reviewers

## 9. Implementation Phases

### Phase A: Contract and parser foundations

- Define normalized in-memory result shape.
- Add parser path for v2 headers.
- Preserve legacy parser path for Claude outputs.
- Add validator enforcing acceptance matrix.

Deliverable: parser can evaluate both legacy and v2 outputs with deterministic outcomes.

### Phase B: Adapter normalization

- Update Codex adapter instructions and handling to emit normalized v2 headers plus body.
- Normalize common failure classes into deterministic `error` outputs.

Deliverable: Codex role runs produce parser-ready structured outputs.

### Phase C: Team-lead policy enforcement

- Add retry-once and per-run fallback logic in team-lead decision path.
- Ensure fallback route is role-local and run-local.

Deliverable: invalid Codex outputs recover automatically or degrade safely.

### Phase D: End-to-end role rollout

- Enable Codex routing for worker and both reviewer roles under the new contract.
- Confirm team-lead role progression is unchanged.

Deliverable: complete task loop runs with Codex-backed worker and reviewers.

### Phase E: Verification and pilot

- Run harness scenarios including malformed output cases.
- Run controlled dev pilot.
- Validate parity signals and fallback rates.

Deliverable: go/no-go report for broader use.

## 10. Test Plan

### 10.1 Unit and contract tests

- legacy parser acceptance tests
- v2 parser acceptance tests
- role and status required-field validation tests
- invalid task id rejection tests
- adapter normalization tests for success and failure outputs

### 10.2 Policy tests

- invalid Codex result triggers one retry
- second invalid result triggers Claude fallback
- fallback is non-sticky (next turn can route back to Codex)

### 10.3 Harness and integration tests

- worker Codex pass flow
- reviewer Codex pass flow
- worker gaps flow with follow-up turn
- reviewer gaps flow with follow-up worker turn
- malformed Codex output flow verifying retry and fallback

## 11. Acceptance Criteria

The rollout is complete when all are true:
1. Team lead can process both legacy and v2 role outputs.
2. Codex worker and both reviewers can complete tasks end-to-end.
3. Retry-once then per-run fallback behavior is deterministic.
4. No regression in task lifecycle state transitions.
5. Docs and tests both reflect the final contract.

## 12. Risks And Mitigations

Risk: result-format drift between engines.
- Mitigation: shared v2 contract and parser validation.

Risk: team-lead ambiguity handling causes stalls.
- Mitigation: strict retry and fallback policy.

Risk: parity regressions over time.
- Mitigation: contract tests plus harness scenarios in CI.

## 13. Execution Checklist

- [ ] Update shared contract docs
- [ ] Implement parser compatibility layer
- [ ] Implement adapter normalization behavior
- [ ] Implement retry and per-run fallback
- [ ] Add unit and integration tests
- [ ] Run harness full scenarios
- [ ] Run dev pilot and capture results
- [ ] Approve broader rollout

## Architectural Context

### Implementation Reality: Skills, Not Code

**Critical framing:** The "parser", "contract", and "normalization" described in this plan are **skill and agent definition changes** (markdown files interpreted by Claude), not Rust or TypeScript code modules. The current system has no programmatic result parser — team-lead (a Claude instance running `team-lead-init` skill) interprets freeform messages from workers/reviewers via LLM reasoning. Codex results are mapped by the `codex-cli` skill (also a Claude instance) before being sent as freeform messages to team-lead.

This means:
- "Define normalized in-memory result shape" (Phase A) = update agent/skill docs to specify output format
- "Add parser path for v2 headers" (Phase A) = update team-lead-init to recognize structured headers
- "Adapter normalization" (Phase B) = update codex-cli skill to emit v2 headers

The only potential *code* changes are: (1) adding v2 header validation to `tina-session exec-codex` return envelope, (2) new harness test scenarios.

### Patterns to follow

- **Routing:** `tina-session/src/routing.rs:56-68` — `cli_for_model()` is the single source of truth for model→CLI routing. Already consumed by skills via `tina-session config cli-for-model`.
- **Codex execution:** `tina-session/src/commands/exec_codex.rs:70-181` — synchronous JSON envelope return. Already emits events to Convex and upserts team members.
- **Team-lead DAG scheduler:** `skills/team-lead-init/SKILL.md:126-261` — the retry/escalation logic and per-task agent lifecycle. Codex fallback logic belongs here.
- **Codex adapter flow:** `skills/codex-cli/SKILL.md:16-230` — Steps 1-5 define the invocation→parse→report cycle. v2 normalization updates go here.
- **Agent output protocols:** `agents/implementer.md:119-138`, `agents/spec-reviewer.md:72-97`, `agents/code-quality-reviewer.md:91-117` — current freeform message formats. v2 contract updates go here.
- **Existing harness scenario:** `tina-harness/scenarios/04-codex-reviewer/` — minimal Codex reviewer test. Extend for retry/fallback/malformed scenarios.

### Code to reuse

- `tina-session/src/routing.rs` — `AgentCli` enum and `cli_for_model()` already handle routing
- `tina-session/src/commands/exec_codex.rs` — JSON envelope structure already close to v2 contract shape
- `skills/team-lead-init/SKILL.md` Step 5.4 — existing review routing for Claude vs Codex
- `skills/executing-plans/SKILL.md` "Team Mode Process" — existing routing check pattern

### Anti-patterns

- Don't build a Rust parser for result interpretation — team-lead is an LLM, not a program. Update skill prompts instead.
- Don't assume v2 headers will be emitted perfectly by Claude agents — LLM output is probabilistic. Team-lead must handle both v2 and legacy gracefully as a soft expectation, not a hard parse.
- Don't use bare `task_id: <numeric>` — the current system uses string UUIDs from TaskCreate, not numeric IDs. See `skills/team-lead-init/SKILL.md:96-122`.

### Integration

- **Entry:** Skill files in `skills/codex-cli/`, `skills/team-lead-init/`, `skills/executing-plans/`
- **Agent definitions:** `agents/implementer.md`, `agents/spec-reviewer.md`, `agents/code-quality-reviewer.md`
- **Existing multi-CLI design:** `docs/plans/2026-02-09-multi-cli-agent-support-design.md` — parent design; this plan builds on top
- **Connects to:** `tina-session exec-codex` for Codex execution, Convex `orchestrationEvents` for observability

### Issues requiring resolution

1. **Section 5 `task_id` type mismatch:** Plan says "numeric task id" but the system uses string UUIDs from TaskCreate. Fix: change to `task_id: string (TaskCreate ID)`.

2. **LLM output reliability risk unaddressed:** The plan treats v2 headers as deterministic, but Claude agents produce freeform text. The acceptance matrix (Section 5.1) implies hard validation — this only works for Codex outputs processed by the codex-cli adapter skill. For Claude agents, team-lead must use best-effort parsing with legacy fallback permanently, not just as a transitional measure.

3. **Phase A/B boundary is blurry:** Both are skill-doc updates. Phase A updates team-lead to recognize v2 format; Phase B updates codex-cli to emit it. Consider: these could be one phase since neither involves substantial code and they're tightly coupled.

4. **Missing: what triggers Codex-to-Claude fallback at the skill level?** Section 6 says "team lead retries Codex once then falls back to Claude" but `team-lead-init/SKILL.md` Step 5.2 currently just spawns workers — there's no infrastructure for re-spawning with a different `subagent_type`. The plan needs to specify how team-lead switches from `tina:codex-cli` to `tina:implementer` (or `tina:spec-reviewer`) mid-task.

5. **Section 9 Phase D assumes all prior infrastructure.** The 04-codex-reviewer harness scenario only tests reviewer role. Worker parity needs a new scenario.

