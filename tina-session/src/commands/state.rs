use std::path::Path;

use chrono::Utc;

use tina_session::state::schema::{OrchestrationStatus, PhaseState, PhaseStatus, SupervisorState};
use tina_session::state::timing::duration_mins;
use tina_session::state::transitions::validate_transition;

use crate::commands::state_sync::{orchestration_args_from_state, phase_args_from_state};
use tina_session::convex;

pub fn update(
    feature: &str,
    phase: &str,
    status: &str,
    plan_path: Option<&Path>,
) -> anyhow::Result<u8> {
    let mut state = SupervisorState::load(feature)?;

    let new_status: PhaseStatus = status.parse()?;

    // Get current status for validation
    let current_status = state
        .phases
        .get(phase)
        .map(|p| p.status)
        .unwrap_or(PhaseStatus::Planning);

    // Validate transition
    validate_transition(current_status, new_status)?;

    // Determine new orchestration status
    let new_orch_status = match new_status {
        PhaseStatus::Executing => Some(OrchestrationStatus::Executing),
        PhaseStatus::Reviewing => Some(OrchestrationStatus::Reviewing),
        PhaseStatus::Complete => {
            anyhow::bail!("Use 'state phase-complete' to mark a phase complete");
        }
        PhaseStatus::Blocked => {
            anyhow::bail!("Use 'state blocked' to mark a phase blocked");
        }
        _ => None,
    };

    // Now get mutable reference to phase state
    let key = phase.to_string();
    if !state.phases.contains_key(&key) {
        state.phases.insert(key.clone(), PhaseState::new());
    }
    let phase_state = state.phases.get_mut(&key).unwrap();

    // Record timestamp based on transition
    let now = Utc::now();
    match new_status {
        PhaseStatus::Planning => {
            phase_state.planning_started_at = Some(now);
        }
        PhaseStatus::Planned => {
            if let Some(start) = phase_state.planning_started_at {
                phase_state.breakdown.planning_mins = Some(duration_mins(start, now));
            }
            if let Some(path) = plan_path {
                phase_state.plan_path = Some(path.to_path_buf());
            }
        }
        PhaseStatus::Executing => {
            phase_state.execution_started_at = Some(now);
        }
        PhaseStatus::Reviewing => {
            if let Some(start) = phase_state.execution_started_at {
                phase_state.breakdown.execution_mins = Some(duration_mins(start, now));
            }
            phase_state.review_started_at = Some(now);
        }
        _ => {}
    }

    phase_state.status = new_status;

    // Update current_phase only for integer phases
    if let Ok(phase_num) = phase.parse::<u32>() {
        state.current_phase = phase_num;
    }

    // Update orchestration status if needed
    if let Some(orch_status) = new_orch_status {
        state.status = orch_status;
    }

    state.save()?;

    // Write phase update to Convex (non-fatal)
    if let Err(e) = upsert_phase_to_convex(feature, phase, &state) {
        eprintln!("Warning: Failed to write phase to Convex: {}", e);
    }

    println!("Updated phase {} status to '{}'", phase, new_status);
    Ok(0)
}

