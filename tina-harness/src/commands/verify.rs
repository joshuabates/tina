//! Verify command implementation
//!
//! Queries Convex to verify that orchestration entities
//! (project, orchestration, phases, tasks, team members)
//! are visible after a full orchestration run.

use anyhow::{Context, Result};
use tina_data::EventRecord;

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
    pub phase_tasks_found: u32,
    pub commits_found: u32,
    pub plans_found: u32,
    pub shutdown_events_found: u32,
}

/// Parse expected and actual values from a failure message.
///
/// Extracts the expected and actual values from messages like:
/// - "Expected at least 2 phases, found 1"
/// - "Expected orchestration status 'complete', found 'planning'"
fn parse_expected_actual_from_message(message: &str) -> (String, String) {
    // Try to match "Expected X, found Y" pattern
    if let Some(expected_start) = message.find("Expected ") {
        if let Some(found_idx) = message.find(", found ") {
            let expected = message[expected_start + 9..found_idx].to_string();
            let actual = message[found_idx + 8..].to_string();
            return (expected, actual);
        }
    }

    // Fallback for orchestration not found
    if message.contains("not found") {
        return ("orchestration exists".to_string(), "not found".to_string());
    }

    // Default fallback
    ("unknown".to_string(), "unknown".to_string())
}

/// Create a consistency.violation event for a verification failure.
fn create_consistency_violation_event(
    trace_id: &str,
    feature_name: &str,
    failure: &CategorizedFailure,
) -> EventRecord {
    create_consistency_violation_event_with_orch_id(trace_id, feature_name, None, failure)
}

/// Create a consistency.violation event with an optional orchestration ID.
fn create_consistency_violation_event_with_orch_id(
    trace_id: &str,
    feature_name: &str,
    orchestration_id: Option<&str>,
    failure: &CategorizedFailure,
) -> EventRecord {
    let (expected, actual) = parse_expected_actual_from_message(&failure.message);

    let attrs = serde_json::json!({
        "category": format!("{:?}", failure.category).to_lowercase(),
        "feature": feature_name,
        "expected": expected,
        "actual": actual,
    });

    EventRecord {
        trace_id: trace_id.to_string(),
        span_id: uuid::Uuid::new_v4().to_string(),
        parent_span_id: None,
        orchestration_id: orchestration_id.map(|s| s.to_string()),
        feature_name: Some(feature_name.to_string()),
        phase_number: None,
        team_name: None,
        task_id: None,
        source: "tina-harness".to_string(),
        event_type: "consistency.violation".to_string(),
        severity: "error".to_string(),
        message: failure.message.clone(),
        status: None,
        attrs: Some(attrs.to_string()),
        recorded_at: chrono::Utc::now().to_rfc3339(),
    }
}

/// Verify that an orchestration and its entities exist in Convex.
///
/// Connects to Convex, looks up the orchestration by feature name,
/// and checks that phases, tasks, and team members are present.
///
/// Emits telemetry events for any consistency violations found.
pub fn verify(feature_name: &str, assertions: &ConvexAssertions) -> Result<VerifyResult> {
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(verify_async(feature_name, assertions))
}

