//! Orchestration discovery module

use crate::data::{tasks, teams, tina_state};
use crate::types::{Agent, SupervisorState, Task, TaskStatus};
use anyhow::Result;
use serde::Serialize;
use std::path::PathBuf;

/// A discovered orchestration with all relevant data
#[derive(Debug, Clone, Serialize)]
pub struct Orchestration {
    pub team_name: String,
    pub title: String,
    pub feature_name: String,
    pub cwd: PathBuf,
    pub current_phase: u32,
    pub total_phases: u32,
    pub design_doc_path: PathBuf,
    pub context_percent: Option<u8>,
    pub status: OrchestrationStatus,
    /// Orchestrator tasks (validate-design, plan-phase-N, etc.)
    pub orchestrator_tasks: Vec<Task>,
    /// Tasks for the current phase
    pub tasks: Vec<Task>,
    /// Members for the current phase
    pub members: Vec<Agent>,
}

impl Orchestration {
    /// Count completed tasks
    pub fn tasks_completed(&self) -> usize {
        self.tasks
            .iter()
            .filter(|t| t.status == TaskStatus::Completed)
            .count()
    }

    /// Count total tasks
    pub fn tasks_total(&self) -> usize {
        self.tasks.len()
    }

    /// Get the path to a phase plan file
    pub fn phase_plan_path(&self, phase: u32) -> PathBuf {
        self.cwd
            .join(".claude")
            .join("tina")
            .join(format!("phase-{}", phase))
            .join("plan.md")
    }

    /// Load the phase plan content for a given phase
    pub fn load_phase_plan(&self, phase: u32) -> Option<String> {
        let path = self.phase_plan_path(phase);
        std::fs::read_to_string(&path).ok()
    }

    /// Load tasks and members for a specific phase
    pub fn load_phase_data(&self, phase: u32) -> (Vec<Task>, Vec<Agent>) {
        load_phase_data_for_worktree(&self.cwd, phase)
    }
}

/// Load tasks and members for a specific phase from all teams in the worktree
/// Finds teams dynamically by matching the worktree path
pub fn load_phase_data_for_worktree(worktree_path: &std::path::Path, phase: u32) -> (Vec<Task>, Vec<Agent>) {
    // Find all teams working in this worktree
    let worktree_teams = match teams::find_teams_for_worktree(worktree_path) {
        Ok(teams) => teams,
        Err(_) => return (vec![], vec![]),
    };

    // Look for a team that matches this phase (by name pattern or other heuristics)
    let phase_str = phase.to_string();
    for team in worktree_teams {
        // Match teams containing the phase number (e.g., "phase-5-execution", "phase-5", etc.)
        if team.name.contains(&format!("phase-{}", phase_str))
           || team.name.contains(&format!("-{}-", phase_str))
           || team.name.ends_with(&format!("-{}", phase_str)) {
            let phase_tasks = tasks::load_tasks(&team.lead_session_id).unwrap_or_default();
            return (phase_tasks, team.members);
        }
    }

    (vec![], vec![])
}

/// Legacy function for backward compatibility
pub fn load_phase_data(phase: u32) -> (Vec<Task>, Vec<Agent>) {
    // Try the common naming pattern as fallback
    let phase_team_name = format!("phase-{}-execution", phase);

    if let Ok(phase_team) = teams::load_team(&phase_team_name) {
        let phase_tasks = tasks::load_tasks(&phase_team.lead_session_id).unwrap_or_default();
        (phase_tasks, phase_team.members)
    } else {
        (vec![], vec![])
    }
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
        // Gracefully skip teams that fail to load (older teams without tina, schema changes, etc.)
        match try_load_orchestration(&name) {
            Ok(Some(orch)) => orchestrations.push(orch),
            Ok(None) => {} // Not an orchestration, skip
            Err(_) => {}   // Failed to load, skip silently
        }
    }

    Ok(orchestrations)
}

/// Try to load a team as an orchestration
fn try_load_orchestration(team_name: &str) -> Result<Option<Orchestration>> {
    let team = teams::load_team(team_name)?;

    // Get cwd from first member (typically team lead)
    let cwd = team
        .members
        .first()
        .map(|m| m.cwd.clone())
        .unwrap_or_default();

    // Check for supervisor state (defines this as an orchestration)
    let supervisor_state = match tina_state::load_supervisor_state(&cwd)? {
        Some(state) => state,
        None => return Ok(None), // Not an orchestration
    };

    // Load context metrics if available
    let context_metrics = tina_state::load_context_metrics(&cwd)?;

    // Load orchestrator tasks (high-level tasks)
    let orchestrator_tasks = tasks::load_tasks(&team.lead_session_id)?;

    // Load current phase tasks and members using the worktree path
    let (phase_tasks, phase_members) = load_phase_data_for_worktree(
        &supervisor_state.worktree_path,
        supervisor_state.current_phase,
    );

    // Derive status
    let status = derive_orchestration_status(&orchestrator_tasks, &supervisor_state);

    // Derive title from design doc filename
    let title = supervisor_state
        .design_doc
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&team.name)
        .to_string();

    Ok(Some(Orchestration {
        team_name: team.name,
        title,
        feature_name: supervisor_state.feature.clone(),
        cwd: supervisor_state.worktree_path.clone(), // Use worktree path, not main repo
        current_phase: supervisor_state.current_phase,
        total_phases: supervisor_state.total_phases,
        design_doc_path: supervisor_state.design_doc,
        context_percent: context_metrics.map(|m| m.used_pct),
        status,
        orchestrator_tasks,
        tasks: phase_tasks,
        members: phase_members,
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
    use chrono::Utc;

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
            version: 1,
            feature: "test-feature".to_string(),
            design_doc: "docs/plans/design.md".into(),
            worktree_path: "/path/to/worktree".into(),
            branch: "feature/test".to_string(),
            total_phases: 3,
            current_phase: phase,
            status: crate::types::OrchestrationStatus::Executing,
            orchestration_started_at: Utc::now(),
            phases: Default::default(),
            timing: Default::default(),
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
        assert!(matches!(
            status,
            OrchestrationStatus::Executing { phase: 2 }
        ));
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