pub fn phase_complete(feature: &str, phase: &str, git_range: &str) -> anyhow::Result<u8> {
    let mut state = SupervisorState::load(feature)?;

    // Validate integer phases against total_phases
    let phase_num = phase.parse::<u32>().ok();
    if let Some(num) = phase_num {
        if num > state.total_phases {
            anyhow::bail!(
                "Phase {} does not exist (total phases: {}).\n\
                 \n\
                 Valid phases: 1-{}\n\
                 Remediation phases (e.g., 1.5, 2.5) are created dynamically.",
                num,
                state.total_phases,
                state.total_phases
            );
        }
    }

    // Get current status for validation
    let current_status = state
        .phases
        .get(phase)
        .map(|p| p.status)
        .unwrap_or(PhaseStatus::Planning);

    // Must be in reviewing to complete
    if current_status != PhaseStatus::Reviewing {
        validate_transition(current_status, PhaseStatus::Complete)?;
    }

    let now = Utc::now();

    // Get mutable reference to phase state
    let key = phase.to_string();
    if !state.phases.contains_key(&key) {
        state.phases.insert(key.clone(), PhaseState::new());
    }
    let phase_state = state.phases.get_mut(&key).unwrap();

    // Calculate review duration
    if let Some(start) = phase_state.review_started_at {
        phase_state.breakdown.review_mins = Some(duration_mins(start, now));
    }

    // Calculate total duration
    if let Some(start) = phase_state.planning_started_at {
        phase_state.duration_mins = Some(duration_mins(start, now));
    }

    phase_state.status = PhaseStatus::Complete;
    phase_state.completed_at = Some(now);
    phase_state.git_range = Some(git_range.to_string());

    // Update orchestration status (only for integer phases)
    if let Some(num) = phase_num {
        if num == state.total_phases {
            state.status = OrchestrationStatus::Complete;
        } else {
            state.current_phase = num + 1;
            state.status = OrchestrationStatus::Planning;
        }
    }

    state.save()?;

    // Write phase completion and orchestration status to Convex (non-fatal)
    if let Err(e) = sync_state_to_convex(feature, phase, &state) {
        eprintln!("Warning: Failed to sync to Convex: {}", e);
    }

    println!("Phase {} complete. Git range: {}", phase, git_range);
    Ok(0)
}

pub fn blocked(feature: &str, phase: &str, reason: &str) -> anyhow::Result<u8> {
    let mut state = SupervisorState::load(feature)?;

    // Validate integer phases against total_phases
    if let Ok(phase_num) = phase.parse::<u32>() {
        if phase_num > state.total_phases {
            anyhow::bail!(
                "Phase {} does not exist (total phases: {}).\n\
                 \n\
                 Valid phases: 1-{}\n\
                 Remediation phases (e.g., 1.5, 2.5) are created dynamically.",
                phase_num,
                state.total_phases,
                state.total_phases
            );
        }
    }

    // Get mutable reference to phase state
    let key = phase.to_string();
    if !state.phases.contains_key(&key) {
        state.phases.insert(key.clone(), PhaseState::new());
    }
    let phase_state = state.phases.get_mut(&key).unwrap();

    phase_state.status = PhaseStatus::Blocked;
    phase_state.blocked_reason = Some(reason.to_string());
    state.status = OrchestrationStatus::Blocked;

    state.save()?;

    // Write blocked state to Convex (non-fatal)
    if let Err(e) = sync_state_to_convex(feature, phase, &state) {
        eprintln!("Warning: Failed to sync to Convex: {}", e);
    }

    println!("Phase {} blocked: {}", phase, reason);
    Ok(0)
}

fn upsert_phase_to_convex(
    feature: &str,
    phase: &str,
    state: &SupervisorState,
) -> anyhow::Result<()> {
    let phase_state = match state.phases.get(phase) {
        Some(ps) => ps,
        None => return Ok(()),
    };

    let mut orch = orchestration_args_from_state(feature, state);
    let mut phase_args = phase_args_from_state(phase, phase_state);

    convex::run_convex_write(|mut writer| async move {
        orch.node_id = writer.node_id().to_string();
        let orch_id = writer.upsert_orchestration(&orch).await?;
        phase_args.orchestration_id = orch_id;
        writer.upsert_phase(&phase_args).await?;
        Ok(())
    })
}

/// Sync both orchestration status and phase to Convex.
fn sync_state_to_convex(feature: &str, phase: &str, state: &SupervisorState) -> anyhow::Result<()> {
    let mut orch = orchestration_args_from_state(feature, state);
    let phase_args = state
        .phases
        .get(phase)
        .map(|phase_state| phase_args_from_state(phase, phase_state));

    convex::run_convex_write(|mut writer| async move {
        orch.node_id = writer.node_id().to_string();
        let orch_id = writer.upsert_orchestration(&orch).await?;

        if let Some(mut pa) = phase_args {
            pa.orchestration_id = orch_id;
            writer.upsert_phase(&pa).await?;
        }

        Ok(())
    })
}

