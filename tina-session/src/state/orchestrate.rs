//! Orchestration state machine.
//!
//! Determines the next action based on supervisor state and advances state
//! on phase events. This is the authoritative state machine that the CLI
//! `tina-session orchestrate` command exposes and that the `/tina:orchestrate`
//! skill delegates to.

use std::path::PathBuf;

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::state::schema::{
    OrchestrationStatus, PhaseState, PhaseStatus, SupervisorState,
};
use crate::state::timing::duration_mins;

/// An action the orchestrator should take next.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Action {
    /// Spawn the design validator.
    SpawnValidator,

    /// Spawn a phase planner.
    SpawnPlanner {
        phase: String,
    },

    /// Spawn a phase executor.
    SpawnExecutor {
        phase: String,
        plan_path: String,
    },

    /// Spawn a phase reviewer.
    SpawnReviewer {
        phase: String,
        git_range: String,
    },

    /// Reuse an existing plan (skip planning).
    ReusePlan {
        phase: String,
        plan_path: String,
    },

    /// Start the finalize workflow.
    Finalize,

    /// Orchestration is complete.
    Complete,

    /// Orchestration was stopped by validation failure.
    Stopped {
        reason: String,
    },

    /// An error occurred; retry or escalate.
    Error {
        phase: String,
        reason: String,
        retry_count: u32,
        can_retry: bool,
    },

    /// Create remediation tasks.
    Remediate {
        phase: String,
        remediation_phase: String,
        issues: Vec<String>,
    },
}

/// Events that advance the orchestration state machine.
#[derive(Debug, Clone)]
pub enum AdvanceEvent {
    /// Design validation passed.
    ValidationPass,
    /// Design validation passed with warnings.
    ValidationWarning,
    /// Design validation failed (stop).
    ValidationStop,
    /// Phase planning completed.
    PlanComplete { plan_path: PathBuf },
    /// Phase execution completed.
    ExecuteComplete { git_range: String },
    /// Phase review passed.
    ReviewPass,
    /// Phase review found gaps.
    ReviewGaps { issues: Vec<String> },
    /// An error occurred during the phase.
    Error { reason: String },
}

/// Errors from orchestration logic.
#[derive(Debug, thiserror::Error)]
pub enum OrchestrateError {
    #[error("Phase '{0}' not found in supervisor state")]
    PhaseNotFound(String),

    #[error("Unexpected state: {0}")]
    UnexpectedState(String),

