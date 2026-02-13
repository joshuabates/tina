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

pub fn orchestration_to_args(orch: &OrchestrationRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert("nodeId".into(), Value::from(orch.node_id.as_str()));
    if let Some(ref pid) = orch.project_id {
        args.insert("projectId".into(), Value::from(pid.clone()));
    }
    if let Some(ref did) = orch.design_id {
        args.insert("designId".into(), Value::from(did.clone()));
    }
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
        args.insert("worktreePath".into(), Value::from(wp.clone()));
    }
    args.insert("totalPhases".into(), Value::from(orch.total_phases));
    args.insert("currentPhase".into(), Value::from(orch.current_phase));
    args.insert("status".into(), Value::from(orch.status.as_str()));
    args.insert("startedAt".into(), Value::from(orch.started_at.as_str()));
    if let Some(ref ca) = orch.completed_at {
        args.insert("completedAt".into(), Value::from(ca.clone()));
    }
    if let Some(mins) = orch.total_elapsed_mins {
        args.insert("totalElapsedMins".into(), Value::from(mins));
    }
    args
}

pub fn phase_to_args(phase: &PhaseRecord) -> BTreeMap<String, Value> {
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
    args.insert("recordedAt".into(), Value::from(event.recorded_at.as_str()));
    args
}

pub fn orchestration_event_to_args(event: &OrchestrationEventRecord) -> BTreeMap<String, Value> {
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
    args.insert("recordedAt".into(), Value::from(event.recorded_at.as_str()));
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

fn register_team_to_args(team: &RegisterTeamRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert("teamName".into(), Value::from(team.team_name.as_str()));
    args.insert(
        "orchestrationId".into(),
        Value::from(team.orchestration_id.as_str()),
    );
    args.insert(
        "leadSessionId".into(),
        Value::from(team.lead_session_id.as_str()),
    );
    if let Some(ref tmux_session_name) = team.tmux_session_name {
        args.insert(
            "tmuxSessionName".into(),
            Value::from(tmux_session_name.as_str()),
        );
    }
    if let Some(ref pn) = team.phase_number {
        args.insert("phaseNumber".into(), Value::from(pn.as_str()));
    }
    if let Some(ref ptid) = team.parent_team_id {
        args.insert("parentTeamId".into(), Value::from(ptid.as_str()));
    }
    args.insert("createdAt".into(), Value::from(team.created_at));
    args
}

fn commit_to_args(commit: &CommitRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert(
        "orchestrationId".into(),
        Value::from(commit.orchestration_id.as_str()),
    );
    args.insert(
        "phaseNumber".into(),
        Value::from(commit.phase_number.as_str()),
    );
    args.insert("sha".into(), Value::from(commit.sha.as_str()));
    args.insert("shortSha".into(), Value::from(commit.short_sha.as_str()));
    args.insert("subject".into(), Value::from(commit.subject.as_str()));
    args.insert("author".into(), Value::from(commit.author.as_str()));
    args.insert("timestamp".into(), Value::from(commit.timestamp.as_str()));
    args.insert("insertions".into(), Value::from(commit.insertions as f64));
    args.insert("deletions".into(), Value::from(commit.deletions as f64));
    args
}

fn plan_to_args(plan: &PlanRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert(
        "orchestrationId".into(),
        Value::from(plan.orchestration_id.as_str()),
    );
    args.insert(
        "phaseNumber".into(),
        Value::from(plan.phase_number.as_str()),
    );
    args.insert("planPath".into(), Value::from(plan.plan_path.as_str()));
    args.insert("content".into(), Value::from(plan.content.as_str()));
    args
}

#[cfg(test)]
fn design_to_args(design: &DesignRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert("projectId".into(), Value::from(design.project_id.as_str()));
    args.insert("designKey".into(), Value::from(design.design_key.as_str()));
    args.insert("title".into(), Value::from(design.title.as_str()));
    args.insert("markdown".into(), Value::from(design.markdown.as_str()));
    args.insert("status".into(), Value::from(design.status.as_str()));
    args.insert("createdAt".into(), Value::from(design.created_at.as_str()));
    args.insert("updatedAt".into(), Value::from(design.updated_at.as_str()));
    if let Some(ref aa) = design.archived_at {
        args.insert("archivedAt".into(), Value::from(aa.as_str()));
    }
    args
}

#[cfg(test)]
fn ticket_to_args(ticket: &TicketRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert("projectId".into(), Value::from(ticket.project_id.as_str()));
    if let Some(ref did) = ticket.design_id {
        args.insert("designId".into(), Value::from(did.as_str()));
    }
    args.insert("ticketKey".into(), Value::from(ticket.ticket_key.as_str()));
    args.insert("title".into(), Value::from(ticket.title.as_str()));
    args.insert("description".into(), Value::from(ticket.description.as_str()));
    args.insert("status".into(), Value::from(ticket.status.as_str()));
    args.insert("priority".into(), Value::from(ticket.priority.as_str()));
    if let Some(ref assignee) = ticket.assignee {
        args.insert("assignee".into(), Value::from(assignee.as_str()));
    }
    if let Some(ref estimate) = ticket.estimate {
        args.insert("estimate".into(), Value::from(estimate.as_str()));
    }
    args.insert("createdAt".into(), Value::from(ticket.created_at.as_str()));
    args.insert("updatedAt".into(), Value::from(ticket.updated_at.as_str()));
    if let Some(ref ca) = ticket.closed_at {
        args.insert("closedAt".into(), Value::from(ca.as_str()));
    }
    args
}

#[cfg(test)]
fn comment_to_args(comment: &CommentRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert("projectId".into(), Value::from(comment.project_id.as_str()));
    args.insert("targetType".into(), Value::from(comment.target_type.as_str()));
    args.insert("targetId".into(), Value::from(comment.target_id.as_str()));
    args.insert("authorType".into(), Value::from(comment.author_type.as_str()));
    args.insert("authorName".into(), Value::from(comment.author_name.as_str()));
    args.insert("body".into(), Value::from(comment.body.as_str()));
    args.insert("createdAt".into(), Value::from(comment.created_at.as_str()));
    args
}

pub fn span_to_args(span: &SpanRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert("traceId".into(), Value::from(span.trace_id.as_str()));
    args.insert("spanId".into(), Value::from(span.span_id.as_str()));
    if let Some(ref psid) = span.parent_span_id {
        args.insert("parentSpanId".into(), Value::from(psid.as_str()));
    }
    if let Some(ref oid) = span.orchestration_id {
        args.insert("orchestrationId".into(), Value::from(oid.as_str()));
    }
    if let Some(ref fn_) = span.feature_name {
        args.insert("featureName".into(), Value::from(fn_.as_str()));
    }
    if let Some(ref pn) = span.phase_number {
        args.insert("phaseNumber".into(), Value::from(pn.as_str()));
    }
    if let Some(ref tn) = span.team_name {
        args.insert("teamName".into(), Value::from(tn.as_str()));
    }
    if let Some(ref tid) = span.task_id {
        args.insert("taskId".into(), Value::from(tid.as_str()));
    }
    args.insert("source".into(), Value::from(span.source.as_str()));
    args.insert("operation".into(), Value::from(span.operation.as_str()));
    args.insert("startedAt".into(), Value::from(span.started_at.as_str()));
    if let Some(ref ea) = span.ended_at {
        args.insert("endedAt".into(), Value::from(ea.as_str()));
    }
    if let Some(dur) = span.duration_ms {
        args.insert("durationMs".into(), Value::from(dur));
    }
    args.insert("status".into(), Value::from(span.status.as_str()));
    if let Some(ref ec) = span.error_code {
        args.insert("errorCode".into(), Value::from(ec.as_str()));
    }
    if let Some(ref ed) = span.error_detail {
        args.insert("errorDetail".into(), Value::from(ed.as_str()));
    }
    if let Some(ref attrs) = span.attrs {
        args.insert("attrs".into(), Value::from(attrs.as_str()));
    }
    args.insert("recordedAt".into(), Value::from(span.recorded_at.as_str()));
    args
}

pub fn event_to_args(event: &EventRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert("traceId".into(), Value::from(event.trace_id.as_str()));
    args.insert("spanId".into(), Value::from(event.span_id.as_str()));
    if let Some(ref psid) = event.parent_span_id {
        args.insert("parentSpanId".into(), Value::from(psid.as_str()));
    }
    if let Some(ref oid) = event.orchestration_id {
        args.insert("orchestrationId".into(), Value::from(oid.as_str()));
    }
    if let Some(ref fn_) = event.feature_name {
        args.insert("featureName".into(), Value::from(fn_.as_str()));
    }
    if let Some(ref pn) = event.phase_number {
        args.insert("phaseNumber".into(), Value::from(pn.as_str()));
    }
    if let Some(ref tn) = event.team_name {
        args.insert("teamName".into(), Value::from(tn.as_str()));
    }
    if let Some(ref tid) = event.task_id {
        args.insert("taskId".into(), Value::from(tid.as_str()));
    }
    args.insert("source".into(), Value::from(event.source.as_str()));
    args.insert("eventType".into(), Value::from(event.event_type.as_str()));
    args.insert("severity".into(), Value::from(event.severity.as_str()));
    args.insert("message".into(), Value::from(event.message.as_str()));
    if let Some(ref st) = event.status {
        args.insert("status".into(), Value::from(st.as_str()));
    }
    if let Some(ref attrs) = event.attrs {
        args.insert("attrs".into(), Value::from(attrs.as_str()));
    }
    args.insert("recordedAt".into(), Value::from(event.recorded_at.as_str()));
    args
}

pub fn rollup_to_args(rollup: &RollupRecord) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert(
        "windowStart".into(),
        Value::from(rollup.window_start.as_str()),
    );
    args.insert("windowEnd".into(), Value::from(rollup.window_end.as_str()));
    args.insert(
        "granularityMin".into(),
        Value::from(rollup.granularity_min as i64),
    );
    args.insert("source".into(), Value::from(rollup.source.as_str()));
    args.insert("operation".into(), Value::from(rollup.operation.as_str()));
    if let Some(ref oid) = rollup.orchestration_id {
        args.insert("orchestrationId".into(), Value::from(oid.as_str()));
    }
    if let Some(ref pn) = rollup.phase_number {
        args.insert("phaseNumber".into(), Value::from(pn.as_str()));
    }
    args.insert("spanCount".into(), Value::from(rollup.span_count as i64));
    args.insert("errorCount".into(), Value::from(rollup.error_count as i64));
    args.insert("eventCount".into(), Value::from(rollup.event_count as i64));
    if let Some(p95) = rollup.p95_duration_ms {
        args.insert("p95DurationMs".into(), Value::from(p95));
    }
    if let Some(max) = rollup.max_duration_ms {
        args.insert("maxDurationMs".into(), Value::from(max));
    }
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

/// Extract optional state JSON from `supervisorStates:getSupervisorState`.
fn extract_optional_state_json(result: FunctionResult) -> Result<Option<String>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(map)) => match map.get("stateJson") {
            Some(Value::String(s)) => Ok(Some(s.clone())),
            Some(other) => bail!("expected stateJson string, got: {:?}", other),
            None => Ok(None),
        },
        FunctionResult::Value(other) => bail!(
            "expected object from supervisor state query, got: {:?}",
            other
        ),
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

