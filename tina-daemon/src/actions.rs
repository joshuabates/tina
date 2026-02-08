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
    let result = execute_action(&action.action_type, &payload).await;

    // Report result
    let (result_msg, success) = match &result {
        Ok(output) => (output.clone(), true),
        Err(e) => (format!("error: {}", e), false),
    };

    let mut client = client.lock().await;
    client
        .complete_action(&action.id, &result_msg, success)
        .await?;

    if success {
        info!(action_type = %action.action_type, action_id = %action.id, "action completed");
    } else {
        error!(action_type = %action.action_type, action_id = %action.id, error = %result_msg, "action failed");
    }

    Ok(())
}

/// Execute the appropriate CLI command for an action type.
async fn execute_action(action_type: &str, payload: &ActionPayload) -> Result<String> {
    let args = build_cli_args(action_type, payload)?;

    info!(action_type = %action_type, args = ?args, "executing tina-session command");

    let output = tokio::task::spawn_blocking(move || {
        Command::new("tina-session")
            .args(&args)
            .output()
    })
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
        assert_eq!(
            args,
            vec!["orchestrate", "advance", "auth", "2", "retry"]
        );
    }

    #[test]
    fn test_build_cli_args_unknown_type() {
        let p = payload("auth", Some("1"));
        let result = build_cli_args("unknown_action", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("unknown action type"));
    }

    #[test]
    fn test_build_cli_args_missing_feature() {
        let p = ActionPayload {
            feature: None,
            phase: Some("1".to_string()),
            feedback: None,
            issues: None,
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
}
