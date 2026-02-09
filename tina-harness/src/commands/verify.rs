//! Verify command implementation
//!
//! Queries Convex to verify that orchestration entities
//! (project, orchestration, phases, tasks, team members)
//! are visible after a full orchestration run.

use anyhow::{Context, Result};

use crate::failure::{CategorizedFailure, FailureCategory};
use crate::scenario::ConvexAssertions;
use crate::verify as verify_logic;

/// Result of verifying Convex state
#[derive(Debug)]
pub struct VerifyResult {
    pub feature_name: String,
    pub passed: bool,
    pub failures: Vec<CategorizedFailure>,
    /// Orchestration ID if found
    pub orchestration_id: Option<String>,
    /// Summary counts for reporting
    pub phases_found: u32,
    pub tasks_found: u32,
    pub members_found: u32,
}

/// Verify that an orchestration and its entities exist in Convex.
///
/// Connects to Convex, looks up the orchestration by feature name,
/// and checks that phases, tasks, and team members are present.
pub fn verify(feature_name: &str, assertions: &ConvexAssertions) -> Result<VerifyResult> {
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(verify_async(feature_name, assertions))
}

async fn verify_async(feature_name: &str, assertions: &ConvexAssertions) -> Result<VerifyResult> {
    let cfg = tina_session::config::load_config_for_env(Some("dev"))?;
    let convex_url = cfg
        .convex_url
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow::anyhow!("convex_url not set in config"))?;

    let mut client = tina_data::TinaConvexClient::new(&convex_url).await?;

    // Step 1: List orchestrations and find ours
    eprintln!("Checking orchestrations...");
    let orchestrations = client
        .list_orchestrations()
        .await
        .context("Failed to list orchestrations")?;

    let mut failures = Vec::new();

    let orchestration_id =
        match verify_logic::verify_orchestration_exists(&orchestrations, feature_name) {
            Ok(id) => Some(id),
            Err(failure) => {
                if assertions.has_orchestration {
                    failures.push(failure);
                }
                None
            }
        };

    // Step 2: If orchestration found, get detail and verify
    let (phases_found, tasks_found, members_found) = if let Some(ref orch_id) = orchestration_id {
        eprintln!("Fetching orchestration detail for {}...", orch_id);
        match client.get_orchestration_detail(orch_id).await {
            Ok(Some(detail)) => {
                let phases = detail.phases.len() as u32;
                let tasks = detail.tasks.len() as u32;
                let members = detail.team_members.len() as u32;

                eprintln!(
                    "  Phases: {}, Tasks: {}, Team members: {}",
                    phases, tasks, members
                );

                // Verify against assertions
                let detail_failures = verify_logic::verify_detail(&detail, assertions);
                failures.extend(detail_failures);

                (phases, tasks, members)
            }
            Ok(None) => {
                failures.push(CategorizedFailure::new(
                    FailureCategory::Orchestration,
                    format!("Orchestration detail returned null for ID '{}'", orch_id),
                ));
                (0, 0, 0)
            }
            Err(e) => {
                failures.push(CategorizedFailure::new(
                    FailureCategory::Orchestration,
                    format!("Failed to fetch orchestration detail: {}", e),
                ));
                (0, 0, 0)
            }
        }
    } else {
        (0, 0, 0)
    };

    let passed = failures.is_empty();

    Ok(VerifyResult {
        feature_name: feature_name.to_string(),
        passed,
        failures,
        orchestration_id,
        phases_found,
        tasks_found,
        members_found,
    })
}

/// Check if tina-daemon is running by looking for the process.
pub fn check_daemon_running() -> bool {
    let output = std::process::Command::new("pgrep")
        .args(["-f", "tina-daemon"])
        .output();

    match output {
        Ok(o) => o.status.success(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_daemon_running_returns_bool() {
        // Just verify it doesn't panic — actual result depends on system state
        let _ = check_daemon_running();
    }
}
