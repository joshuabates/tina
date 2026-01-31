# Orchestration Reliability Phase 2: Automated Complexity Gates

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Enforce objective complexity budgets via tooling-based gates that block phase completion when limits are exceeded.

**Architecture:** Extend `tina-session check` commands with full complexity analysis (individual file lines, function length, cyclomatic complexity). Update planner agent to require Complexity Budget sections. Update team-lead-init to run complexity checks before marking phases complete.

**Phase context:** Phase 1 implemented the tina-session binary with CLI structure, session lifecycle (start/stop/wait), state management, and stub implementations for check commands. The `check complexity` command exists and performs basic line counting via tokei, but lacks function-level analysis and cyclomatic complexity checks. The `check plan` command validates model specifications but doesn't enforce the Complexity Budget section requirement.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max cyclomatic complexity | 10 |
| Max total implementation lines | 500 |

---

### Task 1: Add function length checking for Rust files

**Files:**
- Modify: `/Users/joshuabates/Projects/tina/tina-session/src/commands/check.rs`

**Model:** haiku

**review:** spec-only

**Step 1: Write test for function length extraction**

Add test to check.rs:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_extract_rust_function_lengths() {
        let code = r#"
fn short_function() {
    println!("short");
}

fn longer_function() {
    let x = 1;
    let y = 2;
    let z = 3;
    println!("{}", x + y + z);
}

impl Foo {
    fn method_one(&self) {
        self.do_thing();
    }

    fn method_two(&self) -> i32 {
        let a = 1;
        let b = 2;
        a + b
    }
}
"#;
        let functions = extract_rust_function_lengths(code);
        assert_eq!(functions.len(), 4);
        assert!(functions.iter().any(|(name, len)| name == "short_function" && *len == 3));
        assert!(functions.iter().any(|(name, len)| name == "longer_function" && *len == 5));
        assert!(functions.iter().any(|(name, len)| name == "method_one" && *len == 3));
        assert!(functions.iter().any(|(name, len)| name == "method_two" && *len == 4));
    }
}
```

**Step 2: Run test to verify failure**

Run: `cargo test -p tina-session test_extract_rust_function_lengths`
Expected: FAIL with "cannot find function"

**Step 3: Implement function length extraction**

Add function to check.rs before the complexity function:

```rust
/// Extract function names and their line counts from Rust source code.
/// Returns vector of (function_name, line_count) tuples.
fn extract_rust_function_lengths(code: &str) -> Vec<(String, u32)> {
    let mut functions = Vec::new();
    let mut current_fn: Option<(String, u32, i32)> = None; // (name, start_line, brace_depth)

    for (line_idx, line) in code.lines().enumerate() {
        let trimmed = line.trim();

        // Check for function start
        if let Some(fn_start) = trimmed.find("fn ") {
            if current_fn.is_none() {
                // Extract function name
                let after_fn = &trimmed[fn_start + 3..];
                if let Some(paren_pos) = after_fn.find('(') {
                    let name = after_fn[..paren_pos].trim().to_string();
                    if !name.is_empty() && !name.contains(' ') {
                        let brace_count = trimmed.matches('{').count() as i32
                            - trimmed.matches('}').count() as i32;
                        if brace_count > 0 {
                            current_fn = Some((name, line_idx as u32 + 1, brace_count));
                        }
                    }
                }
            }
        }

        // Track braces for current function
        if let Some((ref name, start, ref mut depth)) = current_fn {
            if !trimmed.contains("fn ") {
                *depth += trimmed.matches('{').count() as i32;
                *depth -= trimmed.matches('}').count() as i32;
            }

            if *depth == 0 {
                let end_line = line_idx as u32 + 1;
                let length = end_line - start + 1;
                functions.push((name.clone(), length));
                current_fn = None;
            }
        }
    }

    functions
}
```

**Step 4: Run test to verify pass**

Run: `cargo test -p tina-session test_extract_rust_function_lengths`
Expected: PASS

**Step 5: Commit**

```bash
git add tina-session/src/commands/check.rs
git commit -m "feat(tina-session): add Rust function length extraction"
```

---

### Task 2: Integrate function length checking into complexity command

**Files:**
- Modify: `/Users/joshuabates/Projects/tina/tina-session/src/commands/check.rs`

**Model:** haiku

**review:** spec-only

**Step 1: Write test for function length violation detection**

Add test:

```rust
#[test]
fn test_check_function_lengths_finds_violations() {
    let temp = TempDir::new().unwrap();
    let src = temp.path().join("src");
    fs::create_dir(&src).unwrap();

    // Create file with long function (>50 lines)
    let mut long_fn = String::from("fn very_long_function() {\n");
    for i in 0..55 {
        long_fn.push_str(&format!("    let x{} = {};\n", i, i));
    }
    long_fn.push_str("}\n");
    fs::write(src.join("main.rs"), long_fn).unwrap();

    let violations = check_function_lengths(&src, 50).unwrap();
    assert_eq!(violations.len(), 1);
    assert!(violations[0].0.contains("main.rs"));
    assert_eq!(violations[0].1, "very_long_function");
    assert!(violations[0].2 > 50);
}

