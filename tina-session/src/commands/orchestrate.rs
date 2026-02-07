use std::path::Path;

use tina_session::db::orchestration_events::OrchestrationEvent;
use tina_session::session::lookup::SessionLookup;
use tina_session::state::orchestrate::{advance_state, next_action, Action, AdvanceEvent};

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
    if let Err(e) = sync_to_sqlite(feature, &state, phase, &action) {
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
    phase: &str,
    action: &Action,
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

    // Record orchestration event
    let (event_type, summary, detail) = event_from_action(phase, action);
    let event = OrchestrationEvent {
        id: None,
        orchestration_id: orch.id.clone(),
        phase_number: if phase == "validation" { None } else { Some(phase.to_string()) },
        event_type,
        source: "tina-session orchestrate".to_string(),
        summary,
        detail,
        recorded_at: chrono::Utc::now().to_rfc3339(),
    };
    tina_session::db::orchestration_events::insert(&conn, &event)?;

    Ok(())
}

fn event_from_action(phase: &str, action: &Action) -> (String, String, Option<String>) {
    match action {
        Action::SpawnValidator => (
            "phase_started".to_string(),
            "Design validation requested".to_string(),
            None,
        ),
        Action::SpawnPlanner { .. } if phase == "validation" => (
            "phase_started".to_string(),
            "Design validation passed".to_string(),
            None,
        ),
        Action::ReusePlan { phase: p, plan_path } if phase == "validation" => (
            "phase_started".to_string(),
            "Design validation passed with warnings".to_string(),
            Some(serde_json::json!({"plan_path": plan_path, "phase": p}).to_string()),
        ),
        Action::Stopped { reason } => (
            "error".to_string(),
            format!("Design validation failed - {}", reason),
            None,
        ),
        Action::SpawnExecutor { phase: p, plan_path } => (
            "phase_completed".to_string(),
            format!("Phase {} planning completed", p),
            Some(serde_json::json!({"plan_path": plan_path}).to_string()),
        ),
        Action::ReusePlan { phase: p, plan_path } => (
            "phase_completed".to_string(),
            format!("Phase {} planning completed (reused plan)", p),
            Some(serde_json::json!({"plan_path": plan_path}).to_string()),
        ),
        Action::SpawnReviewer { phase: p, git_range } => (
            "phase_completed".to_string(),
            format!("Phase {} execution completed", p),
            Some(serde_json::json!({"git_range": git_range}).to_string()),
        ),
        Action::SpawnPlanner { phase: p } => (
            "phase_completed".to_string(),
            format!("Phase {} review passed", p),
            None,
        ),
        Action::Finalize => (
            "phase_completed".to_string(),
            format!("Phase {} review passed - all phases complete", phase),
            None,
        ),
        Action::Complete => (
            "phase_completed".to_string(),
            "Orchestration complete".to_string(),
            None,
        ),
        Action::Remediate { phase: p, remediation_phase, issues } => (
            "retry".to_string(),
            format!("Phase {} review found gaps", p),
            Some(serde_json::json!({"remediation_phase": remediation_phase, "issues": issues}).to_string()),
        ),
        Action::Error { phase: p, reason, retry_count, can_retry } => (
            "error".to_string(),
            format!("Phase {} error: {}", p, reason),
            Some(serde_json::json!({"retry_count": retry_count, "can_retry": can_retry}).to_string()),
        ),
    }
}
