use std::path::Path;

use tina_session::session::lookup::SessionLookup;
use tina_session::state::orchestrate::{advance_state, next_action, AdvanceEvent};

/// Determine the next action to take based on current orchestration state.
pub fn next(feature: &str) -> anyhow::Result<u8> {
    let lookup = SessionLookup::load(feature)?;
    let state = tina_session::state::schema::SupervisorState::load(&lookup.cwd)?;

    let action = next_action(&state)?;
    println!("{}", serde_json::to_string(&action)?);
    Ok(0)
}

/// Record a phase event and return the next action.
pub fn advance(
    feature: &str,
    phase: &str,
    event: &str,
    plan_path: Option<&Path>,
    git_range: Option<&str>,
    issues: Option<&str>,
) -> anyhow::Result<u8> {
    let lookup = SessionLookup::load(feature)?;
    let mut state = tina_session::state::schema::SupervisorState::load(&lookup.cwd)?;

    let event = parse_event(event, plan_path, git_range, issues)?;
    let action = advance_state(&mut state, phase, event)?;

    state.save()?;

    // Sync to SQLite (non-fatal)
    if let Err(e) = sync_to_sqlite(feature, &state) {
        eprintln!("Warning: Failed to sync to SQLite: {}", e);
    }

    println!("{}", serde_json::to_string(&action)?);
    Ok(0)
}

fn parse_event(
    event: &str,
    plan_path: Option<&Path>,
    git_range: Option<&str>,
    issues: Option<&str>,
) -> anyhow::Result<AdvanceEvent> {
    match event {
        "plan_complete" => {
            let path = plan_path
                .ok_or_else(|| anyhow::anyhow!("--plan-path is required for plan_complete event"))?;
            Ok(AdvanceEvent::PlanComplete {
                plan_path: path.to_path_buf(),
            })
        }
        "execute_complete" => {
            let range = git_range
                .ok_or_else(|| anyhow::anyhow!("--git-range is required for execute_complete event"))?;
            Ok(AdvanceEvent::ExecuteComplete {
                git_range: range.to_string(),
            })
        }
        "review_pass" => Ok(AdvanceEvent::ReviewPass),
        "review_gaps" => {
            let issues_str = issues.unwrap_or("");
            let issue_list: Vec<String> = if issues_str.is_empty() {
                vec![]
            } else {
                issues_str.split(',').map(|s| s.trim().to_string()).collect()
            };
            Ok(AdvanceEvent::ReviewGaps { issues: issue_list })
        }
        "validation_pass" => Ok(AdvanceEvent::ValidationPass),
        "validation_warning" => Ok(AdvanceEvent::ValidationWarning),
        "validation_stop" => Ok(AdvanceEvent::ValidationStop),
        "error" => {
            let reason = issues.unwrap_or("unknown error");
            Ok(AdvanceEvent::Error {
                reason: reason.to_string(),
            })
        }
        _ => anyhow::bail!(
            "Unknown event '{}'. Valid events: plan_complete, execute_complete, \
             review_pass, review_gaps, validation_pass, validation_warning, \
             validation_stop, error",
            event
        ),
    }
}

fn sync_to_sqlite(
    feature: &str,
    state: &tina_session::state::schema::SupervisorState,
) -> anyhow::Result<()> {
    let db_path = tina_session::db::default_db_path();
    let conn = tina_session::db::open_or_create(&db_path)?;
    tina_session::db::migrations::migrate(&conn)?;

    let orch = match tina_session::db::orchestrations::find_by_feature(&conn, feature)? {
        Some(o) => o,
        None => return Ok(()),
    };

    // Update orchestration status
    let status_str = match state.status {
        tina_session::state::schema::OrchestrationStatus::Planning => "planning",
        tina_session::state::schema::OrchestrationStatus::Executing => "executing",
        tina_session::state::schema::OrchestrationStatus::Reviewing => "reviewing",
        tina_session::state::schema::OrchestrationStatus::Complete => "complete",
        tina_session::state::schema::OrchestrationStatus::Blocked => "blocked",
    };
    tina_session::db::orchestrations::update_status(&conn, &orch.id, status_str)?;

    // Upsert all phase records
    for (phase_key, phase_state) in &state.phases {
        let db_phase = tina_session::db::phases::Phase {
            id: None,
            orchestration_id: orch.id.clone(),
            phase_number: phase_key.clone(),
            status: phase_state.status.to_string(),
            plan_path: phase_state
                .plan_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            git_range: phase_state.git_range.clone(),
            planning_mins: phase_state.breakdown.planning_mins.map(|m| m as i32),
            execution_mins: phase_state.breakdown.execution_mins.map(|m| m as i32),
            review_mins: phase_state.breakdown.review_mins.map(|m| m as i32),
            started_at: phase_state
                .planning_started_at
                .map(|dt| dt.to_rfc3339()),
            completed_at: phase_state.completed_at.map(|dt| dt.to_rfc3339()),
        };
        tina_session::db::phases::upsert(&conn, &db_phase)?;
    }

    Ok(())
}
