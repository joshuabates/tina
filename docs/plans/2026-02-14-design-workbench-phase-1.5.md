# Design Workbench Phase 1.5 Remediation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 0367c73 (Phase 1 rename commit: `fix: rename remaining design→spec references in CLI tests and UI components`)

**Prerequisite:** Execute this remediation on top of Phase 1 rename baseline (`0367c73`) or an equivalent commit containing the same design→spec core refactor.

**Goal:** Address gaps from Phase 1 review: update tina-harness create_design→create_spec and --design-id→--spec-id (including verify test fixtures), update tina-monitor design_doc_path→spec_doc_path in data types and test JSON, update useCreateSession.ts contextType union design→spec, and migrate orchestrate + downstream agents to spec-based CLI/metadata naming.

**Architecture:** Targeted fixes to existing implementation. No new architecture.

**Phase context:** Phase 1 implemented the designs→specs rename across Convex schema/functions, tina-web components, tina-data types, tina-session commands, and tina-daemon code. Review found gaps in 5 areas: tina-harness still calls `create_design` and sends `--design-id`, tina-harness verify fixtures still use `design_id`/`design_doc_path`, tina-monitor still uses `design_doc_path` field name, useCreateSession.ts still has `"design"` in contextType union, and the orchestrate skill + downstream agents still reference `--design-id`/`DESIGN_ID`/`DESIGN_DOC`/`design_doc_path`/`design_id` throughout (which would break since `tina-session init` now expects `--spec-id`/`--spec-doc` and `tina-session work spec` replaced `work design`).

**Issues to address:**
1. tina-harness `create_design`→`create_spec`, `--design-id`→`--spec-id` — Fix: rename function calls and variable names in `run.rs`
2. tina-harness verify fixtures `design_id`/`design_doc_path`→`spec_id`/`spec_doc_path` — Fix: update `verify.rs` test record construction
3. tina-monitor `design_doc_path`→`spec_doc_path` — Fix: rename struct field and all references across monitor crate
4. useCreateSession.ts contextType `"design"`→`"spec"` — Fix: update union type
5. orchestrate + agents `--design-id`→`--spec-id`, `DESIGN_ID`→`SPEC_ID`, `DESIGN_DOC`→`SPEC_DOC`, `design_doc_path`→`spec_doc_path`, `design_id`→`spec_id`, `tina-session work design`→`tina-session work spec` — Fix: systematic find-replace in skill + agent contracts

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 260 |

---

### Task 1: Rename design→spec references in orchestrate skill and agent contracts

**Files:**
- `skills/orchestrate/SKILL.md`
- `agents/design-validator.md`
- `agents/phase-planner.md`
- `agents/phase-reviewer.md`

**Model:** opus

**review:** spec-only

**Depends on:** none

The orchestrate skill and downstream agent contracts still contain design-era naming. Phase 1 renamed `tina-session init --design-id` → `--spec-id`, `tina-session init --design-doc` → `--spec-doc`, and `tina-session work design` → `tina-session work spec`. These docs must be updated in lockstep so task metadata keys and CLI invocations stay aligned.

**Step 1:** Run systematic replacements across all 4 files. Apply these substitutions in order (more specific patterns first to avoid partial matches):

```
# CLI command renames (most specific first)
"tina-session work design resolve-to-file" → "tina-session work spec resolve-to-file"
"tina-session work design resolve" → "tina-session work spec resolve"
"--design-id" → "--spec-id"  (flag in CLI invocations and skill parsing)
"--design-doc" → "--spec-doc"  (flag in tina-session init)

# Bash variable renames
"DESIGN_ID" → "SPEC_ID"
"DESIGN_DOC" → "SPEC_DOC"
"DESIGN_PRE_APPROVED" → "SPEC_PRE_APPROVED"

# JSON/metadata field renames
"design_doc_path" → "spec_doc_path"
"design_doc" → "spec_doc"  (in JSON keys and descriptions)
"design_id" → "spec_id"  (in JSON keys and task metadata)
"design_only" → "spec_only"  (in init flags)

# Local cache and report path renames
".claude/tina/design.md" → ".claude/tina/spec.md"
"design-validation.md" → "spec-validation.md"

# Skill invocation syntax rename
"design-doc-path" → "spec-doc-path"  (in invocation comment)
"design-id" → "spec-id"  (in invocation comment, after -- prefix already handled)
```

