use std::fs;
use std::path::Path;
use std::process::Command;

use tina_session::error::SessionError;

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

pub fn complexity(
    cwd: &Path,
    max_file_lines: u32,
    max_total_lines: u32,
    max_function_lines: u32,
) -> anyhow::Result<u8> {
    if !cwd.exists() {
        anyhow::bail!(SessionError::DirectoryNotFound(cwd.display().to_string()));
    }

    println!("Checking complexity in {}...", cwd.display());

    // Try to run tokei for line counts on src/ directory
    let src_dir = cwd.join("src");
    let tokei_path = if src_dir.exists() { &src_dir } else { cwd };

    let output = Command::new("tokei")
        .args(["--output", "json"])
        .arg(tokei_path)
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                // Get total code lines
                let total = json
                    .get("Total")
                    .and_then(|t| t.get("code"))
                    .and_then(|c| c.as_u64())
                    .unwrap_or(0);

                println!("Total lines: {}", total);

                if total > max_total_lines as u64 {
                    println!(
                        "FAIL: Total lines {} exceeds budget {}",
                        total, max_total_lines
                    );
                    return Ok(1);
                }
            }
        }
        _ => {
            eprintln!("Warning: tokei not available, skipping line count check");
        }
    }

    // Check individual file sizes (in src/ if it exists)
    let mut violations = Vec::new();
    let check_dir = if src_dir.exists() { &src_dir } else { cwd };
    check_file_sizes(check_dir, max_file_lines, &mut violations)?;

    if !violations.is_empty() {
        println!("FAIL: Files exceeding {} lines:", max_file_lines);
        for (path, lines) in &violations {
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

fn check_file_sizes(dir: &Path, max_lines: u32, violations: &mut Vec<(String, u32)>) -> anyhow::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        // Skip hidden directories and common non-source directories
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') || name == "target" || name == "node_modules" {
                continue;
            }
        }

        if path.is_dir() {
            check_file_sizes(&path, max_lines, violations)?;
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            // Check source files
            if matches!(ext, "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go") {
                if let Ok(contents) = fs::read_to_string(&path) {
                    let lines = contents.lines().count() as u32;
                    if lines > max_lines {
                        violations.push((path.display().to_string(), lines));
                    }
                }
            }
        }
    }
    Ok(())
}

