//! Validation module for tina orchestration state files.
//!
//! Provides validation functions for verifying state files against the schema.

use std::fs;
use std::path::{Path, PathBuf};

use crate::session::naming;
use crate::state::schema::{SupervisorState, Task, Team};

/// A validation error or warning.
#[derive(Debug, Clone)]
pub struct ValidationIssue {
    /// Path to the file with the issue
    pub path: PathBuf,
    /// Field or location within the file
    pub field: String,
    /// Description of the issue
    pub message: String,
}

impl std::fmt::Display for ValidationIssue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}: {} - {}",
            self.path.display(),
            self.field,
            self.message
        )
    }
}

/// Result of validating one or more files.
#[derive(Debug, Default)]
pub struct ValidationResult {
    /// Errors that indicate invalid state
    pub errors: Vec<ValidationIssue>,
    /// Warnings that indicate potential issues
    pub warnings: Vec<ValidationIssue>,
}

impl ValidationResult {
    /// Create a new empty validation result.
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns true if there are no errors.
    pub fn is_valid(&self) -> bool {
        self.errors.is_empty()
    }

    /// Add an error to the result.
    pub fn add_error(&mut self, path: &Path, field: &str, message: &str) {
        self.errors.push(ValidationIssue {
            path: path.to_path_buf(),
            field: field.to_string(),
            message: message.to_string(),
        });
    }

    /// Add a warning to the result.
    pub fn add_warning(&mut self, path: &Path, field: &str, message: &str) {
        self.warnings.push(ValidationIssue {
            path: path.to_path_buf(),
            field: field.to_string(),
            message: message.to_string(),
        });
    }

    /// Merge another validation result into this one.
    pub fn merge(&mut self, other: ValidationResult) {
        self.errors.extend(other.errors);
        self.warnings.extend(other.warnings);
    }
}

/// Validate a supervisor-state.json file.
pub fn validate_supervisor_state(path: &Path) -> ValidationResult {
    let mut result = ValidationResult::new();

    // Check file exists
    if !path.exists() {
        result.add_error(path, "file", "File does not exist");
        return result;
    }

    // Try to read the file
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            result.add_error(path, "file", &format!("Failed to read file: {}", e));
            return result;
        }
    };

    // Try to parse as JSON
    let state: SupervisorState = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(e) => {
            result.add_error(path, "json", &format!("Invalid JSON: {}", e));
            return result;
        }
    };

    // Validate field values
    if state.version == 0 {
        result.add_warning(path, "version", "Version is 0, expected 1 or higher");
    }

    if state.feature.is_empty() {
        result.add_error(path, "feature", "Feature name is empty");
    }

    if state.total_phases == 0 {
        result.add_error(path, "total_phases", "Total phases is 0");
    }

    if state.current_phase == 0 {
        result.add_error(
            path,
            "current_phase",
            "Current phase is 0 (phases are 1-indexed)",
        );
    }

    if state.current_phase > state.total_phases {
        result.add_error(
            path,
            "current_phase",
            &format!(
                "Current phase {} exceeds total phases {}",
                state.current_phase, state.total_phases
            ),
        );
    }

    // Check if design_doc exists (warning only)
    if !state.design_doc.exists() {
        result.add_warning(
            path,
            "design_doc",
            &format!("Design doc does not exist: {}", state.design_doc.display()),
        );
    }

    // Check if worktree_path exists (warning only)
    if !state.worktree_path.exists() {
        result.add_warning(
            path,
            "worktree_path",
            &format!(
                "Worktree path does not exist: {}",
                state.worktree_path.display()
            ),
        );
    }

    // Validate phase states
    for (key, phase) in &state.phases {
        // Validate phase key format (integers like "1" or remediation decimals like "1.5", "1.5.5")
        if let Err(msg) = naming::validate_phase(key) {
            result.add_error(path, &format!("phases.{}", key), &msg);
        }

        // Check plan_path exists if set
        if let Some(ref plan_path) = phase.plan_path {
            if !plan_path.exists() {
                result.add_warning(
                    path,
                    &format!("phases.{}.plan_path", key),
                    &format!("Plan path does not exist: {}", plan_path.display()),
                );
            }
        }
    }

    result
}

