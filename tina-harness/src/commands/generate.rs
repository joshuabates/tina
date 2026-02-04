//! Scenario generator command
//!
//! Generates test scenarios from templates with parameterized complexity.

use std::fs;

use anyhow::{Context, Result};

/// Configuration for scenario generation
pub struct GenerateConfig {
    /// Number of phases in the scenario
    pub phases: u32,
    /// Whether to include a remediation phase
    pub include_remediation: bool,
    /// Phase number where failure should occur (0 = no failure)
    pub failure_at_phase: u32,
    /// Output directory for the scenario
    pub output_dir: std::path::PathBuf,
}

/// Generate a scenario from configuration
pub fn generate(config: &GenerateConfig) -> Result<()> {
    // Create output directory
    fs::create_dir_all(&config.output_dir)
        .with_context(|| format!("Failed to create output directory: {}", config.output_dir.display()))?;

    // Generate design document
    let design = generate_design_doc(config);
    fs::write(config.output_dir.join("design.md"), design)
        .context("Failed to write design.md")?;

    // Generate expected.json
    let expected = generate_expected_json(config);
    fs::write(config.output_dir.join("expected.json"), expected)
        .context("Failed to write expected.json")?;

    // Generate setup.patch if failure scenario
    if config.failure_at_phase > 0 {
        let patch = generate_failure_patch(config);
        fs::write(config.output_dir.join("setup.patch"), patch)
            .context("Failed to write setup.patch")?;
    }

    Ok(())
}

/// Generate a design document for the scenario
fn generate_design_doc(config: &GenerateConfig) -> String {
    let mut doc = String::new();

    doc.push_str("# Generated Scenario\n\n");
    doc.push_str("## Overview\n\n");
    doc.push_str(&format!(
        "Auto-generated scenario with {} phase{}.\n\n",
        config.phases,
        if config.phases == 1 { "" } else { "s" }
    ));

    if config.include_remediation {
        doc.push_str("This scenario includes expected remediation.\n\n");
    }

    if config.failure_at_phase > 0 {
        doc.push_str(&format!(
            "**Note:** This scenario has a setup failure at phase {}.\n\n",
            config.failure_at_phase
        ));
    }

    doc.push_str("## Requirements\n\n");
    doc.push_str("1. Maintain backwards compatibility\n");
    doc.push_str("2. All tests must pass\n");
    doc.push_str("3. Follow existing code patterns\n\n");

    // Generate phases
    for phase in 1..=config.phases {
        doc.push_str(&format!("## Phase {}\n\n", phase));
        doc.push_str(&format!("### Phase {} Tasks\n\n", phase));

        match phase {
            1 => {
                doc.push_str("1. Add a new helper function to `core/processor.rs`\n");
                doc.push_str("2. Add tests for the new function\n");
                doc.push_str("3. Update `lib.rs` to export the new function\n\n");
                doc.push_str("### Success Criteria\n\n");
                doc.push_str("- New function is implemented and tested\n");
                doc.push_str("- All existing tests continue to pass\n\n");
            }
            2 => {
                doc.push_str("1. Refactor processor to use the new helper\n");
                doc.push_str("2. Update CLI to expose new functionality\n");
                doc.push_str("3. Add integration test\n\n");
                doc.push_str("### Success Criteria\n\n");
                doc.push_str("- Refactoring complete without breaking changes\n");
                doc.push_str("- CLI updated with new flag\n\n");
            }
            _ => {
                doc.push_str(&format!("1. Phase {} implementation step 1\n", phase));
                doc.push_str(&format!("2. Phase {} implementation step 2\n", phase));
                doc.push_str(&format!("3. Phase {} tests\n\n", phase));
                doc.push_str("### Success Criteria\n\n");
                doc.push_str("- All phase requirements met\n");
                doc.push_str("- Tests pass\n\n");
            }
        }
    }

    doc
}