// --- Query result extraction helpers ---

fn value_as_str(map: &BTreeMap<String, Value>, key: &str) -> String {
    match map.get(key) {
        Some(Value::String(s)) => s.clone(),
        _ => String::new(),
    }
}

fn value_as_opt_str(map: &BTreeMap<String, Value>, key: &str) -> Option<String> {
    match map.get(key) {
        Some(Value::String(s)) => Some(s.clone()),
        _ => None,
    }
}

fn value_as_f64(map: &BTreeMap<String, Value>, key: &str) -> f64 {
    match map.get(key) {
        Some(Value::Float64(f)) => *f,
        Some(Value::Int64(n)) => *n as f64,
        _ => 0.0,
    }
}

fn value_as_opt_f64(map: &BTreeMap<String, Value>, key: &str) -> Option<f64> {
    match map.get(key) {
        Some(Value::Float64(f)) => Some(*f),
        Some(Value::Int64(n)) => Some(*n as f64),
        _ => None,
    }
}

fn value_as_u32(map: &BTreeMap<String, Value>, key: &str) -> u32 {
    match map.get(key) {
        Some(Value::Int64(n)) => (*n).max(0) as u32,
        Some(Value::Float64(f)) if *f >= 0.0 => *f as u32,
        _ => 0,
    }
}

fn value_as_opt_bool(map: &BTreeMap<String, Value>, key: &str) -> Option<bool> {
    match map.get(key) {
        Some(Value::Boolean(b)) => Some(*b),
        _ => None,
    }
}

fn value_as_id(map: &BTreeMap<String, Value>, key: &str) -> String {
    match map.get(key) {
        Some(Value::String(s)) => s.clone(),
        _ => String::new(),
    }
}

fn extract_orchestration_record(obj: &BTreeMap<String, Value>) -> OrchestrationRecord {
    OrchestrationRecord {
        node_id: value_as_id(obj, "nodeId"),
        project_id: value_as_opt_str(obj, "projectId"),
        design_id: value_as_opt_str(obj, "designId"),
        feature_name: value_as_str(obj, "featureName"),
        design_doc_path: value_as_str(obj, "designDocPath"),
        branch: value_as_str(obj, "branch"),
        worktree_path: value_as_opt_str(obj, "worktreePath"),
        total_phases: value_as_f64(obj, "totalPhases"),
        current_phase: value_as_f64(obj, "currentPhase"),
        status: value_as_str(obj, "status"),
        started_at: value_as_str(obj, "startedAt"),
        completed_at: value_as_opt_str(obj, "completedAt"),
        total_elapsed_mins: value_as_opt_f64(obj, "totalElapsedMins"),
        policy_snapshot: value_as_opt_str(obj, "policySnapshot"),
        policy_snapshot_hash: value_as_opt_str(obj, "policySnapshotHash"),
        preset_origin: value_as_opt_str(obj, "presetOrigin"),
        design_only: value_as_opt_bool(obj, "designOnly"),
        policy_revision: value_as_opt_f64(obj, "policyRevision"),
        updated_at: value_as_opt_str(obj, "updatedAt"),
    }
}

fn extract_orchestration_from_obj(obj: &BTreeMap<String, Value>) -> OrchestrationListEntry {
    OrchestrationListEntry {
        id: value_as_id(obj, "_id"),
        node_name: value_as_str(obj, "nodeName"),
        record: extract_orchestration_record(obj),
    }
}

fn extract_feature_orchestration_from_obj(
    obj: &BTreeMap<String, Value>,
) -> FeatureOrchestrationRecord {
    FeatureOrchestrationRecord {
        id: value_as_id(obj, "_id"),
        record: extract_orchestration_record(obj),
    }
}

fn extract_phase_from_obj(obj: &BTreeMap<String, Value>) -> PhaseRecord {
    PhaseRecord {
        orchestration_id: value_as_id(obj, "orchestrationId"),
        phase_number: value_as_str(obj, "phaseNumber"),
        status: value_as_str(obj, "status"),
        plan_path: value_as_opt_str(obj, "planPath"),
        git_range: value_as_opt_str(obj, "gitRange"),
        planning_mins: value_as_opt_f64(obj, "planningMins"),
        execution_mins: value_as_opt_f64(obj, "executionMins"),
        review_mins: value_as_opt_f64(obj, "reviewMins"),
        started_at: value_as_opt_str(obj, "startedAt"),
        completed_at: value_as_opt_str(obj, "completedAt"),
    }
}

fn extract_task_event_from_obj(obj: &BTreeMap<String, Value>) -> TaskEventRecord {
    TaskEventRecord {
        orchestration_id: value_as_id(obj, "orchestrationId"),
        phase_number: value_as_opt_str(obj, "phaseNumber"),
        task_id: value_as_str(obj, "taskId"),
        subject: value_as_str(obj, "subject"),
        description: value_as_opt_str(obj, "description"),
        status: value_as_str(obj, "status"),
        owner: value_as_opt_str(obj, "owner"),
        blocked_by: value_as_opt_str(obj, "blockedBy"),
        metadata: value_as_opt_str(obj, "metadata"),
        recorded_at: value_as_str(obj, "recordedAt"),
    }
}

fn extract_team_member_from_obj(obj: &BTreeMap<String, Value>) -> TeamMemberRecord {
    TeamMemberRecord {
        orchestration_id: value_as_id(obj, "orchestrationId"),
        phase_number: value_as_str(obj, "phaseNumber"),
        agent_name: value_as_str(obj, "agentName"),
        agent_type: value_as_opt_str(obj, "agentType"),
        model: value_as_opt_str(obj, "model"),
        joined_at: value_as_opt_str(obj, "joinedAt"),
        recorded_at: value_as_str(obj, "recordedAt"),
    }
}