pub fn verify(cwd: &Path) -> anyhow::Result<u8> {
    if !cwd.exists() {
        anyhow::bail!(SessionError::DirectoryNotFound(cwd.display().to_string()));
    }

    println!("Running verification in {}...", cwd.display());

    // Detect project type and run appropriate commands
    if cwd.join("Cargo.toml").exists() {
        println!("Detected Rust project");

        // Run tests
        println!("Running cargo test...");
        let test_status = Command::new("cargo")
            .args(["test", "--no-fail-fast"])
            .current_dir(cwd)
            .status()?;

        if !test_status.success() {
            println!("FAIL: Tests failed");
            return Ok(1);
        }

        // Run clippy
        println!("Running cargo clippy...");
        let clippy_status = Command::new("cargo")
            .args(["clippy", "--", "-D", "warnings"])
            .current_dir(cwd)
            .status()?;

        if !clippy_status.success() {
            println!("FAIL: Clippy warnings found");
            return Ok(1);
        }
    } else if cwd.join("package.json").exists() {
        println!("Detected Node.js project");

        // Run tests
        println!("Running npm test...");
        let test_status = Command::new("npm")
            .args(["test"])
            .current_dir(cwd)
            .status()?;

        if !test_status.success() {
            println!("FAIL: Tests failed");
            return Ok(1);
        }

        // Run lint
        println!("Running npm run lint...");
        let lint_status = Command::new("npm")
            .args(["run", "lint"])
            .current_dir(cwd)
            .status();

        if let Ok(status) = lint_status {
            if !status.success() {
                println!("FAIL: Lint errors found");
                return Ok(1);
            }
        }
    } else if cwd.join("pyproject.toml").exists() || cwd.join("setup.py").exists() {
        println!("Detected Python project");

        // Run pytest
        println!("Running pytest...");
        let test_status = Command::new("pytest")
            .current_dir(cwd)
            .status()?;

        if !test_status.success() {
            println!("FAIL: Tests failed");
            return Ok(1);
        }

        // Run flake8
        println!("Running flake8...");
        let lint_status = Command::new("flake8")
            .arg(".")
            .current_dir(cwd)
            .status();

        if let Ok(status) = lint_status {
            if !status.success() {
                println!("FAIL: Flake8 errors found");
                return Ok(1);
            }
        }
    } else if cwd.join("go.mod").exists() {
        println!("Detected Go project");

        // Run tests
        println!("Running go test...");
        let test_status = Command::new("go")
            .args(["test", "./..."])
            .current_dir(cwd)
            .status()?;

        if !test_status.success() {
            println!("FAIL: Tests failed");
            return Ok(1);
        }

        // Run golangci-lint
        println!("Running golangci-lint...");
        let lint_status = Command::new("golangci-lint")
            .args(["run"])
            .current_dir(cwd)
            .status();

        if let Ok(status) = lint_status {
            if !status.success() {
                println!("FAIL: Lint errors found");
                return Ok(1);
            }
        }
    } else {
        println!("Warning: Unknown project type, skipping verification");
        return Ok(0);
    }

    println!("PASS: All verification checks passed");
    Ok(0)
}

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
        assert!(functions.iter().any(|(name, len)| name == "longer_function" && *len == 6));
        assert!(functions.iter().any(|(name, len)| name == "method_one" && *len == 3));
        assert!(functions.iter().any(|(name, len)| name == "method_two" && *len == 5));
    }

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

    #[test]
    fn test_plan_validation_accepts_sonnet() {
        let temp = TempDir::new().unwrap();

        let plan_with_sonnet = r#"
# Phase 1 Plan

### Task 1: Something
**Model:** sonnet

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
"#;
        let path = temp.path().join("plan.md");
        fs::write(&path, plan_with_sonnet).unwrap();

        let result = plan(&path).unwrap();
        assert_eq!(result, 0, "Sonnet is a valid model routed to Claude");
    }

    #[test]
    fn test_plan_validation_accepts_codex() {
        let temp = TempDir::new().unwrap();

        let content = r#"
# Phase 1 Plan

### Task 1: Something
**Model:** codex

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
"#;
        let path = temp.path().join("plan.md");
        fs::write(&path, content).unwrap();

        let result = plan(&path).unwrap();
        assert_eq!(result, 0, "Codex should be accepted");
    }

    #[test]
    fn test_plan_validation_accepts_gpt_model() {
        let temp = TempDir::new().unwrap();

        let content = r#"
# Phase 1 Plan

### Task 1: Something
**Model:** gpt-5.3-codex

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
"#;
        let path = temp.path().join("plan.md");
        fs::write(&path, content).unwrap();

        let result = plan(&path).unwrap();
        assert_eq!(result, 0, "GPT model should be accepted");
    }

    #[test]
    fn test_plan_validation_accepts_o3_model() {
        let temp = TempDir::new().unwrap();

        let content = r#"
# Phase 1 Plan

### Task 1: Something
**Model:** o3-mini

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
"#;
        let path = temp.path().join("plan.md");
        fs::write(&path, content).unwrap();

        let result = plan(&path).unwrap();
        assert_eq!(result, 0, "o3-mini should be accepted");
    }

    #[test]
    fn test_plan_validation_rejects_empty_model() {
        let temp = TempDir::new().unwrap();

        let content = r#"
# Phase 1 Plan

### Task 1: Something
**Model:**

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
"#;
        let path = temp.path().join("plan.md");
        fs::write(&path, content).unwrap();

        let result = plan(&path).unwrap();
        assert_eq!(result, 1, "Empty model should be rejected");
    }
}

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

    // Validate model specifications: must be non-empty, no backticks, max 50 chars.
    // Routing config determines which CLI handles each model, so we don't restrict
    // by model name — only enforce basic sanity checks.
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("**Model:**") {
            let model = trimmed
                .strip_prefix("**Model:**")
                .map(|s| s.trim().to_lowercase())
                .unwrap_or_default();

            if model.is_empty() {
                println!("FAIL: Empty model specification found.");
                return Ok(1);
            }
            if model.contains('`') {
                println!("FAIL: Model '{}' contains backticks.", model);
                return Ok(1);
            }
            if model.len() > 50 {
                println!("FAIL: Model '{}' exceeds 50 characters.", model);
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
