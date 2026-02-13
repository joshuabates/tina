# Codex Worker/Reviewer Functional Parity Phase 3 Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 71c1dccc11b5d75ccda94fe6976ee8de7e56f72b

**Goal:** Enable Codex routing for worker and both reviewer roles end-to-end under the v2 contract, verify role progression parity, and add a harness scenario proving the complete Codex worker flow works.

**Architecture:** Small Rust code change to `exec-codex` for role tracking, new harness scenario, and documentation updates. Phases A and B established the contract, dual-grammar recognition, and retry protocol. This phase proves the system works end-to-end.

**Phase context:** Phase 1 (A) defined the v2 result contract, added structured headers to agent definitions, updated codex-cli to emit v2 deterministically, and added dual-grammar recognition to team-lead-init and executing-plans. Phase 2 (B) expanded the retry protocol with concrete decision flow, templates, and escalation. This phase validates the complete lifecycle works for all three Codex roles (worker, spec-reviewer, code-quality-reviewer).

**Key patterns to follow:**
- CLI argument pattern: `tina-session/src/main.rs:320-356` (ExecCodex variant)
- exec-codex implementation: `tina-session/src/commands/exec_codex.rs:70-181`
- Codex CLI routing: `skills/codex-cli/SKILL.md:82-94` (Step 3)
- Harness scenario format: `tina-harness/scenarios/04-codex-reviewer/` (scenario.json, design.md, expected.json)
- Team-lead Codex routing: `skills/team-lead-init/SKILL.md:202-281` (Steps 5.2, 5.4)

**Anti-patterns:**
- Don't build a programmatic result parser — team-lead is an LLM, not a program
- Don't duplicate routing logic in multiple places — `cli_for_model()` is the single source of truth
- Don't create overly complex harness designs — simple single-phase scenario with Codex worker is sufficient

---

## Tasks

### Task 1: Add role parameter to exec-codex for Codex role tracking

**Files:**
- `tina-session/src/main.rs`
- `tina-session/src/commands/exec_codex.rs`
- `skills/codex-cli/SKILL.md`

**Model:** opus

**review:** full

**Depends on:** none

Add a `--role` parameter to the `exec-codex` CLI command so Convex events and team member records accurately reflect whether a Codex run was a worker, spec-reviewer, or code-quality-reviewer. Currently `agent_name()` always generates `codex-worker-*` even for reviewer runs.

**Step 1:** Read the current exec-codex CLI definition and run function.

Run: `grep -n "ExecCodex\|agent_name\|upsert_team_member" tina-session/src/commands/exec_codex.rs`
Expected: Lines showing the ExecCodex struct, agent_name function (always "codex-worker"), and upsert call.

**Step 2:** Add `--role` optional parameter to the `ExecCodex` CLI variant in `tina-session/src/main.rs`. Insert after the existing `output` field (around line 355):

```rust
        /// Agent role for tracking (e.g., "worker", "spec-reviewer", "code-quality-reviewer")
        #[arg(long)]
        role: Option<String>,
```

Update the match arm (around line 1232) to pass the new field:

```rust
        Commands::ExecCodex {
            feature,
            phase,
            task_id,
            prompt,
            cwd,
            model,
            sandbox,
            timeout_secs,
            output,
            role,
        } => {
            check_phase(&phase)?;
            commands::exec_codex::run(
                &feature,
                &phase,
                &task_id,
                &prompt,
                &cwd,
                model.as_deref(),
                sandbox.as_deref(),
                timeout_secs,
                output.as_deref(),
                role.as_deref(),
            )
        }
```

**Step 3:** Update `exec_codex.rs` to accept and use the role parameter.

Update `agent_name()` to accept a role parameter:

```rust
fn agent_name(task_id: &str, phase: &str, role: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    task_id.hash(&mut hasher);
    let hash = hasher.finish();
    let hash8 = format!("{:08x}", hash & 0xFFFF_FFFF);
    format!("codex-{role}-{phase}-{hash8}")
}
```

Update the `run()` function signature to include `role: Option<&str>`, default to "worker", and pass to `agent_name()` and events:

```rust
pub fn run(
    feature: &str,
    phase: &str,
    task_id: &str,
    prompt: &str,
    cwd: &Path,
    model_override: Option<&str>,
    sandbox_override: Option<&str>,
    timeout_override: Option<u64>,
    output_path: Option<&Path>,
    role: Option<&str>,
) -> anyhow::Result<u8> {
    // ...
    let role_str = role.unwrap_or("worker");

    // In emit_start_event, include role in detail JSON
    // In emit_terminal_event, include role in detail JSON
    // In agent_name call, pass role_str
    let name = agent_name(task_id, phase, role_str);
    // ...
}
```