/// Validate a team config.json file.
pub fn validate_team(path: &Path) -> ValidationResult {
    let mut result = ValidationResult::new();

    // Check file exists
    if !path.exists() {
        result.add_error(path, "file", "File does not exist");
        return result;
    }

    // Try to read the file
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            result.add_error(path, "file", &format!("Failed to read file: {}", e));
            return result;
        }
    };

    // Try to parse as JSON
    let team: Team = match serde_json::from_str(&content) {
        Ok(t) => t,
        Err(e) => {
            result.add_error(path, "json", &format!("Invalid JSON: {}", e));
            return result;
        }
    };

    // Validate field values
    if team.name.is_empty() {
        result.add_error(path, "name", "Team name is empty");
    }

    if team.lead_agent_id.is_empty() {
        result.add_error(path, "leadAgentId", "Lead agent ID is empty");
    }

    // Validate members
    for (i, member) in team.members.iter().enumerate() {
        if member.agent_id.is_empty() {
            result.add_error(
                path,
                &format!("members[{}].agentId", i),
                "Agent ID is empty",
            );
        }
        if member.name.is_empty() {
            result.add_error(path, &format!("members[{}].name", i), "Agent name is empty");
        }
        if member.model.is_empty() {
            result.add_warning(
                path,
                &format!("members[{}].model", i),
                "Agent model is empty",
            );
        }
    }

    result
}

/// Validate a task .json file.
pub fn validate_task(path: &Path) -> ValidationResult {
    let mut result = ValidationResult::new();

    // Check file exists
    if !path.exists() {
        result.add_error(path, "file", "File does not exist");
        return result;
    }

    // Try to read the file
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            result.add_error(path, "file", &format!("Failed to read file: {}", e));
            return result;
        }
    };

    // Try to parse as JSON
    let task: Task = match serde_json::from_str(&content) {
        Ok(t) => t,
        Err(e) => {
            result.add_error(path, "json", &format!("Invalid JSON: {}", e));
            return result;
        }
    };

    // Validate field values
    if task.id.is_empty() {
        result.add_error(path, "id", "Task ID is empty");
    }

    if task.subject.is_empty() {
        result.add_error(path, "subject", "Task subject is empty");
    }

    result
}