#[test]
fn test_check_function_lengths_passes_when_under_limit() {
    let temp = TempDir::new().unwrap();
    let src = temp.path().join("src");
    fs::create_dir(&src).unwrap();

    let short_fn = "fn short() {\n    println!(\"hi\");\n}\n";
    fs::write(src.join("main.rs"), short_fn).unwrap();

    let violations = check_function_lengths(&src, 50).unwrap();
    assert!(violations.is_empty());
}
```

**Step 2: Run tests to verify failure**

Run: `cargo test -p tina-session test_check_function_lengths`
Expected: FAIL with "cannot find function"

**Step 3: Implement function length checking**

Add function:

```rust
/// Check all Rust files for functions exceeding max_lines.
/// Returns vector of (file_path, function_name, line_count) tuples.
fn check_function_lengths(dir: &Path, max_lines: u32) -> anyhow::Result<Vec<(String, String, u32)>> {
    let mut violations = Vec::new();
    check_function_lengths_recursive(dir, max_lines, &mut violations)?;
    Ok(violations)
}

fn check_function_lengths_recursive(
    dir: &Path,
    max_lines: u32,
    violations: &mut Vec<(String, String, u32)>,
) -> anyhow::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') || name == "target" || name == "node_modules" {
                continue;
            }
        }

        if path.is_dir() {
            check_function_lengths_recursive(&path, max_lines, violations)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
            if let Ok(contents) = fs::read_to_string(&path) {
                for (fn_name, line_count) in extract_rust_function_lengths(&contents) {
                    if line_count > max_lines {
                        violations.push((path.display().to_string(), fn_name, line_count));
                    }
                }
            }
        }
    }
    Ok(())
}
```

**Step 4: Run tests to verify pass**

Run: `cargo test -p tina-session test_check_function_lengths`
Expected: PASS

**Step 5: Update complexity function to use function length checking**

Modify the `complexity` function to add function length checking after file size checks:

```rust
pub fn complexity(
    cwd: &Path,
    max_file_lines: u32,
    max_total_lines: u32,
    max_function_lines: u32,
) -> anyhow::Result<u8> {
    // ... existing code for directory check and tokei ...

    // Check individual file sizes
    let mut file_violations = Vec::new();
    let check_dir = if src_dir.exists() { &src_dir } else { cwd };
    check_file_sizes(check_dir, max_file_lines, &mut file_violations)?;

    if !file_violations.is_empty() {
        println!("FAIL: Files exceeding {} lines:", max_file_lines);
        for (path, lines) in &file_violations {
            println!("  {} ({} lines)", path, lines);
        }
        return Ok(1);
    }

    // Check function lengths
    let fn_violations = check_function_lengths(check_dir, max_function_lines)?;
    if !fn_violations.is_empty() {
        println!("FAIL: Functions exceeding {} lines:", max_function_lines);
        for (path, fn_name, lines) in &fn_violations {
            println!("  {}::{} ({} lines)", path, fn_name, lines);
        }
        return Ok(1);
    }

    println!("PASS: Complexity checks passed");
    Ok(0)
}
```

**Step 6: Update main.rs to pass max_function_lines**

Modify the CheckCommands::Complexity in main.rs:

```rust
CheckCommands::Complexity {
    cwd,
    max_file_lines,
    max_total_lines,
    max_function_lines,
} => commands::check::complexity(&cwd, max_file_lines, max_total_lines, max_function_lines),
```

And update the CLI definition:

```rust
/// Check complexity against budget
Complexity {
    /// Working directory
    #[arg(long)]
    cwd: PathBuf,

    /// Max lines per file
    #[arg(long, default_value = "400")]
    max_file_lines: u32,

    /// Max total implementation lines
    #[arg(long, default_value = "2000")]
    max_total_lines: u32,

    /// Max lines per function
    #[arg(long, default_value = "50")]
    max_function_lines: u32,
},
```

Note: Remove the unused `max_complexity` parameter since cyclomatic complexity requires external tooling and is out of scope for this phase.

**Step 7: Run all tests**

Run: `cargo test -p tina-session`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add tina-session/src/commands/check.rs tina-session/src/main.rs
git commit -m "feat(tina-session): integrate function length checking into complexity command"
```

---

### Task 3: Enforce Complexity Budget section in plan validation

**Files:**
- Modify: `/Users/joshuabates/Projects/tina/tina-session/src/commands/check.rs`

**Model:** haiku

**review:** spec-only

**Step 1: Write test for Complexity Budget validation**

Add test:

