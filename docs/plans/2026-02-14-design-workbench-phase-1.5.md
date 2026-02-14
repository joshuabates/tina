# Design Workbench Phase 1.5 Remediation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 0367c73a8c34ad9b15ea5d939076b0bfe237f3fe

**Goal:** Address gaps from Phase 1 review: tina-harness and tina-monitor have compilation errors due to incomplete design→spec rename, orchestrate skill still uses `--design-id` flag, and useCreateSession.ts contextType union still includes `design`.

**Architecture:** Targeted fixes to existing implementation. No new architecture.

**Phase context:** Phase 1 renamed the `designs` concept (architecture docs) to `specs` across Convex, tina-web, tina-data, tina-session, and tina-daemon. Review found three gaps that were missed:
1. tina-harness calls `writer.create_design()` (removed method) and sends `--design-id` to orchestrate skill
2. tina-monitor references `entry.record.design_doc_path` (renamed to `spec_doc_path` in tina-data)
3. useCreateSession.ts contextType union still has `"design"` instead of `"spec"`

**Issues to address:**
1. tina-harness `create_design`→`create_spec` and `--design-id`→`--spec-id` - Fix: rename method call, function names, variables, and orchestrate command flag
2. tina-monitor `design_doc_path`→`spec_doc_path` - Fix: rename struct field, all usage sites, test data, and CLI output
3. useCreateSession.ts contextType `design`→`spec` - Fix: update union type literal

---

### Task 1: Fix tina-harness compilation and rename design→spec references

**Files:**
- `tina-harness/src/commands/run.rs`

**Model:** opus

**review:** spec-only

**Depends on:** none

This task fixes the compilation error (`create_design` method no longer exists) and renames all old "design" references (meaning architecture docs) to "spec" in the harness run command.

**Step 1:** Rename the `seed_design_in_convex` function to `seed_spec_in_convex` and update its implementation:

Replace `seed_design_in_convex` function (around line 724-739):
```rust
/// Create a Convex spec record for this harness run and return the spec ID.
fn seed_spec_in_convex(work_dir: &Path, spec_markdown: &str, feature_name: &str) -> Result<String> {
    let repo_name = work_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(feature_name)
        .to_string();
    let repo_path = work_dir.canonicalize()?.to_string_lossy().to_string();
    let title = extract_spec_title(spec_markdown, feature_name);
    let markdown = spec_markdown.to_string();

    tina_session::convex::run_convex(|mut writer| async move {
        let project_id = writer.find_or_create_project(&repo_name, &repo_path).await?;
        writer.create_spec(&project_id, &title, &markdown).await
    })
}
```

**Step 2:** Rename `extract_design_title` to `extract_spec_title` (around line 713-722):
```rust
/// Extract a spec title from markdown H1, falling back to the feature name.
fn extract_spec_title(markdown: &str, fallback_feature: &str) -> String {
    markdown
        .lines()
        .find_map(|line| line.strip_prefix("# "))
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| fallback_feature.to_string())
}
```

**Step 3:** Update the call site (around line 278-283) — rename local variables:
```rust
    let spec_doc = design_doc_for_run(&scenario.design_doc, &scenario.feature_name, feature_name);
    let spec_path = work_dir.join("design.md");
    fs::write(&spec_path, spec_doc).context("Failed to write spec doc to work directory")?;
    let spec_markdown =
        fs::read_to_string(&spec_path).context("Failed to read spec doc from work directory")?;
    let spec_id = seed_spec_in_convex(work_dir, &spec_markdown, feature_name)?;
```

Note: The filename `design.md` stays as-is since that's a local temp file name and changing it could affect other harness logic.

**Step 4:** Update the orchestrate command (around line 370-374):
```rust
    // Send the orchestrate skill command using a Convex spec ID.
    let skill_cmd = format!(
        "/tina:orchestrate --feature {} --spec-id {}",
        feature_name, spec_id
    );
```

**Step 5:** Update test function names (around line 1303-1313):
```rust
    #[test]
    fn test_extract_spec_title_prefers_h1() {
        let markdown = "# Calculator API\n\n## Phase 1\nDo work";
        let title = extract_spec_title(markdown, "calculator-api");
        assert_eq!(title, "Calculator API");
    }

    #[test]
    fn test_extract_spec_title_falls_back_when_h1_missing() {
        let markdown = "## Phase 1\nDo work";
        let title = extract_spec_title(markdown, "calculator-api");
        assert_eq!(title, "calculator-api");
    }
```

Run: `cargo check --manifest-path tina-harness/Cargo.toml 2>&1 | tail -5`
Expected: `Finished` with no errors

Run: `cargo test --manifest-path tina-harness/Cargo.toml -- extract_spec_title 2>&1 | tail -5`
Expected: `test result: ok. 2 passed`

---

### Task 2: Fix tina-monitor compilation and rename design_doc_path→spec_doc_path

**Files:**
- `tina-monitor/src/data/convex.rs`
- `tina-monitor/src/cli/status.rs`
- `tina-monitor/src/tui/app.rs`
- `tina-monitor/src/tui/ui.rs`
- `tina-monitor/src/tui/views/phase_detail.rs`
- `tina-monitor/src/tui/views/log_viewer.rs`
- `tina-monitor/tests/tui_tests.rs`
- `tina-monitor/tests/send_tests.rs`

