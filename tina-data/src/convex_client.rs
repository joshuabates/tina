use std::collections::BTreeMap;

use anyhow::{bail, Result};
use convex::{ConvexClient, FunctionResult, QuerySubscription, Value};

use crate::types::*;

/// Typed wrapper around the Convex Rust SDK client.
///
/// All methods map to Convex functions defined in the `convex/` directory.
pub struct TinaConvexClient {
    client: ConvexClient,
}

// --- Arg-building helpers ---

fn node_registration_to_args(reg: &NodeRegistration) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert("name".into(), Value::from(reg.name.as_str()));
    args.insert("os".into(), Value::from(reg.os.as_str()));
    args.insert(
        "authTokenHash".into(),
        Value::from(reg.auth_token_hash.as_str()),
    );
    args
}

fn orchestration_to_args(orch: &OrchestrationRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert("nodeId".into(), Value::from(orch.node_id.as_str()));
    args.insert(
        "featureName".into(),
        Value::from(orch.feature_name.as_str()),
    );
    args.insert(
        "designDocPath".into(),
        Value::from(orch.design_doc_path.as_str()),
    );
    args.insert("branch".into(), Value::from(orch.branch.as_str()));
    if let Some(ref wp) = orch.worktree_path {
        args.insert("worktreePath".into(), Value::from(wp.as_str()));
    }
    args.insert("totalPhases".into(), Value::from(orch.total_phases));
    args.insert("currentPhase".into(), Value::from(orch.current_phase));
    args.insert("status".into(), Value::from(orch.status.as_str()));
    args.insert("startedAt".into(), Value::from(orch.started_at.as_str()));
    if let Some(ref ca) = orch.completed_at {
        args.insert("completedAt".into(), Value::from(ca.as_str()));
    }
    if let Some(mins) = orch.total_elapsed_mins {
        args.insert("totalElapsedMins".into(), Value::from(mins));
    }
    args
}

fn phase_to_args(phase: &PhaseRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert(
        "orchestrationId".into(),
        Value::from(phase.orchestration_id.as_str()),
    );
    args.insert(
        "phaseNumber".into(),
        Value::from(phase.phase_number.as_str()),
    );
    args.insert("status".into(), Value::from(phase.status.as_str()));
    if let Some(ref pp) = phase.plan_path {
        args.insert("planPath".into(), Value::from(pp.as_str()));
    }
    if let Some(ref gr) = phase.git_range {
        args.insert("gitRange".into(), Value::from(gr.as_str()));
    }
    if let Some(mins) = phase.planning_mins {
        args.insert("planningMins".into(), Value::from(mins));
    }
    if let Some(mins) = phase.execution_mins {
        args.insert("executionMins".into(), Value::from(mins));
    }
    if let Some(mins) = phase.review_mins {
        args.insert("reviewMins".into(), Value::from(mins));
    }
    if let Some(ref sa) = phase.started_at {
        args.insert("startedAt".into(), Value::from(sa.as_str()));
    }
    if let Some(ref ca) = phase.completed_at {
        args.insert("completedAt".into(), Value::from(ca.as_str()));
    }
    args
}

fn task_event_to_args(event: &TaskEventRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert(
        "orchestrationId".into(),
        Value::from(event.orchestration_id.as_str()),
    );
    if let Some(ref pn) = event.phase_number {
        args.insert("phaseNumber".into(), Value::from(pn.as_str()));
    }
    args.insert("taskId".into(), Value::from(event.task_id.as_str()));
    args.insert("subject".into(), Value::from(event.subject.as_str()));
    if let Some(ref desc) = event.description {
        args.insert("description".into(), Value::from(desc.as_str()));
    }
    args.insert("status".into(), Value::from(event.status.as_str()));
    if let Some(ref owner) = event.owner {
        args.insert("owner".into(), Value::from(owner.as_str()));
    }
    if let Some(ref bb) = event.blocked_by {
        args.insert("blockedBy".into(), Value::from(bb.as_str()));
    }
    if let Some(ref md) = event.metadata {
        args.insert("metadata".into(), Value::from(md.as_str()));
    }
    args.insert(
        "recordedAt".into(),
        Value::from(event.recorded_at.as_str()),
    );
    args
}