```rust
#[test]
fn test_plan_validation_requires_complexity_budget_table() {
    let temp = TempDir::new().unwrap();

    // Plan with Complexity Budget section but no table
    let plan_no_table = r#"
# Phase 1 Plan

### Task 1: Something
**Model:** haiku

### Complexity Budget

Some text but no table.
"#;
    let path = temp.path().join("plan.md");
    fs::write(&path, plan_no_table).unwrap();

    let result = plan(&path).unwrap();
    assert_eq!(result, 1, "Should fail without budget table");
}

#[test]
fn test_plan_validation_passes_with_complexity_budget_table() {
    let temp = TempDir::new().unwrap();

    let plan_with_table = r#"
# Phase 1 Plan

### Task 1: Something
**Model:** haiku

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
"#;
    let path = temp.path().join("plan.md");
    fs::write(&path, plan_with_table).unwrap();

    let result = plan(&path).unwrap();
    assert_eq!(result, 0, "Should pass with budget table");
}
```

**Step 2: Run tests to verify failure**

Run: `cargo test -p tina-session test_plan_validation_requires_complexity_budget`
Expected: FAIL (current impl doesn't validate table presence)

**Step 3: Update plan validation to check for budget table**

Modify the `plan` function:

```rust
pub fn plan(path: &Path) -> anyhow::Result<u8> {
    if !path.exists() {
        anyhow::bail!(SessionError::FileNotFound(path.display().to_string()));
    }

    println!("Validating plan: {}", path.display());

    let contents = fs::read_to_string(path)?;

    // Check for model specifications
    let task_count = contents.matches("### Task").count();
    let model_count = contents.matches("**Model:**").count();

    if model_count < task_count {
        println!(
            "FAIL: Missing model specifications ({} tasks, {} model specs)",
            task_count, model_count
        );
        return Ok(1);
    }

    // Check model values are valid (opus or haiku only)
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("**Model:**") {
            let model = trimmed
                .strip_prefix("**Model:**")
                .map(|s| s.trim().to_lowercase())
                .unwrap_or_default();

            if model.is_empty() || model.contains('`') || model.len() > 20 {
                continue;
            }

            if !model.starts_with("opus") && !model.starts_with("haiku") {
                println!("FAIL: Invalid model '{}'. Must be 'opus' or 'haiku'.", model);
                return Ok(1);
            }
        }
    }

    // Check for Complexity Budget section
    if !contents.contains("### Complexity Budget") && !contents.contains("## Complexity Budget") {
        println!("FAIL: Missing Complexity Budget section");
        return Ok(1);
    }

    // Verify Complexity Budget section contains a table
    if !has_complexity_budget_table(&contents) {
        println!("FAIL: Complexity Budget section must contain a table with metrics");
        return Ok(1);
    }

    println!("PASS: Plan validation passed");
    Ok(0)
}

/// Check if the Complexity Budget section contains a markdown table.
fn has_complexity_budget_table(contents: &str) -> bool {
    let lines: Vec<&str> = contents.lines().collect();
    let mut in_budget_section = false;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        // Start of Complexity Budget section
        if trimmed.starts_with("### Complexity Budget") || trimmed.starts_with("## Complexity Budget") {
            in_budget_section = true;
            continue;
        }

        // End of section (next heading)
        if in_budget_section && (trimmed.starts_with("### ") || trimmed.starts_with("## ") || trimmed.starts_with("# ")) {
            break;
        }

        // Look for table structure: | header | header |
        if in_budget_section && trimmed.starts_with('|') && trimmed.ends_with('|') {
            // Check next line for separator |---|---|
            if i + 1 < lines.len() {
                let next = lines[i + 1].trim();
                if next.starts_with('|') && next.contains("---") {
                    return true;
                }
            }
        }
    }

    false
}
```

**Step 4: Run tests to verify pass**

Run: `cargo test -p tina-session test_plan_validation`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add tina-session/src/commands/check.rs
git commit -m "feat(tina-session): enforce Complexity Budget table in plan validation"
```

---

### Task 4: Update phase-planner agent to require Complexity Budget section

**Files:**
- Modify: `/Users/joshuabates/Projects/tina/agents/phase-planner.md`

**Model:** haiku

**review:** spec-only

**Step 1: Read current phase-planner.md**

Already read above.

**Step 2: Add Complexity Budget requirement to Quality Standards**

Update the Quality Standards section in phase-planner.md. Replace the existing Quality Standards section with:

```markdown
## Quality Standards

Before reporting completion, verify:

1. **Task structure:** Each task has Files, Steps with code, Run commands with expected output
2. **Granularity:** Steps are 2-5 minute actions
3. **Completeness:** All phase scope is covered
4. **Phase Estimates:** Section exists with metrics table and ROI expectation
5. **Model specification:** Every task has `**Model:** <haiku|opus>` line
6. **Complexity Budget:** Section exists with table specifying limits

### Required Complexity Budget Format

Every plan MUST include a Complexity Budget section with this structure:

```markdown
### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | <budget for this phase> |
```

- **Max lines per file:** Always 400 (non-negotiable)
- **Max function length:** Always 50 lines (non-negotiable)
- **Max total implementation lines:** Set based on phase scope (typical: 500-2000)

Plans without this section will fail validation.
```

**Step 3: Commit**

```bash
git add agents/phase-planner.md
git commit -m "docs(phase-planner): require Complexity Budget section in plans"
```

---

### Task 5: Update planner agent to include Complexity Budget template

**Files:**
- Modify: `/Users/joshuabates/Projects/tina/agents/planner.md`

**Model:** haiku

**review:** spec-only

**Step 1: Add Complexity Budget to Plan Header section**

In planner.md, update the Plan Header section to include:

```markdown
### Plan Header

```markdown
# <Feature> Phase N Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** [One sentence]

**Architecture:** [2-3 sentences]

**Phase context:** [What previous phases accomplished, if any]

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | [estimate based on phase scope] |

---
```
```

**Step 2: Add Complexity Budget guidance to Remember section**

Update the Remember section:

```markdown
## Remember

- Exact file paths always
- Complete code in plan (not "add validation")
- Exact commands with expected output
- Reference relevant skills with @ syntax
- DRY, YAGNI, TDD, frequent commits
- Plan ONLY the specified phase
- Include Phase Estimates section with measurable targets
- Include Complexity Budget section (required for validation)
```

**Step 3: Commit**

```bash
git add agents/planner.md
git commit -m "docs(planner): add Complexity Budget template to plan structure"
```

---

### Task 6: Update team-lead-init to run complexity checks before completion

**Files:**
- Modify: `/Users/joshuabates/Projects/tina/skills/team-lead-init/SKILL.md`

**Model:** haiku

**review:** spec-only

**Step 1: Add complexity gate to STEP 6**

Update STEP 6 in team-lead-init/SKILL.md. Find the "## STEP 6: On completion" section and replace it with:

```markdown
## STEP 6: Run completion gates

Before marking phase complete, run verification gates:

### 6.1 Run test and lint verification

```bash
tina-session check verify --cwd "$WORKTREE_PATH"
```

If exit code is non-zero:
- Set phase status to "blocked"
- Reason: "Verification failed: <output from command>"
- Do NOT proceed to completion

### 6.2 Run complexity checks

Parse Complexity Budget from plan file to get limits, then run:

```bash
tina-session check complexity \
  --cwd "$WORKTREE_PATH" \
  --max-file-lines 400 \
  --max-total-lines <from plan> \
  --max-function-lines 50
```

If exit code is non-zero:
- Set phase status to "blocked"
- Reason: "Complexity budget exceeded: <output from command>"
- Do NOT proceed to completion

### 6.3 Complete phase

Only after both gates pass:
1. All tasks complete (workers/reviewers already shut down per-task)
2. Clean up team resources at phase end: `Teammate { operation: "cleanup" }`
3. Update status.json to "complete"
4. Wait for supervisor to kill session
```

**Step 2: Commit**

```bash
git add skills/team-lead-init/SKILL.md
git commit -m "feat(team-lead-init): add complexity and verification gates before completion"
```

---

### Task 7: Run full test suite and verify clippy clean

**Files:**
- None (verification only)

**Model:** haiku

**review:** none

**Step 1: Run all tests**

Run: `cargo test -p tina-session`
Expected: All tests PASS

**Step 2: Run clippy**

Run: `cargo clippy -p tina-session -- -D warnings`
Expected: No warnings

**Step 3: Verify complexity on tina-session itself**

Run: `cargo run -p tina-session -- check complexity --cwd tina-session --max-file-lines 400 --max-total-lines 2000 --max-function-lines 50`
Expected: PASS

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~150 | `git diff --stat HEAD~7..HEAD -- '*.rs' | tail -1` |
| Test lines added | ~80 | `git diff --stat HEAD~7..HEAD -- '**/tests/**' '*.rs' | grep test | head -5` |
| Files touched | 4 | `git diff --name-only HEAD~7..HEAD | wc -l` |
| Doc files updated | 3 | `git diff --name-only HEAD~7..HEAD -- '*.md' | wc -l` |

**Target files:**
- `tina-session/src/commands/check.rs` - Core complexity checking logic
- `tina-session/src/main.rs` - CLI parameter updates
- `agents/phase-planner.md` - Complexity Budget requirement
- `agents/planner.md` - Complexity Budget template
- `skills/team-lead-init/SKILL.md` - Completion gates

**ROI expectation:** Automated complexity gates prevent 3000+ line files from passing review. One prevented over-engineering incident pays for this implementation many times over.