    #[error("Session error: {0}")]
    Session(#[from] crate::error::SessionError),
}

type Result<T> = std::result::Result<T, OrchestrateError>;

/// Determine the next action based on current supervisor state.
///
/// This examines the phases in order and returns the appropriate action
/// for the first phase that needs work.
pub fn next_action(state: &SupervisorState) -> Result<Action> {
    // Check if orchestration is complete
    if state.status == OrchestrationStatus::Complete {
        return Ok(Action::Complete);
    }

    // Walk phases in order to find what needs doing
    for phase_num in 1..=state.total_phases {
        let key = phase_num.to_string();

        match state.phases.get(&key) {
            None => {
                // Phase hasn't started yet. Check if previous phase is complete.
                if phase_num == 1 {
                    // First phase - need validation first
                    return Ok(Action::SpawnValidator);
                }
                let prev_key = (phase_num - 1).to_string();
                let prev_complete = state
                    .phases
                    .get(&prev_key)
                    .map(|p| p.status == PhaseStatus::Complete)
                    .unwrap_or(false);

                // Also check remediation phases for the previous phase
                let remediation_complete = check_remediations_complete(state, phase_num - 1);

                if prev_complete && remediation_complete {
                    return Ok(Action::SpawnPlanner { phase: key });
                }
                // Previous phase not done yet, skip
                break;
            }
            Some(phase_state) => match phase_state.status {
                PhaseStatus::Planning => {
                    return Ok(Action::SpawnPlanner { phase: key });
                }
                PhaseStatus::Planned => {
                    let plan_path = phase_state
                        .plan_path
                        .as_ref()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    return Ok(Action::SpawnExecutor {
                        phase: key,
                        plan_path,
                    });
                }
                PhaseStatus::Executing => {
                    let plan_path = phase_state
                        .plan_path
                        .as_ref()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    return Ok(Action::SpawnExecutor {
                        phase: key,
                        plan_path,
                    });
                }
                PhaseStatus::Reviewing => {
                    let git_range = phase_state.git_range.clone().unwrap_or_default();
                    return Ok(Action::SpawnReviewer {
                        phase: key,
                        git_range,
                    });
                }
                PhaseStatus::Blocked => {
                    let reason = phase_state
                        .blocked_reason
                        .clone()
                        .unwrap_or_else(|| "unknown".to_string());
                    return Ok(Action::Error {
                        phase: key,
                        reason,
                        retry_count: 0,
                        can_retry: true,
                    });
                }
                PhaseStatus::Complete => {
                    // Check if there are incomplete remediations for this phase
                    if !check_remediations_complete(state, phase_num) {
                        return find_remediation_action(state, phase_num);
                    }
                    // Phase complete, check next
                    continue;
                }
            },
        }
    }

    // All phases complete
    Ok(Action::Finalize)
}

/// Advance the orchestration state based on an event for a given phase.
///
/// Updates the supervisor state in place and returns the next action.
pub fn advance_state(
    state: &mut SupervisorState,
    phase: &str,
    event: AdvanceEvent,
) -> Result<Action> {
    let now = Utc::now();

    match event {
        AdvanceEvent::ValidationPass | AdvanceEvent::ValidationWarning => {
            // Validation passed - start phase 1 planning
            let phase_key = "1".to_string();
            ensure_phase(state, &phase_key);
            let phase_state = state.phases.get_mut(&phase_key).unwrap();
            phase_state.planning_started_at = Some(now);
            phase_state.status = PhaseStatus::Planning;
            state.status = OrchestrationStatus::Planning;
            state.current_phase = 1;

            // Check for existing plan
            let plan_file = state
                .worktree_path
                .join(".claude")
                .join("tina")
                .join("phase-1")
                .join("plan.md");
            if plan_file.exists() {
                let plan_path = plan_file.to_string_lossy().to_string();
                phase_state.plan_path = Some(plan_file.clone());
                phase_state.status = PhaseStatus::Planned;
                if let Some(start) = phase_state.planning_started_at {
                    phase_state.breakdown.planning_mins = Some(duration_mins(start, now));
                }
                return Ok(Action::ReusePlan {
                    phase: phase_key,
                    plan_path,
                });
            }

            Ok(Action::SpawnPlanner { phase: phase_key })
        }

        AdvanceEvent::ValidationStop => {
            state.status = OrchestrationStatus::Blocked;
            Ok(Action::Stopped {
                reason: "Design validation failed".to_string(),
            })
        }

        AdvanceEvent::PlanComplete { plan_path } => {
            let phase_state = state
                .phases
                .get_mut(phase)
                .ok_or_else(|| OrchestrateError::PhaseNotFound(phase.to_string()))?;

            phase_state.plan_path = Some(plan_path.clone());
            phase_state.status = PhaseStatus::Planned;
            if let Some(start) = phase_state.planning_started_at {
                phase_state.breakdown.planning_mins = Some(duration_mins(start, now));
            }

            let plan_str = plan_path.to_string_lossy().to_string();
            Ok(Action::SpawnExecutor {
                phase: phase.to_string(),
                plan_path: plan_str,
            })
        }

        AdvanceEvent::ExecuteComplete { git_range } => {
            let phase_state = state
                .phases
                .get_mut(phase)
                .ok_or_else(|| OrchestrateError::PhaseNotFound(phase.to_string()))?;

            phase_state.git_range = Some(git_range.clone());
            phase_state.status = PhaseStatus::Reviewing;
            if let Some(start) = phase_state.execution_started_at {
                phase_state.breakdown.execution_mins = Some(duration_mins(start, now));
            }
            phase_state.review_started_at = Some(now);
            state.status = OrchestrationStatus::Reviewing;

            if let Ok(num) = phase.parse::<u32>() {
                state.current_phase = num;
            }

            Ok(Action::SpawnReviewer {
                phase: phase.to_string(),
                git_range,
            })
        }

        AdvanceEvent::ReviewPass => {
            let phase_state = state
                .phases
                .get_mut(phase)
                .ok_or_else(|| OrchestrateError::PhaseNotFound(phase.to_string()))?;

            phase_state.status = PhaseStatus::Complete;
            phase_state.completed_at = Some(now);
            if let Some(start) = phase_state.review_started_at {
                phase_state.breakdown.review_mins = Some(duration_mins(start, now));
            }
            if let Some(start) = phase_state.planning_started_at {
                phase_state.duration_mins = Some(duration_mins(start, now));
            }

            // Determine next phase
            let next_phase = next_main_phase(phase, state.total_phases);
            match next_phase {
                Some(next) => {
                    let next_key = next.to_string();
                    ensure_phase(state, &next_key);
                    let next_state = state.phases.get_mut(&next_key).unwrap();
                    next_state.planning_started_at = Some(now);
                    next_state.status = PhaseStatus::Planning;
                    state.status = OrchestrationStatus::Planning;
                    state.current_phase = next;

                    // Check for existing plan
                    let plan_file = state
                        .worktree_path
                        .join(".claude")
                        .join("tina")
                        .join(format!("phase-{}", next))
                        .join("plan.md");
                    if plan_file.exists() {
                        let plan_path = plan_file.to_string_lossy().to_string();
                        let ns = state.phases.get_mut(&next_key).unwrap();
                        ns.plan_path = Some(plan_file);
                        ns.status = PhaseStatus::Planned;
                        if let Some(start) = ns.planning_started_at {
                            ns.breakdown.planning_mins = Some(duration_mins(start, now));
                        }
                        return Ok(Action::ReusePlan {
                            phase: next_key,
                            plan_path,
                        });
                    }

                    Ok(Action::SpawnPlanner { phase: next_key })
                }
                None => {
                    state.status = OrchestrationStatus::Complete;
                    Ok(Action::Finalize)
                }
            }
        }

        AdvanceEvent::ReviewGaps { issues } => {
            let phase_state = state
                .phases
                .get_mut(phase)
                .ok_or_else(|| OrchestrateError::PhaseNotFound(phase.to_string()))?;

            phase_state.status = PhaseStatus::Complete;
            phase_state.completed_at = Some(now);
            if let Some(start) = phase_state.review_started_at {
                phase_state.breakdown.review_mins = Some(duration_mins(start, now));
            }

            // Calculate remediation phase number
            let remediation_phase = compute_remediation_phase(phase);
            let depth = remediation_depth(&remediation_phase);

            if depth > 2 {
                return Ok(Action::Error {
                    phase: phase.to_string(),
                    reason: format!(
                        "Phase {} has failed review after 2 remediation attempts",
                        phase
                    ),
                    retry_count: depth,
                    can_retry: false,
                });
            }

            // Create remediation phase state
            ensure_phase(state, &remediation_phase);
            let rem_state = state.phases.get_mut(&remediation_phase).unwrap();
            rem_state.planning_started_at = Some(now);
            rem_state.status = PhaseStatus::Planning;
            state.status = OrchestrationStatus::Planning;

            Ok(Action::Remediate {
                phase: phase.to_string(),
                remediation_phase,
                issues,
            })
        }

        AdvanceEvent::Error { reason } => {
            // Record the error in phase state
            if let Some(phase_state) = state.phases.get_mut(phase) {
                phase_state.status = PhaseStatus::Blocked;
                phase_state.blocked_reason = Some(reason.clone());
            }
            state.status = OrchestrationStatus::Blocked;

            Ok(Action::Error {
                phase: phase.to_string(),
                reason,
                retry_count: 0,
                can_retry: true,
            })
        }
    }
}

/// Ensure a phase entry exists in the state.
fn ensure_phase(state: &mut SupervisorState, phase_key: &str) {
    if !state.phases.contains_key(phase_key) {
        state.phases.insert(phase_key.to_string(), PhaseState::new());
    }
}

/// Compute the next main phase number after the given phase string.
/// Returns None if all phases are complete.
fn next_main_phase(phase: &str, total_phases: u32) -> Option<u32> {
    // For remediation phases like "1.5", the next main phase is 2
    // For main phases like "1", the next is 2
    let base: u32 = phase
        .split('.')
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let next = base + 1;
    if next <= total_phases {
        Some(next)
    } else {
        None
    }
}

/// Compute the remediation phase number for a given phase.
/// "1" -> "1.5", "1.5" -> "1.5.5"
fn compute_remediation_phase(phase: &str) -> String {
    format!("{}.5", phase)
}

/// Count remediation depth from a phase string.
/// "1" -> 0, "1.5" -> 1, "1.5.5" -> 2
fn remediation_depth(phase: &str) -> u32 {
    phase.matches(".5").count() as u32
}

/// Check if all remediation phases for a given main phase are complete.
fn check_remediations_complete(state: &SupervisorState, phase_num: u32) -> bool {
    let prefix = format!("{}.", phase_num);
    for (key, phase_state) in &state.phases {
        if key.starts_with(&prefix) && phase_state.status != PhaseStatus::Complete {
            return false;
        }
    }
    true
}

/// Find the next action for an incomplete remediation of the given phase.
fn find_remediation_action(state: &SupervisorState, phase_num: u32) -> Result<Action> {
    let prefix = format!("{}.", phase_num);
    for (key, phase_state) in &state.phases {
        if key.starts_with(&prefix) && phase_state.status != PhaseStatus::Complete {
            return match phase_state.status {
                PhaseStatus::Planning => Ok(Action::SpawnPlanner {
                    phase: key.clone(),
                }),
                PhaseStatus::Planned | PhaseStatus::Executing => {
                    let plan_path = phase_state
                        .plan_path
                        .as_ref()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    Ok(Action::SpawnExecutor {
                        phase: key.clone(),
                        plan_path,
                    })
                }
                PhaseStatus::Reviewing => {
                    let git_range = phase_state.git_range.clone().unwrap_or_default();
                    Ok(Action::SpawnReviewer {
                        phase: key.clone(),
                        git_range,
                    })
                }
                PhaseStatus::Blocked => {
                    let reason = phase_state
                        .blocked_reason
                        .clone()
                        .unwrap_or_else(|| "unknown".to_string());
                    Ok(Action::Error {
                        phase: key.clone(),
                        reason,
                        retry_count: 0,
                        can_retry: true,
                    })
                }
                PhaseStatus::Complete => unreachable!(),
            };
        }
    }
    // No incomplete remediations found (shouldn't reach here)
    Ok(Action::Finalize)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_state(total_phases: u32) -> SupervisorState {
        SupervisorState::new(
            "test-feature",
            PathBuf::from("/tmp/design.md"),
            PathBuf::from("/tmp/worktree"),
            "tina/test",
            total_phases,
        )
    }

    #[test]
    fn test_next_action_fresh_state() {
        let state = test_state(3);
        let action = next_action(&state).unwrap();
        assert_eq!(action, Action::SpawnValidator);
    }

    #[test]
    fn test_next_action_planning_phase() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Planning,
                planning_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = next_action(&state).unwrap();
        assert!(matches!(action, Action::SpawnPlanner { phase } if phase == "1"));
    }

