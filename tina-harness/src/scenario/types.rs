//! Scenario types for orchestration testing

use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A parsed scenario from a scenario directory
#[derive(Debug, Clone)]
pub struct Scenario {
    /// Scenario name (directory name)
    pub name: String,
    /// Path to scenario directory
    pub path: PathBuf,
    /// Contents of design.md
    pub design_doc: String,
    /// Expected state/assertions from expected.json
    pub expected: ExpectedState,
    /// Optional setup patch content
    pub setup_patch: Option<String>,
}

/// Expected state from expected.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpectedState {
    /// Schema version for forward compatibility
    pub schema_version: u32,
    /// Assertions to verify after orchestration
    pub assertions: Assertions,
}

/// Assertions about orchestration outcome
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assertions {
    /// Number of phases that should complete
    pub phases_completed: u32,
    /// Expected final status
    pub final_status: String,
    /// Whether all tests should pass after orchestration
    pub tests_pass: bool,
    /// Whether tests failed during setup (before orchestration)
    #[serde(default)]
    pub setup_tests_failed: bool,
    /// File change assertions
    #[serde(default)]
    pub file_changes: Vec<FileAssertion>,
    /// Convex state assertions (verified after full orchestration)
    #[serde(default)]
    pub convex: Option<ConvexAssertions>,
}

/// Assertions about Convex state after orchestration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvexAssertions {
    /// Orchestration record must exist
    #[serde(default = "default_true")]
    pub has_orchestration: bool,
    /// Expected orchestration status (e.g., "complete")
    #[serde(default)]
    pub expected_status: Option<String>,
    /// Minimum number of phases expected
    #[serde(default)]
    pub min_phases: Option<u32>,
    /// Minimum number of tasks expected
    #[serde(default)]
    pub min_tasks: Option<u32>,
    /// Minimum number of team members expected
    #[serde(default)]
    pub min_team_members: Option<u32>,
}

fn default_true() -> bool {
    true
}

/// Assertion about a file change
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileAssertion {
    /// Relative path to the file
    pub path: String,
    /// Whether the file should exist
    #[serde(default)]
    pub exists: Option<bool>,
    /// Text the file should contain
    #[serde(default)]
    pub contains: Option<String>,
}

impl FileAssertion {
    /// Check if this assertion is about file existence only
    pub fn is_existence_check(&self) -> bool {
        self.exists.is_some() && self.contains.is_none()
    }

    /// Check if this assertion is about file content
    pub fn is_content_check(&self) -> bool {
        self.contains.is_some()
    }
}

/// Last passed state for baseline skip logic
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LastPassed {
    /// Git commit hash when the scenario last passed
    pub commit_hash: String,
    /// Timestamp when the scenario last passed
    pub timestamp: DateTime<Utc>,
    /// tina-harness version that ran the test
    #[serde(default)]
    pub harness_version: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_expected_state_deserialize() {
        let json = r#"{
            "schema_version": 1,
            "assertions": {
                "phases_completed": 2,
                "final_status": "complete",
                "tests_pass": true,
                "file_changes": [
                    { "path": "src/lib.rs", "contains": "utils" },
                    { "path": "src/utils/mod.rs", "exists": true }
                ]
            }
        }"#;

        let state: ExpectedState = serde_json::from_str(json).unwrap();
        assert_eq!(state.schema_version, 1);
        assert_eq!(state.assertions.phases_completed, 2);
        assert_eq!(state.assertions.final_status, "complete");
        assert!(state.assertions.tests_pass);
        assert_eq!(state.assertions.file_changes.len(), 2);
    }

    #[test]
    fn test_file_assertion_checks() {
        let existence = FileAssertion {
            path: "src/lib.rs".to_string(),
            exists: Some(true),
            contains: None,
        };
        assert!(existence.is_existence_check());
        assert!(!existence.is_content_check());

        let content = FileAssertion {
            path: "src/lib.rs".to_string(),
            exists: None,
            contains: Some("utils".to_string()),
        };
        assert!(!content.is_existence_check());
        assert!(content.is_content_check());
    }

    #[test]
    fn test_setup_tests_failed_default() {
        let json = r#"{
            "schema_version": 1,
            "assertions": {
                "phases_completed": 1,
                "final_status": "complete",
                "tests_pass": true
            }
        }"#;

        let state: ExpectedState = serde_json::from_str(json).unwrap();
        assert!(!state.assertions.setup_tests_failed);
    }

    #[test]
    fn test_last_passed_serialize() {
        let last_passed = LastPassed {
            commit_hash: "abc123".to_string(),
            timestamp: Utc::now(),
            harness_version: Some("0.1.0".to_string()),
        };

        let json = serde_json::to_string(&last_passed).unwrap();
        assert!(json.contains("abc123"));
        assert!(json.contains("harness_version"));
    }

    #[test]
    fn test_last_passed_deserialize() {
        let json = r#"{
            "commit_hash": "def456",
            "timestamp": "2026-02-03T12:00:00Z"
        }"#;

        let last_passed: LastPassed = serde_json::from_str(json).unwrap();
        assert_eq!(last_passed.commit_hash, "def456");
        assert!(last_passed.harness_version.is_none());
    }
}
