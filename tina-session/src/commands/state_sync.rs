use chrono::Utc;

use tina_session::convex;
use tina_session::state::schema::{OrchestrationStatus, PhaseState, SupervisorState};
use tina_session::state::timing::duration_mins;

/// Build Convex orchestration args from supervisor state.
pub fn orchestration_args_from_state(
    feature: &str,
    state: &SupervisorState,
) -> convex::OrchestrationArgs {
    let (completed_at, total_elapsed_mins) = if state.status == OrchestrationStatus::Complete {
        let now = Utc::now();
        let elapsed = duration_mins(state.orchestration_started_at, now);
        (Some(now.to_rfc3339()), Some(elapsed as f64))
    } else {
        (None, None)
    };

    convex::OrchestrationArgs {
        node_id: String::new(), // filled by writer
        project_id: None,
        design_id: state.design_id.clone(),
        feature_name: feature.to_string(),
        design_doc_path: state.design_doc.to_string_lossy().to_string(),
        branch: state.branch.clone(),
        worktree_path: Some(state.worktree_path.to_string_lossy().to_string()),
        total_phases: state.total_phases as f64,
        current_phase: state.current_phase as f64,
        status: orchestration_status_str(state.status).to_string(),
        started_at: state.orchestration_started_at.to_rfc3339(),
        completed_at,
        total_elapsed_mins,
    }
}

/// Build Convex phase args from a phase key and phase state.
pub fn phase_args_from_state(phase_key: &str, phase_state: &PhaseState) -> convex::PhaseArgs {
    convex::PhaseArgs {
        orchestration_id: String::new(), // filled after orchestration upsert
        phase_number: phase_key.to_string(),
        status: phase_state.status.to_string(),
        plan_path: phase_state
            .plan_path
            .as_ref()
            .map(|p| p.to_string_lossy().to_string()),
        git_range: phase_state.git_range.clone(),
        planning_mins: phase_state.breakdown.planning_mins.map(|m| m as f64),
        execution_mins: phase_state.breakdown.execution_mins.map(|m| m as f64),
        review_mins: phase_state.breakdown.review_mins.map(|m| m as f64),
        started_at: phase_state.planning_started_at.map(|dt| dt.to_rfc3339()),
        completed_at: phase_state.completed_at.map(|dt| dt.to_rfc3339()),
    }
}

/// Build phase args for every phase currently stored in state.
pub fn all_phase_args_from_state(state: &SupervisorState) -> Vec<convex::PhaseArgs> {
    state
        .phases
        .iter()
        .map(|(phase_key, phase_state)| phase_args_from_state(phase_key, phase_state))
        .collect()
}

fn orchestration_status_str(status: OrchestrationStatus) -> &'static str {
    match status {
        OrchestrationStatus::Planning => "planning",
        OrchestrationStatus::Executing => "executing",
        OrchestrationStatus::Reviewing => "reviewing",
        OrchestrationStatus::Complete => "complete",
        OrchestrationStatus::Blocked => "blocked",
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn make_test_state() -> SupervisorState {
        SupervisorState::new(
            "test-feature",
            PathBuf::from("/tmp/design.md"),
            PathBuf::from("/tmp/worktree"),
            "tina/test-feature",
            3,
        )
    }

    #[test]
    fn orchestration_args_forwards_design_id_when_present() {
        let mut state = make_test_state();
        state.design_id = Some("design_abc123".to_string());

        let args = orchestration_args_from_state("test-feature", &state);
        assert_eq!(args.design_id, Some("design_abc123".to_string()));
    }

    #[test]
    fn orchestration_args_forwards_design_id_none() {
        let state = make_test_state();
        assert_eq!(state.design_id, None);

        let args = orchestration_args_from_state("test-feature", &state);
        assert_eq!(args.design_id, None);
    }
}
