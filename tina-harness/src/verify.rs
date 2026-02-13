//! Convex state verification for orchestration testing.
//!
//! After a full orchestration run, verifies that all expected entities
//! (orchestration, phases, tasks, team members) exist in Convex.

use tina_data::{
    CommitRecord, OrchestrationDetailResponse, OrchestrationEventRecord, OrchestrationListEntry,
    PlanRecord,
};

use crate::failure::{CategorizedFailure, FailureCategory};
use crate::scenario::ConvexAssertions;

/// Verify an orchestration detail response against Convex assertions.
///
/// Returns a list of failures (empty if all assertions pass).
pub fn verify_detail(
    detail: &OrchestrationDetailResponse,
    assertions: &ConvexAssertions,
) -> Vec<CategorizedFailure> {
    let mut failures = Vec::new();

    if let Some(ref expected_status) = assertions.expected_status {
        if detail.record.status != *expected_status {
            failures.push(CategorizedFailure::new(
                FailureCategory::Orchestration,
                format!(
                    "Expected orchestration status '{}', found '{}'",
                    expected_status, detail.record.status
                ),
            ));
        }
    }

    if let Some(min) = assertions.min_phases {
        let actual = detail.phases.len() as u32;
        if actual < min {
            failures.push(CategorizedFailure::new(
                FailureCategory::Orchestration,
                format!("Expected at least {} phases, found {}", min, actual),
            ));
        }
    }

    if let Some(min) = assertions.min_tasks {
        let actual = detail.tasks.len() as u32;
        if actual < min {
            failures.push(CategorizedFailure::new(
                FailureCategory::Orchestration,
                format!("Expected at least {} tasks, found {}", min, actual),
            ));
        }
    }

    if let Some(min) = assertions.min_phase_tasks {
        let actual = count_phase_tasks(detail);
        if actual < min {
            failures.push(CategorizedFailure::new(
                FailureCategory::Orchestration,
                format!(
                    "Expected at least {} phase-scoped tasks, found {}",
                    min, actual
                ),
            ));
        }
    }

    if let Some(min) = assertions.min_team_members {
        let actual = detail.team_members.len() as u32;
        if actual < min {
            failures.push(CategorizedFailure::new(
                FailureCategory::Orchestration,
                format!("Expected at least {} team members, found {}", min, actual),
            ));
        }
    }

    failures
}

/// Verify orchestration artifacts not included in orchestration detail response.
///
/// These checks query commits, plans, and orchestration events separately.
pub fn verify_artifacts(
    detail: &OrchestrationDetailResponse,
    commits: &[CommitRecord],
    plans: &[PlanRecord],
    events: &[OrchestrationEventRecord],
    assertions: &ConvexAssertions,
) -> Vec<CategorizedFailure> {
    let mut failures = Vec::new();

    if let Some(min) = assertions.min_commits {
        let actual = commits.len() as u32;
        if actual < min {
            failures.push(CategorizedFailure::new(
                FailureCategory::Orchestration,
                format!("Expected at least {} commits, found {}", min, actual),
            ));
        }
    }

    if let Some(min) = assertions.min_plans {
        let actual = plans.len() as u32;
        if actual < min {
            failures.push(CategorizedFailure::new(
                FailureCategory::Orchestration,
                format!("Expected at least {} plans, found {}", min, actual),
            ));
        }
    }

    if let Some(min) = assertions.min_shutdown_events {
        let actual = events
            .iter()
            .filter(|event| event.event_type == "agent_shutdown")
            .count() as u32;
        if actual < min {
            failures.push(CategorizedFailure::new(
                FailureCategory::Orchestration,
                format!(
                    "Expected at least {} shutdown events, found {}",
                    min, actual
                ),
            ));
        }
    }

    if assertions.has_markdown_task && !has_markdown_task(detail) {
        failures.push(CategorizedFailure::new(
            FailureCategory::Orchestration,
            "Expected at least 1 markdown task description, found 0",
        ));
    }

    if let Some(min) = assertions.min_codex_events {
        let actual = events
            .iter()
            .filter(|event| event.event_type.starts_with("codex_run_"))
            .count() as u32;
        if actual < min {
            failures.push(CategorizedFailure::new(
                FailureCategory::Orchestration,
                format!(
                    "Expected at least {} Codex run events, found {}",
                    min, actual
                ),
            ));
        }
    }

    failures
}