fn orchestration_event_to_args(event: &OrchestrationEventRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert(
        "orchestrationId".into(),
        Value::from(event.orchestration_id.as_str()),
    );
    if let Some(ref pn) = event.phase_number {
        args.insert("phaseNumber".into(), Value::from(pn.as_str()));
    }
    args.insert("eventType".into(), Value::from(event.event_type.as_str()));
    args.insert("source".into(), Value::from(event.source.as_str()));
    args.insert("summary".into(), Value::from(event.summary.as_str()));
    if let Some(ref detail) = event.detail {
        args.insert("detail".into(), Value::from(detail.as_str()));
    }
    args.insert(
        "recordedAt".into(),
        Value::from(event.recorded_at.as_str()),
    );
    args
}

fn team_member_to_args(member: &TeamMemberRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert(
        "orchestrationId".into(),
        Value::from(member.orchestration_id.as_str()),
    );
    args.insert(
        "phaseNumber".into(),
        Value::from(member.phase_number.as_str()),
    );
    args.insert("agentName".into(), Value::from(member.agent_name.as_str()));
    if let Some(ref at) = member.agent_type {
        args.insert("agentType".into(), Value::from(at.as_str()));
    }
    if let Some(ref model) = member.model {
        args.insert("model".into(), Value::from(model.as_str()));
    }
    if let Some(ref ja) = member.joined_at {
        args.insert("joinedAt".into(), Value::from(ja.as_str()));
    }
    args.insert(
        "recordedAt".into(),
        Value::from(member.recorded_at.as_str()),
    );
    args
}

