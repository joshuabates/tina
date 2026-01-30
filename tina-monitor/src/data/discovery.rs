//! Orchestration discovery module

use crate::data::{tasks, teams, tina_state, types::*};
use anyhow::Result;
use serde::Serialize;
use std::path::PathBuf;

/// A discovered orchestration with all relevant data
#[derive(Debug, Clone, Serialize)]
pub struct Orchestration {
    pub team_name: String,
    pub title: String,
    pub cwd: PathBuf,
    pub current_phase: u32,
    pub total_phases: u32,
    pub design_doc_path: PathBuf,
    pub context_percent: Option<u8>,
    pub status: OrchestrationStatus,
    pub tasks: Vec<Task>,
}

/// Status of an orchestration
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchestrationStatus {
    Executing { phase: u32 },
    Blocked { phase: u32, reason: String },
    Complete,
    Idle,
}

/// Find all orchestrations (teams with supervisor-state.json)
pub fn find_orchestrations() -> Result<Vec<Orchestration>> {
    let team_names = teams::list_teams()?;
    let mut orchestrations = Vec::new();

    for name in team_names {
        if let Some(orch) = try_load_orchestration(&name)? {
            orchestrations.push(orch);
        }
    }

    Ok(orchestrations)
}

/// Try to load a team as an orchestration
fn try_load_orchestration(team_name: &str) -> Result<Option<Orchestration>> {
    let team = teams::load_team(team_name)?;

    // Get cwd from first member (typically team lead)
    let cwd = team.members.first().map(|m| m.cwd.clone()).unwrap_or_default();

    // Check for supervisor state (defines this as an orchestration)
    let supervisor_state = match tina_state::load_supervisor_state(&cwd)? {
        Some(state) => state,
        None => return Ok(None), // Not an orchestration
    };

    // Load context metrics if available
    let context_metrics = tina_state::load_context_metrics(&cwd)?;

    // Load tasks
    let task_list = tasks::load_tasks(&team.lead_session_id)?;

    // Derive status
    let status = derive_orchestration_status(&task_list, &supervisor_state);

    // Derive title from design doc filename
    let title = supervisor_state
        .design_doc_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&team.name)
        .to_string();

    Ok(Some(Orchestration {
        team_name: team.name,
        title,
        cwd,
        current_phase: supervisor_state.current_phase,
        total_phases: supervisor_state.total_phases,
        design_doc_path: supervisor_state.design_doc_path,
        context_percent: context_metrics.map(|m| m.used_pct),
        status,
        tasks: task_list,
    }))
}

fn derive_orchestration_status(tasks: &[Task], state: &SupervisorState) -> OrchestrationStatus {
    // Check if all tasks complete
    if tasks.iter().all(|t| t.status == TaskStatus::Completed) && !tasks.is_empty() {
        return OrchestrationStatus::Complete;
    }

    // Check for in-progress tasks
    if tasks.iter().any(|t| t.status == TaskStatus::InProgress) {
        return OrchestrationStatus::Executing {
            phase: state.current_phase,
        };
    }

    // Check for blocked tasks
    let blocked_tasks: Vec<_> = tasks
        .iter()
        .filter(|t| t.status == TaskStatus::Pending && !t.blocked_by.is_empty())
        .collect();
    if !blocked_tasks.is_empty()
        && tasks.iter().all(|t| {
            t.status == TaskStatus::Completed
                || (t.status == TaskStatus::Pending && !t.blocked_by.is_empty())
        })
    {
        let reason = format!("{} tasks blocked", blocked_tasks.len());
        return OrchestrationStatus::Blocked {
            phase: state.current_phase,
            reason,
        };
    }

    OrchestrationStatus::Idle
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_task(id: &str, status: TaskStatus, blocked_by: Vec<String>) -> Task {
        Task {
            id: id.to_string(),
            subject: format!("Task {}", id),
            description: "".to_string(),
            active_form: None,
            status,
            owner: None,
            blocks: vec![],
            blocked_by,
            metadata: serde_json::Value::Null,
        }
    }

    fn make_supervisor_state(phase: u32) -> SupervisorState {
        SupervisorState {
            design_doc_path: "docs/plans/design.md".into(),
            worktree_path: "/path/to/worktree".into(),
            branch_name: "feature/test".to_string(),
            total_phases: 3,
            current_phase: phase,
            plan_paths: Default::default(),
            status: "executing".to_string(),
        }
    }

    #[test]
    fn test_derive_status_complete() {
        let tasks = vec![
            make_task("1", TaskStatus::Completed, vec![]),
            make_task("2", TaskStatus::Completed, vec![]),
            make_task("3", TaskStatus::Completed, vec![]),
        ];
        let state = make_supervisor_state(3);

        let status = derive_orchestration_status(&tasks, &state);
        assert!(matches!(status, OrchestrationStatus::Complete));
    }

    #[test]
    fn test_derive_status_executing() {
        let tasks = vec![
            make_task("1", TaskStatus::Completed, vec![]),
            make_task("2", TaskStatus::InProgress, vec![]),
            make_task("3", TaskStatus::Pending, vec!["2".to_string()]),
        ];
        let state = make_supervisor_state(2);

        let status = derive_orchestration_status(&tasks, &state);
        assert!(matches!(status, OrchestrationStatus::Executing { phase: 2 }));
    }

    #[test]
    fn test_derive_status_blocked() {
        let tasks = vec![
            make_task("1", TaskStatus::Completed, vec![]),
            make_task("2", TaskStatus::Completed, vec![]),
            make_task("3", TaskStatus::Pending, vec!["external".to_string()]),
        ];
        let state = make_supervisor_state(2);

        let status = derive_orchestration_status(&tasks, &state);
        assert!(matches!(
            status,
            OrchestrationStatus::Blocked { phase: 2, .. }
        ));
    }

    #[test]
    fn test_derive_status_idle_empty() {
        let tasks: Vec<Task> = vec![];
        let state = make_supervisor_state(1);

        let status = derive_orchestration_status(&tasks, &state);
        assert!(matches!(status, OrchestrationStatus::Idle));
    }

    #[test]
    fn test_derive_status_idle_pending_unblocked() {
        let tasks = vec![
            make_task("1", TaskStatus::Completed, vec![]),
            make_task("2", TaskStatus::Pending, vec![]), // Not blocked
        ];
        let state = make_supervisor_state(1);

        let status = derive_orchestration_status(&tasks, &state);
        assert!(matches!(status, OrchestrationStatus::Idle));
    }

    #[test]
    fn test_orchestration_status_serialization() {
        // Test that status serializes correctly
        let executing = OrchestrationStatus::Executing { phase: 1 };
        let json = serde_json::to_string(&executing).unwrap();
        assert!(json.contains("\"executing\""));
        assert!(json.contains("\"phase\":1"));

        let blocked = OrchestrationStatus::Blocked {
            phase: 2,
            reason: "test reason".to_string(),
        };
        let json = serde_json::to_string(&blocked).unwrap();
        assert!(json.contains("\"blocked\""));
        assert!(json.contains("\"phase\":2"));
        assert!(json.contains("\"reason\":\"test reason\""));

        let complete = OrchestrationStatus::Complete;
        let json = serde_json::to_string(&complete).unwrap();
        assert!(json.contains("\"complete\""));
    }
}