fn extract_orchestration_event_from_obj(obj: &BTreeMap<String, Value>) -> OrchestrationEventRecord {
    OrchestrationEventRecord {
        orchestration_id: value_as_id(obj, "orchestrationId"),
        phase_number: value_as_opt_str(obj, "phaseNumber"),
        event_type: value_as_str(obj, "eventType"),
        source: value_as_str(obj, "source"),
        summary: value_as_str(obj, "summary"),
        detail: value_as_opt_str(obj, "detail"),
        recorded_at: value_as_str(obj, "recordedAt"),
    }
}

fn extract_commit_from_obj(obj: &BTreeMap<String, Value>) -> CommitRecord {
    CommitRecord {
        orchestration_id: value_as_id(obj, "orchestrationId"),
        phase_number: value_as_str(obj, "phaseNumber"),
        sha: value_as_str(obj, "sha"),
        short_sha: value_as_str(obj, "shortSha"),
        subject: value_as_str(obj, "subject"),
        author: value_as_str(obj, "author"),
        timestamp: value_as_str(obj, "timestamp"),
        insertions: value_as_u32(obj, "insertions"),
        deletions: value_as_u32(obj, "deletions"),
    }
}

fn extract_plan_from_obj(obj: &BTreeMap<String, Value>) -> PlanRecord {
    PlanRecord {
        orchestration_id: value_as_id(obj, "orchestrationId"),
        phase_number: value_as_str(obj, "phaseNumber"),
        plan_path: value_as_str(obj, "planPath"),
        content: value_as_str(obj, "content"),
    }
}

