//! Scenario types for orchestration testing

use std::path::PathBuf;

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

#[cfg(test)]
mod tests {
    use super::*;

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
}
