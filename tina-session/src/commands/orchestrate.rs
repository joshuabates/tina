use std::path::Path;

use tina_session::state::orchestrate::{advance_state, next_action, Action, AdvanceEvent};
use tina_session::telemetry::TelemetryContext;

use crate::commands::state_sync::{all_phase_args_from_state, orchestration_args_from_state};
use tina_session::convex;

/// Determine the next action to take based on current orchestration state.
pub fn next(feature: &str) -> anyhow::Result<u8> {
    let state = tina_session::state::schema::SupervisorState::load(feature)?;

    // Create telemetry context for this operation
    let ctx = TelemetryContext::new(
        "orchestrate.next",
        None, // orchestration_id will be set during sync
        Some(feature.to_string()),
        None,
    );

    let action = next_action(&state)?;

    // Record telemetry (best-effort)
    if let Err(e) = record_next_telemetry(&ctx, &state, &action) {
        eprintln!("Warning: Failed to record telemetry: {}", e);
    }

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

    // Create telemetry context for this operation
    let phase_number = if phase == "validation" {
        None
    } else {
        Some(phase.to_string())
    };
    let ctx = TelemetryContext::new(
        "orchestrate.advance",
        None, // orchestration_id will be set during sync
        Some(feature.to_string()),
        phase_number.clone(),
    );

    let event = parse_event(event, plan_path, git_range, issues)?;
    let action = advance_state(&mut state, phase, event.clone())?;

    state.save()?;

    // Sync to Convex and record telemetry (non-fatal)
    if let Err(e) = sync_to_convex_with_telemetry(&ctx, feature, &state, phase, &action, Some(&event)) {
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
            let path = plan_path.ok_or_else(|| {
                anyhow::anyhow!("--plan-path is required for plan_complete event")
            })?;
            Ok(AdvanceEvent::PlanComplete {
                plan_path: path.to_path_buf(),
            })
        }
        "execute_started" => Ok(AdvanceEvent::ExecuteStarted),
        "execute_complete" => {
            let range = git_range.ok_or_else(|| {
                anyhow::anyhow!("--git-range is required for execute_complete event")
            })?;
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
                issues_str
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .collect()
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

/// Record telemetry for next_action operation (best-effort).
fn record_next_telemetry(
    ctx: &TelemetryContext,
    state: &tina_session::state::schema::SupervisorState,
    action: &Action,
) -> anyhow::Result<()> {
    convex::run_convex_write(|mut writer| async move {
        // Get orchestration ID from Convex (or None if not yet created)
        let orchestration_id = writer
            .get_by_feature(&state.feature)
            .await?
            .map(|o| o.id);

        // Create a context with the resolved orchestration ID
        let ctx_with_id = if orchestration_id.is_some() {
            TelemetryContext::new(
                "orchestrate.next",
                orchestration_id.clone(),
                Some(state.feature.clone()),
                None,
            )
        } else {
            ctx.clone()
        };

        // Record span
        let status = match action {
            Action::Error { .. } | Action::Stopped { .. } | Action::ConsensusDisagreement { .. } => "error",
            _ => "ok",
        };
        ctx_with_id.record_span(&mut writer, status, None, None).await?;

        Ok(())
    })
}

/// Update model and/or review policy for future work.
pub fn set_policy(
    feature: &str,
    model_json: Option<&str>,
    review_json: Option<&str>,
) -> anyhow::Result<u8> {
    if model_json.is_none() && review_json.is_none() {
        anyhow::bail!("at least one of --model-json or --review-json is required");
    }

    let mut state = tina_session::state::schema::SupervisorState::load(feature)?;

    if let Some(json) = model_json {
        let patch: tina_session::state::schema::ModelPolicy = serde_json::from_str(json)
            .map_err(|e| anyhow::anyhow!("invalid model policy JSON: {}", e))?;
        state.model_policy = patch;
    }

    if let Some(json) = review_json {
        let patch: tina_session::state::schema::ReviewPolicy = serde_json::from_str(json)
            .map_err(|e| anyhow::anyhow!("invalid review policy JSON: {}", e))?;
        state.review_policy = patch;
    }

    state.save()?;

    let output = serde_json::json!({
        "success": true,
        "model_policy": state.model_policy,
        "review_policy": state.review_policy,
    });
    println!("{}", serde_json::to_string(&output)?);
    Ok(0)
}

/// Update the model for a single role.
pub fn set_role_model(feature: &str, role: &str, model: &str) -> anyhow::Result<u8> {
    let valid_roles = ["validator", "planner", "executor", "reviewer"];
    if !valid_roles.contains(&role) {
        anyhow::bail!(
            "invalid role: '{}'. Allowed: {}",
            role,
            valid_roles.join(", ")
        );
    }

    let valid_models = ["opus", "sonnet", "haiku"];
    if !valid_models.contains(&model) {
        anyhow::bail!(
            "invalid model: '{}'. Allowed: {}",
            model,
            valid_models.join(", ")
        );
    }

    let mut state = tina_session::state::schema::SupervisorState::load(feature)?;

    match role {
        "validator" => state.model_policy.validator = model.to_string(),
        "planner" => state.model_policy.planner = model.to_string(),
        "executor" => state.model_policy.executor = model.to_string(),
        "reviewer" => state.model_policy.reviewer = model.to_string(),
        _ => unreachable!(),
    }

    state.save()?;

    let output = serde_json::json!({
        "success": true,
        "role": role,
        "model": model,
        "model_policy": state.model_policy,
    });
    println!("{}", serde_json::to_string(&output)?);
    Ok(0)
}

/// Acknowledge a task edit (mutation already applied in Convex).
pub fn task_edit(
    feature: &str,
    phase: &str,
    task_number: u32,
    revision: u32,
    subject: Option<&str>,
    description: Option<&str>,
    model: Option<&str>,
) -> anyhow::Result<u8> {
    let output = serde_json::json!({
        "success": true,
        "action": "task_edit",
        "feature": feature,
        "phase": phase,
        "task_number": task_number,
        "revision": revision,
        "subject": subject,
        "description": description,
        "model": model,
    });
    println!("{}", serde_json::to_string(&output)?);
    Ok(0)
}

/// Acknowledge a task insertion (mutation already applied in Convex).
pub fn task_insert(
    feature: &str,
    phase: &str,
    after_task: u32,
    subject: &str,
    model: Option<&str>,
    depends_on: Option<&str>,
) -> anyhow::Result<u8> {
    let output = serde_json::json!({
        "success": true,
        "action": "task_insert",
        "feature": feature,
        "phase": phase,
        "after_task": after_task,
        "subject": subject,
        "model": model,
        "depends_on": depends_on,
    });
    println!("{}", serde_json::to_string(&output)?);
    Ok(0)
}

/// Acknowledge a task model override (mutation already applied in Convex).
pub fn task_set_model(
    feature: &str,
    phase: &str,
    task_number: u32,
    revision: u32,
    model: &str,
) -> anyhow::Result<u8> {
    let output = serde_json::json!({
        "success": true,
        "action": "task_set_model",
        "feature": feature,
        "phase": phase,
        "task_number": task_number,
        "revision": revision,
        "model": model,
    });
    println!("{}", serde_json::to_string(&output)?);
    Ok(0)
}

/// Sync to Convex and record telemetry (best-effort).
fn sync_to_convex_with_telemetry(
    _ctx: &TelemetryContext,
    feature: &str,
    state: &tina_session::state::schema::SupervisorState,
    phase: &str,
    action: &Action,
    event: Option<&AdvanceEvent>,
) -> anyhow::Result<()> {
    let mut orch = orchestration_args_from_state(feature, state);
    let phase_args_list = all_phase_args_from_state(state);

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
            orchestration_id: orch_id.clone(),
            phase_number: phase_number.clone(),
            event_type: event_type.clone(),
            source: "tina-session orchestrate".to_string(),
            summary: summary.clone(),
            detail,
            recorded_at: chrono::Utc::now().to_rfc3339(),
        };
        writer.record_event(&event).await?;

        // Record telemetry (best-effort - don't fail if telemetry fails)
        let ctx_with_id = TelemetryContext::new(
            "orchestrate.advance",
            Some(orch_id.clone()),
            Some(state.feature.clone()),
            phase_number,
        );

        // Record span
        let span_status = match action {
            Action::Error { .. } | Action::Stopped { .. } | Action::ConsensusDisagreement { .. } => "error",
            _ => "ok",
        };
        if let Err(e) = ctx_with_id.record_span(&mut writer, span_status, None, None).await {
            eprintln!("Warning: Failed to record telemetry span: {}", e);
        }

        // Record state.transition event
        let severity = match action {
            Action::Error { .. } | Action::Stopped { .. } | Action::ConsensusDisagreement { .. } => "error",
            Action::Wait { .. } => "info",
            _ => "info",
        };
        let transition_attrs = serde_json::json!({
            "from_status": state.status,
            "action": serde_json::to_value(action).unwrap_or(serde_json::Value::Null),
        }).to_string();

        if let Err(e) = ctx_with_id.record_event(
            &mut writer,
            "state.transition",
            severity,
            summary,
            Some(span_status.to_string()),
            Some(transition_attrs),
        ).await {
            eprintln!("Warning: Failed to record telemetry event: {}", e);
        }

        Ok(())
    })
}
