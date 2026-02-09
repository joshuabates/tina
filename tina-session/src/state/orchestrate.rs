//! Orchestration state machine.
//!
//! Determines the next action based on supervisor state and advances state
//! on phase events. This is the authoritative state machine that the CLI
//! `tina-session orchestrate` command exposes and that the `/tina:orchestrate`
//! skill delegates to.

use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::state::schema::{
    OrchestrationStatus, PhaseState, PhaseStatus, ReviewVerdict, SupervisorState,
};
use crate::state::timing::duration_mins;

/// Plan-ahead information: the orchestrator should spawn a planner for this
/// phase in parallel with the current reviewer.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlanAhead {
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// An action the orchestrator should take next.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Action {
    /// Spawn the design validator.
    SpawnValidator {
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },

    /// Spawn a phase planner.
    SpawnPlanner {
        phase: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },

    /// Spawn a phase executor.
    SpawnExecutor {
        phase: String,
        plan_path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },

    /// Spawn a phase reviewer.
    SpawnReviewer {
        phase: String,
        git_range: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        /// When set, the orchestrator should spawn a second reviewer with this model
        /// in parallel for consensus review.
        #[serde(skip_serializing_if = "Option::is_none")]
        secondary_model: Option<String>,
        /// When set, the orchestrator should also spawn a planner for this phase
        /// in parallel (plan-ahead). Contains the phase number to plan.
        #[serde(skip_serializing_if = "Option::is_none")]
        plan_ahead: Option<PlanAhead>,
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

    /// Review consensus disagreement - requires human resolution.
    ConsensusDisagreement {
        phase: String,
        verdict_1: String,
        verdict_2: String,
        issues: Vec<String>,
    },

    /// No immediate action required.
    Wait {
        reason: String,
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
    /// Phase execution started (executor successfully launched).
    ExecuteStarted,
    /// Phase review passed.
    ReviewPass,
    /// Phase review found gaps.
    ReviewGaps { issues: Vec<String> },
    /// Retry a blocked phase.
    Retry { reason: String },
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

/// Return Some(model) only if it differs from the default for that agent type.
fn non_default_model(model: &str, default: &str) -> Option<String> {
    if model != default {
        Some(model.to_string())
    } else {
        None
    }
}

/// Return the secondary reviewer model when consensus is enabled.
fn consensus_secondary_model(state: &SupervisorState) -> Option<String> {
    if state.model_policy.review_consensus {
        Some(state.model_policy.reviewer_secondary.clone())
    } else {
        None
    }
}

/// Find a plan file in docs/plans following the naming convention.
fn find_plan_in_docs(worktree_path: &Path, feature: &str, phase: &str) -> Option<PathBuf> {
    let plans_dir = worktree_path.join("docs").join("plans");
    let suffix = format!("-{}-phase-{}.md", feature, phase);
    let entries = fs::read_dir(&plans_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(&suffix) {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn reuse_plan_if_present(
    worktree_path: &Path,
    feature: &str,
    phase_key: &str,
    phase_state: &mut PhaseState,
    now: chrono::DateTime<Utc>,
) -> Option<Action> {
    if let Some(existing) = phase_state.plan_path.as_ref() {
        if existing.exists() {
            let plan_path = existing.to_string_lossy().to_string();
            phase_state.status = PhaseStatus::Planned;
            if let Some(start) = phase_state.planning_started_at {
                phase_state.breakdown.planning_mins = Some(duration_mins(start, now));
            }
            return Some(Action::ReusePlan {
                phase: phase_key.to_string(),
                plan_path,
            });
        }
    }

    if let Some(found) = find_plan_in_docs(worktree_path, feature, phase_key) {
        let plan_path = found.to_string_lossy().to_string();
        phase_state.plan_path = Some(found);
        phase_state.status = PhaseStatus::Planned;
        if let Some(start) = phase_state.planning_started_at {
            phase_state.breakdown.planning_mins = Some(duration_mins(start, now));
        }
        return Some(Action::ReusePlan {
            phase: phase_key.to_string(),
            plan_path,
        });
    }

    None
}

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
                    return Ok(Action::SpawnValidator {
                        model: non_default_model(&state.model_policy.validator, "opus"),
                    });
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
                    return Ok(Action::SpawnPlanner {
                        phase: key,
                        model: non_default_model(&state.model_policy.planner, "opus"),
                    });
                }
                // Previous phase not done yet, skip
                break;
            }
            Some(phase_state) => match phase_state.status {
                PhaseStatus::Planning => {
                    return Ok(Action::SpawnPlanner {
                        phase: key,
                        model: non_default_model(&state.model_policy.planner, "opus"),
                    });
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
                        model: non_default_model(&state.model_policy.executor, "haiku"),
                    });
                }
                PhaseStatus::Executing => {
                    return Ok(Action::Wait {
                        reason: format!("phase {} executing", key),
                    });
                }
                PhaseStatus::Reviewing => {
                    let git_range = phase_state.git_range.clone().unwrap_or_default();
                    return Ok(Action::SpawnReviewer {
                        phase: key,
                        git_range,
                        model: non_default_model(&state.model_policy.reviewer, "opus"),
                        secondary_model: consensus_secondary_model(state),
                        plan_ahead: None,
                    });
                }
                PhaseStatus::Blocked => {
                    let reason = phase_state
                        .blocked_reason
                        .clone()
                        .unwrap_or_else(|| "unknown".to_string());
                    let can_retry = !reason.contains("consensus disagreement");
                    return Ok(Action::Error {
                        phase: key,
                        reason,
                        retry_count: 0,
                        can_retry,
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
            let worktree_path = state.worktree_path.clone();
            let feature = state.feature.clone();
            let phase_state = state.phases.get_mut(&phase_key).unwrap();
            phase_state.planning_started_at = Some(now);
            phase_state.status = PhaseStatus::Planning;
            state.status = OrchestrationStatus::Planning;
            state.current_phase = 1;

            if let Some(action) =
                reuse_plan_if_present(&worktree_path, &feature, &phase_key, phase_state, now)
            {
                return Ok(action);
            }

            Ok(Action::SpawnPlanner {
                phase: phase_key,
                model: non_default_model(&state.model_policy.planner, "opus"),
            })
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

            // Plan-ahead check: if the previous phase is still reviewing,
            // this plan was produced ahead of time. Store it but don't
            // spawn the executor yet - wait for the previous review to complete.
            if is_plan_ahead(state, phase) {
                return Ok(Action::Wait {
                    reason: format!(
                        "plan-ahead: phase {} planned, waiting for previous review",
                        phase
                    ),
                });
            }

            let plan_str = plan_path.to_string_lossy().to_string();
            Ok(Action::SpawnExecutor {
                phase: phase.to_string(),
                plan_path: plan_str,
                model: non_default_model(&state.model_policy.executor, "haiku"),
            })
        }

        AdvanceEvent::ExecuteStarted => {
            let phase_state = state
                .phases
                .get_mut(phase)
                .ok_or_else(|| OrchestrateError::PhaseNotFound(phase.to_string()))?;

            phase_state.status = PhaseStatus::Executing;
            if phase_state.execution_started_at.is_none() {
                phase_state.execution_started_at = Some(now);
            }
            state.status = OrchestrationStatus::Executing;

            if let Ok(num) = phase.parse::<u32>() {
                state.current_phase = num;
            }

            Ok(Action::Wait {
                reason: "execute_started".to_string(),
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

            // Plan-ahead: if there's a next phase and it hasn't started planning yet,
            // signal the orchestrator to spawn a planner in parallel with the reviewer.
            let plan_ahead = plan_ahead_for_next_phase(state, phase, now);

            Ok(Action::SpawnReviewer {
                phase: phase.to_string(),
                git_range,
                model: non_default_model(&state.model_policy.reviewer, "opus"),
                secondary_model: consensus_secondary_model(state),
                plan_ahead,
            })
        }

        AdvanceEvent::ReviewPass => {
            let phase_state = state
                .phases
                .get_mut(phase)
                .ok_or_else(|| OrchestrateError::PhaseNotFound(phase.to_string()))?;

            // Consensus mode: collect verdict before deciding
            if state.model_policy.review_consensus && phase_state.review_verdicts.is_empty() {
                // First verdict - store and wait for second reviewer
                // (both reviewers were spawned in parallel by the orchestrator)
                phase_state.review_verdicts.push(ReviewVerdict {
                    result: "pass".to_string(),
                    issues: vec![],
                });
                return Ok(Action::Wait {
                    reason: format!("consensus: waiting for second reviewer on phase {}", phase),
                });
            }

            // Consensus mode: second verdict arrived
            if state.model_policy.review_consensus && phase_state.review_verdicts.len() == 1 {
                let first = &phase_state.review_verdicts[0];
                if first.result == "pass" {
                    // Both pass - proceed normally
                } else {
                    // Disagreement: first was gaps, second is pass
                    let issues = first.issues.clone();
                    phase_state.status = PhaseStatus::Blocked;
                    phase_state.blocked_reason = Some("review consensus disagreement".to_string());
                    state.status = OrchestrationStatus::Blocked;
                    return Ok(Action::ConsensusDisagreement {
                        phase: phase.to_string(),
                        verdict_1: first.result.clone(),
                        verdict_2: "pass".to_string(),
                        issues,
                    });
                }
            }

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
                    state.current_phase = next;

                    // Check if plan-ahead already created this phase entry
                    let plan_ahead_active = state.phases.contains_key(&next_key);

                    if plan_ahead_active {
                        let next_state = state.phases.get(&next_key).unwrap();

                        // Plan-ahead completed: skip planning, go to executor
                        if next_state.status == PhaseStatus::Planned {
                            if let Some(plan_path) = next_state.plan_path.as_ref() {
                                let plan_str = plan_path.to_string_lossy().to_string();
                                state.status = OrchestrationStatus::Executing;
                                return Ok(Action::SpawnExecutor {
                                    phase: next_key,
                                    plan_path: plan_str,
                                    model: non_default_model(
                                        &state.model_policy.executor,
                                        "haiku",
                                    ),
                                });
                            }
                        }

                        // Plan-ahead in progress: planner is still running
                        if next_state.status == PhaseStatus::Planning {
                            state.status = OrchestrationStatus::Planning;
                            return Ok(Action::Wait {
                                reason: format!(
                                    "plan-ahead: waiting for phase {} planner to complete",
                                    next_key
                                ),
                            });
                        }
                    }

                    // No plan-ahead: start planning normally
                    ensure_phase(state, &next_key);
                    let worktree_path = state.worktree_path.clone();
                    let feature = state.feature.clone();
                    let next_state = state.phases.get_mut(&next_key).unwrap();
                    next_state.planning_started_at = Some(now);
                    next_state.status = PhaseStatus::Planning;
                    state.status = OrchestrationStatus::Planning;

                    if let Some(action) =
                        reuse_plan_if_present(&worktree_path, &feature, &next_key, next_state, now)
                    {
                        return Ok(action);
                    }

                    Ok(Action::SpawnPlanner {
                        phase: next_key,
                        model: non_default_model(&state.model_policy.planner, "opus"),
                    })
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

            // Consensus mode: collect verdict before deciding
            if state.model_policy.review_consensus && phase_state.review_verdicts.is_empty() {
                // First verdict - store and wait for second reviewer
                // (both reviewers were spawned in parallel by the orchestrator)
                phase_state.review_verdicts.push(ReviewVerdict {
                    result: "gaps".to_string(),
                    issues: issues.clone(),
                });
                return Ok(Action::Wait {
                    reason: format!("consensus: waiting for second reviewer on phase {}", phase),
                });
            }

            // Consensus mode: second verdict arrived
            if state.model_policy.review_consensus && phase_state.review_verdicts.len() == 1 {
                let first = &phase_state.review_verdicts[0];
                if first.result == "pass" {
                    // Disagreement: first was pass, second is gaps
                    phase_state.status = PhaseStatus::Blocked;
                    phase_state.blocked_reason = Some("review consensus disagreement".to_string());
                    state.status = OrchestrationStatus::Blocked;
                    return Ok(Action::ConsensusDisagreement {
                        phase: phase.to_string(),
                        verdict_1: first.result.clone(),
                        verdict_2: "gaps".to_string(),
                        issues,
                    });
                }
                // Both gaps - merge issues and proceed with remediation
                let mut merged = first.issues.clone();
                for issue in &issues {
                    if !merged.contains(issue) {
                        merged.push(issue.clone());
                    }
                }
                // Fall through to normal remediation with merged issues
                // (re-assign issues for the rest of the handler)
                return handle_review_gaps(state, phase, now, merged);
            }

            handle_review_gaps(state, phase, now, issues)
        }

        AdvanceEvent::Retry { reason: _reason } => {
            let phase_state = state
                .phases
                .get_mut(phase)
                .ok_or_else(|| OrchestrateError::PhaseNotFound(phase.to_string()))?;

            if phase_state.status != PhaseStatus::Blocked {
                return Err(OrchestrateError::UnexpectedState(format!(
                    "Phase {} is not blocked (status: {})",
                    phase, phase_state.status
                )));
            }

            let blocked_reason = phase_state.blocked_reason.clone().unwrap_or_default();
            if blocked_reason.contains("consensus disagreement") {
                return Ok(Action::Error {
                    phase: phase.to_string(),
                    reason: blocked_reason,
                    retry_count: 0,
                    can_retry: false,
                });
            }

            phase_state.blocked_reason = None;

            if let Ok(num) = phase.parse::<u32>() {
                state.current_phase = num;
            }

            if phase_state.plan_path.is_none() {
                phase_state.status = PhaseStatus::Planning;
                if phase_state.planning_started_at.is_none() {
                    phase_state.planning_started_at = Some(now);
                }
                state.status = OrchestrationStatus::Planning;
                return Ok(Action::SpawnPlanner {
                    phase: phase.to_string(),
                    model: non_default_model(&state.model_policy.planner, "opus"),
                });
            }

            if phase_state.git_range.is_some() {
                phase_state.status = PhaseStatus::Reviewing;
                if phase_state.review_started_at.is_none() {
                    phase_state.review_started_at = Some(now);
                }
                state.status = OrchestrationStatus::Reviewing;
                let git_range = phase_state.git_range.clone().unwrap_or_default();
                return Ok(Action::SpawnReviewer {
                    phase: phase.to_string(),
                    git_range,
                    model: non_default_model(&state.model_policy.reviewer, "opus"),
                    secondary_model: consensus_secondary_model(state),
                    plan_ahead: None,
                });
            }

            phase_state.status = PhaseStatus::Executing;
            if phase_state.execution_started_at.is_none() {
                phase_state.execution_started_at = Some(now);
            }
            state.status = OrchestrationStatus::Executing;
            let plan_path = phase_state
                .plan_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            Ok(Action::SpawnExecutor {
                phase: phase.to_string(),
                plan_path,
                model: non_default_model(&state.model_policy.executor, "haiku"),
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

/// Handle review gaps: create remediation or error if depth exceeded.
fn handle_review_gaps(
    state: &mut SupervisorState,
    phase: &str,
    now: chrono::DateTime<Utc>,
    issues: Vec<String>,
) -> Result<Action> {
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

/// Check if a phase's plan was produced ahead of time (plan-ahead).
///
/// Returns true when the previous main phase has NOT completed yet,
/// meaning this plan was produced in parallel with the previous phase's review.
fn is_plan_ahead(state: &SupervisorState, phase: &str) -> bool {
    // Only main phases can be plan-ahead targets (not remediation phases)
    if phase.contains('.') {
        return false;
    }

    let phase_num: u32 = match phase.parse() {
        Ok(n) => n,
        Err(_) => return false,
    };

    // Phase 1 can't be plan-ahead (there's no previous phase)
    if phase_num <= 1 {
        return false;
    }

    let prev_key = (phase_num - 1).to_string();
    match state.phases.get(&prev_key) {
        Some(prev) => prev.status != PhaseStatus::Complete,
        None => false,
    }
}

/// Determine if plan-ahead is available for the next phase after the given one.
///
/// Returns `Some(PlanAhead)` when:
/// - The current phase is a main phase (not remediation)
/// - A next main phase exists
/// - The next phase has NOT already started planning
///
/// This allows the orchestrator to spawn a planner for the next phase in
/// parallel with the reviewer for the current phase.
/// Determine if plan-ahead is available for the next phase after the given one,
/// and if so, create the phase entry in state so the planner can advance it.
///
/// Returns `Some(PlanAhead)` when:
/// - The current phase is a main phase (not remediation)
/// - A next main phase exists
/// - The next phase has NOT already started planning
///
/// When plan-ahead is available, also creates the phase entry in `Planning` status.
fn plan_ahead_for_next_phase(
    state: &mut SupervisorState,
    phase: &str,
    now: chrono::DateTime<Utc>,
) -> Option<PlanAhead> {
    // Only plan-ahead for main phases (not remediation phases like "1.5")
    if phase.contains('.') {
        return None;
    }

    let phase_num: u32 = phase.parse().ok()?;
    let next_phase = phase_num + 1;

    if next_phase > state.total_phases {
        return None;
    }

    let next_key = next_phase.to_string();

    // If the next phase already exists in state, it has already started (or was planned ahead)
    if state.phases.contains_key(&next_key) {
        return None;
    }

    // Create the phase entry so PlanComplete can find it
    let mut next_state = PhaseState::new();
    next_state.planning_started_at = Some(now);
    next_state.status = PhaseStatus::Planning;
    state.phases.insert(next_key.clone(), next_state);

    Some(PlanAhead {
        phase: next_key,
        model: non_default_model(&state.model_policy.planner, "opus"),
    })
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
                    model: non_default_model(&state.model_policy.planner, "opus"),
                }),
                PhaseStatus::Planned => {
                    let plan_path = phase_state
                        .plan_path
                        .as_ref()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    Ok(Action::SpawnExecutor {
                        phase: key.clone(),
                        plan_path,
                        model: non_default_model(&state.model_policy.executor, "haiku"),
                    })
                }
                PhaseStatus::Executing => Ok(Action::Wait {
                    reason: format!("phase {} executing", key),
                }),
                PhaseStatus::Reviewing => {
                    let git_range = phase_state.git_range.clone().unwrap_or_default();
                    Ok(Action::SpawnReviewer {
                        phase: key.clone(),
                        git_range,
                        model: non_default_model(&state.model_policy.reviewer, "opus"),
                        secondary_model: consensus_secondary_model(state),
                        plan_ahead: None,
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
        assert!(matches!(action, Action::SpawnValidator { .. }));
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
        assert!(matches!(action, Action::SpawnPlanner { ref phase, .. } if phase == "1"));
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
            matches!(action, Action::SpawnExecutor { ref phase, ref plan_path, .. } if phase == "1" && plan_path == "/tmp/plan.md")
        );
    }

    #[test]
    fn test_next_action_executing_phase_waits() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Executing,
                plan_path: Some(PathBuf::from("/tmp/plan.md")),
                execution_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = next_action(&state).unwrap();
        assert!(matches!(action, Action::Wait { .. }));
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
            matches!(action, Action::SpawnReviewer { ref phase, ref git_range, .. } if phase == "1" && git_range == "abc..def")
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
        assert!(matches!(action, Action::SpawnPlanner { ref phase, .. } if phase == "2"));
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
        assert!(matches!(action, Action::SpawnPlanner { ref phase, .. } if phase == "1"));
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
        assert!(matches!(action, Action::SpawnExecutor { ref phase, .. } if phase == "1"));
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
            matches!(action, Action::SpawnReviewer { ref phase, ref git_range, .. } if phase == "1" && git_range == "abc..def")
        );
        assert_eq!(state.phases["1"].status, PhaseStatus::Reviewing);
        assert_eq!(state.status, OrchestrationStatus::Reviewing);
    }

    #[test]
    fn test_advance_execute_started_sets_executing() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Planned,
                planning_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action =
            advance_state(&mut state, "1", AdvanceEvent::ExecuteStarted).unwrap();
        assert!(matches!(action, Action::Wait { .. }));
        assert_eq!(state.phases["1"].status, PhaseStatus::Executing);
        assert_eq!(state.status, OrchestrationStatus::Executing);
        assert!(state.phases["1"].execution_started_at.is_some());
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
        assert!(matches!(action, Action::SpawnPlanner { ref phase, .. } if phase == "2"));
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
    fn test_retry_blocked_planning_spawns_planner() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Blocked,
                blocked_reason: Some("planner failed".to_string()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::Retry {
                reason: "manual retry".to_string(),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::SpawnPlanner { ref phase, .. } if phase == "1"));
        assert_eq!(state.phases["1"].status, PhaseStatus::Planning);
        assert!(state.phases["1"].blocked_reason.is_none());
    }

    #[test]
    fn test_retry_blocked_executing_spawns_executor() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Blocked,
                plan_path: Some(PathBuf::from("/tmp/plan.md")),
                blocked_reason: Some("session died".to_string()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::Retry {
                reason: "manual retry".to_string(),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::SpawnExecutor { ref phase, .. } if phase == "1"));
        assert_eq!(state.phases["1"].status, PhaseStatus::Executing);
        assert!(state.phases["1"].blocked_reason.is_none());
    }

    #[test]
    fn test_retry_blocked_reviewing_spawns_reviewer() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Blocked,
                plan_path: Some(PathBuf::from("/tmp/plan.md")),
                git_range: Some("abc..def".to_string()),
                blocked_reason: Some("reviewer failed".to_string()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::Retry {
                reason: "manual retry".to_string(),
            },
        )
        .unwrap();
        assert!(
            matches!(action, Action::SpawnReviewer { ref phase, ref git_range, .. } if phase == "1" && git_range == "abc..def")
        );
        assert_eq!(state.phases["1"].status, PhaseStatus::Reviewing);
        assert!(state.phases["1"].blocked_reason.is_none());
    }

    #[test]
    fn test_retry_consensus_disagreement_blocked() {
        let mut state = test_state(3);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Blocked,
                blocked_reason: Some("review consensus disagreement".to_string()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::Retry {
                reason: "manual retry".to_string(),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::Error { can_retry: false, .. }));
        assert_eq!(state.phases["1"].status, PhaseStatus::Blocked);
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

    #[test]
    fn test_consensus_execute_complete_includes_secondary_model() {
        // When consensus is enabled, ExecuteComplete should include secondary_model
        // in SpawnReviewer so the orchestrator can spawn both reviewers in parallel
        let mut state = test_state(2);
        state.model_policy.review_consensus = true;
        state.model_policy.reviewer_secondary = "sonnet".to_string();
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
        match action {
            Action::SpawnReviewer {
                secondary_model, ..
            } => {
                assert_eq!(secondary_model, Some("sonnet".to_string()));
            }
            other => panic!("Expected SpawnReviewer, got {:?}", other),
        }
    }

    #[test]
    fn test_consensus_execute_complete_no_secondary_when_disabled() {
        // When consensus is NOT enabled, ExecuteComplete should NOT include secondary_model
        let mut state = test_state(2);
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
        match action {
            Action::SpawnReviewer {
                secondary_model, ..
            } => {
                assert_eq!(secondary_model, None);
            }
            other => panic!("Expected SpawnReviewer, got {:?}", other),
        }
    }

    #[test]
    fn test_review_consensus_first_verdict_returns_wait() {
        // In parallel consensus mode, first verdict should return Wait
        // (orchestrator already spawned both reviewers)
        let mut state = test_state(2);
        state.model_policy.review_consensus = true;
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                git_range: Some("abc..def".to_string()),
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        // First verdict should return Wait (not SpawnReviewer)
        assert!(matches!(action, Action::Wait { .. }));
        assert_eq!(state.phases["1"].review_verdicts.len(), 1);
        assert_eq!(state.phases["1"].review_verdicts[0].result, "pass");
    }

    #[test]
    fn test_review_consensus_first_verdict_gaps_returns_wait() {
        // First verdict with gaps should also return Wait
        let mut state = test_state(2);
        state.model_policy.review_consensus = true;
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                git_range: Some("abc..def".to_string()),
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
        assert!(matches!(action, Action::Wait { .. }));
        assert_eq!(state.phases["1"].review_verdicts.len(), 1);
        assert_eq!(state.phases["1"].review_verdicts[0].result, "gaps");
    }

    #[test]
    fn test_review_consensus_both_pass() {
        let mut state = test_state(2);
        state.model_policy.review_consensus = true;
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                git_range: Some("abc..def".to_string()),
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                review_verdicts: vec![ReviewVerdict {
                    result: "pass".to_string(),
                    issues: vec![],
                }],
                ..PhaseState::default()
            },
        );
        let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        // Both pass -> advance to next phase
        assert!(matches!(action, Action::SpawnPlanner { .. }));
    }

    #[test]
    fn test_review_consensus_disagreement() {
        let mut state = test_state(2);
        state.model_policy.review_consensus = true;
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                git_range: Some("abc..def".to_string()),
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                review_verdicts: vec![ReviewVerdict {
                    result: "pass".to_string(),
                    issues: vec![],
                }],
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
        // Disagreement -> surface to user
        assert!(matches!(action, Action::ConsensusDisagreement { .. }));
    }

    #[test]
    fn test_review_consensus_both_gaps_merges_issues() {
        let mut state = test_state(2);
        state.model_policy.review_consensus = true;
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                git_range: Some("abc..def".to_string()),
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                review_verdicts: vec![ReviewVerdict {
                    result: "gaps".to_string(),
                    issues: vec!["missing tests".to_string()],
                }],
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::ReviewGaps {
                issues: vec!["error handling".to_string()],
            },
        )
        .unwrap();
        // Both gaps -> remediation with merged issues
        assert!(matches!(action, Action::Remediate { .. }));
        if let Action::Remediate { issues, .. } = &action {
            assert!(issues.contains(&"missing tests".to_string()));
            assert!(issues.contains(&"error handling".to_string()));
        }
    }

    #[test]
    fn test_review_no_consensus_mode_unchanged() {
        // Default state has review_consensus = false
        let mut state = test_state(2);
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
        // Without consensus, should go straight to next phase
        assert!(matches!(action, Action::SpawnPlanner { .. }));
        // No verdicts stored
        assert!(state.phases["1"].review_verdicts.is_empty());
    }

    // ====================================================================
    // Full Lifecycle Tests
    // ====================================================================

    #[test]
    fn test_full_lifecycle_single_phase() {
        let mut state = test_state(1);

        // 1) Fresh state -> SpawnValidator
        let action = next_action(&state).unwrap();
        assert!(matches!(action, Action::SpawnValidator { .. }));

        // 2) ValidationPass -> Planning phase 1
        let action =
            advance_state(&mut state, "validation", AdvanceEvent::ValidationPass).unwrap();
        assert!(matches!(action, Action::SpawnPlanner { ref phase, .. } if phase == "1"));
        assert_eq!(state.status, OrchestrationStatus::Planning);
        assert_eq!(state.phases["1"].status, PhaseStatus::Planning);

        // 3) PlanComplete -> SpawnExecutor
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan-1.md"),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::SpawnExecutor { ref phase, .. } if phase == "1"));
        assert_eq!(state.phases["1"].status, PhaseStatus::Planned);

        // 4) ExecuteStarted -> Wait
        let action = advance_state(&mut state, "1", AdvanceEvent::ExecuteStarted).unwrap();
        assert!(matches!(action, Action::Wait { .. }));
        assert_eq!(state.phases["1"].status, PhaseStatus::Executing);
        assert_eq!(state.status, OrchestrationStatus::Executing);

        // 5) ExecuteComplete -> SpawnReviewer
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::ExecuteComplete {
                git_range: "abc..def".to_string(),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::SpawnReviewer { ref phase, .. } if phase == "1"));
        assert_eq!(state.phases["1"].status, PhaseStatus::Reviewing);
        assert_eq!(state.status, OrchestrationStatus::Reviewing);

        // 6) ReviewPass on last phase -> Finalize + status=Complete
        let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        assert!(matches!(action, Action::Finalize));
        assert_eq!(state.status, OrchestrationStatus::Complete);
        assert_eq!(state.phases["1"].status, PhaseStatus::Complete);
        assert!(state.phases["1"].completed_at.is_some());
        assert!(state.phases["1"].breakdown.planning_mins.is_some());
        assert!(state.phases["1"].breakdown.execution_mins.is_some());
        assert!(state.phases["1"].breakdown.review_mins.is_some());

        // 7) After finalize, next_action -> Complete
        let action = next_action(&state).unwrap();
        assert!(matches!(action, Action::Complete));
    }

    #[test]
    fn test_full_lifecycle_multi_phase_plan_ahead_planner_first() {
        // Scenario: planner-2 finishes before reviewer-1 (plan-ahead)
        let mut state = test_state(2);

        // Validation
        let action =
            advance_state(&mut state, "validation", AdvanceEvent::ValidationPass).unwrap();
        assert!(matches!(action, Action::SpawnPlanner { ref phase, .. } if phase == "1"));

        // Phase 1: plan -> execute
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan-1.md"),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::SpawnExecutor { ref phase, .. } if phase == "1"));

        let action = advance_state(&mut state, "1", AdvanceEvent::ExecuteStarted).unwrap();
        assert!(matches!(action, Action::Wait { .. }));

        // ExecuteComplete triggers plan-ahead: reviewer-1 AND planner-2
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::ExecuteComplete {
                git_range: "abc..def".to_string(),
            },
        )
        .unwrap();
        match &action {
            Action::SpawnReviewer {
                phase, plan_ahead, ..
            } => {
                assert_eq!(phase, "1");
                let pa = plan_ahead.as_ref().expect("should have plan_ahead");
                assert_eq!(pa.phase, "2");
            }
            other => panic!("Expected SpawnReviewer with plan_ahead, got {:?}", other),
        }
        // Phase 2 entry created in Planning status by plan-ahead
        assert_eq!(state.phases["2"].status, PhaseStatus::Planning);

        // Planner-2 finishes first -> Wait (plan-ahead, previous review not done)
        let action = advance_state(
            &mut state,
            "2",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan-2.md"),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::Wait { .. }));
        assert_eq!(state.phases["2"].status, PhaseStatus::Planned);

        // ReviewPass on phase 1 -> skip planning, SpawnExecutor for phase 2
        let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        assert!(
            matches!(action, Action::SpawnExecutor { ref phase, .. } if phase == "2")
        );
        assert_eq!(state.status, OrchestrationStatus::Executing);
        assert_eq!(state.current_phase, 2);
        assert_eq!(state.phases["1"].status, PhaseStatus::Complete);

        // Phase 2: execute -> review
        let action = advance_state(&mut state, "2", AdvanceEvent::ExecuteStarted).unwrap();
        assert!(matches!(action, Action::Wait { .. }));

        let action = advance_state(
            &mut state,
            "2",
            AdvanceEvent::ExecuteComplete {
                git_range: "ghi..jkl".to_string(),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::SpawnReviewer { ref phase, .. } if phase == "2"));

        // ReviewPass on phase 2 (last) -> Finalize + Complete
        let action = advance_state(&mut state, "2", AdvanceEvent::ReviewPass).unwrap();
        assert!(matches!(action, Action::Finalize));
        assert_eq!(state.status, OrchestrationStatus::Complete);
        assert_eq!(state.phases["2"].status, PhaseStatus::Complete);

        let action = next_action(&state).unwrap();
        assert!(matches!(action, Action::Complete));
    }

    #[test]
    fn test_full_lifecycle_multi_phase_plan_ahead_reviewer_first() {
        // Scenario: reviewer-1 finishes before planner-2 (plan-ahead)
        let mut state = test_state(2);

        // Validation + Phase 1 plan + execute
        advance_state(&mut state, "validation", AdvanceEvent::ValidationPass).unwrap();
        advance_state(
            &mut state,
            "1",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan-1.md"),
            },
        )
        .unwrap();
        advance_state(&mut state, "1", AdvanceEvent::ExecuteStarted).unwrap();

        // ExecuteComplete triggers plan-ahead
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::ExecuteComplete {
                git_range: "abc..def".to_string(),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::SpawnReviewer { ref plan_ahead, .. } if plan_ahead.is_some()));

        // ReviewPass on phase 1 BEFORE planner-2 finishes -> Wait for planner
        let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        assert!(matches!(action, Action::Wait { .. }));
        assert_eq!(state.status, OrchestrationStatus::Planning);
        assert_eq!(state.phases["1"].status, PhaseStatus::Complete);
        assert_eq!(state.phases["2"].status, PhaseStatus::Planning);

        // Planner-2 finishes -> SpawnExecutor (previous review now complete)
        let action = advance_state(
            &mut state,
            "2",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan-2.md"),
            },
        )
        .unwrap();
        assert!(
            matches!(action, Action::SpawnExecutor { ref phase, .. } if phase == "2")
        );

        // Phase 2: execute -> review -> finalize
        advance_state(&mut state, "2", AdvanceEvent::ExecuteStarted).unwrap();
        advance_state(
            &mut state,
            "2",
            AdvanceEvent::ExecuteComplete {
                git_range: "ghi..jkl".to_string(),
            },
        )
        .unwrap();
        let action = advance_state(&mut state, "2", AdvanceEvent::ReviewPass).unwrap();
        assert!(matches!(action, Action::Finalize));
        assert_eq!(state.status, OrchestrationStatus::Complete);
    }

    #[test]
    fn test_full_lifecycle_with_remediation() {
        let mut state = test_state(1);

        // Validation + Plan + Execute
        advance_state(&mut state, "validation", AdvanceEvent::ValidationPass).unwrap();
        advance_state(
            &mut state,
            "1",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan-1.md"),
            },
        )
        .unwrap();
        advance_state(&mut state, "1", AdvanceEvent::ExecuteStarted).unwrap();
        advance_state(
            &mut state,
            "1",
            AdvanceEvent::ExecuteComplete {
                git_range: "abc..def".to_string(),
            },
        )
        .unwrap();

        // Review finds gaps -> remediation phase 1.5
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
                ref phase,
                ref remediation_phase,
                ..
            } if phase == "1" && remediation_phase == "1.5"
        ));
        assert_eq!(state.phases["1"].status, PhaseStatus::Complete);
        assert_eq!(state.phases["1.5"].status, PhaseStatus::Planning);

        // Remediation phase 1.5: plan -> execute -> review pass
        let action = advance_state(
            &mut state,
            "1.5",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan-1.5.md"),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::SpawnExecutor { ref phase, .. } if phase == "1.5"));

        advance_state(&mut state, "1.5", AdvanceEvent::ExecuteStarted).unwrap();

        advance_state(
            &mut state,
            "1.5",
            AdvanceEvent::ExecuteComplete {
                git_range: "def..ghi".to_string(),
            },
        )
        .unwrap();

        // ReviewPass on remediation of last phase -> Finalize + Complete
        let action = advance_state(&mut state, "1.5", AdvanceEvent::ReviewPass).unwrap();
        assert!(matches!(action, Action::Finalize));
        assert_eq!(state.status, OrchestrationStatus::Complete);
        assert_eq!(state.phases["1.5"].status, PhaseStatus::Complete);

        let action = next_action(&state).unwrap();
        assert!(matches!(action, Action::Complete));
    }

    #[test]
    fn test_next_action_matches_advance_state_throughout_lifecycle() {
        // Verify that next_action and advance_state agree at each step
        let mut state = test_state(1);

        // Before validation: next_action says SpawnValidator
        let na = next_action(&state).unwrap();
        assert!(matches!(na, Action::SpawnValidator { .. }));

        // Advance through validation
        advance_state(&mut state, "validation", AdvanceEvent::ValidationPass).unwrap();

        // After validation, next_action should say SpawnPlanner for phase 1
        // (but phase is already in Planning from advance_state)
        let na = next_action(&state).unwrap();
        assert!(matches!(na, Action::SpawnPlanner { ref phase, .. } if phase == "1"));

        // Plan complete
        advance_state(
            &mut state,
            "1",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan.md"),
            },
        )
        .unwrap();
        let na = next_action(&state).unwrap();
        assert!(matches!(na, Action::SpawnExecutor { ref phase, .. } if phase == "1"));

        // Execute started
        advance_state(&mut state, "1", AdvanceEvent::ExecuteStarted).unwrap();
        let na = next_action(&state).unwrap();
        assert!(matches!(na, Action::Wait { .. }));

        // Execute complete
        advance_state(
            &mut state,
            "1",
            AdvanceEvent::ExecuteComplete {
                git_range: "a..b".to_string(),
            },
        )
        .unwrap();
        let na = next_action(&state).unwrap();
        assert!(matches!(na, Action::SpawnReviewer { ref phase, .. } if phase == "1"));

        // Review pass (last phase)
        advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        let na = next_action(&state).unwrap();
        assert!(matches!(na, Action::Complete));
    }

    #[test]
    fn test_convex_sync_fields_correct_at_completion() {
        // Verify the state has all the fields needed for Convex sync
        let mut state = test_state(1);

        advance_state(&mut state, "validation", AdvanceEvent::ValidationPass).unwrap();
        advance_state(
            &mut state,
            "1",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan.md"),
            },
        )
        .unwrap();
        advance_state(&mut state, "1", AdvanceEvent::ExecuteStarted).unwrap();
        advance_state(
            &mut state,
            "1",
            AdvanceEvent::ExecuteComplete {
                git_range: "a..b".to_string(),
            },
        )
        .unwrap();
        advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();

        // Verify fields sync_to_convex relies on
        assert_eq!(state.status, OrchestrationStatus::Complete);
        assert_eq!(state.current_phase, 1);
        assert_eq!(state.total_phases, 1);

        let phase = &state.phases["1"];
        assert_eq!(phase.status, PhaseStatus::Complete);
        assert!(phase.plan_path.is_some());
        assert!(phase.git_range.is_some());
        assert!(phase.planning_started_at.is_some());
        assert!(phase.execution_started_at.is_some());
        assert!(phase.review_started_at.is_some());
        assert!(phase.completed_at.is_some());
        assert!(phase.duration_mins.is_some());
        assert!(phase.breakdown.planning_mins.is_some());
        assert!(phase.breakdown.execution_mins.is_some());
        assert!(phase.breakdown.review_mins.is_some());
    }

    #[test]
    fn test_error_recovery_then_complete() {
        // Full lifecycle with an error + retry in the middle
        let mut state = test_state(1);

        advance_state(&mut state, "validation", AdvanceEvent::ValidationPass).unwrap();
        advance_state(
            &mut state,
            "1",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan.md"),
            },
        )
        .unwrap();
        advance_state(&mut state, "1", AdvanceEvent::ExecuteStarted).unwrap();

        // Error during execution
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::Error {
                reason: "session crashed".to_string(),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::Error { can_retry: true, .. }));
        assert_eq!(state.status, OrchestrationStatus::Blocked);
        assert_eq!(state.phases["1"].status, PhaseStatus::Blocked);

        // Retry - has plan_path but no git_range, so re-executes
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::Retry {
                reason: "manual".to_string(),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::SpawnExecutor { ref phase, .. } if phase == "1"));
        assert_eq!(state.status, OrchestrationStatus::Executing);

        // Complete execution and review
        advance_state(
            &mut state,
            "1",
            AdvanceEvent::ExecuteComplete {
                git_range: "a..b".to_string(),
            },
        )
        .unwrap();
        let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        assert!(matches!(action, Action::Finalize));
        assert_eq!(state.status, OrchestrationStatus::Complete);
    }

    // ====================================================================
    // Plan-Ahead Tests
    // ====================================================================

    #[test]
    fn test_plan_ahead_execute_complete_includes_plan_ahead() {
        // ExecuteComplete on phase 1 of a 2-phase orchestration should
        // include plan_ahead for phase 2
        let mut state = test_state(2);
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
        match &action {
            Action::SpawnReviewer { plan_ahead, .. } => {
                let pa = plan_ahead.as_ref().expect("should have plan_ahead");
                assert_eq!(pa.phase, "2");
            }
            other => panic!("Expected SpawnReviewer, got {:?}", other),
        }
        // Phase 2 entry should be created in Planning status
        assert!(state.phases.contains_key("2"));
        assert_eq!(state.phases["2"].status, PhaseStatus::Planning);
    }

    #[test]
    fn test_plan_ahead_not_on_last_phase() {
        // ExecuteComplete on the LAST phase should NOT include plan_ahead
        let mut state = test_state(1);
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
        match &action {
            Action::SpawnReviewer { plan_ahead, .. } => {
                assert!(plan_ahead.is_none(), "last phase should not have plan_ahead");
            }
            other => panic!("Expected SpawnReviewer, got {:?}", other),
        }
    }

    #[test]
    fn test_plan_ahead_not_on_remediation_phase() {
        // ExecuteComplete on a remediation phase should NOT include plan_ahead
        let mut state = test_state(2);
        state.phases.insert(
            "1.5".to_string(),
            PhaseState {
                status: PhaseStatus::Executing,
                execution_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "1.5",
            AdvanceEvent::ExecuteComplete {
                git_range: "abc..def".to_string(),
            },
        )
        .unwrap();
        match &action {
            Action::SpawnReviewer { plan_ahead, .. } => {
                assert!(
                    plan_ahead.is_none(),
                    "remediation phase should not have plan_ahead"
                );
            }
            other => panic!("Expected SpawnReviewer, got {:?}", other),
        }
    }

    #[test]
    fn test_plan_ahead_not_when_next_phase_exists() {
        // If next phase already exists in state, plan_ahead should be None
        let mut state = test_state(2);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Executing,
                execution_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        // Phase 2 already exists (e.g. from a previous attempt)
        state
            .phases
            .insert("2".to_string(), PhaseState::new());
        let action = advance_state(
            &mut state,
            "1",
            AdvanceEvent::ExecuteComplete {
                git_range: "abc..def".to_string(),
            },
        )
        .unwrap();
        match &action {
            Action::SpawnReviewer { plan_ahead, .. } => {
                assert!(plan_ahead.is_none(), "should not plan_ahead when next phase exists");
            }
            other => panic!("Expected SpawnReviewer, got {:?}", other),
        }
    }

    #[test]
    fn test_plan_ahead_plan_complete_waits_when_prev_reviewing() {
        // When plan-ahead produces a plan but the previous phase is still reviewing,
        // PlanComplete should return Wait
        let mut state = test_state(2);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                review_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        state.phases.insert(
            "2".to_string(),
            PhaseState {
                status: PhaseStatus::Planning,
                planning_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "2",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan-2.md"),
            },
        )
        .unwrap();
        assert!(matches!(action, Action::Wait { .. }));
        assert_eq!(state.phases["2"].status, PhaseStatus::Planned);
    }

    #[test]
    fn test_plan_ahead_plan_complete_executes_when_prev_complete() {
        // When plan-ahead produces a plan and the previous phase is already complete,
        // PlanComplete should return SpawnExecutor (no longer plan-ahead)
        let mut state = test_state(2);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Complete,
                completed_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        state.phases.insert(
            "2".to_string(),
            PhaseState {
                status: PhaseStatus::Planning,
                planning_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(
            &mut state,
            "2",
            AdvanceEvent::PlanComplete {
                plan_path: PathBuf::from("/tmp/plan-2.md"),
            },
        )
        .unwrap();
        assert!(
            matches!(action, Action::SpawnExecutor { ref phase, .. } if phase == "2")
        );
    }

    #[test]
    fn test_plan_ahead_review_pass_skips_planning_when_planned() {
        // When review passes and next phase is already Planned (plan-ahead completed),
        // should skip to SpawnExecutor
        let mut state = test_state(2);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        state.phases.insert(
            "2".to_string(),
            PhaseState {
                status: PhaseStatus::Planned,
                plan_path: Some(PathBuf::from("/tmp/plan-2.md")),
                planning_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        assert!(
            matches!(action, Action::SpawnExecutor { ref phase, ref plan_path, .. } if phase == "2" && plan_path == "/tmp/plan-2.md")
        );
        assert_eq!(state.status, OrchestrationStatus::Executing);
    }

    #[test]
    fn test_plan_ahead_review_pass_waits_when_planning() {
        // When review passes and next phase is still Planning (plan-ahead in progress),
        // should return Wait
        let mut state = test_state(2);
        state.phases.insert(
            "1".to_string(),
            PhaseState {
                status: PhaseStatus::Reviewing,
                planning_started_at: Some(Utc::now()),
                review_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        state.phases.insert(
            "2".to_string(),
            PhaseState {
                status: PhaseStatus::Planning,
                planning_started_at: Some(Utc::now()),
                ..PhaseState::default()
            },
        );
        let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
        assert!(matches!(action, Action::Wait { .. }));
        assert_eq!(state.status, OrchestrationStatus::Planning);
        assert_eq!(state.phases["1"].status, PhaseStatus::Complete);
    }

    #[test]
    fn test_plan_ahead_serialization() {
        // PlanAhead struct should serialize correctly in SpawnReviewer action JSON
        let action = Action::SpawnReviewer {
            phase: "1".to_string(),
            git_range: "abc..def".to_string(),
            model: None,
            secondary_model: None,
            plan_ahead: Some(PlanAhead {
                phase: "2".to_string(),
                model: None,
            }),
        };
        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("plan_ahead"));
        assert!(json.contains("\"phase\":\"2\""));

        // Without plan_ahead, it should be omitted
        let action = Action::SpawnReviewer {
            phase: "1".to_string(),
            git_range: "abc..def".to_string(),
            model: None,
            secondary_model: None,
            plan_ahead: None,
        };
        let json = serde_json::to_string(&action).unwrap();
        assert!(!json.contains("plan_ahead"));
    }
}