Add `"role": role_str` to both `emit_start_event` and `emit_terminal_event` detail JSON objects.

**Step 4:** Update existing tests in `exec_codex.rs`:

Update `agent_name_format` test:
```rust
#[test]
fn agent_name_format() {
    let name = agent_name("task-123", "1", "worker");
    assert!(name.starts_with("codex-worker-1-"), "got: {}", name);
    assert_eq!(name.len(), "codex-worker-1-".len() + 8);
}
```

Update `agent_name_deterministic` test:
```rust
#[test]
fn agent_name_deterministic() {
    let name1 = agent_name("task-abc", "2", "worker");
    let name2 = agent_name("task-abc", "2", "worker");
    assert_eq!(name1, name2);
}
```

Update `agent_name_different_for_different_tasks` test:
```rust
#[test]
fn agent_name_different_for_different_tasks() {
    let name1 = agent_name("task-1", "1", "worker");
    let name2 = agent_name("task-2", "1", "worker");
    assert_ne!(name1, name2);
}
```

Add new test for role in agent name:
```rust
#[test]
fn agent_name_includes_role() {
    let worker = agent_name("task-1", "1", "worker");
    let reviewer = agent_name("task-1", "1", "spec-reviewer");
    assert!(worker.starts_with("codex-worker-"), "got: {}", worker);
    assert!(reviewer.starts_with("codex-spec-reviewer-"), "got: {}", reviewer);
    assert_ne!(worker, reviewer);
}
```

**Step 5:** Update `skills/codex-cli/SKILL.md` Step 3 to pass `--role` parameter. Change the command template:

```bash
tina-session exec-codex \
  --feature "$FEATURE" \
  --phase "$PHASE" \
  --task-id "$TASK_ID" \
  --prompt "$PROMPT"  \
  --cwd "$CWD" \
  --role "$ROLE" \
  ${MODEL:+--model "$MODEL"}
```

Where `$ROLE` is the mapped role: `executor` → `worker`, `reviewer` + spawn name contains `spec-reviewer` → `spec-reviewer`, `reviewer` + spawn name contains `code-quality-reviewer` → `code-quality-reviewer`.

Add a note after the command in Step 3:

```markdown
**Role mapping:** The `--role` parameter uses the v2 role name:
- Spawn role `executor` → `--role worker`
- Spawn role `reviewer` with name containing `spec-reviewer` → `--role spec-reviewer`
- Spawn role `reviewer` with name containing `code-quality-reviewer` → `--role code-quality-reviewer`
```

**Step 6:** Verify the changes build and tests pass.

Run: `cargo test --manifest-path tina-session/Cargo.toml -- exec_codex`
Expected: All exec_codex tests pass including the new `agent_name_includes_role` test.

Run: `cargo check --manifest-path tina-session/Cargo.toml`
Expected: Clean compilation with no errors.

---

### Task 2: Create 05-codex-worker-flow harness scenario

**Files:**
- `tina-harness/scenarios/05-codex-worker-flow/scenario.json`
- `tina-harness/scenarios/05-codex-worker-flow/design.md`
- `tina-harness/scenarios/05-codex-worker-flow/expected.json`

**Model:** opus

**review:** full

**Depends on:** 1

Create a new harness scenario that exercises the complete Codex worker flow: worker implements via Codex, then both reviewers run via Codex. This proves all three Codex roles work end-to-end under the v2 contract.

**Step 1:** Read the existing 04-codex-reviewer scenario files for format reference.

Run: `cat tina-harness/scenarios/04-codex-reviewer/scenario.json`
Expected: `{"feature_name": "codex-review-test"}`

**Step 2:** Create the scenario directory.

Run: `mkdir -p tina-harness/scenarios/05-codex-worker-flow`
Expected: Directory created.

**Step 3:** Create `scenario.json`:

```json
{"feature_name": "codex-worker-test"}
```

**Step 4:** Create `design.md`. The design doc exercises the full Codex worker flow by specifying `codex` as the model for both the worker and reviewer tasks:

```markdown
# Add Statistics Summary to CLI

## Overview

Add a `--stats` / `-s` flag to the test-project CLI that prints character and word count statistics after processing. This exercises full Codex routing by using a Codex model for both implementation and review.

## Architectural Context

This is a single-file change to the CLI argument parser and main processing loop. No architectural changes required. The existing Clap-based CLI parser supports boolean flags natively.

## Requirements

1. Add `--stats` / `-s` flag to CLI arguments
2. When enabled, after processing count and print total characters and total words in the output
3. Format: "Stats: N characters, M words"

## Phase 1: Implement Statistics Flag

### Tasks

1. **Executor (codex):** Add `stats: bool` field to `Cli` struct with `-s` and `--stats` flags. After normal processing output, if stats is enabled, count total characters and words in the output and print "Stats: N characters, M words" on a separate line.

2. **Reviewer (codex):** Review the implementation for correctness, ensuring the stats flag does not affect normal processing when not enabled, output counts are accurate, and all existing tests still pass.

### Success Criteria

- `test-project --stats -u` shows output followed by stats line
- `test-project` (without stats) works as before with no stats line
- All existing tests continue to pass
```

**Step 5:** Create `expected.json`:

```json
{
  "schema_version": 1,
  "assertions": {
    "phases_completed": 1,
    "final_status": "complete",
    "tests_pass": true,
    "file_changes": [
      { "path": "src/main.rs", "contains": "stats" }
    ],
    "convex": {
      "has_orchestration": true,
      "expected_status": "complete",
      "min_phases": 1,
      "min_tasks": 1,
      "min_team_members": 2
    }
  }
}
```

**Step 6:** Verify scenario loads correctly.

Run: `cargo run --manifest-path tina-harness/Cargo.toml -- run 05-codex-worker-flow --scenarios-dir tina-harness/scenarios --test-project-dir tina-harness/test-project 2>&1 | head -5`
Expected: Scenario loads and begins (may fail if not in --full mode, but should not error on scenario parsing).

---

### Task 3: Document Codex role progression parity in team-lead-init

**Files:**
- `skills/team-lead-init/SKILL.md`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Add explicit documentation confirming that Codex-routed tasks follow the identical role progression as Claude-routed tasks. This satisfies the design doc requirement "Confirm team-lead role progression is unchanged."

**Step 1:** Read the current Integration section of team-lead-init.

Run: `grep -n "Integration\|Codex\|role progression\|parity" skills/team-lead-init/SKILL.md`
Expected: Integration section around line 899 with existing Codex routing notes.

**Step 2:** Add a "Codex Role Progression Parity" subsection after the Integration section (before Red Flags). Insert after the line "Note: `team-name.txt` is no longer used..." (around line 916):

```markdown
## Codex Role Progression Parity

Codex-routed tasks follow the identical progression as Claude-routed tasks:

1. **Routing check:** `tina-session config cli-for-model --model <model>` returns `claude` or `codex`
2. **Worker spawn:** `tina:implementer` (claude) or `tina:codex-cli` with `role: executor` (codex)
3. **Worker result:** v2 headers (both emit) or legacy freeform (Claude only) → dual-grammar recognition
4. **Spec-reviewer spawn:** `tina:spec-reviewer` (claude) or `tina:codex-cli` with `role: reviewer` (codex)
5. **Code-quality-reviewer spawn:** `tina:code-quality-reviewer` (claude) or `tina:codex-cli` with `role: reviewer` (codex)
6. **Review results:** Same dual-grammar recognition, same acceptance matrix, same retry policy
7. **Task completion:** Identical shutdown, mark complete, re-check ready queue flow

The routing decision affects only the subagent_type and prompt format. All task lifecycle transitions (in_progress → review → complete/blocked), retry counters, escalation rules, and completion gates are engine-agnostic.
```

**Step 3:** Verify the addition integrates properly.

Run: `grep -c "Codex Role Progression Parity\|engine-agnostic\|cli-for-model" skills/team-lead-init/SKILL.md`
Expected: At least 3 matches showing the new parity section exists alongside existing routing references.

---

## Phase Estimates

| Task | Estimated effort | Risk |
|------|-----------------|------|
| Task 1: exec-codex role parameter | 15-20 min | Low — small additive Rust change with clear pattern |
| Task 2: Codex worker harness scenario | 10-15 min | Low — follows existing 04-codex-reviewer pattern |
| Task 3: Role progression parity docs | 5 min | Very low — documentation only |

**Total estimated:** 30-40 min
**Critical path:** Task 2 depends on Task 1 (needs --role for accurate tracking). Task 3 is independent.

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 200 |

Note: Task 1 is ~30 lines of Rust changes + ~10 lines of skill updates. Task 2 is ~60 lines of scenario files. Task 3 is ~15 lines of documentation. Total well within 200-line budget.

---

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
