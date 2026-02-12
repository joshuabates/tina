use std::process::Command;
use std::sync::Arc;

use anyhow::{bail, Result};
use tokio::sync::Mutex;
use tracing::{error, info};

use tina_data::{InboundAction, TinaConvexClient};

/// Payload for inbound actions that include feature/phase context.
#[derive(Debug, serde::Deserialize)]
pub struct ActionPayload {
    pub feature: Option<String>,
    pub phase: Option<String>,
    pub feedback: Option<String>,
    pub issues: Option<String>,
    // Launch-specific fields (start_orchestration)
    pub design_id: Option<String>,
    pub cwd: Option<String>,
    pub branch: Option<String>,
    pub total_phases: Option<u32>,
    pub policy: Option<serde_json::Value>,
    pub model_policy: Option<serde_json::Value>,
    pub review_policy: Option<serde_json::Value>,
    pub role: Option<String>,
    pub model: Option<String>,
    // Task reconfiguration fields
    pub phase_number: Option<String>,
    pub task_number: Option<u32>,
    pub after_task: Option<u32>,
    pub subject: Option<String>,
    pub description: Option<String>,
    pub revision: Option<u32>,
    pub depends_on: Option<Vec<u32>>,
}

/// Machine-parseable error codes for action dispatch results.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DispatchErrorCode {
    PayloadMissingField,
    PayloadInvalid,
    CliExitNonZero,
    CliSpawnFailed,
    UnknownActionType,
}

/// Structured result from action dispatch, serialized as JSON for the queue completion message.
#[derive(Debug, serde::Serialize)]
pub struct DispatchResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<DispatchErrorCode>,
    pub message: String,
}

impl DispatchResult {
    pub fn ok(message: String) -> Self {
        Self {
            success: true,
            error_code: None,
            message,
        }
    }

    pub fn err(code: DispatchErrorCode, message: String) -> Self {
        Self {
            success: false,
            error_code: Some(code),
            message,
        }
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| {
            format!(
                "{{\"success\":{},\"message\":\"{}\"}}",
                self.success, self.message
            )
        })
    }
}

/// Dispatch a single inbound action: claim it, execute the CLI command, complete it.
pub async fn dispatch_action(
    client: &Arc<Mutex<TinaConvexClient>>,
    action: &InboundAction,
) -> Result<()> {
    // Claim the action
    let claim_result = {
        let mut client = client.lock().await;
        client.claim_action(&action.id).await?
    };

    if !claim_result.success {
        info!(
            action_id = %action.id,
            reason = ?claim_result.reason,
            "action already claimed, skipping"
        );
        return Ok(());
    }

    // Parse payload
    let payload: ActionPayload = serde_json::from_str(&action.payload)
        .map_err(|e| anyhow::anyhow!("failed to parse action payload: {}", e))?;

    // Build and execute CLI command
    let dispatch_result = match execute_action(&action.action_type, &payload).await {
        Ok(output) => DispatchResult::ok(output),
        Err(e) => {
            let code = classify_error(&e);
            DispatchResult::err(code, format!("{}", e))
        }
    };

    // Report result
    let mut client = client.lock().await;
    client
        .complete_action(&action.id, &dispatch_result.to_json(), dispatch_result.success)
        .await?;

    if dispatch_result.success {
        info!(action_type = %action.action_type, action_id = %action.id, "action completed");
    } else {
        error!(action_type = %action.action_type, action_id = %action.id, error = %dispatch_result.message, "action failed");
    }

    Ok(())
}

/// Execute the appropriate CLI command for an action type.
async fn execute_action(action_type: &str, payload: &ActionPayload) -> Result<String> {
    let args = build_cli_args(action_type, payload)?;

    info!(action_type = %action_type, args = ?args, "executing tina-session command");

    let output =
        tokio::task::spawn_blocking(move || Command::new("tina-session").args(&args).output())
            .await??;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        bail!(
            "tina-session exited with {}: stdout={}, stderr={}",
            output.status,
            stdout.trim(),
            stderr.trim()
        );
    }

    Ok(stdout)
}

