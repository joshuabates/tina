# Control Plane Phase 2.5 Remediation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 11c5d8bcfde97c9397cb396d8fae947ce6f7511d

**Goal:** Address gaps from Phase 2 review: (1) commit 6 uncommitted phase-2 files (test_helpers, node schema, queryDefs, test builders), (2) fix pre-existing tina-data compile error from phase 1.

**Architecture:** Targeted fixes to existing implementation. No new architecture.

**Phase context:** Phase 2 implemented the full launch-from-web pipeline (launchOrchestration mutation, daemon handler, web UI). Review found two gaps: several working-tree files were never committed, and the `extract_orchestration_record` function in `tina-data/src/convex_client.rs` was not updated for the 5 new `OrchestrationRecord` fields added in Phase 1's contract generation.

**Issues to address:**
1. Uncommitted phase-2 files - Fix: stage and commit all 7 files (6 modified + 1 new)
2. tina-data compile error - Fix: add missing field extractions in `extract_orchestration_record`

---

## Task 1: Fix tina-data OrchestrationRecord extraction to include Phase 1 fields

**Files:**
- `tina-data/src/convex_client.rs`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. In `tina-data/src/convex_client.rs`, find the `extract_orchestration_record` function (line ~504). Add the 5 missing fields after the `total_elapsed_mins` extraction:

```rust
fn extract_orchestration_record(obj: &BTreeMap<String, Value>) -> OrchestrationRecord {
    OrchestrationRecord {
        node_id: value_as_id(obj, "nodeId"),
        project_id: value_as_opt_str(obj, "projectId"),
        design_id: value_as_opt_str(obj, "designId"),
        feature_name: value_as_str(obj, "featureName"),
        design_doc_path: value_as_str(obj, "designDocPath"),
        branch: value_as_str(obj, "branch"),
        worktree_path: value_as_opt_str(obj, "worktreePath"),
        total_phases: value_as_f64(obj, "totalPhases"),
        current_phase: value_as_f64(obj, "currentPhase"),
        status: value_as_str(obj, "status"),
        started_at: value_as_str(obj, "startedAt"),
        completed_at: value_as_opt_str(obj, "completedAt"),
        total_elapsed_mins: value_as_opt_f64(obj, "totalElapsedMins"),
        policy_snapshot: value_as_opt_str(obj, "policySnapshot"),
        policy_snapshot_hash: value_as_opt_str(obj, "policySnapshotHash"),
        preset_origin: value_as_opt_str(obj, "presetOrigin"),
        design_only: value_as_opt_bool(obj, "designOnly"),
        updated_at: value_as_opt_str(obj, "updatedAt"),
    }
}
```

The `value_as_opt_str` helper already exists. A `value_as_opt_bool` helper may need to be added if not present. Check for it:

```rust
fn value_as_opt_bool(map: &BTreeMap<String, Value>, key: &str) -> Option<bool> {
    match map.get(key) {
        Some(Value::Boolean(b)) => Some(*b),
        _ => None,
    }
}
```

2. Verify tina-data compiles:

Run: `cargo check --manifest-path tina-data/Cargo.toml 2>&1 | tail -5`
Expected: Compiles without errors.

---

## Task 2: Commit all uncommitted phase-2 files

**Files:**
- `convex/_generated/api.d.ts`
- `convex/test_helpers.ts`
- `tina-web/src/schemas/node.ts`
- `tina-web/src/schemas/index.ts`
- `tina-web/src/services/data/queryDefs.ts`
- `tina-web/src/test/builders/domain/entities.ts`
- `tina-web/src/test/builders/domain/fixtures.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** 1

### Steps

1. Stage all uncommitted phase-2 files:

Run: `git add convex/_generated/api.d.ts convex/test_helpers.ts tina-web/src/schemas/node.ts tina-web/src/schemas/index.ts tina-web/src/services/data/queryDefs.ts tina-web/src/test/builders/domain/entities.ts tina-web/src/test/builders/domain/fixtures.ts`
Expected: Files staged.

2. Also stage the tina-data fix from Task 1:

Run: `git add tina-data/src/convex_client.rs`
Expected: File staged.

3. Commit all remediation work:

Run: `git commit -m "fix: commit uncommitted phase-2 files and fix tina-data compile error"`
Expected: Commit created successfully with all 8 files.

4. Verify clean working tree:

Run: `git status --short`
Expected: Only `AGENTS.md` remains as untracked (not part of this feature).

5. Verify tina-data compiles:

Run: `cargo check --manifest-path tina-data/Cargo.toml 2>&1 | tail -3`
Expected: No errors.

---

## Dependency Graph

```
Task 1 (fix tina-data extraction) ────> Task 2 (commit all files)
```

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 30 |

---

## Phase Estimates

| Task | Estimated Time | Lines |
|------|---------------|-------|
| Task 1: Fix OrchestrationRecord extraction | 3 min | ~15 |
| Task 2: Commit all uncommitted files | 2 min | 0 (git only) |
| **Total** | **~5 min** | **~15** |

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