/// Validate an entire tina directory structure.
///
/// Expects the path to be a worktree/.claude/tina directory.
pub fn validate_tina_directory(path: &Path) -> ValidationResult {
    let mut result = ValidationResult::new();

    // Check directory exists
    if !path.exists() {
        result.add_error(path, "directory", "Tina directory does not exist");
        return result;
    }

    if !path.is_dir() {
        result.add_error(path, "directory", "Path is not a directory");
        return result;
    }

    // Validate supervisor-state.json
    let state_path = path.join("supervisor-state.json");
    if state_path.exists() {
        result.merge(validate_supervisor_state(&state_path));
    } else {
        result.add_warning(&state_path, "file", "supervisor-state.json not found");
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_validate_nonexistent_file() {
        let result = validate_supervisor_state(Path::new("/nonexistent/path"));
        assert!(!result.is_valid());
        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].message.contains("does not exist"));
    }

    #[test]
    fn test_validate_invalid_json() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("invalid.json");
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(b"not valid json").unwrap();

        let result = validate_supervisor_state(&path);
        assert!(!result.is_valid());
        assert!(result.errors[0].message.contains("Invalid JSON"));
    }

    #[test]
    fn test_validate_valid_supervisor_state() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("supervisor-state.json");
        let json = r#"{
            "version": 1,
            "feature": "test",
            "design_doc": "/tmp/design.md",
            "worktree_path": "/tmp/worktree",
            "branch": "test-branch",
            "total_phases": 3,
            "current_phase": 1,
            "status": "executing",
            "orchestration_started_at": "2026-01-30T10:00:00Z",
            "phases": {},
            "timing": {}
        }"#;
        fs::write(&path, json).unwrap();

        let result = validate_supervisor_state(&path);
        assert!(result.is_valid());
        // Should have warnings about non-existent paths
        assert!(!result.warnings.is_empty());
    }

    #[test]
    fn test_validate_supervisor_state_invalid_phase() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("supervisor-state.json");
        let json = r#"{
            "version": 1,
            "feature": "test",
            "design_doc": "/tmp/design.md",
            "worktree_path": "/tmp/worktree",
            "branch": "test-branch",
            "total_phases": 3,
            "current_phase": 5,
            "status": "executing",
            "orchestration_started_at": "2026-01-30T10:00:00Z",
            "phases": {},
            "timing": {}
        }"#;
        fs::write(&path, json).unwrap();

        let result = validate_supervisor_state(&path);
        assert!(!result.is_valid());
        assert!(result.errors.iter().any(|e| e.field == "current_phase"));
    }

    #[test]
    fn test_validate_valid_team() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("config.json");
        let json = r#"{
            "name": "test-team",
            "description": "A test team",
            "createdAt": 1706644800000,
            "leadAgentId": "leader@test-team",
            "leadSessionId": "session-123",
            "members": [{
                "agentId": "leader@test-team",
                "name": "leader",
                "agentType": "team-lead",
                "model": "claude-opus-4-5-20251101",
                "joinedAt": 1706644800000,
                "tmuxPaneId": null,
                "cwd": "/path/to/project",
                "subscriptions": []
            }]
        }"#;
        fs::write(&path, json).unwrap();

        let result = validate_team(&path);
        assert!(result.is_valid());
    }

    #[test]
    fn test_validate_valid_task() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("1.json");
        let json = r#"{
            "id": "1",
            "subject": "Test task",
            "description": "A test task",
            "activeForm": null,
            "status": "pending",
            "owner": null,
            "blocks": [],
            "blockedBy": [],
            "metadata": {}
        }"#;
        fs::write(&path, json).unwrap();

        let result = validate_task(&path);
        assert!(result.is_valid());
    }

    #[test]
    fn test_phase_key_integer_valid() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("state.json");
        let json = r#"{
            "version": 1, "feature": "test", "design_doc": "/tmp/d.md",
            "worktree_path": "/tmp/w", "branch": "b", "total_phases": 3,
            "current_phase": 1, "status": "executing",
            "orchestration_started_at": "2026-01-30T10:00:00Z",
            "phases": {
                "1": {"status": "executing", "plan_path": null},
                "2": {"status": "planning", "plan_path": null}
            },
            "timing": {}
        }"#;
        fs::write(&path, json).unwrap();
        let result = validate_supervisor_state(&path);
        let phase_errors: Vec<_> = result
            .errors
            .iter()
            .filter(|e| e.field.starts_with("phases."))
            .collect();
        assert!(
            phase_errors.is_empty(),
            "Integer keys should be valid: {:?}",
            phase_errors
        );
    }

    #[test]
    fn test_phase_key_remediation_valid() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("state.json");
        let json = r#"{
            "version": 1, "feature": "test", "design_doc": "/tmp/d.md",
            "worktree_path": "/tmp/w", "branch": "b", "total_phases": 3,
            "current_phase": 1, "status": "executing",
            "orchestration_started_at": "2026-01-30T10:00:00Z",
            "phases": {
                "1": {"status": "complete", "plan_path": null},
                "1.5": {"status": "executing", "plan_path": null},
                "1.5.5": {"status": "planning", "plan_path": null}
            },
            "timing": {}
        }"#;
        fs::write(&path, json).unwrap();
        let result = validate_supervisor_state(&path);
        let phase_errors: Vec<_> = result
            .errors
            .iter()
            .filter(|e| e.field.starts_with("phases."))
            .collect();
        assert!(
            phase_errors.is_empty(),
            "Remediation keys '1.5' and '1.5.5' should be valid: {:?}",
            phase_errors
        );
    }

    #[test]
    fn test_phase_key_invalid_alpha() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("state.json");
        let json = r#"{
            "version": 1, "feature": "test", "design_doc": "/tmp/d.md",
            "worktree_path": "/tmp/w", "branch": "b", "total_phases": 3,
            "current_phase": 1, "status": "executing",
            "orchestration_started_at": "2026-01-30T10:00:00Z",
            "phases": {
                "abc": {"status": "executing", "plan_path": null}
            },
            "timing": {}
        }"#;
        fs::write(&path, json).unwrap();
        let result = validate_supervisor_state(&path);
        let phase_errors: Vec<_> = result
            .errors
            .iter()
            .filter(|e| e.field.starts_with("phases."))
            .collect();
        assert!(!phase_errors.is_empty(), "Key 'abc' should be invalid");
    }

    #[test]
    fn test_phase_key_invalid_empty() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("state.json");
        let json = r#"{
            "version": 1, "feature": "test", "design_doc": "/tmp/d.md",
            "worktree_path": "/tmp/w", "branch": "b", "total_phases": 3,
            "current_phase": 1, "status": "executing",
            "orchestration_started_at": "2026-01-30T10:00:00Z",
            "phases": {
                "": {"status": "executing", "plan_path": null}
            },
            "timing": {}
        }"#;
        fs::write(&path, json).unwrap();
        let result = validate_supervisor_state(&path);
        let phase_errors: Vec<_> = result
            .errors
            .iter()
            .filter(|e| e.field.starts_with("phases."))
            .collect();
        assert!(!phase_errors.is_empty(), "Empty key should be invalid");
    }

    #[test]
    fn test_validation_result_merge() {
        let mut result1 = ValidationResult::new();
        result1.add_error(Path::new("/a"), "field1", "error1");

        let mut result2 = ValidationResult::new();
        result2.add_error(Path::new("/b"), "field2", "error2");
        result2.add_warning(Path::new("/b"), "field3", "warning1");

        result1.merge(result2);
        assert_eq!(result1.errors.len(), 2);
        assert_eq!(result1.warnings.len(), 1);
    }
}