/// Extract a string ID from a Convex FunctionResult.
fn extract_id(result: FunctionResult) -> Result<String> {
    match result {
        FunctionResult::Value(Value::String(id)) => Ok(id),
        FunctionResult::Value(other) => bail!("expected string ID, got: {:?}", other),
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

/// Extract a ClaimResult from a Convex FunctionResult.
fn extract_claim_result(result: FunctionResult) -> Result<ClaimResult> {
    match result {
        FunctionResult::Value(Value::Object(map)) => {
            let success = match map.get("success") {
                Some(Value::Boolean(b)) => *b,
                _ => bail!("missing or invalid 'success' field in claim result"),
            };
            let reason = match map.get("reason") {
                Some(Value::String(s)) => Some(s.clone()),
                _ => None,
            };
            Ok(ClaimResult { success, reason })
        }
        FunctionResult::Value(other) => bail!("expected object for claim result, got: {:?}", other),
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

/// Extract unit result (for mutations that don't return a meaningful value).
fn extract_unit(result: FunctionResult) -> Result<()> {
    match result {
        FunctionResult::Value(_) => Ok(()),
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

impl TinaConvexClient {
    /// Connect to a Convex deployment.
    pub async fn new(deployment_url: &str) -> Result<Self> {
        let client = ConvexClient::new(deployment_url).await?;
        Ok(Self { client })
    }

    /// Register a new node (laptop) with Convex.
    pub async fn register_node(&mut self, reg: &NodeRegistration) -> Result<String> {
        let args = node_registration_to_args(reg);
        let result = self.client.mutation("nodes:registerNode", args).await?;
        extract_id(result)
    }

    /// Send a heartbeat for a node.
    pub async fn heartbeat(&mut self, node_id: &str) -> Result<()> {
        let mut args = BTreeMap::new();
        args.insert("nodeId".into(), Value::from(node_id));
        let result = self.client.mutation("nodes:heartbeat", args).await?;
        extract_unit(result)
    }

    /// Create or update an orchestration record.
    pub async fn upsert_orchestration(&mut self, orch: &OrchestrationRecord) -> Result<String> {
        let args = orchestration_to_args(orch);
        let result = self
            .client
            .mutation("orchestrations:upsertOrchestration", args)
            .await?;
        extract_id(result)
    }

    /// Create or update a phase record.
    pub async fn upsert_phase(&mut self, phase: &PhaseRecord) -> Result<String> {
        let args = phase_to_args(phase);
        let result = self.client.mutation("phases:upsertPhase", args).await?;
        extract_id(result)
    }

    /// Record a task event (append-only).
    pub async fn record_task_event(&mut self, event: &TaskEventRecord) -> Result<String> {
        let args = task_event_to_args(event);
        let result = self.client.mutation("tasks:recordTaskEvent", args).await?;
        extract_id(result)
    }

    /// Record an orchestration event (append-only).
    pub async fn record_event(&mut self, event: &OrchestrationEventRecord) -> Result<String> {
        let args = orchestration_event_to_args(event);
        let result = self.client.mutation("events:recordEvent", args).await?;
        extract_id(result)
    }

    /// Create or update a team member record.
    pub async fn upsert_team_member(&mut self, member: &TeamMemberRecord) -> Result<String> {
        let args = team_member_to_args(member);
        let result = self
            .client
            .mutation("teamMembers:upsertTeamMember", args)
            .await?;
        extract_id(result)
    }

    /// Claim an inbound action (atomic pending -> claimed transition).
    pub async fn claim_action(&mut self, action_id: &str) -> Result<ClaimResult> {
        let mut args = BTreeMap::new();
        args.insert("actionId".into(), Value::from(action_id));
        let result = self.client.mutation("actions:claimAction", args).await?;
        extract_claim_result(result)
    }

    /// Mark an inbound action as completed or failed.
    pub async fn complete_action(
        &mut self,
        action_id: &str,
        result_msg: &str,
        success: bool,
    ) -> Result<()> {
        let mut args = BTreeMap::new();
        args.insert("actionId".into(), Value::from(action_id));
        args.insert("result".into(), Value::from(result_msg));
        args.insert("success".into(), Value::from(success));
        let result = self
            .client
            .mutation("actions:completeAction", args)
            .await?;
        extract_unit(result)
    }

    /// Subscribe to pending actions for a node.
    /// Returns a raw QuerySubscription that the caller can stream.
    pub async fn subscribe_pending_actions(
        &mut self,
        node_id: &str,
    ) -> Result<QuerySubscription> {
        let mut args = BTreeMap::new();
        args.insert("nodeId".into(), Value::from(node_id));
        let sub = self
            .client
            .subscribe("actions:pendingActions", args)
            .await?;
        Ok(sub)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Arg-building tests ---

    #[test]
    fn test_node_registration_to_args() {
        let reg = NodeRegistration {
            name: "macbook-pro".to_string(),
            os: "darwin".to_string(),
            auth_token_hash: "abc123hash".to_string(),
        };

        let args = node_registration_to_args(&reg);

        assert_eq!(args.get("name"), Some(&Value::from("macbook-pro")));
        assert_eq!(args.get("os"), Some(&Value::from("darwin")));
        assert_eq!(args.get("authTokenHash"), Some(&Value::from("abc123hash")));
        assert_eq!(args.len(), 3);
    }

    #[test]
    fn test_orchestration_to_args_all_fields() {
        let orch = OrchestrationRecord {
            node_id: "node-123".to_string(),
            feature_name: "auth-system".to_string(),
            design_doc_path: "docs/auth.md".to_string(),
            branch: "tina/auth-system".to_string(),
            worktree_path: Some("/path/to/worktree".to_string()),
            total_phases: 3,
            current_phase: 2,
            status: "executing".to_string(),
            started_at: "2026-02-07T10:00:00Z".to_string(),
            completed_at: Some("2026-02-07T12:00:00Z".to_string()),
            total_elapsed_mins: Some(120.0),
        };

        let args = orchestration_to_args(&orch);

        assert_eq!(args.get("nodeId"), Some(&Value::from("node-123")));
        assert_eq!(args.get("featureName"), Some(&Value::from("auth-system")));
        assert_eq!(
            args.get("designDocPath"),
            Some(&Value::from("docs/auth.md"))
        );
        assert_eq!(args.get("branch"), Some(&Value::from("tina/auth-system")));
        assert_eq!(
            args.get("worktreePath"),
            Some(&Value::from("/path/to/worktree"))
        );
        assert_eq!(args.get("totalPhases"), Some(&Value::from(3i64)));
        assert_eq!(args.get("currentPhase"), Some(&Value::from(2i64)));
        assert_eq!(args.get("status"), Some(&Value::from("executing")));
        assert_eq!(
            args.get("startedAt"),
            Some(&Value::from("2026-02-07T10:00:00Z"))
        );
        assert_eq!(
            args.get("completedAt"),
            Some(&Value::from("2026-02-07T12:00:00Z"))
        );
        assert_eq!(
            args.get("totalElapsedMins"),
            Some(&Value::from(120.0f64))
        );
        assert_eq!(args.len(), 11);
    }

    #[test]
    fn test_orchestration_to_args_optional_fields_omitted() {
        let orch = OrchestrationRecord {
            node_id: "node-123".to_string(),
            feature_name: "auth".to_string(),
            design_doc_path: "docs/auth.md".to_string(),
            branch: "tina/auth".to_string(),
            worktree_path: None,
            total_phases: 1,
            current_phase: 1,
            status: "planning".to_string(),
            started_at: "2026-02-07T10:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: None,
        };

        let args = orchestration_to_args(&orch);

        assert!(args.get("worktreePath").is_none());
        assert!(args.get("completedAt").is_none());
        assert!(args.get("totalElapsedMins").is_none());
        assert_eq!(args.len(), 8);
    }

    #[test]
    fn test_phase_to_args_all_fields() {
        let phase = PhaseRecord {
            orchestration_id: "orch-123".to_string(),
            phase_number: "1".to_string(),
            status: "executing".to_string(),
            plan_path: Some("/path/to/plan.md".to_string()),
            git_range: Some("abc..def".to_string()),
            planning_mins: Some(5.0),
            execution_mins: Some(15.0),
            review_mins: Some(3.0),
            started_at: Some("2026-02-07T10:00:00Z".to_string()),
            completed_at: Some("2026-02-07T10:23:00Z".to_string()),
        };

        let args = phase_to_args(&phase);

        assert_eq!(args.get("orchestrationId"), Some(&Value::from("orch-123")));
        assert_eq!(args.get("phaseNumber"), Some(&Value::from("1")));
        assert_eq!(args.get("status"), Some(&Value::from("executing")));
        assert_eq!(
            args.get("planPath"),
            Some(&Value::from("/path/to/plan.md"))
        );
        assert_eq!(args.get("gitRange"), Some(&Value::from("abc..def")));
        assert_eq!(args.get("planningMins"), Some(&Value::from(5.0f64)));
        assert_eq!(args.get("executionMins"), Some(&Value::from(15.0f64)));
        assert_eq!(args.get("reviewMins"), Some(&Value::from(3.0f64)));
        assert_eq!(args.len(), 10);
    }

    #[test]
    fn test_phase_to_args_minimal() {
        let phase = PhaseRecord {
            orchestration_id: "orch-123".to_string(),
            phase_number: "2".to_string(),
            status: "planning".to_string(),
            plan_path: None,
            git_range: None,
            planning_mins: None,
            execution_mins: None,
            review_mins: None,
            started_at: None,
            completed_at: None,
        };

        let args = phase_to_args(&phase);

        assert_eq!(args.len(), 3);
        assert!(args.get("planPath").is_none());
        assert!(args.get("gitRange").is_none());
    }

    #[test]
    fn test_task_event_to_args() {
        let event = TaskEventRecord {
            orchestration_id: "orch-123".to_string(),
            phase_number: Some("1".to_string()),
            task_id: "42".to_string(),
            subject: "Implement auth module".to_string(),
            description: Some("Build the auth module".to_string()),
            status: "in_progress".to_string(),
            owner: Some("executor-1".to_string()),
            blocked_by: Some("[\"41\"]".to_string()),
            metadata: Some("{}".to_string()),
            recorded_at: "2026-02-07T10:00:00Z".to_string(),
        };

        let args = task_event_to_args(&event);

        assert_eq!(
            args.get("orchestrationId"),
            Some(&Value::from("orch-123"))
        );
        assert_eq!(args.get("phaseNumber"), Some(&Value::from("1")));
        assert_eq!(args.get("taskId"), Some(&Value::from("42")));
        assert_eq!(
            args.get("subject"),
            Some(&Value::from("Implement auth module"))
        );
        assert_eq!(
            args.get("description"),
            Some(&Value::from("Build the auth module"))
        );
        assert_eq!(args.get("status"), Some(&Value::from("in_progress")));
        assert_eq!(args.get("owner"), Some(&Value::from("executor-1")));
        assert_eq!(args.get("blockedBy"), Some(&Value::from("[\"41\"]")));
        assert_eq!(args.get("metadata"), Some(&Value::from("{}")));
        assert_eq!(args.len(), 10);
    }

    #[test]
    fn test_task_event_to_args_minimal() {
        let event = TaskEventRecord {
            orchestration_id: "orch-123".to_string(),
            phase_number: None,
            task_id: "1".to_string(),
            subject: "Setup".to_string(),
            description: None,
            status: "pending".to_string(),
            owner: None,
            blocked_by: None,
            metadata: None,
            recorded_at: "2026-02-07T10:00:00Z".to_string(),
        };

        let args = task_event_to_args(&event);

        assert!(args.get("phaseNumber").is_none());
        assert!(args.get("description").is_none());
        assert!(args.get("owner").is_none());
        assert!(args.get("blockedBy").is_none());
        assert!(args.get("metadata").is_none());
        assert_eq!(args.len(), 5);
    }

    #[test]
    fn test_orchestration_event_to_args() {
        let event = OrchestrationEventRecord {
            orchestration_id: "orch-123".to_string(),
            phase_number: Some("1".to_string()),
            event_type: "phase_started".to_string(),
            source: "orchestrator".to_string(),
            summary: "Phase 1 started".to_string(),
            detail: Some("Starting execution of phase 1".to_string()),
            recorded_at: "2026-02-07T10:00:00Z".to_string(),
        };

        let args = orchestration_event_to_args(&event);

        assert_eq!(
            args.get("orchestrationId"),
            Some(&Value::from("orch-123"))
        );
        assert_eq!(args.get("phaseNumber"), Some(&Value::from("1")));
        assert_eq!(args.get("eventType"), Some(&Value::from("phase_started")));
        assert_eq!(args.get("source"), Some(&Value::from("orchestrator")));
        assert_eq!(args.get("summary"), Some(&Value::from("Phase 1 started")));
        assert_eq!(
            args.get("detail"),
            Some(&Value::from("Starting execution of phase 1"))
        );
        assert_eq!(args.len(), 7);
    }

    #[test]
    fn test_team_member_to_args() {
        let member = TeamMemberRecord {
            orchestration_id: "orch-123".to_string(),
            phase_number: "1".to_string(),
            agent_name: "executor-1".to_string(),
            agent_type: Some("executor".to_string()),
            model: Some("claude-opus-4-6".to_string()),
            joined_at: Some("2026-02-07T10:00:00Z".to_string()),
            recorded_at: "2026-02-07T10:00:00Z".to_string(),
        };

        let args = team_member_to_args(&member);

        assert_eq!(
            args.get("orchestrationId"),
            Some(&Value::from("orch-123"))
        );
        assert_eq!(args.get("phaseNumber"), Some(&Value::from("1")));
        assert_eq!(args.get("agentName"), Some(&Value::from("executor-1")));
        assert_eq!(args.get("agentType"), Some(&Value::from("executor")));
        assert_eq!(
            args.get("model"),
            Some(&Value::from("claude-opus-4-6"))
        );
        assert_eq!(args.len(), 7);
    }

    #[test]
    fn test_team_member_to_args_minimal() {
        let member = TeamMemberRecord {
            orchestration_id: "orch-123".to_string(),
            phase_number: "1".to_string(),
            agent_name: "executor-1".to_string(),
            agent_type: None,
            model: None,
            joined_at: None,
            recorded_at: "2026-02-07T10:00:00Z".to_string(),
        };

        let args = team_member_to_args(&member);

        assert!(args.get("agentType").is_none());
        assert!(args.get("model").is_none());
        assert!(args.get("joinedAt").is_none());
        assert_eq!(args.len(), 4);
    }

    // --- Result extraction tests ---

    #[test]
    fn test_extract_id_from_string_value() {
        let result = FunctionResult::Value(Value::from("doc-id-123"));
        let id = extract_id(result).unwrap();
        assert_eq!(id, "doc-id-123");
    }

    #[test]
    fn test_extract_id_error_on_non_string() {
        let result = FunctionResult::Value(Value::from(42i64));
        let err = extract_id(result).unwrap_err();
        assert!(err.to_string().contains("expected string ID"));
    }

    #[test]
    fn test_extract_id_error_on_error_message() {
        let result = FunctionResult::ErrorMessage("something went wrong".into());
        let err = extract_id(result).unwrap_err();
        assert!(err.to_string().contains("something went wrong"));
    }

    #[test]
    fn test_extract_claim_result_success() {
        let mut map = BTreeMap::new();
        map.insert("success".to_string(), Value::from(true));
        let result = FunctionResult::Value(Value::Object(map));

        let claim = extract_claim_result(result).unwrap();
        assert!(claim.success);
        assert!(claim.reason.is_none());
    }

    #[test]
    fn test_extract_claim_result_failure_with_reason() {
        let mut map = BTreeMap::new();
        map.insert("success".to_string(), Value::from(false));
        map.insert("reason".to_string(), Value::from("already_claimed"));
        let result = FunctionResult::Value(Value::Object(map));

        let claim = extract_claim_result(result).unwrap();
        assert!(!claim.success);
        assert_eq!(claim.reason.as_deref(), Some("already_claimed"));
    }

    #[test]
    fn test_extract_claim_result_error_on_non_object() {
        let result = FunctionResult::Value(Value::from("not an object"));
        let err = extract_claim_result(result).unwrap_err();
        assert!(err.to_string().contains("expected object"));
    }

    #[test]
    fn test_extract_unit_success() {
        let result = FunctionResult::Value(Value::Null);
        assert!(extract_unit(result).is_ok());
    }

    #[test]
    fn test_extract_unit_error() {
        let result = FunctionResult::ErrorMessage("bad".into());
        assert!(extract_unit(result).is_err());
    }
}
