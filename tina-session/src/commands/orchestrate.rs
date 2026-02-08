use std::path::Path;

use tina_session::state::orchestrate::{advance_state, next_action, Action, AdvanceEvent};

use tina_session::convex;

/// Determine the next action to take based on current orchestration state.
pub fn next(feature: &str) -> anyhow::Result<u8> {
    let state = tina_session::state::schema::SupervisorState::load(feature)?;

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
    let mut state = tina_session::state::schema::SupervisorState::load(feature)?;

    let event = parse_event(event, plan_path, git_range, issues)?;
    let action = advance_state(&mut state, phase, event.clone())?;

    state.save()?;

    // Sync to Convex (non-fatal)
    if let Err(e) = sync_to_convex(feature, &state, phase, &action, Some(&event)) {
        eprintln!("Warning: Failed to sync to Convex: {}", e);
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
        "execute_started" => Ok(AdvanceEvent::ExecuteStarted),
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
        "retry" => {
            let reason = issues.unwrap_or("manual retry");
            Ok(AdvanceEvent::Retry {
                reason: reason.to_string(),
            })
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
             execute_started, review_pass, review_gaps, retry, validation_pass, \
             validation_warning, validation_stop, error",
            event
        ),
    }
}

fn sync_to_convex(
    feature: &str,
    state: &tina_session::state::schema::SupervisorState,
    phase: &str,
    action: &Action,
    event: Option<&AdvanceEvent>,
) -> anyhow::Result<()> {
    use tina_session::state::schema::OrchestrationStatus;

    let status_str = match state.status {
        OrchestrationStatus::Planning => "planning",
        OrchestrationStatus::Executing => "executing",
        OrchestrationStatus::Reviewing => "reviewing",
        OrchestrationStatus::Complete => "complete",
        OrchestrationStatus::Blocked => "blocked",
    };

    let mut orch = convex::OrchestrationArgs {
        node_id: String::new(), // filled by writer
        project_id: None,
        feature_name: feature.to_string(),
        design_doc_path: state.design_doc.to_string_lossy().to_string(),
        branch: state.branch.clone(),
        worktree_path: Some(state.worktree_path.to_string_lossy().to_string()),
        total_phases: state.total_phases as f64,
        current_phase: state.current_phase as f64,
        status: status_str.to_string(),
        started_at: state.orchestration_started_at.to_rfc3339(),
        completed_at: None,
        total_elapsed_mins: None,
    };

    let phase_args_list: Vec<_> = state
        .phases
        .iter()
        .map(|(k, ps)| convex::PhaseArgs {
            orchestration_id: String::new(), // filled after upsert
            phase_number: k.clone(),
            status: ps.status.to_string(),
            plan_path: ps.plan_path.as_ref().map(|p| p.to_string_lossy().to_string()),
            git_range: ps.git_range.clone(),
            planning_mins: ps.breakdown.planning_mins.map(|m| m as f64),
            execution_mins: ps.breakdown.execution_mins.map(|m| m as f64),
            review_mins: ps.breakdown.review_mins.map(|m| m as f64),
            started_at: ps.planning_started_at.map(|dt| dt.to_rfc3339()),
            completed_at: ps.completed_at.map(|dt| dt.to_rfc3339()),
        })
        .collect();

    let (event_type, summary, detail) = event_from_action(phase, action, event);
    let phase_number = if phase == "validation" {
        None
    } else {
        Some(phase.to_string())
    };

    convex::run_convex_write(|mut writer| async move {
        orch.node_id = writer.node_id().to_string();
        let orch_id = writer.upsert_orchestration(&orch).await?;

        for mut pa in phase_args_list {
            pa.orchestration_id = orch_id.clone();
            writer.upsert_phase(&pa).await?;
        }

        let event = convex::EventArgs {
            orchestration_id: orch_id,
            phase_number,
            event_type,
            source: "tina-session orchestrate".to_string(),
            summary,
            detail,
            recorded_at: chrono::Utc::now().to_rfc3339(),
        };
        writer.record_event(&event).await?;

        Ok(())
    })
}

fn event_from_action(
    phase: &str,
    action: &Action,
    event: Option<&AdvanceEvent>,
) -> (String, String, Option<String>) {
    if let Some(AdvanceEvent::Retry { reason }) = event {
        return (
            "retry".to_string(),
            format!("Phase {} retry requested", phase),
            Some(serde_json::json!({"reason": reason}).to_string()),
        );
    }

    match action {
        Action::SpawnValidator { .. } => (
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
        Action::SpawnExecutor { phase: p, plan_path, .. } => (
            "phase_completed".to_string(),
            format!("Phase {} planning completed", p),
            Some(serde_json::json!({"plan_path": plan_path}).to_string()),
        ),
        Action::ReusePlan { phase: p, plan_path } => (
            "phase_completed".to_string(),
            format!("Phase {} planning completed (reused plan)", p),
            Some(serde_json::json!({"plan_path": plan_path}).to_string()),
        ),
        Action::SpawnReviewer { phase: p, git_range, .. } => (
            "phase_completed".to_string(),
            format!("Phase {} execution completed", p),
            Some(serde_json::json!({"git_range": git_range}).to_string()),
        ),
        Action::SpawnPlanner { phase: p, .. } => (
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
        Action::ConsensusDisagreement { phase: p, verdict_1, verdict_2, issues } => (
            "error".to_string(),
            format!("Phase {} review consensus disagreement", p),
            Some(serde_json::json!({"verdict_1": verdict_1, "verdict_2": verdict_2, "issues": issues}).to_string()),
        ),
        Action::Wait { reason } => (
            "info".to_string(),
            format!("Waiting: {}", reason),
            None,
        ),
    }
}