async fn verify_async(feature_name: &str, assertions: &ConvexAssertions) -> Result<VerifyResult> {
    // Generate a trace ID for this verification run
    let trace_id = uuid::Uuid::new_v4().to_string();

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
                    // Emit telemetry event for orchestration not found
                    let event =
                        create_consistency_violation_event(&trace_id, feature_name, &failure);
                    if let Err(e) = client.record_telemetry_event(&event).await {
                        eprintln!("Warning: Failed to record telemetry event: {}", e);
                    }
                    failures.push(failure);
                }
                None
            }
        };

    // Step 2: If orchestration found, get detail and verify
    let (
        phases_found,
        tasks_found,
        members_found,
        phase_tasks_found,
        commits_found,
        plans_found,
        shutdown_events_found,
    ) = if let Some(ref orch_id) = orchestration_id {
        eprintln!("Fetching orchestration detail for {}...", orch_id);
        match client.get_orchestration_detail(orch_id).await {
            Ok(Some(detail)) => {
                let phases = detail.phases.len() as u32;
                let tasks = detail.tasks.len() as u32;
                let members = detail.team_members.len() as u32;
                let phase_tasks = verify_logic::count_phase_tasks(&detail);

                eprintln!(
                    "  Phases: {}, Tasks: {} (phase-scoped: {}), Team members: {}",
                    phases, tasks, phase_tasks, members
                );

                // Verify against assertions
                let detail_failures = verify_logic::verify_detail(&detail, assertions);

                // Query artifacts that are not included in orchestration detail.
                let commits = match client.list_commits(orch_id, None).await {
                    Ok(commits) => commits,
                    Err(e) => {
                        let failure = CategorizedFailure::new(
                            FailureCategory::Orchestration,
                            format!("Failed to list commits: {}", e),
                        );
                        let event = create_consistency_violation_event_with_orch_id(
                            &trace_id,
                            feature_name,
                            Some(orch_id),
                            &failure,
                        );
                        if let Err(e) = client.record_telemetry_event(&event).await {
                            eprintln!("Warning: Failed to record telemetry event: {}", e);
                        }
                        failures.push(failure);
                        Vec::new()
                    }
                };

                let plans = match client.list_plans(orch_id).await {
                    Ok(plans) => plans,
                    Err(e) => {
                        let failure = CategorizedFailure::new(
                            FailureCategory::Orchestration,
                            format!("Failed to list plans: {}", e),
                        );
                        let event = create_consistency_violation_event_with_orch_id(
                            &trace_id,
                            feature_name,
                            Some(orch_id),
                            &failure,
                        );
                        if let Err(e) = client.record_telemetry_event(&event).await {
                            eprintln!("Warning: Failed to record telemetry event: {}", e);
                        }
                        failures.push(failure);
                        Vec::new()
                    }
                };

                let events = match client.list_events(orch_id, None, None, Some(200)).await {
                    Ok(events) => events,
                    Err(e) => {
                        let failure = CategorizedFailure::new(
                            FailureCategory::Orchestration,
                            format!("Failed to list orchestration events: {}", e),
                        );
                        let event = create_consistency_violation_event_with_orch_id(
                            &trace_id,
                            feature_name,
                            Some(orch_id),
                            &failure,
                        );
                        if let Err(e) = client.record_telemetry_event(&event).await {
                            eprintln!("Warning: Failed to record telemetry event: {}", e);
                        }
                        failures.push(failure);
                        Vec::new()
                    }
                };

                let artifact_failures =
                    verify_logic::verify_artifacts(&detail, &commits, &plans, &events, assertions);

                // Emit telemetry events for each detail failure
                for failure in &detail_failures {
                    let event = create_consistency_violation_event_with_orch_id(
                        &trace_id,
                        feature_name,
                        Some(orch_id),
                        failure,
                    );
                    if let Err(e) = client.record_telemetry_event(&event).await {
                        eprintln!("Warning: Failed to record telemetry event: {}", e);
                    }
                }

                failures.extend(detail_failures);
                failures.extend(artifact_failures.iter().cloned());

                // Emit telemetry events for each artifact failure.
                for failure in &artifact_failures {
                    let event = create_consistency_violation_event_with_orch_id(
                        &trace_id,
                        feature_name,
                        Some(orch_id),
                        failure,
                    );
                    if let Err(e) = client.record_telemetry_event(&event).await {
                        eprintln!("Warning: Failed to record telemetry event: {}", e);
                    }
                }

                let shutdown_events = events
                    .iter()
                    .filter(|event| event.event_type == "agent_shutdown")
                    .count() as u32;

                (
                    phases,
                    tasks,
                    members,
                    phase_tasks,
                    commits.len() as u32,
                    plans.len() as u32,
                    shutdown_events,
                )
            }
            Ok(None) => {
                let failure = CategorizedFailure::new(
                    FailureCategory::Orchestration,
                    format!("Orchestration detail returned null for ID '{}'", orch_id),
                );

                // Emit telemetry event
                let event = create_consistency_violation_event_with_orch_id(
                    &trace_id,
                    feature_name,
                    Some(orch_id),
                    &failure,
                );
                if let Err(e) = client.record_telemetry_event(&event).await {
                    eprintln!("Warning: Failed to record telemetry event: {}", e);
                }

                failures.push(failure);
                (0, 0, 0, 0, 0, 0, 0)
            }
            Err(e) => {
                let failure = CategorizedFailure::new(
                    FailureCategory::Orchestration,
                    format!("Failed to fetch orchestration detail: {}", e),
                );

                // Emit telemetry event
                let event = create_consistency_violation_event_with_orch_id(
                    &trace_id,
                    feature_name,
                    Some(orch_id),
                    &failure,
                );
                if let Err(e) = client.record_telemetry_event(&event).await {
                    eprintln!("Warning: Failed to record telemetry event: {}", e);
                }

                failures.push(failure);
                (0, 0, 0, 0, 0, 0, 0)
            }
        }
    } else {
        (0, 0, 0, 0, 0, 0, 0)
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
        phase_tasks_found,
        commits_found,
        plans_found,
        shutdown_events_found,
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

    #[test]
    fn test_create_consistency_violation_event() {
        let trace_id = "test-trace-123";
        let feature_name = "test-feature";
        let failure = CategorizedFailure::new(
            FailureCategory::Orchestration,
            "Expected at least 1 phases, found 0".to_string(),
        );

        let event = create_consistency_violation_event(trace_id, feature_name, &failure);

        assert_eq!(event.trace_id, trace_id);
        assert_eq!(event.source, "tina-harness");
        assert_eq!(event.event_type, "consistency.violation");
        assert_eq!(event.severity, "error");
        assert_eq!(event.feature_name, Some(feature_name.to_string()));
        assert_eq!(event.message, "Expected at least 1 phases, found 0");

        // Check that attrs is valid JSON and contains expected fields
        let attrs: serde_json::Value = serde_json::from_str(&event.attrs.unwrap()).unwrap();
        assert_eq!(attrs["category"], "orchestration");
        assert_eq!(attrs["feature"], feature_name);
        assert_eq!(attrs["expected"], "at least 1 phases");
        assert_eq!(attrs["actual"], "0");
    }

    #[test]
    fn test_create_consistency_violation_event_with_orchestration_id() {
        let trace_id = "test-trace-456";
        let feature_name = "another-feature";
        let failure = CategorizedFailure::new(
            FailureCategory::Orchestration,
            "Expected at least 3 tasks, found 1".to_string(),
        );
        let orchestration_id = Some("orch-123".to_string());

        let event = create_consistency_violation_event_with_orch_id(
            trace_id,
            feature_name,
            orchestration_id.as_deref(),
            &failure,
        );

        assert_eq!(event.orchestration_id, orchestration_id);
        assert_eq!(event.feature_name, Some(feature_name.to_string()));
    }

    #[test]
    fn test_parse_expected_actual_from_phases_message() {
        let message = "Expected at least 2 phases, found 1";
        let (expected, actual) = parse_expected_actual_from_message(message);
        assert_eq!(expected, "at least 2 phases");
        assert_eq!(actual, "1");
    }

    #[test]
    fn test_parse_expected_actual_from_tasks_message() {
        let message = "Expected at least 5 tasks, found 3";
        let (expected, actual) = parse_expected_actual_from_message(message);
        assert_eq!(expected, "at least 5 tasks");
        assert_eq!(actual, "3");
    }

    #[test]
    fn test_parse_expected_actual_from_status_message() {
        let message = "Expected orchestration status 'complete', found 'planning'";
        let (expected, actual) = parse_expected_actual_from_message(message);
        assert_eq!(expected, "orchestration status 'complete'");
        assert_eq!(actual, "'planning'");
    }

    #[test]
    fn test_parse_expected_actual_fallback() {
        let message = "Orchestration not found for feature 'missing'. Available: []";
        let (expected, actual) = parse_expected_actual_from_message(message);
        assert_eq!(expected, "orchestration exists");
        assert_eq!(actual, "not found");
    }

    #[test]
    fn test_event_attrs_valid_json() {
        let trace_id = "test-trace";
        let feature = "test-feature";
        let failure = CategorizedFailure::new(
            FailureCategory::Orchestration,
            "Expected at least 3 tasks, found 1".to_string(),
        );

        let event = create_consistency_violation_event(trace_id, feature, &failure);

        // Verify attrs is valid JSON
        assert!(event.attrs.is_some());
        let attrs_str = event.attrs.unwrap();
        let attrs: serde_json::Value =
            serde_json::from_str(&attrs_str).expect("attrs should be valid JSON");

        // Verify required fields
        assert_eq!(attrs["category"], "orchestration");
        assert_eq!(attrs["feature"], feature);
        assert_eq!(attrs["expected"], "at least 3 tasks");
        assert_eq!(attrs["actual"], "1");
    }

    #[test]
    fn test_event_recorded_at_is_valid_timestamp() {
        let trace_id = "test-trace";
        let feature = "test-feature";
        let failure =
            CategorizedFailure::new(FailureCategory::Orchestration, "Test failure".to_string());

        let event = create_consistency_violation_event(trace_id, feature, &failure);

        // Verify recorded_at is a valid RFC3339 timestamp
        chrono::DateTime::parse_from_rfc3339(&event.recorded_at)
            .expect("recorded_at should be valid RFC3339");
    }
}