/// Count tasks that are phase-scoped (`phase_number` present).
pub fn count_phase_tasks(detail: &OrchestrationDetailResponse) -> u32 {
    detail
        .tasks
        .iter()
        .filter(|task| task.phase_number.is_some())
        .count() as u32
}

/// Detect markdown-like content in task descriptions.
pub fn has_markdown_task(detail: &OrchestrationDetailResponse) -> bool {
    detail.tasks.iter().any(|task| {
        let Some(description) = task.description.as_deref() else {
            return false;
        };

        let text = description.trim();
        if text.is_empty() {
            return false;
        }

        // Heuristic markers for markdown presence.
        text.contains("```")
            || text.contains("# ")
            || text.contains("## ")
            || text.contains("- [ ]")
            || text.contains("- [x]")
            || text.contains("* ")
            || text.contains("1. ")
    })
}

/// Find the most recent orchestration by feature name in a list of orchestrations.
///
/// When multiple orchestrations share the same feature name (from repeated runs),
/// returns the one with the latest `started_at` timestamp.
pub fn find_orchestration_by_feature<'a>(
    orchestrations: &'a [OrchestrationListEntry],
    feature_name: &str,
) -> Option<&'a OrchestrationListEntry> {
    orchestrations
        .iter()
        .filter(|o| {
            o.record.feature_name == feature_name
                || o.record
                    .feature_name
                    .starts_with(&format!("{}-", feature_name))
        })
        .max_by(|a, b| a.record.started_at.cmp(&b.record.started_at))
}

