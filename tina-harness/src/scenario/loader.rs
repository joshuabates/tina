//! Scenario loader

use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use chrono::Utc;

use super::types::{ExpectedState, LastPassed, Scenario, ScenarioConfig};

/// Load a scenario from a directory
pub fn load_scenario(scenario_dir: &Path) -> Result<Scenario> {
    let name = scenario_dir
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .context("Invalid scenario directory name")?;

    // Load scenario.json (required)
    let config_path = scenario_dir.join("scenario.json");
    let config_content = fs::read_to_string(&config_path)
        .with_context(|| format!("Failed to read scenario.json at {}", config_path.display()))?;
    let config: ScenarioConfig = serde_json::from_str(&config_content)
        .with_context(|| format!("Failed to parse scenario.json at {}", config_path.display()))?;

    // Load design.md (required)
    let design_path = scenario_dir.join("design.md");
    let design_doc = fs::read_to_string(&design_path)
        .with_context(|| format!("Failed to read design.md at {}", design_path.display()))?;

    // Load expected.json (required)
    let expected_path = scenario_dir.join("expected.json");
    let expected_content = fs::read_to_string(&expected_path).with_context(|| {
        format!(
            "Failed to read expected.json at {}",
            expected_path.display()
        )
    })?;
    let expected: ExpectedState = serde_json::from_str(&expected_content).with_context(|| {
        format!(
            "Failed to parse expected.json at {}",
            expected_path.display()
        )
    })?;

    // Load setup.patch (optional)
    let patch_path = scenario_dir.join("setup.patch");
    let setup_patch =
        if patch_path.exists() {
            Some(fs::read_to_string(&patch_path).with_context(|| {
                format!("Failed to read setup.patch at {}", patch_path.display())
            })?)
        } else {
            None
        };

    Ok(Scenario {
        name,
        path: scenario_dir.to_path_buf(),
        feature_name: config.feature_name,
        design_doc,
        expected,
        setup_patch,
    })
}

/// Load last-passed.json from a scenario directory
pub fn load_last_passed(scenario_dir: &Path) -> Option<LastPassed> {
    let path = scenario_dir.join("last-passed.json");
    if !path.exists() {
        return None;
    }

    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).ok(),
        Err(_) => None,
    }
}

/// Save last-passed.json to a scenario directory
pub fn save_last_passed(scenario_dir: &Path, commit_hash: &str) -> Result<()> {
    let last_passed = LastPassed {
        commit_hash: commit_hash.to_string(),
        timestamp: Utc::now(),
        harness_version: Some(env!("CARGO_PKG_VERSION").to_string()),
    };

    let path = scenario_dir.join("last-passed.json");
    let content = serde_json::to_string_pretty(&last_passed)?;
    fs::write(&path, content)
        .with_context(|| format!("Failed to write last-passed.json at {}", path.display()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_scenario(dir: &Path) {
        fs::write(
            dir.join("scenario.json"),
            r#"{"feature_name": "test-feature"}"#,
        )
        .unwrap();
        fs::write(
            dir.join("design.md"),
            "# Test\n\nA test scenario.\n\n## Phase 1\n\nDo something.",
        )
        .unwrap();
        fs::write(
            dir.join("expected.json"),
            r#"{
                "schema_version": 1,
                "assertions": {
                    "phases_completed": 1,
                    "final_status": "complete",
                    "tests_pass": true
                }
            }"#,
        )
        .unwrap();
    }

    #[test]
    fn test_load_scenario_basic() {
        let temp = TempDir::new().unwrap();
        let scenario_dir = temp.path().join("01-test-scenario");
        fs::create_dir(&scenario_dir).unwrap();
        create_test_scenario(&scenario_dir);

        let scenario = load_scenario(&scenario_dir).unwrap();
        assert_eq!(scenario.name, "01-test-scenario");
        assert_eq!(scenario.feature_name, "test-feature");
        assert!(scenario.design_doc.contains("# Test"));
        assert_eq!(scenario.expected.assertions.phases_completed, 1);
        assert!(scenario.setup_patch.is_none());
    }

    #[test]
    fn test_load_scenario_missing_scenario_json() {
        let temp = TempDir::new().unwrap();
        let scenario_dir = temp.path().join("05-no-config");
        fs::create_dir(&scenario_dir).unwrap();
        fs::write(scenario_dir.join("design.md"), "# Test").unwrap();
        fs::write(
            scenario_dir.join("expected.json"),
            r#"{"schema_version":1,"assertions":{"phases_completed":1,"final_status":"complete","tests_pass":true}}"#,
        )
        .unwrap();

        let result = load_scenario(&scenario_dir);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("scenario.json"));
    }

    #[test]
    fn test_load_scenario_with_patch() {
        let temp = TempDir::new().unwrap();
        let scenario_dir = temp.path().join("02-with-patch");
        fs::create_dir(&scenario_dir).unwrap();
        create_test_scenario(&scenario_dir);
        fs::write(scenario_dir.join("setup.patch"), "--- a/file\n+++ b/file\n").unwrap();

        let scenario = load_scenario(&scenario_dir).unwrap();
        assert!(scenario.setup_patch.is_some());
        assert!(scenario.setup_patch.unwrap().contains("---"));
    }

    #[test]
    fn test_load_scenario_missing_design() {
        let temp = TempDir::new().unwrap();
        let scenario_dir = temp.path().join("03-missing");
        fs::create_dir(&scenario_dir).unwrap();
        fs::write(
            scenario_dir.join("scenario.json"),
            r#"{"feature_name": "test"}"#,
        )
        .unwrap();
        fs::write(
            scenario_dir.join("expected.json"),
            r#"{"schema_version":1,"assertions":{"phases_completed":1,"final_status":"complete","tests_pass":true}}"#,
        )
        .unwrap();

        let result = load_scenario(&scenario_dir);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("design.md"));
    }

    #[test]
    fn test_load_scenario_missing_expected() {
        let temp = TempDir::new().unwrap();
        let scenario_dir = temp.path().join("04-missing");
        fs::create_dir(&scenario_dir).unwrap();
        fs::write(
            scenario_dir.join("scenario.json"),
            r#"{"feature_name": "test"}"#,
        )
        .unwrap();
        fs::write(scenario_dir.join("design.md"), "# Test").unwrap();

        let result = load_scenario(&scenario_dir);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("expected.json"));
    }

    #[test]
    fn test_load_last_passed_missing() {
        let temp = TempDir::new().unwrap();
        let result = load_last_passed(temp.path());
        assert!(result.is_none());
    }

    #[test]
    fn test_load_last_passed_exists() {
        let temp = TempDir::new().unwrap();
        fs::write(
            temp.path().join("last-passed.json"),
            r#"{"commit_hash": "abc123", "timestamp": "2026-02-03T12:00:00Z"}"#,
        )
        .unwrap();

        let result = load_last_passed(temp.path());
        assert!(result.is_some());
        assert_eq!(result.unwrap().commit_hash, "abc123");
    }

    #[test]
    fn test_save_last_passed() {
        let temp = TempDir::new().unwrap();
        save_last_passed(temp.path(), "def456").unwrap();

        let path = temp.path().join("last-passed.json");
        assert!(path.exists());

        let content = fs::read_to_string(path).unwrap();
        assert!(content.contains("def456"));
        assert!(content.contains("harness_version"));
    }
}
