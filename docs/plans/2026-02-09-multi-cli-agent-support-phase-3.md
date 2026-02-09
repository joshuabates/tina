# Multi-CLI Agent Support - Phase 3: Validation, Init AGENTS.md, Harness Scenario

## Scene-Setting Context

Phase 1 added routing primitives (`cli_for_model()`, `CliRouting`, `CodexConfig`), the `config cli-for-model` CLI command, `exec-codex` synchronous command, and `ConvexWriter::upsert_team_member()`.

Phase 2 added the `codex-cli` skill and integrated routing into orchestration skills (`orchestrate`, `team-lead-init`, `executing-plans`).

Phase 3 completes the feature by updating `check plan` validation to accept Codex-family models, adding AGENTS.md generation to `tina-session init`, and adding a harness scenario for end-to-end Codex reviewer flow.

## Tasks

### Task 1: Update `check plan` model validation to accept routing-aware models

**Model:** opus

Update `tina-session/src/commands/check.rs` to replace the strict `opus|haiku` whitelist with routing-aware validation that accepts any non-empty model token recognized by `cli_for_model()`.

**Current behavior** (lines 488-506 of `check.rs`):

The `plan()` function iterates `**Model:**` lines and rejects any model not starting with `"opus"` or `"haiku"`. This blocks Codex models like `codex`, `gpt-5.3-codex`, `o3-mini`, etc.

**New behavior:**

1. Keep the "model required per task" check (task count >= model count).
2. Replace the `opus|haiku` prefix check with:
   - Empty model string is still invalid.
   - Valid alias `"codex"` is accepted (resolves to config default).
   - Any non-empty model token is accepted by routing. The routing config determines whether it goes to Claude or Codex. The plan validator should not reject models based on CLI family, only ensure models are non-empty.
3. Simplify: since routing handles validity, the plan validator only needs to check:
   - Model field is present and non-empty.
   - Model field does not contain backticks or exceed 50 chars (existing sanity checks).

**Files changed:**

| File | Action |
|------|--------|
| `tina-session/src/commands/check.rs` | Modify `plan()` model validation logic |

**Tests:**

Update existing tests and add new ones:

- `test_plan_validation_accepts_opus` -- existing behavior preserved.
- `test_plan_validation_accepts_haiku` -- existing behavior preserved.
- `test_plan_validation_accepts_codex` -- model `"codex"` is accepted (new).
- `test_plan_validation_accepts_gpt_model` -- model `"gpt-5.3-codex"` is accepted (new).
- `test_plan_validation_accepts_o3_model` -- model `"o3-mini"` is accepted (new).
- `test_plan_validation_rejects_empty_model` -- empty model field still rejected.
- `test_plan_validation_rejects_sonnet` -- **remove or update**. The design says to accept any non-empty model token. "sonnet" is a valid model name (it routes to Claude). The old test that asserts `sonnet` must fail should be removed or changed to verify it passes, since sonnet is a valid model routed to Claude.

Note on the sonnet test: The existing `test_plan_validation_rejects_sonnet` test (line 442) asserts that `sonnet` is rejected. Under the new routing-aware validation, `sonnet` is a valid model (routes to Claude). This test must be updated to assert success instead.

### Task 2: Add AGENTS.md generation to `tina-session init`

**Model:** opus

Add a best-effort step to `tina-session init` that generates a `AGENTS.md` file in the worktree root with project context for Codex agents.

**Changes to `tina-session/src/commands/init.rs`:**

1. After creating the worktree and statusline config (line 77), add a call to `generate_agents_md(&worktree_path, &design_doc_abs)?`.

2. Add `fn generate_agents_md(worktree_path: &Path, design_doc: &Path) -> anyhow::Result<()>`:
   - Read the project's `CLAUDE.md` from the worktree root (if it exists).
   - Extract project-relevant sections: Overview, Build and Test, Architecture, Conventions.
   - Exclude orchestration internals and private operational instructions.
   - Write the result to `{worktree_path}/AGENTS.md`.
   - If `CLAUDE.md` is missing or unparseable, log a warning to stderr and continue without error.
   - This is best-effort: failures here must not block init.

3. Template format:

```markdown
# Project Context

## Overview
{extracted from CLAUDE.md "Project Overview" section, or design doc summary}

## Build and Test
{extracted from CLAUDE.md "Build & Development Commands" section}

## Architecture
{extracted from CLAUDE.md "Architecture" section}

## Conventions
{extracted from CLAUDE.md "Conventions" section}
```

**Files changed:**

| File | Action |
|------|--------|
| `tina-session/src/commands/init.rs` | Add `generate_agents_md()` function and call from `run()` |

**Tests:**

- `test_generate_agents_md_from_claude_md` -- given a worktree with a `CLAUDE.md`, generates `AGENTS.md` with expected sections.
- `test_generate_agents_md_missing_claude_md` -- no `CLAUDE.md` exists, function succeeds silently (no AGENTS.md created, no error).
- `test_generate_agents_md_partial_claude_md` -- `CLAUDE.md` with only some sections still generates partial `AGENTS.md`.
- `test_generate_agents_md_does_not_include_orchestration_internals` -- verifies AGENTS.md does not contain tina-specific operational content like "worktree", "supervisor state", or "tmux".

### Task 3: Add harness scenario for Codex reviewer flow

**Model:** opus

Create `tina-harness/scenarios/04-codex-reviewer/` with scenario files that exercise the Codex reviewer path end-to-end.

**Scenario description:**

This scenario tests that an orchestration using `--reviewer-model codex` (or task metadata `model: "codex"`) routes review through the `codex-cli` skill. It uses the test-project and is designed for `--full` mode (real orchestration). In mock mode, it verifies scenario parsing and assertion structure.

**Files:**

`tina-harness/scenarios/04-codex-reviewer/scenario.json`:
```json
{"feature_name": "codex-review-test"}
```

`tina-harness/scenarios/04-codex-reviewer/design.md`:

A simple design that requests 1 phase with a small implementation task and a codex model review task. The design should:
- Request adding a `--dry-run` flag to the test-project CLI (similar complexity to verbose flag).
- Specify the reviewer model as `codex` to trigger routing through `codex-cli`.
- Keep the executor model as `opus` (standard Claude path).

`tina-harness/scenarios/04-codex-reviewer/expected.json`:
```json
{
  "schema_version": 1,
  "assertions": {
    "phases_completed": 1,
    "final_status": "complete",
    "tests_pass": true,
    "file_changes": [
      { "path": "src/main.rs", "contains": "dry_run" }
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

The key assertions:
- `min_team_members: 2` -- one Claude executor + one Codex reviewer (registered via `upsert_team_member`).
- Standard orchestration and phase completion checks.

**Files changed:**

| File | Action |
|------|--------|
| `tina-harness/scenarios/04-codex-reviewer/scenario.json` | **New** |
| `tina-harness/scenarios/04-codex-reviewer/design.md` | **New** |
| `tina-harness/scenarios/04-codex-reviewer/expected.json` | **New** |

**Tests:**

- The scenario files are validated by the existing harness `validate` command (`tina-harness validate 04-codex-reviewer`).
- Full integration testing requires `--full` mode with a running Codex binary, so this scenario primarily validates the routing path and scenario structure in mock mode.

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max total implementation lines | 300 |
| Max function length | 50 lines |

## File Changes Summary

| File | Action |
|------|--------|
| `tina-session/src/commands/check.rs` | Modify model validation in `plan()` |
| `tina-session/src/commands/init.rs` | Add `generate_agents_md()` |
| `tina-harness/scenarios/04-codex-reviewer/scenario.json` | **New** |
| `tina-harness/scenarios/04-codex-reviewer/design.md` | **New** |
| `tina-harness/scenarios/04-codex-reviewer/expected.json` | **New** |

## Dependencies

No new crate dependencies required.

## Risks and Mitigations

- **AGENTS.md content quality**: The extraction from CLAUDE.md is best-effort and may miss sections if the markdown structure varies. Mitigated by using simple section-header matching and accepting partial output.
- **Codex harness scenario**: Full e2e testing requires a real Codex binary. The scenario is designed to work in mock mode for structural validation, with full mode requiring the Codex CLI to be installed and configured.
- **Sonnet test removal**: Removing the `test_plan_validation_rejects_sonnet` assertion changes validation behavior. This is intentional per the design -- the plan validator should not reject models by name.
