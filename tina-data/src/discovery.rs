//! Orchestration discovery module

use crate::{tasks, teams, tina_state};
use crate::{Agent, SessionLookup, SupervisorState, Task, TaskStatus};
use anyhow::{Context, Result};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

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
    let worktree_teams = match teams::find_teams_for_worktree(worktree_path) {
        Ok(teams) => teams,
        Err(_) => return (vec![], vec![]),
    };

    find_phase_team_data(&worktree_teams, phase, &tasks::tasks_dir())
}

/// Load tasks and members for a specific phase, searching in a specific base directory
fn load_phase_data_for_worktree_in(base_dir: &Path, worktree_path: &std::path::Path, phase: u32) -> (Vec<Task>, Vec<Agent>) {
    let teams_dir = teams::teams_dir_in(base_dir);
    let worktree_teams = match teams::find_teams_for_worktree_in(&teams_dir, worktree_path) {
        Ok(teams) => teams,
        Err(_) => return (vec![], vec![]),
    };

    find_phase_team_data(&worktree_teams, phase, &tasks::tasks_dir_in(base_dir))
}

fn find_phase_team_data(worktree_teams: &[crate::Team], phase: u32, tasks_dir: &Path) -> (Vec<Task>, Vec<Agent>) {
    let phase_str = phase.to_string();
    for team in worktree_teams {
        if team.name.contains(&format!("phase-{}", phase_str))
           || team.name.contains(&format!("-{}-", phase_str))
           || team.name.ends_with(&format!("-{}", phase_str)) {
            let phase_tasks = tasks::load_tasks_in(tasks_dir, &team.lead_session_id).unwrap_or_default();
            return (phase_tasks, team.members.clone());
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

/// Derived status of an orchestration (computed from task states at runtime)
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
    let home = dirs::home_dir().context("Could not determine home directory")?;
    find_orchestrations_in(&home)
}

/// Find all orchestrations within a specific base directory
pub fn find_orchestrations_in(base_dir: &Path) -> Result<Vec<Orchestration>> {
    let teams_dir = teams::teams_dir_in(base_dir);
    let team_names = teams::list_teams_in(&teams_dir)?;
    let mut orchestrations = Vec::new();

    for name in team_names {
        match try_load_orchestration_in(base_dir, &name) {
            Ok(Some(orch)) => orchestrations.push(orch),
            Ok(None) => {}
            Err(_) => {}
        }
    }

    Ok(orchestrations)
}

/// Load session lookup from {base_dir}/.claude/tina-sessions/{feature}.json
fn load_session_lookup_in(base_dir: &Path, feature: &str) -> Result<SessionLookup> {
    let path = base_dir
        .join(".claude")
        .join("tina-sessions")
        .join(format!("{}.json", feature));

    let content = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read session lookup: {}", path.display()))?;
    serde_json::from_str(&content).context("Failed to parse session lookup JSON")
}

/// Find worktree path for an orchestration team
#[cfg(test)]
fn find_worktree_for_orchestration(team_name: &str, member_cwd: &PathBuf) -> Option<PathBuf> {
    find_worktree_for_orchestration_in(None, team_name, member_cwd)
}

fn find_worktree_for_orchestration_in(base_dir: Option<&Path>, team_name: &str, member_cwd: &PathBuf) -> Option<PathBuf> {
    if team_name.ends_with("-orchestration") {
        let feature = team_name.trim_end_matches("-orchestration");
        let lookup_result = match base_dir {
            Some(base) => load_session_lookup_in(base, feature),
            None => {
                let home = dirs::home_dir().expect("Could not determine home directory");
                load_session_lookup_in(&home, feature)
            }
        };
        return lookup_result.ok().map(|l| l.cwd);
    }

    Some(member_cwd.clone())
}

/// Try to load a team as an orchestration from a specific base directory
fn try_load_orchestration_in(base_dir: &Path, team_name: &str) -> Result<Option<Orchestration>> {
    let teams_dir = teams::teams_dir_in(base_dir);
    let tasks_dir = tasks::tasks_dir_in(base_dir);
    let team = teams::load_team_in(&teams_dir, team_name)?;

    let member_cwd = team
        .members
        .first()
        .map(|m| m.cwd.clone())
        .unwrap_or_default();

    let worktree_path = match find_worktree_for_orchestration_in(Some(base_dir), team_name, &member_cwd) {
        Some(path) => path,
        None => return Ok(None),
    };

    let supervisor_state = match tina_state::load_supervisor_state(&worktree_path)? {
        Some(state) => state,
        None => return Ok(None),
    };

    let context_metrics = tina_state::load_context_metrics(&worktree_path)?;

    let orchestrator_tasks = tasks::load_tasks_in(&tasks_dir, &team.lead_session_id)?;

    // For phase data, use the base_dir-aware variant
    let (phase_tasks, phase_members) = load_phase_data_for_worktree_in(
        base_dir,
        &supervisor_state.worktree_path,
        supervisor_state.current_phase,
    );

    let status = derive_orchestration_status(&orchestrator_tasks, &supervisor_state);

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
        cwd: supervisor_state.worktree_path.clone(),
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
            status: crate::OrchestrationStatus::Executing,
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

    #[test]
    fn test_find_worktree_for_non_orchestration_team() {
        // Non-orchestration teams should return the member's cwd
        let member_cwd = PathBuf::from("/path/to/project");
        let result = find_worktree_for_orchestration("my-team", &member_cwd);
        assert_eq!(result, Some(member_cwd));
    }

    #[test]
    fn test_find_worktree_for_orchestration_without_session() {
        // Orchestration teams without session lookup should return None, not fall back to member_cwd
        let member_cwd = PathBuf::from("/path/to/project");
        let result = find_worktree_for_orchestration("nonexistent-orchestration", &member_cwd);
        assert_eq!(result, None);
    }

    #[test]
    fn test_orchestration_without_session_lookup_skipped() {
        // An orchestration team without a session lookup file should not produce an Orchestration.
        // This prevents cross-contamination where multiple teams resolve to the same stale state.
        let temp = tempfile::TempDir::new().unwrap();
        let base = temp.path();

        // Create team directory with a team config (an -orchestration team)
        let teams_dir = base.join(".claude").join("teams").join("foo-orchestration");
        fs::create_dir_all(&teams_dir).unwrap();
        let config = r#"{
            "name": "foo-orchestration",
            "description": "test",
            "createdAt": 1700000000000,
            "leadAgentId": "lead@foo-orchestration",
            "leadSessionId": "session-1",
            "members": [{
                "agentId": "lead@foo-orchestration",
                "name": "team-lead",
                "agentType": "team-lead",
                "model": "claude-opus-4-5-20251101",
                "joinedAt": 1700000000000,
                "cwd": "/some/project/dir",
                "subscriptions": []
            }]
        }"#;
        fs::write(teams_dir.join("config.json"), config).unwrap();

        // Create tasks directory (empty)
        let tasks_dir = base.join(".claude").join("tasks").join("foo-orchestration");
        fs::create_dir_all(&tasks_dir).unwrap();

        // Put a supervisor-state.json at the member_cwd to simulate the stale state bug
        let stale_cwd = base.join("some").join("project").join("dir");
        let tina_dir = stale_cwd.join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();
        let stale_state = r#"{
            "version": 1,
            "feature": "wrong-feature",
            "design_doc": "docs/wrong.md",
            "worktree_path": "/wrong/path",
            "branch": "wrong-branch",
            "total_phases": 1,
            "current_phase": 1,
            "status": "executing",
            "orchestration_started_at": "2026-01-01T00:00:00Z",
            "phases": {},
            "timing": {}
        }"#;
        fs::write(tina_dir.join("supervisor-state.json"), stale_state).unwrap();

        // Do NOT create a session lookup file for "foo"
        // (i.e., no base/.claude/tina-sessions/foo.json)

        // The orchestration should be skipped (None), not loaded with the stale state
        let result = try_load_orchestration_in(base, "foo-orchestration").unwrap();
        assert!(result.is_none(), "Orchestration without session lookup should be skipped, got: {:?}", result);
    }
}