    #[test]
    fn test_next_action_planned_phase() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Planned,
                plan_path: Some(PathBuf::from("/tmp/plan.md")),
                planning_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = next_action(&state).unwrap();
        assert!(
            matches!(action, Action::SpawnExecutor { phase, plan_path } if phase == "1" && plan_path == "/tmp/plan.md")
        );
    }

    #[test]
    fn test_next_action_reviewing_phase() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                git_range: Some("abc..def".to_string()),
                planning_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = next_action(&state).unwrap();
        assert!(
            matches!(action, Action::SpawnReviewer { phase, git_range } if phase == "1" && git_range == "abc..def")
        );
    }

    #[test]
    fn test_next_action_phase_1_complete_moves_to_phase_2() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Complete,
                planning_started_at: Some(Utc::now()),
                completed_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = next_action(&state).unwrap();
        assert!(matches!(action, Action::SpawnPlanner { phase } if phase == "2"));
    }

    #[test]
    fn test_next_action_all_phases_complete() {
        let mut state = test_state(2);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Complete,
                planning_started_at: Some(Utc::now()),
                completed_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        state.phases.insert(
            "2".to_string(),
            PhaseState {
                status: PhaseStatus::Complete,
                planning_started_at: Some(Utc::now()),
                completed_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = next_action(&state).unwrap();
        assert!(matches!(action, Action::Finalize));
    }

    #[test]
    fn test_next_action_orchestration_complete() {
        let mut state = test_state(2);
        state.status = OrchestrationStatus::Complete;
        let action = next_action(&state).unwrap();
        assert!(matches!(action, Action::Complete));
    }

    #[test]
    fn test_advance_validation_pass() {
        let mut state = test_state(3);
        let action = advance_state(&mut state, "validation", AdvanceEvent::ValidationPass).unwrap();
        assert!(matches!(action, Action::SpawnPlanner { phase } if phase == "1"));
        assert_eq!(state.status, OrchestrationStatus::Planning);
        assert!(state.phases.contains_key("1"));
        assert_eq!(state.phases["1"].status, PhaseStatus::Planning);
    }

    #[test]
    fn test_advance_validation_stop() {
        let mut state = test_state(3);
        let action = advance_state(&mut state, "validation", AdvanceEvent::ValidationStop).unwrap();
        assert!(matches!(action, Action::Stopped { .. }));
        assert_eq!(state.status, OrchestrationStatus::Blocked);
    }

    #[test]
    fn test_advance_plan_complete() {
        let mut state = test_state(3);
        state
            .phases
            .insert("1".to_string(), PhaseState::new());
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan.md"),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::SpawnExecutor { phase, .. } if phase == "1"));
        assert_eq!(state.phases["1"].status, PhaseStatus::Planned);
        assert_eq!(
            state.phases["1"].plan_path,
            Some(PathBuf::from("/tmp/plan.md"))
        );
    }

    #[test]
    fn test_advance_execute_complete() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Executing,
                execution_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::ExecuteComplete {
                git_range: "abc..def".to_string(),
            },
        )
        .unwrap();
        assert!(
            matches!(action, Action::SpawnReviewer { phase, git_range } if phase == "1" && git_range == "abc..def")
        );
        assert_eq!(state.phases["1"].status, PhaseStatus::Reviewing);
        assert_eq!(state.status, OrchestrationStatus::Reviewing);
    }

    #[test]
    fn test_advance_review_pass_next_phase() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        assert!(matches!(action, Action::SpawnPlanner { phase } if phase == "2"));
        assert_eq!(state.phases["1"].status, PhaseStatus::Complete);
        assert_eq!(state.status, OrchestrationStatus::Planning);
        assert_eq!(state.current_phase, 2);
    }

    #[test]
    fn test_advance_review_pass_last_phase() {
        let mut state = test_state(1);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        assert!(matches!(action, Action::Finalize));
        assert_eq!(state.status, OrchestrationStatus::Complete);
    }

    #[test]
    fn test_advance_review_gaps_creates_remediation() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::ReviewGaps {
                issues: vec!["missing tests".to_string()],
            },
        )
        .unwrap();
        assert!(matches!(
            action,
            Action::Remediate {
                phase,
                remediation_phase,
                ..
            } if phase == "1" && remediation_phase == "1.5"
        ));
        assert!(state.phases.contains_key("1.5"));
        assert_eq!(state.phases["1.5"].status, PhaseStatus::Planning);
    }

    #[test]
    fn test_advance_review_gaps_nested_remediation() {
        let mut state = test_state(3);
        state.phases.insert(
            "1.5".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "1.5",
            AdvanceEvent::ReviewGaps {
                issues: vec!["still failing".to_string()],
            },
        )
        .unwrap();
        assert!(matches!(
            action,
            Action::Remediate {
                remediation_phase,
                ..
            } if remediation_phase == "1.5.5"
        ));
    }

    #[test]
    fn test_advance_review_gaps_exceeds_depth() {
        let mut state = test_state(3);
        state.phases.insert(
            "1.5.5".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "1.5.5",
            AdvanceEvent::ReviewGaps {
                issues: vec!["still failing".to_string()],
            },
        )
        .unwrap();
        assert!(matches!(
            action,
            Action::Error {
                can_retry: false,
                ..
            }
        ));
    }

    #[test]
    fn test_advance_error() {
        let mut state = test_state(3);
        state
            .phases
            .insert("1".to_string(), PhaseState::new());
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::Error {
                reason: "session died".to_string(),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::Error { can_retry: true, .. }));
        assert_eq!(state.phases["1"].status, PhaseStatus::Blocked);
        assert_eq!(state.status, OrchestrationStatus::Blocked);
    }

    #[test]
    fn test_compute_remediation_phase() {
        assert_eq!(compute_remediation_phase("1"), "1.5");
        assert_eq!(compute_remediation_phase("1.5"), "1.5.5");
        assert_eq!(compute_remediation_phase("2"), "2.5");
    }

    #[test]
    fn test_remediation_depth() {
        assert_eq!(remediation_depth("1"), 0);
        assert_eq!(remediation_depth("1.5"), 1);
        assert_eq!(remediation_depth("1.5.5"), 2);
        assert_eq!(remediation_depth("1.5.5.5"), 3);
    }

    #[test]
    fn test_next_main_phase() {
        assert_eq!(next_main_phase("1", 3), Some(2));
        assert_eq!(next_main_phase("2", 3), Some(3));
        assert_eq!(next_main_phase("3", 3), None);
        assert_eq!(next_main_phase("1.5", 3), Some(2));
        assert_eq!(next_main_phase("3.5", 3), None);
    }

    #[test]
    fn test_remediations_complete_no_remediations() {
        let state = test_state(3);
        assert!(check_remediations_complete(&state, 1));
    }

    #[test]
    fn test_remediations_complete_with_incomplete() {
        let mut state = test_state(3);
        state.phases.insert(
            "1.5".to_string(),
            PhaseState {
                status: PhaseStatus::Executing,
                ..PhaseState::default()
            },
        );
        assert!(!check_remediations_complete(&state, 1));
    }

    #[test]
    fn test_remediations_complete_with_complete() {
        let mut state = test_state(3);
        state.phases.insert(
            "1.5".to_string(),
            PhaseState {
                status: PhaseStatus::Complete,
                ..PhaseState::default()
            },
        );
        assert!(check_remediations_complete(&state, 1));
    }
}