**IMPORTANT — What NOT to rename:**
- `"design"` when referring to the NEW visual design concept (e.g., "which visual design to target" in orchestration linkage documentation)
- `designId` in the orchestration JSON that refers to the NEW optional visual design link (per the spec: `orchestrations.designId (optional — which visual design to target)`)
- The word "design" in prose referring to the design workbench feature itself

The key distinction: in the orchestrate skill, `DESIGN_ID`/`--design-id` refers to the architecture document (now spec), because that's what the orchestrate skill takes as input. The new `designId` field on orchestrations (visual design reference) is Phase 2+ scope.

Run: `rg -n "design-id|DESIGN_ID|DESIGN_DOC|design_doc_path|design_id|work design|\\.claude/tina/design\\.md" skills/orchestrate/SKILL.md agents/design-validator.md agents/phase-planner.md agents/phase-reviewer.md`

Expected: No matches. Orchestrate + agents all use `--spec-id`, `SPEC_ID`, `SPEC_DOC`, `spec_doc_path`, `spec_id`, `tina-session work spec`, and `.claude/tina/spec.md`.

**Step 2:** Verify the skill + agents are internally consistent.

Run: `rg -n "spec-id|SPEC_ID|SPEC_DOC|spec_doc_path|spec_id|work spec|\\.claude/tina/spec\\.md" skills/orchestrate/SKILL.md agents/design-validator.md agents/phase-planner.md agents/phase-reviewer.md`

Expected: Matches exist in all four files for the new spec-based forms.

---

### Task 2: Rename design→spec in tina-harness run.rs and verify.rs

**Files:**
- `tina-harness/src/commands/run.rs`
- `tina-harness/src/verify.rs`

**Model:** opus

**review:** spec-only

**Depends on:** none

Phase 1 renamed `tina-data`'s `create_design` → `create_spec` and `tina-session`'s wrapper. The harness still calls the old name.

**Step 1:** Apply these renames in `tina-harness/src/commands/run.rs`:

```
# Function renames
seed_design_in_convex → seed_spec_in_convex
design_doc_for_run → spec_doc_for_run
extract_design_title → extract_spec_title

# API call rename
writer.create_design → writer.create_spec

# Variable renames
design_markdown → spec_markdown
design_id → spec_id
design_doc → spec_doc  (variable names, not the concept)
design_path → spec_path

# Skill command flag
"--design-id {}" → "--spec-id {}"

# Comment and doc updates
"Create a Convex design record" → "Create a Convex spec record"
"return the design ID" → "return the spec ID"
"Build the run-specific design doc" → "Build the run-specific spec doc"
"Extract a design title" → "Extract a spec title"
"Send the orchestrate skill command using a Convex design ID" → "Send the orchestrate skill command using a Convex spec ID"
```

Also rename test function names:
```
test_design_doc_for_run_rewrites_existing_h1_for_unique_feature → test_spec_doc_for_run_rewrites_existing_h1_for_unique_feature
test_design_doc_for_run_prepends_h1_when_missing → test_spec_doc_for_run_prepends_h1_when_missing
test_extract_design_title_prefers_h1 → test_extract_spec_title_prefers_h1
test_extract_design_title_falls_back_when_h1_missing → test_extract_spec_title_falls_back_when_h1_missing
```

**Step 2:** Rename field names in `tina-harness/src/verify.rs` test fixtures:

```rust
design_id: None  →  spec_id: None
design_doc_path: "design.md".to_string()  →  spec_doc_path: "spec.md".to_string()
```

**Step 3:** Run harness checks.

Run: `cargo check --manifest-path tina-harness/Cargo.toml 2>&1 | tail -5`

Expected: Compilation succeeds (or only warnings, no errors). The harness now calls `create_spec`, sends `--spec-id`, and uses generated `spec_id`/`spec_doc_path` fields in tests.

**Step 4:** Run harness tests.

Run: `cargo test --manifest-path tina-harness/Cargo.toml 2>&1 | tail -10`

Expected: All tests pass.

---

### Task 3: Rename design_doc_path→spec_doc_path in tina-monitor and update useCreateSession.ts

**Files:**
- `tina-monitor/src/data/convex.rs`
- `tina-monitor/src/tui/app.rs`
- `tina-monitor/src/cli/status.rs`
- `tina-monitor/src/tui/ui.rs`
- `tina-monitor/src/tui/views/phase_detail.rs`
- `tina-monitor/src/tui/views/log_viewer.rs`
- `tina-monitor/tests/tui_tests.rs`
- `tina-monitor/tests/send_tests.rs`
- `tina-web/src/hooks/useCreateSession.ts`