/// Generate expected.json for the scenario
fn generate_expected_json(config: &GenerateConfig) -> String {
    let phases_completed = if config.failure_at_phase > 0 {
        config.failure_at_phase - 1
    } else {
        config.phases
    };

    let final_status = if config.failure_at_phase > 0 {
        "failed"
    } else {
        "complete"
    };

    let tests_pass = config.failure_at_phase == 0;

    let file_changes = if config.phases >= 1 && config.failure_at_phase == 0 {
        r#"[
      { "path": "src/core/processor.rs", "contains": "fn " }
    ]"#
    } else {
        "[]"
    };

    format!(
        r#"{{
  "schema_version": 1,
  "assertions": {{
    "phases_completed": {},
    "final_status": "{}",
    "tests_pass": {},
    "setup_tests_failed": {},
    "file_changes": {}
  }}
}}"#,
        phases_completed,
        final_status,
        tests_pass,
        config.failure_at_phase > 0,
        file_changes
    )
}

/// Generate a setup.patch that introduces a failure
fn generate_failure_patch(config: &GenerateConfig) -> String {
    // Create a patch that breaks a test
    format!(
        r#"--- a/src/core/processor.rs
+++ b/src/core/processor.rs
@@ -1,6 +1,6 @@
 pub struct Processor;

 impl Processor {{
-    pub fn new() -> Self {{ Self }}
+    pub fn new() -> Self {{ panic!("Phase {} failure injected") }}
     pub fn process(&self, input: &str) -> String {{
         input.to_uppercase()
"#,
        config.failure_at_phase
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_generate_single_phase() {
        let temp = TempDir::new().unwrap();
        let config = GenerateConfig {
            phases: 1,
            include_remediation: false,
            failure_at_phase: 0,
            output_dir: temp.path().to_path_buf(),
        };

        generate(&config).unwrap();

        assert!(temp.path().join("design.md").exists());
        assert!(temp.path().join("expected.json").exists());
        assert!(!temp.path().join("setup.patch").exists());

        let design = fs::read_to_string(temp.path().join("design.md")).unwrap();
        assert!(design.contains("Phase 1"));
        assert!(!design.contains("Phase 2"));

        let expected = fs::read_to_string(temp.path().join("expected.json")).unwrap();
        assert!(expected.contains("\"phases_completed\": 1"));
        assert!(expected.contains("\"final_status\": \"complete\""));
    }

    #[test]
    fn test_generate_multi_phase() {
        let temp = TempDir::new().unwrap();
        let config = GenerateConfig {
            phases: 3,
            include_remediation: false,
            failure_at_phase: 0,
            output_dir: temp.path().to_path_buf(),
        };

        generate(&config).unwrap();

        let design = fs::read_to_string(temp.path().join("design.md")).unwrap();
        assert!(design.contains("Phase 1"));
        assert!(design.contains("Phase 2"));
        assert!(design.contains("Phase 3"));

        let expected = fs::read_to_string(temp.path().join("expected.json")).unwrap();
        assert!(expected.contains("\"phases_completed\": 3"));
    }

    #[test]
    fn test_generate_with_failure() {
        let temp = TempDir::new().unwrap();
        let config = GenerateConfig {
            phases: 2,
            include_remediation: false,
            failure_at_phase: 2,
            output_dir: temp.path().to_path_buf(),
        };

        generate(&config).unwrap();

        assert!(temp.path().join("setup.patch").exists());

        let expected = fs::read_to_string(temp.path().join("expected.json")).unwrap();
        assert!(expected.contains("\"phases_completed\": 1"));
        assert!(expected.contains("\"final_status\": \"failed\""));
        assert!(expected.contains("\"setup_tests_failed\": true"));
    }

    #[test]
    fn test_generate_with_remediation() {
        let temp = TempDir::new().unwrap();
        let config = GenerateConfig {
            phases: 2,
            include_remediation: true,
            failure_at_phase: 0,
            output_dir: temp.path().to_path_buf(),
        };

        generate(&config).unwrap();

        let design = fs::read_to_string(temp.path().join("design.md")).unwrap();
        assert!(design.contains("remediation"));
    }
}