/// Verify that an orchestration exists for the given feature name.
///
/// Returns the orchestration ID on success, or a failure on error.
pub fn verify_orchestration_exists(
    orchestrations: &[OrchestrationListEntry],
    feature_name: &str,
) -> Result<String, CategorizedFailure> {
    match find_orchestration_by_feature(orchestrations, feature_name) {
        Some(entry) => Ok(entry.id.clone()),
        None => {
            let available: Vec<&str> = orchestrations
                .iter()
                .map(|o| o.record.feature_name.as_str())
                .collect();
            Err(CategorizedFailure::new(
                FailureCategory::Orchestration,
                format!(
                    "Orchestration not found for feature '{}'. Available: {:?}",
                    feature_name, available
                ),
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tina_data::{
        OrchestrationDetailResponse, OrchestrationListEntry, OrchestrationRecord, PhaseRecord,
        TaskEventRecord, TeamMemberRecord,
    };

    fn make_orchestration_record(feature: &str) -> OrchestrationRecord {
        OrchestrationRecord {
            node_id: "node-1".to_string(),
            project_id: None,
            design_id: None,
            feature_name: feature.to_string(),
            design_doc_path: "design.md".to_string(),
            branch: "tina/test".to_string(),
            worktree_path: None,
            total_phases: 1.0,
            current_phase: 1.0,
            status: "complete".to_string(),
            started_at: "2026-02-08T10:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: None,
            policy_snapshot: None,
            policy_snapshot_hash: None,
            preset_origin: None,
            design_only: None,
            policy_revision: None,
            updated_at: None,
        }
    }

    fn make_phase(orch_id: &str, phase_num: &str) -> PhaseRecord {
        PhaseRecord {
            orchestration_id: orch_id.to_string(),
            phase_number: phase_num.to_string(),
            status: "complete".to_string(),
            plan_path: None,
            git_range: None,
            planning_mins: None,
            execution_mins: None,
            review_mins: None,
            started_at: None,
            completed_at: None,
        }
    }

    fn make_task(orch_id: &str, task_id: &str, subject: &str) -> TaskEventRecord {
        TaskEventRecord {
            orchestration_id: orch_id.to_string(),
            phase_number: Some("1".to_string()),
            task_id: task_id.to_string(),
            subject: subject.to_string(),
            description: None,
            status: "completed".to_string(),
            owner: None,
            blocked_by: None,
            metadata: None,
            recorded_at: "2026-02-08T10:00:00Z".to_string(),
        }
    }

    fn make_member(orch_id: &str, name: &str) -> TeamMemberRecord {
        TeamMemberRecord {
            orchestration_id: orch_id.to_string(),
            phase_number: "1".to_string(),
            agent_name: name.to_string(),
            agent_type: Some("general-purpose".to_string()),
            model: Some("opus".to_string()),
            joined_at: None,
            tmux_pane_id: None,
            recorded_at: "2026-02-08T10:00:00Z".to_string(),
        }
    }

    fn make_detail(
        phases: Vec<PhaseRecord>,
        tasks: Vec<TaskEventRecord>,
        members: Vec<TeamMemberRecord>,
    ) -> OrchestrationDetailResponse {
        OrchestrationDetailResponse {
            id: "orch-1".to_string(),
            node_name: "test-node".to_string(),
            record: make_orchestration_record("test-feature"),
            phases,
            tasks,
            team_members: members,
        }
    }

    #[test]
    fn test_verify_detail_all_pass() {
        let detail = make_detail(
            vec![make_phase("orch-1", "1")],
            vec![
                make_task("orch-1", "1", "Setup"),
                make_task("orch-1", "2", "Implement"),
                make_task("orch-1", "3", "Review"),
            ],
            vec![
                make_member("orch-1", "team-lead"),
                make_member("orch-1", "executor-1"),
            ],
        );

        let assertions = ConvexAssertions {
            has_orchestration: true,
            expected_status: None,
            min_phases: Some(1),
            min_tasks: Some(2),
            min_team_members: Some(2),
            min_phase_tasks: None,
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: None,
        };

        let failures = verify_detail(&detail, &assertions);
        assert!(
            failures.is_empty(),
            "Expected no failures, got: {:?}",
            failures
        );
    }

    #[test]
    fn test_verify_detail_status_match() {
        let detail = make_detail(vec![], vec![], vec![]);

        let assertions = ConvexAssertions {
            has_orchestration: true,
            expected_status: Some("complete".to_string()),
            min_phases: None,
            min_tasks: None,
            min_team_members: None,
            min_phase_tasks: None,
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: None,
        };

        let failures = verify_detail(&detail, &assertions);
        assert!(
            failures.is_empty(),
            "Expected no failures, got: {:?}",
            failures
        );
    }

    #[test]
    fn test_verify_detail_status_mismatch() {
        let detail = make_detail(vec![], vec![], vec![]);

        let assertions = ConvexAssertions {
            has_orchestration: true,
            expected_status: Some("planning".to_string()),
            min_phases: None,
            min_tasks: None,
            min_team_members: None,
            min_phase_tasks: None,
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: None,
        };

        let failures = verify_detail(&detail, &assertions);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].message.contains("planning"));
        assert!(failures[0].message.contains("complete"));
    }

    #[test]
    fn test_verify_detail_insufficient_phases() {
        let detail = make_detail(vec![], vec![], vec![]);

        let assertions = ConvexAssertions {
            has_orchestration: true,
            expected_status: None,
            min_phases: Some(1),
            min_tasks: None,
            min_team_members: None,
            min_phase_tasks: None,
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: None,
        };

        let failures = verify_detail(&detail, &assertions);
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].category, FailureCategory::Orchestration);
        assert!(failures[0].message.contains("phases"));
    }

    #[test]
    fn test_verify_detail_insufficient_tasks() {
        let detail = make_detail(
            vec![make_phase("orch-1", "1")],
            vec![make_task("orch-1", "1", "Only one")],
            vec![],
        );

        let assertions = ConvexAssertions {
            has_orchestration: true,
            expected_status: None,
            min_phases: None,
            min_tasks: Some(3),
            min_team_members: None,
            min_phase_tasks: None,
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: None,
        };

        let failures = verify_detail(&detail, &assertions);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].message.contains("tasks"));
    }

    #[test]
    fn test_verify_detail_insufficient_members() {
        let detail = make_detail(vec![], vec![], vec![]);

        let assertions = ConvexAssertions {
            has_orchestration: true,
            expected_status: None,
            min_phases: None,
            min_tasks: None,
            min_team_members: Some(2),
            min_phase_tasks: None,
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: None,
        };

        let failures = verify_detail(&detail, &assertions);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].message.contains("team members"));
    }

    #[test]
    fn test_verify_detail_multiple_failures() {
        let detail = make_detail(vec![], vec![], vec![]);

        let assertions = ConvexAssertions {
            has_orchestration: true,
            expected_status: None,
            min_phases: Some(1),
            min_tasks: Some(3),
            min_team_members: Some(2),
            min_phase_tasks: None,
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: None,
        };

        let failures = verify_detail(&detail, &assertions);
        assert_eq!(failures.len(), 3);
    }

    #[test]
    fn test_verify_detail_no_assertions() {
        let detail = make_detail(vec![], vec![], vec![]);

        let assertions = ConvexAssertions {
            has_orchestration: true,
            expected_status: None,
            min_phases: None,
            min_tasks: None,
            min_team_members: None,
            min_phase_tasks: None,
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: None,
        };

        let failures = verify_detail(&detail, &assertions);
        assert!(failures.is_empty());
    }

    #[test]
    fn test_find_orchestration_by_feature() {
        let entries = vec![
            OrchestrationListEntry {
                id: "orch-1".to_string(),
                node_name: "node-1".to_string(),
                record: make_orchestration_record("auth-system"),
            },
            OrchestrationListEntry {
                id: "orch-2".to_string(),
                node_name: "node-1".to_string(),
                record: make_orchestration_record("verbose-flag"),
            },
        ];

        let found = find_orchestration_by_feature(&entries, "verbose-flag");
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, "orch-2");

        let not_found = find_orchestration_by_feature(&entries, "nonexistent");
        assert!(not_found.is_none());
    }

    #[test]
    fn test_verify_orchestration_exists_success() {
        let entries = vec![OrchestrationListEntry {
            id: "orch-1".to_string(),
            node_name: "node-1".to_string(),
            record: make_orchestration_record("test-feature"),
        }];

        let result = verify_orchestration_exists(&entries, "test-feature");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "orch-1");
    }

    #[test]
    fn test_verify_orchestration_exists_failure() {
        let entries = vec![OrchestrationListEntry {
            id: "orch-1".to_string(),
            node_name: "node-1".to_string(),
            record: make_orchestration_record("other-feature"),
        }];

        let result = verify_orchestration_exists(&entries, "missing-feature");
        assert!(result.is_err());
        let failure = result.unwrap_err();
        assert_eq!(failure.category, FailureCategory::Orchestration);
        assert!(failure.message.contains("missing-feature"));
    }

    #[test]
    fn test_convex_assertions_deserialize() {
        let json = r#"{
            "has_orchestration": true,
            "expected_status": "complete",
            "min_phases": 1,
            "min_tasks": 3,
            "min_team_members": 2
        }"#;

        let assertions: ConvexAssertions = serde_json::from_str(json).unwrap();
        assert!(assertions.has_orchestration);
        assert_eq!(assertions.expected_status, Some("complete".to_string()));
        assert_eq!(assertions.min_phases, Some(1));
        assert_eq!(assertions.min_tasks, Some(3));
        assert_eq!(assertions.min_team_members, Some(2));
        assert!(assertions.min_phase_tasks.is_none());
        assert!(assertions.min_commits.is_none());
        assert!(assertions.min_plans.is_none());
        assert!(assertions.min_shutdown_events.is_none());
        assert!(!assertions.has_markdown_task);
    }

    #[test]
    fn test_convex_assertions_deserialize_minimal() {
        let json = r#"{}"#;

        let assertions: ConvexAssertions = serde_json::from_str(json).unwrap();
        assert!(assertions.has_orchestration); // default_true
        assert!(assertions.expected_status.is_none());
        assert!(assertions.min_phases.is_none());
        assert!(assertions.min_tasks.is_none());
        assert!(assertions.min_team_members.is_none());
        assert!(assertions.min_phase_tasks.is_none());
        assert!(assertions.min_commits.is_none());
        assert!(assertions.min_plans.is_none());
        assert!(assertions.min_shutdown_events.is_none());
        assert!(!assertions.has_markdown_task);
    }

    #[test]
    fn test_verify_detail_insufficient_phase_scoped_tasks() {
        let detail = make_detail(
            vec![make_phase("orch-1", "1")],
            vec![TaskEventRecord {
                orchestration_id: "orch-1".to_string(),
                phase_number: None,
                task_id: "control-1".to_string(),
                subject: "plan-phase-1".to_string(),
                description: None,
                status: "completed".to_string(),
                owner: None,
                blocked_by: None,
                metadata: None,
                recorded_at: "2026-02-08T10:00:00Z".to_string(),
            }],
            vec![],
        );

        let assertions = ConvexAssertions {
            has_orchestration: true,
            expected_status: None,
            min_phases: None,
            min_tasks: None,
            min_team_members: None,
            min_phase_tasks: Some(1),
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: None,
        };

        let failures = verify_detail(&detail, &assertions);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].message.contains("phase-scoped tasks"));
    }

    #[test]
    fn test_verify_artifacts_commit_plan_shutdown_and_markdown_checks() {
        let detail = make_detail(
            vec![make_phase("orch-1", "1")],
            vec![TaskEventRecord {
                orchestration_id: "orch-1".to_string(),
                phase_number: Some("1".to_string()),
                task_id: "1".to_string(),
                subject: "Implement".to_string(),
                description: Some("## Task\n- [ ] done".to_string()),
                status: "completed".to_string(),
                owner: None,
                blocked_by: None,
                metadata: None,
                recorded_at: "2026-02-08T10:00:00Z".to_string(),
            }],
            vec![],
        );

        let commits = vec![CommitRecord {
            orchestration_id: "orch-1".to_string(),
            phase_number: "1".to_string(),
            sha: "abc123".to_string(),
            short_sha: Some("abc123".to_string()),
        }];
        let plans = vec![PlanRecord {
            orchestration_id: "orch-1".to_string(),
            phase_number: "1".to_string(),
            plan_path: "docs/plans/phase-1.md".to_string(),
            content: "# plan".to_string(),
        }];
        let events = vec![OrchestrationEventRecord {
            orchestration_id: "orch-1".to_string(),
            phase_number: Some("1".to_string()),
            event_type: "agent_shutdown".to_string(),
            source: "tina-daemon".to_string(),
            summary: "worker shutdown".to_string(),
            detail: None,
            recorded_at: "2026-02-08T10:00:00Z".to_string(),
        }];

        let assertions = ConvexAssertions {
            has_orchestration: true,
            expected_status: None,
            min_phases: None,
            min_tasks: None,
            min_team_members: None,
            min_phase_tasks: None,
            min_commits: Some(1),
            min_plans: Some(1),
            min_shutdown_events: Some(1),
            has_markdown_task: true,
            min_codex_events: None,
        };

        let failures = verify_artifacts(&detail, &commits, &plans, &events, &assertions);
        assert!(
            failures.is_empty(),
            "Expected no failures, got: {:?}",
            failures
        );
    }

    #[test]
    fn test_convex_assertions_deserialize_extended_fields() {
        let json = r#"{
            "has_orchestration": true,
            "min_phase_tasks": 2,
            "min_commits": 3,
            "min_plans": 2,
            "min_shutdown_events": 1,
            "has_markdown_task": true
        }"#;

        let assertions: ConvexAssertions = serde_json::from_str(json).unwrap();
        assert_eq!(assertions.min_phase_tasks, Some(2));
        assert_eq!(assertions.min_commits, Some(3));
        assert_eq!(assertions.min_plans, Some(2));
        assert_eq!(assertions.min_shutdown_events, Some(1));
        assert!(assertions.has_markdown_task);
    }

    #[test]
    fn test_verify_artifacts_codex_events() {
        let detail = make_detail(vec![], vec![], vec![]);

        let events = vec![
            OrchestrationEventRecord {
                orchestration_id: "orch-1".to_string(),
                phase_number: Some("1".to_string()),
                event_type: "codex_run_started".to_string(),
                source: "tina-session".to_string(),
                summary: "Codex run started".to_string(),
                detail: None,
                recorded_at: "2026-02-08T10:00:00Z".to_string(),
            },
            OrchestrationEventRecord {
                orchestration_id: "orch-1".to_string(),
                phase_number: Some("1".to_string()),
                event_type: "codex_run_completed".to_string(),
                source: "tina-session".to_string(),
                summary: "Codex run completed".to_string(),
                detail: None,
                recorded_at: "2026-02-08T10:01:00Z".to_string(),
            },
        ];

        let assertions_pass = ConvexAssertions {
            has_orchestration: true,
            expected_status: None,
            min_phases: None,
            min_tasks: None,
            min_team_members: None,
            min_phase_tasks: None,
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: Some(2),
        };

        let failures = verify_artifacts(&detail, &[], &[], &events, &assertions_pass);
        assert!(
            failures.is_empty(),
            "Expected no failures, got: {:?}",
            failures
        );

        let assertions_fail = ConvexAssertions {
            has_orchestration: true,
            expected_status: None,
            min_phases: None,
            min_tasks: None,
            min_team_members: None,
            min_phase_tasks: None,
            min_commits: None,
            min_plans: None,
            min_shutdown_events: None,
            has_markdown_task: false,
            min_codex_events: Some(5),
        };

        let failures = verify_artifacts(&detail, &[], &[], &events, &assertions_fail);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].message.contains("Codex run events"));
    }

    #[test]
    fn test_convex_assertions_deserialize_codex_events() {
        let json = r#"{
            "has_orchestration": true,
            "min_codex_events": 4
        }"#;

        let assertions: ConvexAssertions = serde_json::from_str(json).unwrap();
        assert_eq!(assertions.min_codex_events, Some(4));
    }
}