fn extract_optional_feature_orchestration(
    result: FunctionResult,
) -> Result<Option<FeatureOrchestrationRecord>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(obj)) => {
            Ok(Some(extract_feature_orchestration_from_obj(&obj)))
        }
        FunctionResult::Value(other) => {
            bail!("expected object or null for getByFeature, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_optional_phase_record(result: FunctionResult) -> Result<Option<PhaseRecord>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(obj)) => Ok(Some(extract_phase_from_obj(&obj))),
        FunctionResult::Value(other) => {
            bail!("expected object or null for phase status, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_orchestration_list(result: FunctionResult) -> Result<Vec<OrchestrationListEntry>> {
    match result {
        FunctionResult::Value(Value::Array(items)) => {
            let mut entries = Vec::new();
            for item in items {
                if let Value::Object(obj) = item {
                    entries.push(extract_orchestration_from_obj(&obj));
                }
            }
            Ok(entries)
        }
        FunctionResult::Value(Value::Null) => Ok(vec![]),
        FunctionResult::Value(other) => {
            bail!("expected array for orchestration list, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_orchestration_detail(
    result: FunctionResult,
) -> Result<Option<OrchestrationDetailResponse>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(obj)) => {
            let phases = match obj.get("phases") {
                Some(Value::Array(items)) => items
                    .iter()
                    .filter_map(|v| match v {
                        Value::Object(o) => Some(extract_phase_from_obj(o)),
                        _ => None,
                    })
                    .collect(),
                _ => vec![],
            };

            let tasks = match obj.get("tasks") {
                Some(Value::Array(items)) => items
                    .iter()
                    .filter_map(|v| match v {
                        Value::Object(o) => Some(extract_task_event_from_obj(o)),
                        _ => None,
                    })
                    .collect(),
                _ => vec![],
            };

            let team_members = match obj.get("teamMembers") {
                Some(Value::Array(items)) => items
                    .iter()
                    .filter_map(|v| match v {
                        Value::Object(o) => Some(extract_team_member_from_obj(o)),
                        _ => None,
                    })
                    .collect(),
                _ => vec![],
            };

            Ok(Some(OrchestrationDetailResponse {
                id: value_as_id(&obj, "_id"),
                node_name: value_as_str(&obj, "nodeName"),
                record: extract_orchestration_record(&obj),
                phases,
                tasks,
                team_members,
            }))
        }
        FunctionResult::Value(other) => {
            bail!("expected object for orchestration detail, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_node_list(result: FunctionResult) -> Result<Vec<NodeRecord>> {
    match result {
        FunctionResult::Value(Value::Array(items)) => {
            let mut nodes = Vec::new();
            for item in items {
                if let Value::Object(obj) = item {
                    nodes.push(NodeRecord {
                        id: value_as_id(&obj, "_id"),
                        name: value_as_str(&obj, "name"),
                        os: value_as_str(&obj, "os"),
                        status: value_as_str(&obj, "status"),
                        last_heartbeat: value_as_f64(&obj, "lastHeartbeat"),
                        registered_at: value_as_f64(&obj, "registeredAt"),
                    });
                }
            }
            Ok(nodes)
        }
        FunctionResult::Value(Value::Null) => Ok(vec![]),
        FunctionResult::Value(other) => bail!("expected array for node list, got: {:?}", other),
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_team_record_from_obj(obj: &BTreeMap<String, Value>) -> TeamRecord {
    TeamRecord {
        id: value_as_id(obj, "_id"),
        team_name: value_as_str(obj, "teamName"),
        orchestration_id: value_as_id(obj, "orchestrationId"),
        lead_session_id: value_as_str(obj, "leadSessionId"),
        tmux_session_name: value_as_opt_str(obj, "tmuxSessionName"),
        phase_number: value_as_opt_str(obj, "phaseNumber"),
        parent_team_id: value_as_opt_str(obj, "parentTeamId"),
        created_at: value_as_f64(obj, "createdAt"),
    }
}

fn extract_team_record(result: FunctionResult) -> Result<Option<TeamRecord>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(obj)) => Ok(Some(extract_team_record_from_obj(&obj))),
        FunctionResult::Value(other) => bail!("expected object for team record, got: {:?}", other),
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_active_team_list(result: FunctionResult) -> Result<Vec<ActiveTeamRecord>> {
    match result {
        FunctionResult::Value(Value::Array(items)) => {
            let mut teams = Vec::new();
            for item in items {
                if let Value::Object(obj) = item {
                    teams.push(ActiveTeamRecord {
                        id: value_as_id(&obj, "_id"),
                        team_name: value_as_str(&obj, "teamName"),
                        orchestration_id: value_as_id(&obj, "orchestrationId"),
                        lead_session_id: value_as_str(&obj, "leadSessionId"),
                        tmux_session_name: value_as_opt_str(&obj, "tmuxSessionName"),
                        phase_number: value_as_opt_str(&obj, "phaseNumber"),
                        parent_team_id: value_as_opt_str(&obj, "parentTeamId"),
                        created_at: value_as_f64(&obj, "createdAt"),
                        orchestration_status: value_as_str(&obj, "orchestrationStatus"),
                        feature_name: value_as_str(&obj, "featureName"),
                    });
                }
            }
            Ok(teams)
        }
        FunctionResult::Value(Value::Null) => Ok(vec![]),
        FunctionResult::Value(other) => {
            bail!("expected array for active team list, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_orchestration_event_list(
    result: FunctionResult,
) -> Result<Vec<OrchestrationEventRecord>> {
    match result {
        FunctionResult::Value(Value::Array(items)) => {
            let mut events = Vec::new();
            for item in items {
                if let Value::Object(obj) = item {
                    events.push(extract_orchestration_event_from_obj(&obj));
                }
            }
            Ok(events)
        }
        FunctionResult::Value(Value::Null) => Ok(vec![]),
        FunctionResult::Value(other) => {
            bail!(
                "expected array for orchestration event list, got: {:?}",
                other
            )
        }
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_commit_list(result: FunctionResult) -> Result<Vec<CommitRecord>> {
    match result {
        FunctionResult::Value(Value::Array(items)) => {
            let mut commits = Vec::new();
            for item in items {
                if let Value::Object(obj) = item {
                    commits.push(extract_commit_from_obj(&obj));
                }
            }
            Ok(commits)
        }
        FunctionResult::Value(Value::Null) => Ok(vec![]),
        FunctionResult::Value(other) => bail!("expected array for commit list, got: {:?}", other),
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_plan_list(result: FunctionResult) -> Result<Vec<PlanRecord>> {
    match result {
        FunctionResult::Value(Value::Array(items)) => {
            let mut plans = Vec::new();
            for item in items {
                if let Value::Object(obj) = item {
                    plans.push(extract_plan_from_obj(&obj));
                }
            }
            Ok(plans)
        }
        FunctionResult::Value(Value::Null) => Ok(vec![]),
        FunctionResult::Value(other) => bail!("expected array for plan list, got: {:?}", other),
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_design_record(obj: &BTreeMap<String, Value>) -> DesignRecord {
    DesignRecord {
        id: value_as_id(obj, "_id"),
        project_id: value_as_id(obj, "projectId"),
        design_key: value_as_str(obj, "designKey"),
        title: value_as_str(obj, "title"),
        markdown: value_as_str(obj, "markdown"),
        status: value_as_str(obj, "status"),
        created_at: value_as_str(obj, "createdAt"),
        updated_at: value_as_str(obj, "updatedAt"),
        archived_at: value_as_opt_str(obj, "archivedAt"),
    }
}

fn extract_optional_design(result: FunctionResult) -> Result<Option<DesignRecord>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(obj)) => Ok(Some(extract_design_record(&obj))),
        FunctionResult::Value(other) => {
            bail!("expected object or null for design, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_design_list(result: FunctionResult) -> Result<Vec<DesignRecord>> {
    match result {
        FunctionResult::Value(Value::Array(items)) => {
            let mut designs = Vec::new();
            for item in items {
                if let Value::Object(obj) = item {
                    designs.push(extract_design_record(&obj));
                }
            }
            Ok(designs)
        }
        FunctionResult::Value(Value::Null) => Ok(vec![]),
        FunctionResult::Value(other) => bail!("expected array for design list, got: {:?}", other),
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_ticket_record(obj: &BTreeMap<String, Value>) -> TicketRecord {
    TicketRecord {
        id: value_as_id(obj, "_id"),
        project_id: value_as_id(obj, "projectId"),
        design_id: value_as_opt_str(obj, "designId"),
        ticket_key: value_as_str(obj, "ticketKey"),
        title: value_as_str(obj, "title"),
        description: value_as_str(obj, "description"),
        status: value_as_str(obj, "status"),
        priority: value_as_str(obj, "priority"),
        assignee: value_as_opt_str(obj, "assignee"),
        estimate: value_as_opt_str(obj, "estimate"),
        created_at: value_as_str(obj, "createdAt"),
        updated_at: value_as_str(obj, "updatedAt"),
        closed_at: value_as_opt_str(obj, "closedAt"),
    }
}

fn extract_optional_ticket(result: FunctionResult) -> Result<Option<TicketRecord>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(obj)) => Ok(Some(extract_ticket_record(&obj))),
        FunctionResult::Value(other) => {
            bail!("expected object or null for ticket, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_ticket_list(result: FunctionResult) -> Result<Vec<TicketRecord>> {
    match result {
        FunctionResult::Value(Value::Array(items)) => {
            let mut tickets = Vec::new();
            for item in items {
                if let Value::Object(obj) = item {
                    tickets.push(extract_ticket_record(&obj));
                }
            }
            Ok(tickets)
        }
        FunctionResult::Value(Value::Null) => Ok(vec![]),
        FunctionResult::Value(other) => bail!("expected array for ticket list, got: {:?}", other),
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_comment_record(obj: &BTreeMap<String, Value>) -> CommentRecord {
    CommentRecord {
        id: value_as_id(obj, "_id"),
        project_id: value_as_id(obj, "projectId"),
        target_type: value_as_str(obj, "targetType"),
        target_id: value_as_str(obj, "targetId"),
        author_type: value_as_str(obj, "authorType"),
        author_name: value_as_str(obj, "authorName"),
        body: value_as_str(obj, "body"),
        created_at: value_as_str(obj, "createdAt"),
        edited_at: value_as_opt_str(obj, "editedAt"),
    }
}

fn extract_comment_list(result: FunctionResult) -> Result<Vec<CommentRecord>> {
    match result {
        FunctionResult::Value(Value::Array(items)) => {
            let mut comments = Vec::new();
            for item in items {
                if let Value::Object(obj) = item {
                    comments.push(extract_comment_record(&obj));
                }
            }
            Ok(comments)
        }
        FunctionResult::Value(Value::Null) => Ok(vec![]),
        FunctionResult::Value(other) => bail!("expected array for comment list, got: {:?}", other),
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

    /// Find or create a project by repo path.
    pub async fn find_or_create_project(&mut self, name: &str, repo_path: &str) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("name".into(), Value::from(name));
        args.insert("repoPath".into(), Value::from(repo_path));
        let result = self
            .client
            .mutation("projects:findOrCreateByRepoPath", args)
            .await?;
        extract_id(result)
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

    /// Register a team in Convex.
    pub async fn register_team(&mut self, team: &RegisterTeamRecord) -> Result<String> {
        let args = register_team_to_args(team);
        let result = self.client.mutation("teams:registerTeam", args).await?;
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
        let result = self.client.mutation("actions:completeAction", args).await?;
        extract_unit(result)
    }

    /// Subscribe to pending actions for a node.
    /// Returns a raw QuerySubscription that the caller can stream.
    pub async fn subscribe_pending_actions(&mut self, node_id: &str) -> Result<QuerySubscription> {
        let mut args = BTreeMap::new();
        args.insert("nodeId".into(), Value::from(node_id));
        let sub = self
            .client
            .subscribe("actions:pendingActions", args)
            .await?;
        Ok(sub)
    }

    /// Upsert supervisor state JSON for node+feature.
    pub async fn upsert_supervisor_state(
        &mut self,
        node_id: &str,
        feature_name: &str,
        state_json: &str,
        updated_at: f64,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("nodeId".into(), Value::from(node_id));
        args.insert("featureName".into(), Value::from(feature_name));
        args.insert("stateJson".into(), Value::from(state_json));
        args.insert("updatedAt".into(), Value::from(updated_at));
        let result = self
            .client
            .mutation("supervisorStates:upsertSupervisorState", args)
            .await?;
        extract_id(result)
    }

    /// Fetch supervisor state JSON for node+feature.
    pub async fn get_supervisor_state(
        &mut self,
        node_id: &str,
        feature_name: &str,
    ) -> Result<Option<String>> {
        let mut args = BTreeMap::new();
        args.insert("nodeId".into(), Value::from(node_id));
        args.insert("featureName".into(), Value::from(feature_name));
        let result = self
            .client
            .query("supervisorStates:getSupervisorState", args)
            .await?;
        extract_optional_state_json(result)
    }

    // --- Query methods (for tina-monitor reads) ---

    /// List all orchestrations with node names resolved.
    pub async fn list_orchestrations(&mut self) -> Result<Vec<OrchestrationListEntry>> {
        let args = BTreeMap::new();
        let result = self
            .client
            .query("orchestrations:listOrchestrations", args)
            .await?;
        extract_orchestration_list(result)
    }

    /// Get full detail for an orchestration (phases, tasks, team members).
    pub async fn get_orchestration_detail(
        &mut self,
        orchestration_id: &str,
    ) -> Result<Option<OrchestrationDetailResponse>> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        let result = self
            .client
            .query("orchestrations:getOrchestrationDetail", args)
            .await?;
        extract_orchestration_detail(result)
    }

    /// List orchestration events for an orchestration, optionally filtered.
    pub async fn list_events(
        &mut self,
        orchestration_id: &str,
        event_type: Option<&str>,
        since: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<OrchestrationEventRecord>> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        if let Some(event_type) = event_type {
            args.insert("eventType".into(), Value::from(event_type));
        }
        if let Some(since) = since {
            args.insert("since".into(), Value::from(since));
        }
        if let Some(limit) = limit {
            // Convex v.number() validates as float64; send an f64 literal.
            args.insert("limit".into(), Value::from(limit as f64));
        }
        let result = self.client.query("events:listEvents", args).await?;
        extract_orchestration_event_list(result)
    }

    /// List all registered nodes.
    pub async fn list_nodes(&mut self) -> Result<Vec<NodeRecord>> {
        let args = BTreeMap::new();
        let result = self.client.query("nodes:listNodes", args).await?;
        extract_node_list(result)
    }

    /// List all active teams (teams whose orchestration is not complete/blocked).
    pub async fn list_active_teams(&mut self) -> Result<Vec<ActiveTeamRecord>> {
        let args = BTreeMap::new();
        let result = self.client.query("teams:listActiveTeams", args).await?;
        extract_active_team_list(result)
    }

    /// Look up a team by name from the Convex `teams` table.
    pub async fn get_team_by_name(&mut self, team_name: &str) -> Result<Option<TeamRecord>> {
        let mut args = BTreeMap::new();
        args.insert("teamName".into(), Value::from(team_name));
        let result = self.client.query("teams:getByTeamName", args).await?;
        extract_team_record(result)
    }

    /// Get latest orchestration by feature name.
    pub async fn get_by_feature(
        &mut self,
        feature_name: &str,
    ) -> Result<Option<FeatureOrchestrationRecord>> {
        let mut args = BTreeMap::new();
        args.insert("featureName".into(), Value::from(feature_name));
        let result = self
            .client
            .query("orchestrations:getByFeature", args)
            .await?;
        extract_optional_feature_orchestration(result)
    }

    /// Get phase status for orchestration+phase pair.
    pub async fn get_phase_status(
        &mut self,
        orchestration_id: &str,
        phase_number: &str,
    ) -> Result<Option<PhaseRecord>> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        args.insert("phaseNumber".into(), Value::from(phase_number));
        let result = self.client.query("phases:getPhaseStatus", args).await?;
        extract_optional_phase_record(result)
    }

    /// Subscribe to phase status updates.
    pub async fn subscribe_phase_status(
        &mut self,
        orchestration_id: &str,
        phase_number: &str,
    ) -> Result<QuerySubscription> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        args.insert("phaseNumber".into(), Value::from(phase_number));
        self.client
            .subscribe("phases:getPhaseStatus", args)
            .await
            .map_err(Into::into)
    }

    /// Record a git commit (deduplicates by SHA).
    pub async fn record_commit(&mut self, commit: &CommitRecord) -> Result<String> {
        let args = commit_to_args(commit);
        let result = self.client.mutation("commits:recordCommit", args).await?;
        extract_id(result)
    }

    /// List commits for an orchestration, optionally filtered by phase.
    pub async fn list_commits(
        &mut self,
        orchestration_id: &str,
        phase_number: Option<&str>,
    ) -> Result<Vec<CommitRecord>> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        if let Some(phase_number) = phase_number {
            args.insert("phaseNumber".into(), Value::from(phase_number));
        }
        let result = self.client.query("commits:listCommits", args).await?;
        extract_commit_list(result)
    }

    /// Upsert a plan file (creates or updates by orchestrationId + phaseNumber).
    pub async fn upsert_plan(&mut self, plan: &PlanRecord) -> Result<String> {
        let args = plan_to_args(plan);
        let result = self.client.mutation("plans:upsertPlan", args).await?;
        extract_id(result)
    }

    /// List plans for an orchestration.
    pub async fn list_plans(&mut self, orchestration_id: &str) -> Result<Vec<PlanRecord>> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        let result = self.client.query("plans:listPlans", args).await?;
        extract_plan_list(result)
    }

    /// Record a telemetry span (dedups by spanId).
    pub async fn record_telemetry_span(&mut self, span: &SpanRecord) -> Result<String> {
        let args = span_to_args(span);
        let result = self.client.mutation("telemetry:recordSpan", args).await?;
        extract_id(result)
    }

    /// Record a telemetry event (append-only).
    pub async fn record_telemetry_event(&mut self, event: &EventRecord) -> Result<String> {
        let args = event_to_args(event);
        let result = self.client.mutation("telemetry:recordEvent", args).await?;
        extract_id(result)
    }

    /// Record a telemetry rollup (upserts by window+source+operation).
    pub async fn record_telemetry_rollup(&mut self, rollup: &RollupRecord) -> Result<String> {
        let args = rollup_to_args(rollup);
        let result = self.client.mutation("telemetry:recordRollup", args).await?;
        extract_id(result)
    }

    // --- PM (Project Management) methods ---

    /// Create a new design.
    pub async fn create_design(
        &mut self,
        project_id: &str,
        title: &str,
        markdown: &str,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("projectId".into(), Value::from(project_id));
        args.insert("title".into(), Value::from(title));
        args.insert("markdown".into(), Value::from(markdown));
        let result = self.client.mutation("designs:createDesign", args).await?;
        extract_id(result)
    }

    /// Get a design by ID.
    pub async fn get_design(&mut self, design_id: &str) -> Result<Option<DesignRecord>> {
        let mut args = BTreeMap::new();
        args.insert("designId".into(), Value::from(design_id));
        let result = self.client.query("designs:getDesign", args).await?;
        extract_optional_design(result)
    }

    /// Get a design by key.
    pub async fn get_design_by_key(&mut self, design_key: &str) -> Result<Option<DesignRecord>> {
        let mut args = BTreeMap::new();
        args.insert("designKey".into(), Value::from(design_key));
        let result = self.client.query("designs:getDesignByKey", args).await?;
        extract_optional_design(result)
    }

    /// List designs for a project, optionally filtered by status.
    pub async fn list_designs(
        &mut self,
        project_id: &str,
        status: Option<&str>,
    ) -> Result<Vec<DesignRecord>> {
        let mut args = BTreeMap::new();
        args.insert("projectId".into(), Value::from(project_id));
        if let Some(s) = status {
            args.insert("status".into(), Value::from(s));
        }
        let result = self.client.query("designs:listDesigns", args).await?;
        extract_design_list(result)
    }

    /// Update a design.
    pub async fn update_design(
        &mut self,
        design_id: &str,
        title: Option<&str>,
        markdown: Option<&str>,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("designId".into(), Value::from(design_id));
        if let Some(t) = title {
            args.insert("title".into(), Value::from(t));
        }
        if let Some(m) = markdown {
            args.insert("markdown".into(), Value::from(m));
        }
        let result = self.client.mutation("designs:updateDesign", args).await?;
        extract_id(result)
    }

    /// Transition a design to a new status.
    pub async fn transition_design(&mut self, design_id: &str, new_status: &str) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("designId".into(), Value::from(design_id));
        args.insert("newStatus".into(), Value::from(new_status));
        let result = self
            .client
            .mutation("designs:transitionDesign", args)
            .await?;
        extract_id(result)
    }

    /// Create a new ticket.
    pub async fn create_ticket(
        &mut self,
        project_id: &str,
        design_id: Option<&str>,
        title: &str,
        description: &str,
        priority: &str,
        assignee: Option<&str>,
        estimate: Option<&str>,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("projectId".into(), Value::from(project_id));
        if let Some(did) = design_id {
            args.insert("designId".into(), Value::from(did));
        }
        args.insert("title".into(), Value::from(title));
        args.insert("description".into(), Value::from(description));
        args.insert("priority".into(), Value::from(priority));
        if let Some(a) = assignee {
            args.insert("assignee".into(), Value::from(a));
        }
        if let Some(e) = estimate {
            args.insert("estimate".into(), Value::from(e));
        }
        let result = self.client.mutation("tickets:createTicket", args).await?;
        extract_id(result)
    }

    /// Get a ticket by ID.
    pub async fn get_ticket(&mut self, ticket_id: &str) -> Result<Option<TicketRecord>> {
        let mut args = BTreeMap::new();
        args.insert("ticketId".into(), Value::from(ticket_id));
        let result = self.client.query("tickets:getTicket", args).await?;
        extract_optional_ticket(result)
    }

    /// Get a ticket by key.
    pub async fn get_ticket_by_key(&mut self, ticket_key: &str) -> Result<Option<TicketRecord>> {
        let mut args = BTreeMap::new();
        args.insert("ticketKey".into(), Value::from(ticket_key));
        let result = self.client.query("tickets:getTicketByKey", args).await?;
        extract_optional_ticket(result)
    }

    /// List tickets for a project, optionally filtered by status, design, or assignee.
    pub async fn list_tickets(
        &mut self,
        project_id: &str,
        status: Option<&str>,
        design_id: Option<&str>,
        assignee: Option<&str>,
    ) -> Result<Vec<TicketRecord>> {
        let mut args = BTreeMap::new();
        args.insert("projectId".into(), Value::from(project_id));
        if let Some(s) = status {
            args.insert("status".into(), Value::from(s));
        }
        if let Some(did) = design_id {
            args.insert("designId".into(), Value::from(did));
        }
        if let Some(a) = assignee {
            args.insert("assignee".into(), Value::from(a));
        }
        let result = self.client.query("tickets:listTickets", args).await?;
        extract_ticket_list(result)
    }

    /// Update a ticket.
    pub async fn update_ticket(
        &mut self,
        ticket_id: &str,
        title: Option<&str>,
        description: Option<&str>,
        priority: Option<&str>,
        design_id: Option<&str>,
        clear_design_id: bool,
        assignee: Option<&str>,
        estimate: Option<&str>,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("ticketId".into(), Value::from(ticket_id));
        if let Some(t) = title {
            args.insert("title".into(), Value::from(t));
        }
        if let Some(d) = description {
            args.insert("description".into(), Value::from(d));
        }
        if let Some(p) = priority {
            args.insert("priority".into(), Value::from(p));
        }
        if let Some(did) = design_id {
            args.insert("designId".into(), Value::from(did));
        }
        if clear_design_id {
            args.insert("clearDesignId".into(), Value::from(true));
        }
        if let Some(a) = assignee {
            args.insert("assignee".into(), Value::from(a));
        }
        if let Some(e) = estimate {
            args.insert("estimate".into(), Value::from(e));
        }
        let result = self.client.mutation("tickets:updateTicket", args).await?;
        extract_id(result)
    }

    /// Transition a ticket to a new status.
    pub async fn transition_ticket(&mut self, ticket_id: &str, new_status: &str) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("ticketId".into(), Value::from(ticket_id));
        args.insert("newStatus".into(), Value::from(new_status));
        let result = self
            .client
            .mutation("tickets:transitionTicket", args)
            .await?;
        extract_id(result)
    }

    /// Add a comment to a design or ticket (internal function).
    pub async fn add_comment(
        &mut self,
        project_id: &str,
        target_type: &str,
        target_id: &str,
        author_type: &str,
        author_name: &str,
        body: &str,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("projectId".into(), Value::from(project_id));
        args.insert("targetType".into(), Value::from(target_type));
        args.insert("targetId".into(), Value::from(target_id));
        args.insert("authorType".into(), Value::from(author_type));
        args.insert("authorName".into(), Value::from(author_name));
        args.insert("body".into(), Value::from(body));
        let result = self
            .client
            .mutation("workComments:addComment", args)
            .await?;
        extract_id(result)
    }

    /// List comments for a design or ticket (internal function).
    pub async fn list_comments(
        &mut self,
        target_type: &str,
        target_id: &str,
    ) -> Result<Vec<CommentRecord>> {
        let mut args = BTreeMap::new();
        args.insert("targetType".into(), Value::from(target_type));
        args.insert("targetId".into(), Value::from(target_id));
        let result = self
            .client
            .query("workComments:listComments", args)
            .await?;
        extract_comment_list(result)
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
            project_id: None,
            design_id: None,
            feature_name: "auth-system".to_string(),
            design_doc_path: "docs/auth.md".to_string(),
            branch: "tina/auth-system".to_string(),
            worktree_path: Some("/path/to/worktree".to_string()),
            total_phases: 3.0,
            current_phase: 2.0,
            status: "executing".to_string(),
            started_at: "2026-02-07T10:00:00Z".to_string(),
            completed_at: Some("2026-02-07T12:00:00Z".to_string()),
            total_elapsed_mins: Some(120.0),
            policy_snapshot: None,
            policy_snapshot_hash: None,
            preset_origin: None,
            design_only: None,
            policy_revision: None,
            updated_at: None,
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
        assert_eq!(args.get("totalPhases"), Some(&Value::from(3.0f64)));
        assert_eq!(args.get("currentPhase"), Some(&Value::from(2.0f64)));
        assert_eq!(args.get("status"), Some(&Value::from("executing")));
        assert_eq!(
            args.get("startedAt"),
            Some(&Value::from("2026-02-07T10:00:00Z"))
        );
        assert_eq!(
            args.get("completedAt"),
            Some(&Value::from("2026-02-07T12:00:00Z"))
        );
        assert_eq!(args.get("totalElapsedMins"), Some(&Value::from(120.0f64)));
        assert_eq!(args.len(), 11);
    }

    #[test]
    fn test_orchestration_to_args_optional_fields_omitted() {
        let orch = OrchestrationRecord {
            node_id: "node-123".to_string(),
            project_id: None,
            design_id: None,
            feature_name: "auth".to_string(),
            design_doc_path: "docs/auth.md".to_string(),
            branch: "tina/auth".to_string(),
            worktree_path: None,
            total_phases: 1.0,
            current_phase: 1.0,
            status: "planning".to_string(),
            started_at: "2026-02-07T10:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: None,
            policy_snapshot: None,
            policy_snapshot_hash: None,
            preset_origin: None,
            design_only: None,
            policy_revision: None,
            updated_at: None,
        };

        let args = orchestration_to_args(&orch);

        assert!(args.get("worktreePath").is_none());
        assert!(args.get("completedAt").is_none());
        assert!(args.get("totalElapsedMins").is_none());
        assert!(args.get("designId").is_none());
        assert_eq!(args.len(), 8);
    }

    #[test]
    fn test_orchestration_to_args_with_design_id() {
        let orch = OrchestrationRecord {
            node_id: "node-123".to_string(),
            project_id: Some("proj-456".to_string()),
            design_id: Some("design-789".to_string()),
            feature_name: "linked-feature".to_string(),
            design_doc_path: "docs/design.md".to_string(),
            branch: "tina/linked-feature".to_string(),
            worktree_path: None,
            total_phases: 2.0,
            current_phase: 1.0,
            status: "planning".to_string(),
            started_at: "2026-02-11T10:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: None,
            policy_snapshot: None,
            policy_snapshot_hash: None,
            preset_origin: None,
            design_only: None,
            policy_revision: None,
            updated_at: None,
        };

        let args = orchestration_to_args(&orch);

        assert_eq!(args.get("designId"), Some(&Value::from("design-789")));
        assert_eq!(args.get("projectId"), Some(&Value::from("proj-456")));
        assert_eq!(args.len(), 10); // 8 required + projectId + designId
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
        assert_eq!(args.get("planPath"), Some(&Value::from("/path/to/plan.md")));
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
    fn test_commit_to_args_uses_f64_for_diff_counts() {
        let commit = CommitRecord {
            orchestration_id: "orch-123".to_string(),
            phase_number: "1".to_string(),
            sha: "abc123".to_string(),
            short_sha: "abc123".to_string(),
            subject: "feat: test".to_string(),
            author: "Test <test@example.com>".to_string(),
            timestamp: "2026-02-11T07:00:00Z".to_string(),
            insertions: 12,
            deletions: 0,
        };

        let args = commit_to_args(&commit);
        assert_eq!(args.get("insertions"), Some(&Value::from(12.0f64)));
        assert_eq!(args.get("deletions"), Some(&Value::from(0.0f64)));
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

        assert_eq!(args.get("orchestrationId"), Some(&Value::from("orch-123")));
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

        assert_eq!(args.get("orchestrationId"), Some(&Value::from("orch-123")));
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

        assert_eq!(args.get("orchestrationId"), Some(&Value::from("orch-123")));
        assert_eq!(args.get("phaseNumber"), Some(&Value::from("1")));
        assert_eq!(args.get("agentName"), Some(&Value::from("executor-1")));
        assert_eq!(args.get("agentType"), Some(&Value::from("executor")));
        assert_eq!(args.get("model"), Some(&Value::from("claude-opus-4-6")));
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

    // --- Team record extraction tests ---

    #[test]
    fn test_extract_team_record_null() {
        let result = FunctionResult::Value(Value::Null);
        let team = extract_team_record(result).unwrap();
        assert!(team.is_none());
    }

    #[test]
    fn test_extract_team_record_found() {
        let mut map = BTreeMap::new();
        map.insert("_id".to_string(), Value::from("team-id-123"));
        map.insert(
            "teamName".to_string(),
            Value::from("my-feature-orchestration"),
        );
        map.insert("orchestrationId".to_string(), Value::from("orch-456"));
        map.insert("leadSessionId".to_string(), Value::from("session-789"));
        map.insert(
            "tmuxSessionName".to_string(),
            Value::from("tina-my-feature-phase-1"),
        );
        map.insert("phaseNumber".to_string(), Value::from("1"));
        map.insert("parentTeamId".to_string(), Value::from("parent-team-001"));
        map.insert("createdAt".to_string(), Value::from(1706644800000.0f64));
        let result = FunctionResult::Value(Value::Object(map));

        let team = extract_team_record(result).unwrap().unwrap();
        assert_eq!(team.id, "team-id-123");
        assert_eq!(team.team_name, "my-feature-orchestration");
        assert_eq!(team.orchestration_id, "orch-456");
        assert_eq!(team.lead_session_id, "session-789");
        assert_eq!(
            team.tmux_session_name.as_deref(),
            Some("tina-my-feature-phase-1")
        );
        assert_eq!(team.phase_number.as_deref(), Some("1"));
        assert_eq!(team.parent_team_id.as_deref(), Some("parent-team-001"));
        assert_eq!(team.created_at, 1706644800000.0);
    }

    #[test]
    fn test_extract_team_record_no_phase() {
        let mut map = BTreeMap::new();
        map.insert("_id".to_string(), Value::from("team-id-123"));
        map.insert("teamName".to_string(), Value::from("my-team"));
        map.insert("orchestrationId".to_string(), Value::from("orch-456"));
        map.insert("leadSessionId".to_string(), Value::from("session-789"));
        map.insert("createdAt".to_string(), Value::from(1706644800000.0f64));
        let result = FunctionResult::Value(Value::Object(map));

        let team = extract_team_record(result).unwrap().unwrap();
        assert!(team.phase_number.is_none());
        assert!(team.parent_team_id.is_none());
    }

    #[test]
    fn test_extract_team_record_error() {
        let result = FunctionResult::ErrorMessage("not found".into());
        assert!(extract_team_record(result).is_err());
    }

    // --- Active team list extraction tests ---

    #[test]
    fn test_extract_active_team_list_empty() {
        let result = FunctionResult::Value(Value::Array(vec![]));
        let teams = extract_active_team_list(result).unwrap();
        assert!(teams.is_empty());
    }

    #[test]
    fn test_extract_active_team_list_null() {
        let result = FunctionResult::Value(Value::Null);
        let teams = extract_active_team_list(result).unwrap();
        assert!(teams.is_empty());
    }

    #[test]
    fn test_extract_active_team_list_with_entries() {
        let mut map = BTreeMap::new();
        map.insert("_id".to_string(), Value::from("team-id-1"));
        map.insert("teamName".to_string(), Value::from("feature-orchestration"));
        map.insert("orchestrationId".to_string(), Value::from("orch-1"));
        map.insert("leadSessionId".to_string(), Value::from("session-1"));
        map.insert(
            "tmuxSessionName".to_string(),
            Value::from("tina-feature-phase-1"),
        );
        map.insert("phaseNumber".to_string(), Value::from("1"));
        map.insert("parentTeamId".to_string(), Value::from("parent-team-1"));
        map.insert("createdAt".to_string(), Value::from(1000.0f64));
        map.insert("orchestrationStatus".to_string(), Value::from("executing"));
        map.insert("featureName".to_string(), Value::from("my-feature"));

        let result = FunctionResult::Value(Value::Array(vec![Value::Object(map)]));
        let teams = extract_active_team_list(result).unwrap();

        assert_eq!(teams.len(), 1);
        assert_eq!(teams[0].id, "team-id-1");
        assert_eq!(teams[0].team_name, "feature-orchestration");
        assert_eq!(teams[0].orchestration_status, "executing");
        assert_eq!(teams[0].feature_name, "my-feature");
        assert_eq!(
            teams[0].tmux_session_name.as_deref(),
            Some("tina-feature-phase-1")
        );
        assert_eq!(teams[0].parent_team_id.as_deref(), Some("parent-team-1"));
    }

    #[test]
    fn test_extract_active_team_list_error() {
        let result = FunctionResult::ErrorMessage("query failed".into());
        assert!(extract_active_team_list(result).is_err());
    }

    // --- PM arg-building tests ---

    #[test]
    fn test_design_to_args_all_fields() {
        let design = DesignRecord {
            id: "design-123".to_string(),
            project_id: "proj-123".to_string(),
            design_key: "MYAPP-D1".to_string(),
            title: "User Auth Flow".to_string(),
            markdown: "# Auth Design\n\nDetails here".to_string(),
            status: "approved".to_string(),
            created_at: "2026-02-11T10:00:00Z".to_string(),
            updated_at: "2026-02-11T11:00:00Z".to_string(),
            archived_at: Some("2026-02-11T12:00:00Z".to_string()),
        };

        let args = design_to_args(&design);

        assert_eq!(args.get("projectId"), Some(&Value::from("proj-123")));
        assert_eq!(args.get("designKey"), Some(&Value::from("MYAPP-D1")));
        assert_eq!(args.get("title"), Some(&Value::from("User Auth Flow")));
        assert_eq!(
            args.get("markdown"),
            Some(&Value::from("# Auth Design\n\nDetails here"))
        );
        assert_eq!(args.get("status"), Some(&Value::from("approved")));
        assert_eq!(
            args.get("createdAt"),
            Some(&Value::from("2026-02-11T10:00:00Z"))
        );
        assert_eq!(
            args.get("updatedAt"),
            Some(&Value::from("2026-02-11T11:00:00Z"))
        );
        assert_eq!(
            args.get("archivedAt"),
            Some(&Value::from("2026-02-11T12:00:00Z"))
        );
    }

    #[test]
    fn test_design_to_args_no_archived_at() {
        let design = DesignRecord {
            id: "design-123".to_string(),
            project_id: "proj-123".to_string(),
            design_key: "MYAPP-D1".to_string(),
            title: "Design".to_string(),
            markdown: "Content".to_string(),
            status: "draft".to_string(),
            created_at: "2026-02-11T10:00:00Z".to_string(),
            updated_at: "2026-02-11T10:00:00Z".to_string(),
            archived_at: None,
        };

        let args = design_to_args(&design);

        assert!(args.get("archivedAt").is_none());
        assert_eq!(args.len(), 7);
    }

    #[test]
    fn test_ticket_to_args_all_fields() {
        let ticket = TicketRecord {
            id: "ticket-123".to_string(),
            project_id: "proj-123".to_string(),
            design_id: Some("design-456".to_string()),
            ticket_key: "MYAPP-123".to_string(),
            title: "Implement OAuth".to_string(),
            description: "Add OAuth support".to_string(),
            status: "in_progress".to_string(),
            priority: "high".to_string(),
            assignee: Some("alice@example.com".to_string()),
            estimate: Some("3d".to_string()),
            created_at: "2026-02-11T10:00:00Z".to_string(),
            updated_at: "2026-02-11T11:00:00Z".to_string(),
            closed_at: Some("2026-02-11T12:00:00Z".to_string()),
        };

        let args = ticket_to_args(&ticket);

        assert_eq!(args.get("projectId"), Some(&Value::from("proj-123")));
        assert_eq!(args.get("designId"), Some(&Value::from("design-456")));
        assert_eq!(args.get("ticketKey"), Some(&Value::from("MYAPP-123")));
        assert_eq!(args.get("title"), Some(&Value::from("Implement OAuth")));
        assert_eq!(
            args.get("description"),
            Some(&Value::from("Add OAuth support"))
        );
        assert_eq!(args.get("status"), Some(&Value::from("in_progress")));
        assert_eq!(args.get("priority"), Some(&Value::from("high")));
        assert_eq!(args.get("assignee"), Some(&Value::from("alice@example.com")));
        assert_eq!(args.get("estimate"), Some(&Value::from("3d")));
        assert_eq!(
            args.get("closedAt"),
            Some(&Value::from("2026-02-11T12:00:00Z"))
        );
    }

    #[test]
    fn test_ticket_to_args_minimal() {
        let ticket = TicketRecord {
            id: "ticket-123".to_string(),
            project_id: "proj-123".to_string(),
            design_id: None,
            ticket_key: "MYAPP-1".to_string(),
            title: "Task".to_string(),
            description: "Do it".to_string(),
            status: "todo".to_string(),
            priority: "low".to_string(),
            assignee: None,
            estimate: None,
            created_at: "2026-02-11T10:00:00Z".to_string(),
            updated_at: "2026-02-11T10:00:00Z".to_string(),
            closed_at: None,
        };

        let args = ticket_to_args(&ticket);

        assert!(args.get("designId").is_none());
        assert!(args.get("assignee").is_none());
        assert!(args.get("estimate").is_none());
        assert!(args.get("closedAt").is_none());
        assert_eq!(args.len(), 8);
    }

    #[test]
    fn test_comment_to_args() {
        let comment = CommentRecord {
            id: "comment-123".to_string(),
            project_id: "proj-123".to_string(),
            target_type: "design".to_string(),
            target_id: "design-456".to_string(),
            author_type: "human".to_string(),
            author_name: "alice@example.com".to_string(),
            body: "Great design!".to_string(),
            created_at: "2026-02-11T10:00:00Z".to_string(),
            edited_at: None,
        };

        let args = comment_to_args(&comment);

        assert_eq!(args.get("projectId"), Some(&Value::from("proj-123")));
        assert_eq!(args.get("targetType"), Some(&Value::from("design")));
        assert_eq!(args.get("targetId"), Some(&Value::from("design-456")));
        assert_eq!(args.get("authorType"), Some(&Value::from("human")));
        assert_eq!(args.get("authorName"), Some(&Value::from("alice@example.com")));
        assert_eq!(args.get("body"), Some(&Value::from("Great design!")));
        assert_eq!(
            args.get("createdAt"),
            Some(&Value::from("2026-02-11T10:00:00Z"))
        );
        assert_eq!(args.len(), 7);
    }

    #[test]
    fn test_comment_to_args_agent_author() {
        let comment = CommentRecord {
            id: "comment-123".to_string(),
            project_id: "proj-123".to_string(),
            target_type: "ticket".to_string(),
            target_id: "ticket-789".to_string(),
            author_type: "agent".to_string(),
            author_name: "claude-executor-1".to_string(),
            body: "This looks good".to_string(),
            created_at: "2026-02-11T10:00:00Z".to_string(),
            edited_at: None,
        };

        let args = comment_to_args(&comment);

        assert_eq!(args.get("authorType"), Some(&Value::from("agent")));
        assert_eq!(args.get("authorName"), Some(&Value::from("claude-executor-1")));
        assert_eq!(args.get("targetType"), Some(&Value::from("ticket")));
    }

    #[test]
    fn test_design_update_args_partial() {
        let design = DesignRecord {
            id: "design-123".to_string(),
            project_id: "proj-123".to_string(),
            design_key: "MYAPP-D1".to_string(),
            title: "Original Title".to_string(),
            markdown: "# Original".to_string(),
            status: "draft".to_string(),
            created_at: "2026-02-11T10:00:00Z".to_string(),
            updated_at: "2026-02-11T10:00:00Z".to_string(),
            archived_at: None,
        };

        let args = design_to_args(&design);

        assert_eq!(args.get("projectId"), Some(&Value::from("proj-123")));
        assert_eq!(args.get("designKey"), Some(&Value::from("MYAPP-D1")));
        assert_eq!(args.len(), 7);
    }

    #[test]
    fn test_extract_design_record_from_obj() {
        let mut obj = BTreeMap::new();
        obj.insert("_id".to_string(), Value::from("design-456"));
        obj.insert("projectId".to_string(), Value::from("proj-123"));
        obj.insert("designKey".to_string(), Value::from("MYAPP-D1"));
        obj.insert("title".to_string(), Value::from("Test Design"));
        obj.insert("markdown".to_string(), Value::from("# Test"));
        obj.insert("status".to_string(), Value::from("draft"));
        obj.insert("createdAt".to_string(), Value::from("2026-02-11T10:00:00Z"));
        obj.insert("updatedAt".to_string(), Value::from("2026-02-11T11:00:00Z"));

        let design = extract_design_record(&obj);

        assert_eq!(design.id, "design-456");
        assert_eq!(design.project_id, "proj-123");
        assert_eq!(design.design_key, "MYAPP-D1");
        assert_eq!(design.title, "Test Design");
        assert_eq!(design.status, "draft");
        assert!(design.archived_at.is_none());
    }

    #[test]
    fn test_extract_design_record_with_archived_at() {
        let mut obj = BTreeMap::new();
        obj.insert("_id".to_string(), Value::from("design-456"));
        obj.insert("projectId".to_string(), Value::from("proj-123"));
        obj.insert("designKey".to_string(), Value::from("MYAPP-D1"));
        obj.insert("title".to_string(), Value::from("Test Design"));
        obj.insert("markdown".to_string(), Value::from("# Test"));
        obj.insert("status".to_string(), Value::from("archived"));
        obj.insert("createdAt".to_string(), Value::from("2026-02-11T10:00:00Z"));
        obj.insert("updatedAt".to_string(), Value::from("2026-02-11T11:00:00Z"));
        obj.insert("archivedAt".to_string(), Value::from("2026-02-11T12:00:00Z"));

        let design = extract_design_record(&obj);

        assert_eq!(design.id, "design-456");
        assert_eq!(design.archived_at, Some("2026-02-11T12:00:00Z".to_string()));
    }

    #[test]
    fn test_extract_ticket_record_from_obj() {
        let mut obj = BTreeMap::new();
        obj.insert("_id".to_string(), Value::from("ticket-789"));
        obj.insert("projectId".to_string(), Value::from("proj-123"));
        obj.insert("ticketKey".to_string(), Value::from("MYAPP-123"));
        obj.insert("title".to_string(), Value::from("Test Ticket"));
        obj.insert("description".to_string(), Value::from("Do something"));
        obj.insert("status".to_string(), Value::from("todo"));
        obj.insert("priority".to_string(), Value::from("medium"));
        obj.insert("createdAt".to_string(), Value::from("2026-02-11T10:00:00Z"));
        obj.insert("updatedAt".to_string(), Value::from("2026-02-11T11:00:00Z"));

        let ticket = extract_ticket_record(&obj);

        assert_eq!(ticket.id, "ticket-789");
        assert_eq!(ticket.project_id, "proj-123");
        assert_eq!(ticket.ticket_key, "MYAPP-123");
        assert_eq!(ticket.title, "Test Ticket");
        assert_eq!(ticket.status, "todo");
        assert!(ticket.design_id.is_none());
        assert!(ticket.closed_at.is_none());
    }

    #[test]
    fn test_extract_ticket_record_with_optional_fields() {
        let mut obj = BTreeMap::new();
        obj.insert("_id".to_string(), Value::from("ticket-789"));
        obj.insert("projectId".to_string(), Value::from("proj-123"));
        obj.insert("designId".to_string(), Value::from("design-456"));
        obj.insert("ticketKey".to_string(), Value::from("MYAPP-123"));
        obj.insert("title".to_string(), Value::from("Test Ticket"));
        obj.insert("description".to_string(), Value::from("Do something"));
        obj.insert("status".to_string(), Value::from("done"));
        obj.insert("priority".to_string(), Value::from("high"));
        obj.insert("assignee".to_string(), Value::from("alice@example.com"));
        obj.insert("estimate".to_string(), Value::from("3d"));
        obj.insert("createdAt".to_string(), Value::from("2026-02-11T10:00:00Z"));
        obj.insert("updatedAt".to_string(), Value::from("2026-02-11T11:00:00Z"));
        obj.insert("closedAt".to_string(), Value::from("2026-02-11T12:00:00Z"));

        let ticket = extract_ticket_record(&obj);

        assert_eq!(ticket.design_id, Some("design-456".to_string()));
        assert_eq!(ticket.assignee, Some("alice@example.com".to_string()));
        assert_eq!(ticket.closed_at, Some("2026-02-11T12:00:00Z".to_string()));
    }

    #[test]
    fn test_extract_comment_record_from_obj() {
        let mut obj = BTreeMap::new();
        obj.insert("_id".to_string(), Value::from("comment-999"));
        obj.insert("projectId".to_string(), Value::from("proj-123"));
        obj.insert("targetType".to_string(), Value::from("design"));
        obj.insert("targetId".to_string(), Value::from("design-456"));
        obj.insert("authorType".to_string(), Value::from("human"));
        obj.insert("authorName".to_string(), Value::from("alice@example.com"));
        obj.insert("body".to_string(), Value::from("Great design!"));
        obj.insert("createdAt".to_string(), Value::from("2026-02-11T10:00:00Z"));

        let comment = extract_comment_record(&obj);

        assert_eq!(comment.id, "comment-999");
        assert_eq!(comment.project_id, "proj-123");
        assert_eq!(comment.target_type, "design");
        assert_eq!(comment.author_type, "human");
        assert_eq!(comment.body, "Great design!");
        assert!(comment.edited_at.is_none());
    }

    #[test]
    fn test_extract_comment_record_with_edited_at() {
        let mut obj = BTreeMap::new();
        obj.insert("_id".to_string(), Value::from("comment-999"));
        obj.insert("projectId".to_string(), Value::from("proj-123"));
        obj.insert("targetType".to_string(), Value::from("ticket"));
        obj.insert("targetId".to_string(), Value::from("ticket-789"));
        obj.insert("authorType".to_string(), Value::from("agent"));
        obj.insert("authorName".to_string(), Value::from("claude-executor-1"));
        obj.insert("body".to_string(), Value::from("Updated comment"));
        obj.insert("createdAt".to_string(), Value::from("2026-02-11T10:00:00Z"));
        obj.insert("editedAt".to_string(), Value::from("2026-02-11T11:00:00Z"));

        let comment = extract_comment_record(&obj);

        assert_eq!(comment.edited_at, Some("2026-02-11T11:00:00Z".to_string()));
    }

}