pub fn show(feature: &str, phase: Option<&str>, json: bool) -> anyhow::Result<u8> {
    let state = SupervisorState::load(feature)?;

    if json {
        if let Some(phase_key) = phase {
            // Validate integer phases against total_phases
            if let Ok(phase_num) = phase_key.parse::<u32>() {
                if phase_num > state.total_phases {
                    anyhow::bail!(
                        "Phase {} does not exist (total phases: {}).\n\
                         \n\
                         Valid phases: 1-{}\n\
                         Remediation phases (e.g., 1.5, 2.5) are created dynamically.",
                        phase_num,
                        state.total_phases,
                        state.total_phases
                    );
                }
            }
            if let Some(phase_state) = state.phases.get(phase_key) {
                println!("{}", serde_json::to_string_pretty(phase_state)?);
            } else {
                println!("{{}}");
            }
        } else {
            println!("{}", serde_json::to_string_pretty(&state)?);
        }
    } else if let Some(phase_key) = phase {
        // Validate integer phases against total_phases
        if let Ok(phase_num) = phase_key.parse::<u32>() {
            if phase_num > state.total_phases {
                anyhow::bail!(
                    "Phase {} does not exist (total phases: {}).\n\
                     \n\
                     Valid phases: 1-{}\n\
                     Remediation phases (e.g., 1.5, 2.5) are created dynamically.",
                    phase_num,
                    state.total_phases,
                    state.total_phases
                );
            }
        }
        if let Some(phase_state) = state.phases.get(phase_key) {
            println!("Phase {}", phase_key);
            println!("  Status: {}", phase_state.status);
            if let Some(ref plan) = phase_state.plan_path {
                println!("  Plan: {}", plan.display());
            }
            if let Some(ref range) = phase_state.git_range {
                println!("  Git range: {}", range);
            }
            if let Some(ref reason) = phase_state.blocked_reason {
                println!("  Blocked: {}", reason);
            }
            if let Some(mins) = phase_state.duration_mins {
                println!("  Duration: {} mins", mins);
            }
        } else {
            println!("Phase {} (not started)", phase_key);
        }
    } else {
        println!("Orchestration: {}", state.feature);
        println!("  Design: {}", state.design_doc.display());
        println!("  Worktree: {}", state.worktree_path.display());
        println!("  Branch: {}", state.branch);
        println!("  Status: {:?}", state.status);
        println!("  Phase: {}/{}", state.current_phase, state.total_phases);
        println!();
        println!("Phases:");
        for i in 1..=state.total_phases {
            let key = i.to_string();
            if let Some(ps) = state.phases.get(&key) {
                let status_icon = match ps.status {
                    PhaseStatus::Complete => "✓",
                    PhaseStatus::Executing | PhaseStatus::Reviewing => "▶",
                    PhaseStatus::Blocked => "✗",
                    _ => "○",
                };
                println!("  {} Phase {}: {}", status_icon, i, ps.status);
            } else {
                println!("  ○ Phase {}: pending", i);
            }
        }
        // Also show remediation phases if any exist
        for key in state.phases.keys() {
            if key.contains('.') {
                if let Some(ps) = state.phases.get(key) {
                    let status_icon = match ps.status {
                        PhaseStatus::Complete => "✓",
                        PhaseStatus::Executing | PhaseStatus::Reviewing => "▶",
                        PhaseStatus::Blocked => "✗",
                        _ => "○",
                    };
                    println!(
                        "  {} Phase {} (remediation): {}",
                        status_icon, key, ps.status
                    );
                }
            }
        }
    }

    Ok(0)
}