**Model:** opus

**review:** spec-only

**Depends on:** none

This task fixes the compilation error (`design_doc_path` field no longer exists on `OrchestrationRecord`) and renames the local `MonitorOrchestration` struct field and all its usage sites.

**Step 1:** Rename `design_doc_path` → `spec_doc_path` in `MonitorOrchestration` struct (`src/data/convex.rs`, around line 107):
```rust
    pub spec_doc_path: PathBuf,
```

**Step 2:** Update the two mapping sites in `src/data/convex.rs` (lines ~142 and ~184):
```rust
            spec_doc_path: PathBuf::from(&entry.record.spec_doc_path),
```
```rust
            spec_doc_path: PathBuf::from(&detail.record.spec_doc_path),
```

**Step 3:** Update all test data in `src/data/convex.rs` (lines ~435, ~465, ~556) to use `spec_doc_path`:
```rust
                spec_doc_path: "docs/auth.md".to_string(),
```

**Step 4:** Update `src/cli/status.rs` — struct field (line ~135), usage (line ~173), and output label (line ~197):
```rust
    pub spec_doc_path: String,
```
```rust
        spec_doc_path: orch.spec_doc_path.display().to_string(),
```
```rust
            println!("Spec Doc: {}", output.spec_doc_path);
```

**Step 5:** Update `src/tui/app.rs` — usage of `design_doc_path` (lines ~666, ~702, ~704) and test data (line ~1396):
- Line ~666: `orch.spec_doc_path.file_stem()?.to_str()?`
- Line ~702: `let spec_path = orch.spec_doc_path.clone();`
- Line ~704: `if spec_path.exists() {`
- Test data line ~1396: `spec_doc_path: "design.md".to_string(),`

**Step 6:** Update test data in remaining files:
- `src/tui/ui.rs` line ~209: `spec_doc_path: "design.md".to_string(),`
- `src/tui/views/log_viewer.rs` line ~224: `spec_doc_path: "design.md".to_string(),`
- `src/tui/views/phase_detail.rs` line ~865: `spec_doc_path: "design.md".to_string(),`
- `tests/tui_tests.rs` line ~115: `spec_doc_path: "/test/design.md".to_string(),`
- `tests/send_tests.rs` line ~22: `spec_doc_path: "/test/design.md".to_string(),`

Run: `cargo check --manifest-path tina-monitor/Cargo.toml 2>&1 | tail -5`
Expected: `Finished` with no errors

Run: `cargo test --manifest-path tina-monitor/Cargo.toml 2>&1 | tail -5`
Expected: `test result: ok` with all tests passing

---

### Task 3: Update orchestrate skill --design-id→--spec-id and useCreateSession.ts

**Files:**
- `skills/orchestrate/SKILL.md`
- `tina-web/src/hooks/useCreateSession.ts`

**Model:** opus

**review:** spec-only

**Depends on:** Task 1

The orchestrate skill still uses `--design-id` flag, `DESIGN_ID` variable, and `tina-session work design resolve`. These must be renamed to match the Phase 1 spec convention. The tina-harness now sends `--spec-id`, so the skill must accept it.

Use `@tina:automated-refactoring` for the skill file. Apply these renames throughout `skills/orchestrate/SKILL.md`:

| Pattern | Replacement |
|---------|-------------|
| `--design-id` | `--spec-id` |
| `DESIGN_ID` | `SPEC_ID` |
| `DESIGN_DOC` | `SPEC_DOC` |
| `DESIGN_PRE_APPROVED` | `SPEC_PRE_APPROVED` |
| `design-doc-path` | `spec-doc-path` |
| `tina-session work design resolve` | `tina-session work spec resolve` |
| `tina-session work design resolve-to-file` | `tina-session work spec resolve-to-file` |
| `design doc path` (prose) | `spec doc path` |
| `design doc` (prose, when referring to architecture docs) | `spec doc` |
| `design document` (prose, when referring to architecture docs) | `spec document` |
| `Convex design ID` | `Convex spec ID` |
| `Convex design document ID` | `Convex spec document ID` |
| `design info` | `spec info` |

**Important:** Do NOT rename these (they refer to the NEW visual design concept or are part of the file naming convention):
- Filename references like `*-design.md` patterns used for detecting spec files
- Any references to visual designs or the design workbench

After renaming, manually verify the argument parsing section looks like:
```bash
        --spec-id) SPEC_ID="$2"; shift 2 ;;
```

And the `tina-session` calls look like:
```bash
tina-session work spec resolve --spec-id "$SPEC_ID" --json
```

**Step 2:** Update `tina-web/src/hooks/useCreateSession.ts` line 10:
```typescript
  contextType?: "task" | "plan" | "commit" | "spec" | "freeform"
```

Run: `grep -c 'design-id\|DESIGN_ID\|DESIGN_DOC\|design_doc\|work design' skills/orchestrate/SKILL.md`
Expected: `0` (no remaining old-style references)

Run: `grep -c 'spec-id\|SPEC_ID\|SPEC_DOC' skills/orchestrate/SKILL.md`
Expected: Non-zero count confirming renames were applied

---

## Phase Estimates

| Metric | Estimate |
|--------|----------|
| Total tasks | 3 |
| Estimated time | 15-25 min |
| Risk | Low — all changes are mechanical renames |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 200 |

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
