//! Tina state parsing module (supervisor state and context metrics)

use crate::data::types::{ContextMetrics, SupervisorState};
use anyhow::{Context, Result};
use std::fs;
use std::path::Path;

/// Load supervisor state from a worktree
pub fn load_supervisor_state(cwd: &Path) -> Result<Option<SupervisorState>> {
    let state_path = cwd
        .join(".claude")
        .join("tina")
        .join("supervisor-state.json");
    if !state_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&state_path)
        .with_context(|| format!("Failed to read supervisor state: {}", state_path.display()))?;
    let state: SupervisorState = serde_json::from_str(&content)
        .with_context(|| format!("Failed to parse supervisor state: {}", state_path.display()))?;
    Ok(Some(state))
}

/// Load context metrics from a worktree
pub fn load_context_metrics(cwd: &Path) -> Result<Option<ContextMetrics>> {
    let metrics_path = cwd
        .join(".claude")
        .join("tina")
        .join("context-metrics.json");
    if !metrics_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&metrics_path)
        .with_context(|| format!("Failed to read context metrics: {}", metrics_path.display()))?;
    let metrics: ContextMetrics = serde_json::from_str(&content).with_context(|| {
        format!(
            "Failed to parse context metrics: {}",
            metrics_path.display()
        )
    })?;
    Ok(Some(metrics))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_supervisor_state(dir: &Path) {
        let tina_dir = dir.join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();
        let state = r#"{
            "design_doc_path": "docs/plans/design.md",
            "worktree_path": "/path/to/worktree",
            "branch_name": "feature/test",
            "total_phases": 3,
            "current_phase": 2,
            "plan_paths": {},
            "status": "executing"
        }"#;
        fs::write(tina_dir.join("supervisor-state.json"), state).unwrap();
    }

    fn create_context_metrics(dir: &Path, used_pct: u8) {
        let tina_dir = dir.join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();
        let metrics = format!(
            r#"{{
            "used_pct": {},
            "tokens": 50000,
            "max": 120000,
            "timestamp": "2026-01-30T10:00:00Z"
        }}"#,
            used_pct
        );
        fs::write(tina_dir.join("context-metrics.json"), metrics).unwrap();
    }

    #[test]
    fn test_load_supervisor_state_exists() {
        let temp_dir = TempDir::new().unwrap();
        create_supervisor_state(temp_dir.path());

        let state = load_supervisor_state(temp_dir.path()).unwrap();
        assert!(state.is_some());

        let state = state.unwrap();
        assert_eq!(state.total_phases, 3);
        assert_eq!(state.current_phase, 2);
        assert_eq!(state.status, "executing");
    }

    #[test]
    fn test_load_supervisor_state_missing() {
        let temp_dir = TempDir::new().unwrap();

        let state = load_supervisor_state(temp_dir.path()).unwrap();
        assert!(state.is_none());
    }

    #[test]
    fn test_load_context_metrics_exists() {
        let temp_dir = TempDir::new().unwrap();
        create_context_metrics(temp_dir.path(), 42);

        let metrics = load_context_metrics(temp_dir.path()).unwrap();
        assert!(metrics.is_some());

        let metrics = metrics.unwrap();
        assert_eq!(metrics.used_pct, 42);
        assert_eq!(metrics.tokens, 50000);
    }

    #[test]
    fn test_load_context_metrics_missing() {
        let temp_dir = TempDir::new().unwrap();

        let metrics = load_context_metrics(temp_dir.path()).unwrap();
        assert!(metrics.is_none());
    }

    #[test]
    fn test_malformed_supervisor_state() {
        let temp_dir = TempDir::new().unwrap();
        let tina_dir = temp_dir.path().join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();
        fs::write(tina_dir.join("supervisor-state.json"), "{ invalid }").unwrap();

        let result = load_supervisor_state(temp_dir.path());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("Failed to parse supervisor state"));
    }

    #[test]
    fn test_malformed_context_metrics() {
        let temp_dir = TempDir::new().unwrap();
        let tina_dir = temp_dir.path().join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();
        fs::write(tina_dir.join("context-metrics.json"), "{ invalid }").unwrap();

        let result = load_context_metrics(temp_dir.path());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("Failed to parse context metrics"));
    }
}