**Model:** opus

**review:** spec-only

**Depends on:** none

Phase 1 renamed the generated `OrchestrationRecord` to use `spec_doc_path` (in `tina-data/src/generated/orchestration_core_fields.rs`). But tina-monitor's local `MonitorOrchestration` struct and all its usages still use `design_doc_path`. This would cause a compile error since the source field is now `spec_doc_path`.

**Step 1:** Rename in `tina-monitor/src/data/convex.rs`:

```rust
# Struct field (line ~107)
pub design_doc_path: PathBuf  →  pub spec_doc_path: PathBuf

# from_list_entry (line ~142)
design_doc_path: PathBuf::from(&entry.record.design_doc_path)
→ spec_doc_path: PathBuf::from(&entry.record.spec_doc_path)

# from_detail (line ~184)
design_doc_path: PathBuf::from(&detail.record.design_doc_path)
→ spec_doc_path: PathBuf::from(&detail.record.spec_doc_path)

# Test data (lines ~435, ~465, ~556)
design_doc_path: "docs/auth.md".to_string()
→ spec_doc_path: "docs/auth.md".to_string()
(and similar for other test instances)
```

**Step 2:** Rename in `tina-monitor/src/tui/app.rs`:

```rust
# Line ~666
orch.design_doc_path.file_stem()  →  orch.spec_doc_path.file_stem()

# Line ~702
let design_path = orch.design_doc_path.clone()  →  let spec_path = orch.spec_doc_path.clone()
(and update usage of design_path → spec_path in that function)

# Test data (line ~1396)
design_doc_path: "design.md".to_string()  →  spec_doc_path: "spec.md".to_string()
```

**Step 3:** Rename in `tina-monitor/src/cli/status.rs`:

```rust
# Struct field (line ~135)
pub design_doc_path: String  →  pub spec_doc_path: String

# Mapping (line ~173)
design_doc_path: orch.design_doc_path.display().to_string()
→ spec_doc_path: orch.spec_doc_path.display().to_string()

# Display (line ~197)
println!("Design Doc: {}", output.design_doc_path)
→ println!("Spec Doc: {}", output.spec_doc_path)
```

**Step 4:** Rename in remaining view files:

```rust
# tina-monitor/src/tui/ui.rs (line ~209)
design_doc_path: "design.md"  →  spec_doc_path: "spec.md"

# tina-monitor/src/tui/views/phase_detail.rs (line ~865)
design_doc_path: "design.md"  →  spec_doc_path: "spec.md"

# tina-monitor/src/tui/views/log_viewer.rs (line ~224)
design_doc_path: "design.md"  →  spec_doc_path: "spec.md"
```

**Step 5:** Rename in test files:

```rust
# tina-monitor/tests/tui_tests.rs (line ~115)
design_doc_path: "/test/design.md"  →  spec_doc_path: "/test/spec.md"

# tina-monitor/tests/send_tests.rs (line ~22)
design_doc_path: "/test/design.md"  →  spec_doc_path: "/test/spec.md"
```

Run: `cargo check --manifest-path tina-monitor/Cargo.toml 2>&1 | tail -5`

Expected: Compilation succeeds.

**Step 6:** Run monitor tests.

Run: `cargo test --manifest-path tina-monitor/Cargo.toml 2>&1 | tail -10`

Expected: All tests pass.

**Step 7:** Update `tina-web/src/hooks/useCreateSession.ts` line 10:

```typescript
# Old
contextType?: "task" | "plan" | "commit" | "design" | "freeform"

# New
contextType?: "task" | "plan" | "commit" | "spec" | "freeform"
```

Run: `cd tina-web && npx tsc --noEmit 2>&1 | tail -5`

Expected: No type errors. The SpecDetailPage already passes `contextType: "spec"`, so this just updates the union to match.

---

## Phase Estimates

| Task | Estimated Duration | Complexity |
|------|--------------------|------------|
| Task 1: Orchestrate + agent contract rename | 7 min | Medium-High (cross-file contract update across 4 docs) |
| Task 2: tina-harness rename | 4 min | Low-Medium (2 files, mostly mechanical renames) |
| Task 3: tina-monitor + useCreateSession | 5 min | Low-Medium (8 Rust files + 1 TS file, all mechanical) |
| **Total** | **~16 min** | |

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