/// Classify an anyhow error into a deterministic error code.
fn classify_error(err: &anyhow::Error) -> DispatchErrorCode {
    let msg = err.to_string();
    if msg.contains("missing") && (msg.contains("field") || msg.contains("payload")) {
        DispatchErrorCode::PayloadMissingField
    } else if msg.contains("unknown action type") {
        DispatchErrorCode::UnknownActionType
    } else if msg.contains("exited with") {
        DispatchErrorCode::CliExitNonZero
    } else if msg.contains("parse") || msg.contains("invalid") {
        DispatchErrorCode::PayloadInvalid
    } else {
        DispatchErrorCode::CliSpawnFailed
    }
}

/// Build the tina-session CLI arguments for a given action type.
pub fn build_cli_args(action_type: &str, payload: &ActionPayload) -> Result<Vec<String>> {
    let feature = payload
        .feature
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("action payload missing 'feature' field"))?;

    match action_type {
        "approve_plan" => {
            let phase = payload
                .phase
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("approve_plan requires 'phase' in payload"))?;
            Ok(vec![
                "orchestrate".to_string(),
                "advance".to_string(),
                feature.to_string(),
                phase.to_string(),
                "review_pass".to_string(),
            ])
        }
        "reject_plan" => {
            let phase = payload
                .phase
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("reject_plan requires 'phase' in payload"))?;
            let mut args = vec![
                "orchestrate".to_string(),
                "advance".to_string(),
                feature.to_string(),
                phase.to_string(),
                "review_gaps".to_string(),
            ];
            if let Some(ref feedback) = payload.feedback.as_ref().or(payload.issues.as_ref()) {
                args.push("--issues".to_string());
                args.push(feedback.to_string());
            }
            Ok(args)
        }
        "pause" => {
            let phase = payload
                .phase
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("pause requires 'phase' in payload"))?;
            Ok(vec![
                "orchestrate".to_string(),
                "advance".to_string(),
                feature.to_string(),
                phase.to_string(),
                "error".to_string(),
                "--issues".to_string(),
                "paused by operator".to_string(),
            ])
        }
        "resume" => Ok(vec![
            "orchestrate".to_string(),
            "next".to_string(),
            feature.to_string(),
        ]),
        "retry" => {
            let phase = payload
                .phase
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("retry requires 'phase' in payload"))?;
            Ok(vec![
                "orchestrate".to_string(),
                "advance".to_string(),
                feature.to_string(),
                phase.to_string(),
                "retry".to_string(),
            ])
        }
        "start_orchestration" => {
            let design_id = payload.design_id.as_deref().ok_or_else(|| {
                anyhow::anyhow!("start_orchestration requires 'design_id' in payload")
            })?;
            let cwd = payload
                .cwd
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("start_orchestration requires 'cwd' in payload"))?;
            let branch = payload.branch.as_deref().ok_or_else(|| {
                anyhow::anyhow!("start_orchestration requires 'branch' in payload")
            })?;
            let total_phases = payload.total_phases.ok_or_else(|| {
                anyhow::anyhow!("start_orchestration requires 'total_phases' in payload")
            })?;

            let mut args = vec![
                "init".to_string(),
                feature.to_string(),
                "--cwd".to_string(),
                cwd.to_string(),
                "--design-id".to_string(),
                design_id.to_string(),
                "--branch".to_string(),
                branch.to_string(),
                total_phases.to_string(),
            ];

            // Apply policy overrides from snapshot if present
            if let Some(policy) = &payload.policy {
                if let Some(review) = policy.get("review") {
                    if let Some(v) = review.get("enforcement").and_then(|v| v.as_str()) {
                        args.push("--review-enforcement".to_string());
                        args.push(v.to_string());
                    }
                    if let Some(v) = review.get("detector_scope").and_then(|v| v.as_str()) {
                        args.push("--detector-scope".to_string());
                        args.push(v.to_string());
                    }
                    if let Some(v) = review.get("architect_mode").and_then(|v| v.as_str()) {
                        args.push("--architect-mode".to_string());
                        args.push(v.to_string());
                    }
                    if let Some(v) = review
                        .get("test_integrity_profile")
                        .and_then(|v| v.as_str())
                    {
                        args.push("--test-integrity-profile".to_string());
                        args.push(v.to_string());
                    }
                    if let Some(v) = review.get("hard_block_detectors").and_then(|v| v.as_bool()) {
                        if !v {
                            args.push("--no-hard-block-detectors".to_string());
                        }
                    }
                    if let Some(v) = review.get("allow_rare_override").and_then(|v| v.as_bool()) {
                        if !v {
                            args.push("--no-allow-rare-override".to_string());
                        }
                    }
                    if let Some(v) = review.get("require_fix_first").and_then(|v| v.as_bool()) {
                        if !v {
                            args.push("--no-require-fix-first".to_string());
                        }
                    }
                }
            }

            Ok(args)
        }
        "orchestration_set_policy" => {
            let mut args = vec![
                "orchestrate".to_string(),
                "set-policy".to_string(),
                "--feature".to_string(),
                feature.to_string(),
            ];
            if let Some(model_policy) = &payload.model_policy {
                args.push("--model-json".to_string());
                args.push(serde_json::to_string(model_policy)?);
            }
            if let Some(review_policy) = &payload.review_policy {
                args.push("--review-json".to_string());
                args.push(serde_json::to_string(review_policy)?);
            }
            Ok(args)
        }
        "orchestration_set_role_model" => {
            let role = payload
                .role
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("orchestration_set_role_model requires 'role' in payload"))?;
            let model = payload
                .model
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("orchestration_set_role_model requires 'model' in payload"))?;
            Ok(vec![
                "orchestrate".to_string(),
                "set-role-model".to_string(),
                "--feature".to_string(),
                feature.to_string(),
                "--role".to_string(),
                role.to_string(),
                "--model".to_string(),
                model.to_string(),
            ])
        }
        "task_edit" => {
            let phase_number = payload.phase_number.as_deref().ok_or_else(|| {
                anyhow::anyhow!("task_edit requires 'phase_number' in payload")
            })?;
            let task_number = payload.task_number.ok_or_else(|| {
                anyhow::anyhow!("task_edit requires 'task_number' in payload")
            })?;
            let revision = payload.revision.ok_or_else(|| {
                anyhow::anyhow!("task_edit requires 'revision' in payload")
            })?;

            let mut args = vec![
                "orchestrate".to_string(),
                "task-edit".to_string(),
                "--feature".to_string(),
                feature.to_string(),
                "--phase".to_string(),
                phase_number.to_string(),
                "--task".to_string(),
                task_number.to_string(),
                "--revision".to_string(),
                revision.to_string(),
            ];
            if let Some(ref subject) = payload.subject {
                args.push("--subject".to_string());
                args.push(subject.clone());
            }
            if let Some(ref description) = payload.description {
                args.push("--description".to_string());
                args.push(description.clone());
            }
            if let Some(ref model) = payload.model {
                args.push("--model".to_string());
                args.push(model.clone());
            }
            Ok(args)
        }
        "task_insert" => {
            let phase_number = payload.phase_number.as_deref().ok_or_else(|| {
                anyhow::anyhow!("task_insert requires 'phase_number' in payload")
            })?;
            let after_task = payload.after_task.ok_or_else(|| {
                anyhow::anyhow!("task_insert requires 'after_task' in payload")
            })?;
            let subject = payload.subject.as_deref().ok_or_else(|| {
                anyhow::anyhow!("task_insert requires 'subject' in payload")
            })?;

            let mut args = vec![
                "orchestrate".to_string(),
                "task-insert".to_string(),
                "--feature".to_string(),
                feature.to_string(),
                "--phase".to_string(),
                phase_number.to_string(),
                "--after-task".to_string(),
                after_task.to_string(),
                "--subject".to_string(),
                subject.to_string(),
            ];
            if let Some(ref model) = payload.model {
                args.push("--model".to_string());
                args.push(model.clone());
            }
            if let Some(ref deps) = payload.depends_on {
                args.push("--depends-on".to_string());
                args.push(
                    deps.iter()
                        .map(|d| d.to_string())
                        .collect::<Vec<_>>()
                        .join(","),
                );
            }
            Ok(args)
        }
        "task_set_model" => {
            let phase_number = payload.phase_number.as_deref().ok_or_else(|| {
                anyhow::anyhow!("task_set_model requires 'phase_number' in payload")
            })?;
            let task_number = payload.task_number.ok_or_else(|| {
                anyhow::anyhow!("task_set_model requires 'task_number' in payload")
            })?;
            let revision = payload.revision.ok_or_else(|| {
                anyhow::anyhow!("task_set_model requires 'revision' in payload")
            })?;
            let model = payload.model.as_deref().ok_or_else(|| {
                anyhow::anyhow!("task_set_model requires 'model' in payload")
            })?;

            Ok(vec![
                "orchestrate".to_string(),
                "task-set-model".to_string(),
                "--feature".to_string(),
                feature.to_string(),
                "--phase".to_string(),
                phase_number.to_string(),
                "--task".to_string(),
                task_number.to_string(),
                "--revision".to_string(),
                revision.to_string(),
                "--model".to_string(),
                model.to_string(),
            ])
        }
        other => bail!("unknown action type: {}", other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(feature: &str, phase: Option<&str>) -> ActionPayload {
        ActionPayload {
            feature: Some(feature.to_string()),
            phase: phase.map(|p| p.to_string()),
            feedback: None,
            issues: None,
            design_id: None,
            cwd: None,
            branch: None,
            total_phases: None,
            policy: None,
            model_policy: None,
            review_policy: None,
            role: None,
            model: None,
            phase_number: None,
            task_number: None,
            after_task: None,
            subject: None,
            description: None,
            revision: None,
            depends_on: None,
        }
    }

    #[test]
    fn test_build_cli_args_approve_plan() {
        let p = payload("auth", Some("1"));
        let args = build_cli_args("approve_plan", &p).unwrap();
        assert_eq!(
            args,
            vec!["orchestrate", "advance", "auth", "1", "review_pass"]
        );
    }

    #[test]
    fn test_build_cli_args_reject_plan_with_feedback() {
        let p = ActionPayload {
            feature: Some("auth".to_string()),
            phase: Some("2".to_string()),
            feedback: Some("needs error handling".to_string()),
            issues: None,
            design_id: None,
            cwd: None,
            branch: None,
            total_phases: None,
            policy: None,
            model_policy: None,
            review_policy: None,
            role: None,
            model: None,
            phase_number: None,
            task_number: None,
            after_task: None,
            subject: None,
            description: None,
            revision: None,
            depends_on: None,
        };
        let args = build_cli_args("reject_plan", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "advance",
                "auth",
                "2",
                "review_gaps",
                "--issues",
                "needs error handling"
            ]
        );
    }

    #[test]
    fn test_build_cli_args_reject_plan_without_feedback() {
        let p = payload("auth", Some("1"));
        let args = build_cli_args("reject_plan", &p).unwrap();
        assert_eq!(
            args,
            vec!["orchestrate", "advance", "auth", "1", "review_gaps"]
        );
    }

    #[test]
    fn test_build_cli_args_pause() {
        let p = payload("auth", Some("3"));
        let args = build_cli_args("pause", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "advance",
                "auth",
                "3",
                "error",
                "--issues",
                "paused by operator"
            ]
        );
    }

    #[test]
    fn test_build_cli_args_resume() {
        let p = payload("auth", None);
        let args = build_cli_args("resume", &p).unwrap();
        assert_eq!(args, vec!["orchestrate", "next", "auth"]);
    }

    #[test]
    fn test_build_cli_args_retry() {
        let p = payload("auth", Some("2"));
        let args = build_cli_args("retry", &p).unwrap();
        assert_eq!(args, vec!["orchestrate", "advance", "auth", "2", "retry"]);
    }

    #[test]
    fn test_build_cli_args_unknown_type() {
        let p = payload("auth", Some("1"));
        let result = build_cli_args("unknown_action", &p);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("unknown action type"));
    }

    #[test]
    fn test_build_cli_args_missing_feature() {
        let p = ActionPayload {
            feature: None,
            phase: Some("1".to_string()),
            feedback: None,
            issues: None,
            design_id: None,
            cwd: None,
            branch: None,
            total_phases: None,
            policy: None,
            model_policy: None,
            review_policy: None,
            role: None,
            model: None,
            phase_number: None,
            task_number: None,
            after_task: None,
            subject: None,
            description: None,
            revision: None,
            depends_on: None,
        };
        let result = build_cli_args("approve_plan", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("feature"));
    }

    #[test]
    fn test_build_cli_args_approve_plan_missing_phase() {
        let p = payload("auth", None);
        let result = build_cli_args("approve_plan", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("phase"));
    }

    #[test]
    fn test_build_cli_args_reject_plan_uses_issues_field() {
        let p = ActionPayload {
            feature: Some("auth".to_string()),
            phase: Some("1".to_string()),
            feedback: None,
            issues: Some("missing tests".to_string()),
            design_id: None,
            cwd: None,
            branch: None,
            total_phases: None,
            policy: None,
            model_policy: None,
            review_policy: None,
            role: None,
            model: None,
            phase_number: None,
            task_number: None,
            after_task: None,
            subject: None,
            description: None,
            revision: None,
            depends_on: None,
        };
        let args = build_cli_args("reject_plan", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "advance",
                "auth",
                "1",
                "review_gaps",
                "--issues",
                "missing tests"
            ]
        );
    }

    fn launch_payload() -> ActionPayload {
        ActionPayload {
            feature: Some("auth".to_string()),
            phase: None,
            feedback: None,
            issues: None,
            design_id: Some("design_abc".to_string()),
            cwd: Some("/tmp/worktree".to_string()),
            branch: Some("tina/auth".to_string()),
            total_phases: Some(3),
            policy: None,
            model_policy: None,
            review_policy: None,
            role: None,
            model: None,
            phase_number: None,
            task_number: None,
            after_task: None,
            subject: None,
            description: None,
            revision: None,
            depends_on: None,
        }
    }

    #[test]
    fn test_start_orchestration_basic() {
        let p = launch_payload();
        let args = build_cli_args("start_orchestration", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "init",
                "auth",
                "--cwd",
                "/tmp/worktree",
                "--design-id",
                "design_abc",
                "--branch",
                "tina/auth",
                "3",
            ]
        );
    }

    #[test]
    fn test_start_orchestration_with_policy() {
        let mut p = launch_payload();
        p.policy = Some(serde_json::json!({
            "review": {
                "enforcement": "task_and_phase",
                "detector_scope": "whole_repo_pattern_index",
                "architect_mode": "manual_plus_auto",
                "test_integrity_profile": "strict_baseline",
                "hard_block_detectors": false,
                "allow_rare_override": false,
                "require_fix_first": false,
            }
        }));
        let args = build_cli_args("start_orchestration", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "init",
                "auth",
                "--cwd",
                "/tmp/worktree",
                "--design-id",
                "design_abc",
                "--branch",
                "tina/auth",
                "3",
                "--review-enforcement",
                "task_and_phase",
                "--detector-scope",
                "whole_repo_pattern_index",
                "--architect-mode",
                "manual_plus_auto",
                "--test-integrity-profile",
                "strict_baseline",
                "--no-hard-block-detectors",
                "--no-allow-rare-override",
                "--no-require-fix-first",
            ]
        );
    }

    #[test]
    fn test_start_orchestration_policy_defaults_omitted() {
        // When boolean policy flags are true (the defaults), no flags are emitted
        let mut p = launch_payload();
        p.policy = Some(serde_json::json!({
            "review": {
                "hard_block_detectors": true,
                "allow_rare_override": true,
                "require_fix_first": true,
            }
        }));
        let args = build_cli_args("start_orchestration", &p).unwrap();
        // Should only have the base args, no --no-* flags
        assert_eq!(
            args,
            vec![
                "init",
                "auth",
                "--cwd",
                "/tmp/worktree",
                "--design-id",
                "design_abc",
                "--branch",
                "tina/auth",
                "3",
            ]
        );
    }

    #[test]
    fn test_start_orchestration_missing_design_id() {
        let mut p = launch_payload();
        p.design_id = None;
        let result = build_cli_args("start_orchestration", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("design_id"));
    }

    #[test]
    fn test_start_orchestration_missing_cwd() {
        let mut p = launch_payload();
        p.cwd = None;
        let result = build_cli_args("start_orchestration", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("cwd"));
    }

    #[test]
    fn test_start_orchestration_missing_branch() {
        let mut p = launch_payload();
        p.branch = None;
        let result = build_cli_args("start_orchestration", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("branch"));
    }

    #[test]
    fn test_start_orchestration_missing_total_phases() {
        let mut p = launch_payload();
        p.total_phases = None;
        let result = build_cli_args("start_orchestration", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("total_phases"));
    }

    // --- orchestration_set_policy tests ---

    #[test]
    fn test_set_policy_with_both_policies() {
        let mut p = payload("auth", None);
        p.model_policy = Some(serde_json::json!({"implementer": "haiku"}));
        p.review_policy = Some(serde_json::json!({"enforcement": "phase_only"}));
        let args = build_cli_args("orchestration_set_policy", &p).unwrap();
        assert_eq!(args[0], "orchestrate");
        assert_eq!(args[1], "set-policy");
        assert_eq!(args[2], "--feature");
        assert_eq!(args[3], "auth");
        assert_eq!(args[4], "--model-json");
        let model_json: serde_json::Value = serde_json::from_str(&args[5]).unwrap();
        assert_eq!(model_json, serde_json::json!({"implementer": "haiku"}));
        assert_eq!(args[6], "--review-json");
        let review_json: serde_json::Value = serde_json::from_str(&args[7]).unwrap();
        assert_eq!(review_json, serde_json::json!({"enforcement": "phase_only"}));
    }

    #[test]
    fn test_set_policy_model_only() {
        let mut p = payload("auth", None);
        p.model_policy = Some(serde_json::json!({"implementer": "opus"}));
        let args = build_cli_args("orchestration_set_policy", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "set-policy",
                "--feature",
                "auth",
                "--model-json",
                &serde_json::to_string(&serde_json::json!({"implementer": "opus"})).unwrap(),
            ]
        );
    }

    #[test]
    fn test_set_policy_review_only() {
        let mut p = payload("auth", None);
        p.review_policy = Some(serde_json::json!({"enforcement": "task_only"}));
        let args = build_cli_args("orchestration_set_policy", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "set-policy",
                "--feature",
                "auth",
                "--review-json",
                &serde_json::to_string(&serde_json::json!({"enforcement": "task_only"})).unwrap(),
            ]
        );
    }

    #[test]
    fn test_set_policy_neither_policy() {
        let p = payload("auth", None);
        let args = build_cli_args("orchestration_set_policy", &p).unwrap();
        assert_eq!(
            args,
            vec!["orchestrate", "set-policy", "--feature", "auth"]
        );
    }

    // --- orchestration_set_role_model tests ---

    #[test]
    fn test_set_role_model() {
        let mut p = payload("auth", None);
        p.role = Some("implementer".to_string());
        p.model = Some("haiku".to_string());
        let args = build_cli_args("orchestration_set_role_model", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "set-role-model",
                "--feature",
                "auth",
                "--role",
                "implementer",
                "--model",
                "haiku",
            ]
        );
    }

    #[test]
    fn test_set_role_model_missing_role() {
        let mut p = payload("auth", None);
        p.model = Some("haiku".to_string());
        let result = build_cli_args("orchestration_set_role_model", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("role"));
    }

    #[test]
    fn test_set_role_model_missing_model() {
        let mut p = payload("auth", None);
        p.role = Some("implementer".to_string());
        let result = build_cli_args("orchestration_set_role_model", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("model"));
    }

    // --- task_edit tests ---

    #[test]
    fn test_task_edit_basic() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.task_number = Some(3);
        p.revision = Some(2);
        p.subject = Some("Updated subject".to_string());
        p.description = Some("Updated desc".to_string());
        let args = build_cli_args("task_edit", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "task-edit",
                "--feature",
                "auth",
                "--phase",
                "1",
                "--task",
                "3",
                "--revision",
                "2",
                "--subject",
                "Updated subject",
                "--description",
                "Updated desc",
            ]
        );
    }

    #[test]
    fn test_task_edit_with_model() {
        let mut p = payload("auth", None);
        p.phase_number = Some("2".to_string());
        p.task_number = Some(1);
        p.revision = Some(1);
        p.model = Some("haiku".to_string());
        let args = build_cli_args("task_edit", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "task-edit",
                "--feature",
                "auth",
                "--phase",
                "2",
                "--task",
                "1",
                "--revision",
                "1",
                "--model",
                "haiku",
            ]
        );
    }

    #[test]
    fn test_task_edit_minimal() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.task_number = Some(2);
        p.revision = Some(1);
        let args = build_cli_args("task_edit", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "task-edit",
                "--feature",
                "auth",
                "--phase",
                "1",
                "--task",
                "2",
                "--revision",
                "1",
            ]
        );
    }

    #[test]
    fn test_task_edit_missing_phase_number() {
        let mut p = payload("auth", None);
        p.task_number = Some(1);
        p.revision = Some(1);
        let result = build_cli_args("task_edit", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("phase_number"));
    }

    #[test]
    fn test_task_edit_missing_task_number() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.revision = Some(1);
        let result = build_cli_args("task_edit", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("task_number"));
    }

    #[test]
    fn test_task_edit_missing_revision() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.task_number = Some(1);
        let result = build_cli_args("task_edit", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("revision"));
    }

    // --- task_insert tests ---

    #[test]
    fn test_task_insert_basic() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.after_task = Some(2);
        p.subject = Some("New task".to_string());
        let args = build_cli_args("task_insert", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "task-insert",
                "--feature",
                "auth",
                "--phase",
                "1",
                "--after-task",
                "2",
                "--subject",
                "New task",
            ]
        );
    }

    #[test]
    fn test_task_insert_with_model_and_depends() {
        let mut p = payload("auth", None);
        p.phase_number = Some("2".to_string());
        p.after_task = Some(0);
        p.subject = Some("First task".to_string());
        p.model = Some("opus".to_string());
        p.depends_on = Some(vec![1, 3]);
        let args = build_cli_args("task_insert", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "task-insert",
                "--feature",
                "auth",
                "--phase",
                "2",
                "--after-task",
                "0",
                "--subject",
                "First task",
                "--model",
                "opus",
                "--depends-on",
                "1,3",
            ]
        );
    }

    #[test]
    fn test_task_insert_missing_phase_number() {
        let mut p = payload("auth", None);
        p.after_task = Some(1);
        p.subject = Some("New task".to_string());
        let result = build_cli_args("task_insert", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("phase_number"));
    }

    #[test]
    fn test_task_insert_missing_after_task() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.subject = Some("New task".to_string());
        let result = build_cli_args("task_insert", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("after_task"));
    }

    #[test]
    fn test_task_insert_missing_subject() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.after_task = Some(1);
        let result = build_cli_args("task_insert", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("subject"));
    }

    // --- task_set_model tests ---

    #[test]
    fn test_task_set_model_basic() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.task_number = Some(2);
        p.revision = Some(1);
        p.model = Some("sonnet".to_string());
        let args = build_cli_args("task_set_model", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "task-set-model",
                "--feature",
                "auth",
                "--phase",
                "1",
                "--task",
                "2",
                "--revision",
                "1",
                "--model",
                "sonnet",
            ]
        );
    }

    #[test]
    fn test_task_set_model_missing_phase_number() {
        let mut p = payload("auth", None);
        p.task_number = Some(1);
        p.revision = Some(1);
        p.model = Some("sonnet".to_string());
        let result = build_cli_args("task_set_model", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("phase_number"));
    }

    #[test]
    fn test_task_set_model_missing_task_number() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.revision = Some(1);
        p.model = Some("sonnet".to_string());
        let result = build_cli_args("task_set_model", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("task_number"));
    }

    #[test]
    fn test_task_set_model_missing_revision() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.task_number = Some(1);
        p.model = Some("sonnet".to_string());
        let result = build_cli_args("task_set_model", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("revision"));
    }

    #[test]
    fn test_task_set_model_missing_model() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.task_number = Some(1);
        p.revision = Some(1);
        let result = build_cli_args("task_set_model", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("model"));
    }

    // --- DispatchResult / DispatchErrorCode tests ---

    #[test]
    fn test_dispatch_result_ok_serializes() {
        let r = DispatchResult::ok("done".to_string());
        assert!(r.success);
        assert!(r.error_code.is_none());
        let json: serde_json::Value = serde_json::from_str(&r.to_json()).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(json["message"], "done");
        assert!(json.get("error_code").is_none());
    }

    #[test]
    fn test_dispatch_result_err_serializes() {
        let r = DispatchResult::err(
            DispatchErrorCode::CliExitNonZero,
            "exited with 1".to_string(),
        );
        assert!(!r.success);
        assert!(r.error_code.is_some());
        let json: serde_json::Value = serde_json::from_str(&r.to_json()).unwrap();
        assert_eq!(json["success"], false);
        assert_eq!(json["error_code"], "cli_exit_non_zero");
        assert_eq!(json["message"], "exited with 1");
    }

    #[test]
    fn test_classify_error_missing_field() {
        let err = anyhow::anyhow!("action payload missing 'feature' field");
        let code = classify_error(&err);
        assert!(matches!(code, DispatchErrorCode::PayloadMissingField));
    }

    #[test]
    fn test_classify_error_unknown_action_type() {
        let err = anyhow::anyhow!("unknown action type: foo");
        let code = classify_error(&err);
        assert!(matches!(code, DispatchErrorCode::UnknownActionType));
    }

    #[test]
    fn test_classify_error_cli_exit_non_zero() {
        let err = anyhow::anyhow!("tina-session exited with exit status: 1");
        let code = classify_error(&err);
        assert!(matches!(code, DispatchErrorCode::CliExitNonZero));
    }

    #[test]
    fn test_classify_error_payload_invalid() {
        let err = anyhow::anyhow!("failed to parse action payload: invalid json");
        let code = classify_error(&err);
        assert!(matches!(code, DispatchErrorCode::PayloadInvalid));
    }

    #[test]
    fn test_classify_error_fallback_spawn_failed() {
        let err = anyhow::anyhow!("No such file or directory");
        let code = classify_error(&err);
        assert!(matches!(code, DispatchErrorCode::CliSpawnFailed));
    }

    #[test]
    fn test_dispatch_error_code_serializes_snake_case() {
        let codes = vec![
            (DispatchErrorCode::PayloadMissingField, "payload_missing_field"),
            (DispatchErrorCode::PayloadInvalid, "payload_invalid"),
            (DispatchErrorCode::CliExitNonZero, "cli_exit_non_zero"),
            (DispatchErrorCode::CliSpawnFailed, "cli_spawn_failed"),
            (DispatchErrorCode::UnknownActionType, "unknown_action_type"),
        ];
        for (code, expected) in codes {
            let json = serde_json::to_string(&code).unwrap();
            assert_eq!(json, format!("\"{}\"", expected));
        }
    }
}
