use std::path::Path;

use chrono::Utc;

use tina_session::session::lookup::SessionLookup;
use tina_session::state::schema::{PhaseStatus, SupervisorState, OrchestrationStatus, PhaseState};
use tina_session::state::transitions::validate_transition;
use tina_session::state::timing::duration_mins;

pub fn update(
    feature: &str,
    phase: u32,
    status: &str,
    plan_path: Option<&Path>,
) -> anyhow::Result<u8> {
    let lookup = SessionLookup::load(feature)?;
    let mut state = SupervisorState::load(&lookup.cwd)?;

    let new_status: PhaseStatus = status.parse()?;

    // Get current status for validation
    let current_status = state
        .phases
        .get(&phase.to_string())
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
    state.current_phase = phase;

    // Update orchestration status if needed
    if let Some(orch_status) = new_orch_status {
        state.status = orch_status;
    }

    state.save()?;

    println!("Updated phase {} status to '{}'", phase, new_status);
    Ok(0)
}

pub fn phase_complete(feature: &str, phase: u32, git_range: &str) -> anyhow::Result<u8> {
    let lookup = SessionLookup::load(feature)?;
    let mut state = SupervisorState::load(&lookup.cwd)?;

    // Validate phase exists
    if phase > state.total_phases {
        anyhow::bail!("Phase {} does not exist (total phases: {})", phase, state.total_phases);
    }

    // Get current status for validation
    let current_status = state
        .phases
        .get(&phase.to_string())
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

    // Update orchestration status
    if phase == state.total_phases {
        state.status = OrchestrationStatus::Complete;
    } else {
        state.current_phase = phase + 1;
        state.status = OrchestrationStatus::Planning;
    }

    state.save()?;

    println!("Phase {} complete. Git range: {}", phase, git_range);
    Ok(0)
}

pub fn blocked(feature: &str, phase: u32, reason: &str) -> anyhow::Result<u8> {
    let lookup = SessionLookup::load(feature)?;
    let mut state = SupervisorState::load(&lookup.cwd)?;

    // Validate phase exists
    if phase > state.total_phases {
        anyhow::bail!("Phase {} does not exist (total phases: {})", phase, state.total_phases);
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

    println!("Phase {} blocked: {}", phase, reason);
    Ok(0)
}

pub fn show(feature: &str, phase: Option<u32>, json: bool) -> anyhow::Result<u8> {
    let lookup = SessionLookup::load(feature)?;
    let state = SupervisorState::load(&lookup.cwd)?;

    if json {
        if let Some(phase_num) = phase {
            if phase_num > state.total_phases {
                anyhow::bail!("Phase {} does not exist (total phases: {})", phase_num, state.total_phases);
            }
            let key = phase_num.to_string();
            if let Some(phase_state) = state.phases.get(&key) {
                println!("{}", serde_json::to_string_pretty(phase_state)?);
            } else {
                println!("{{}}");
            }
        } else {
            println!("{}", serde_json::to_string_pretty(&state)?);
        }
    } else if let Some(phase_num) = phase {
        if phase_num > state.total_phases {
            anyhow::bail!("Phase {} does not exist (total phases: {})", phase_num, state.total_phases);
        }
        let key = phase_num.to_string();
        if let Some(phase_state) = state.phases.get(&key) {
            println!("Phase {}", phase_num);
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
            println!("Phase {} (not started)", phase_num);
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
    }

    Ok(0)
}
