//! Telemetry instrumentation helpers for tina-session.
//!
//! Provides TelemetryContext for managing trace/span IDs and recording
//! telemetry spans and events to Convex.

use chrono::Utc;
use tina_data::{EventRecord, SpanRecord};

use crate::convex::ConvexWriter;

/// Helper for managing telemetry trace/span IDs and recording telemetry.
#[derive(Clone)]
pub struct TelemetryContext {
    trace_id: String,
    span_id: String,
    parent_span_id: Option<String>,
    orchestration_id: Option<String>,
    feature_name: Option<String>,
    phase_number: Option<String>,
    operation: String,
    started_at: String,
}

impl TelemetryContext {
    /// Create a new root telemetry context (no parent span).
    pub fn new(
        operation: impl Into<String>,
        orchestration_id: Option<String>,
        feature_name: Option<String>,
        phase_number: Option<String>,
    ) -> Self {
        Self {
            trace_id: generate_trace_id(),
            span_id: generate_span_id(),
            parent_span_id: None,
            orchestration_id,
            feature_name,
            phase_number,
            operation: operation.into(),
            started_at: Utc::now().to_rfc3339(),
        }
    }

    /// Create a child telemetry context from an existing trace.
    pub fn child(&self, operation: impl Into<String>) -> Self {
        Self {
            trace_id: self.trace_id.clone(),
            span_id: generate_span_id(),
            parent_span_id: Some(self.span_id.clone()),
            orchestration_id: self.orchestration_id.clone(),
            feature_name: self.feature_name.clone(),
            phase_number: self.phase_number.clone(),
            operation: operation.into(),
            started_at: Utc::now().to_rfc3339(),
        }
    }

    /// Record a span with the given status.
    pub async fn record_span(
        &self,
        writer: &mut ConvexWriter,
        status: &str,
        error_code: Option<String>,
        error_detail: Option<String>,
    ) -> anyhow::Result<String> {
        let ended_at = Utc::now();
        let duration_ms = ended_at
            .signed_duration_since(
                chrono::DateTime::parse_from_rfc3339(&self.started_at)
                    .map_err(|e| anyhow::anyhow!("invalid started_at timestamp: {}", e))?
                    .with_timezone(&Utc),
            )
            .num_milliseconds() as f64;

        let span = SpanRecord {
            trace_id: self.trace_id.clone(),
            span_id: self.span_id.clone(),
            parent_span_id: self.parent_span_id.clone(),
            orchestration_id: self.orchestration_id.clone(),
            feature_name: self.feature_name.clone(),
            phase_number: self.phase_number.clone(),
            team_name: None,
            task_id: None,
            source: "tina-session".to_string(),
            operation: self.operation.clone(),
            started_at: self.started_at.clone(),
            ended_at: Some(ended_at.to_rfc3339()),
            duration_ms: Some(duration_ms),
            status: status.to_string(),
            error_code,
            error_detail,
            attrs: None,
            recorded_at: ended_at.to_rfc3339(),
        };

        writer.record_telemetry_span(&span).await
    }

    /// Record a telemetry event.
    pub async fn record_event(
        &self,
        writer: &mut ConvexWriter,
        event_type: &str,
        severity: &str,
        message: impl Into<String>,
        status: Option<String>,
        attrs: Option<String>,
    ) -> anyhow::Result<String> {
        let now = Utc::now().to_rfc3339();
        let event = EventRecord {
            trace_id: self.trace_id.clone(),
            span_id: self.span_id.clone(),
            parent_span_id: self.parent_span_id.clone(),
            orchestration_id: self.orchestration_id.clone(),
            feature_name: self.feature_name.clone(),
            phase_number: self.phase_number.clone(),
            team_name: None,
            task_id: None,
            source: "tina-session".to_string(),
            event_type: event_type.to_string(),
            severity: severity.to_string(),
            message: message.into(),
            status,
            attrs,
            recorded_at: now,
        };

        writer.record_telemetry_event(&event).await
    }
}

/// Generate a new trace ID (UUID v4).
fn generate_trace_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Generate a new span ID (UUID v4).
fn generate_span_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_creates_root_context() {
        let ctx = TelemetryContext::new(
            "test.operation",
            Some("orch-123".to_string()),
            Some("my-feature".to_string()),
            Some("1".to_string()),
        );

        assert_eq!(ctx.operation, "test.operation");
        assert_eq!(ctx.orchestration_id, Some("orch-123".to_string()));
        assert_eq!(ctx.feature_name, Some("my-feature".to_string()));
        assert_eq!(ctx.phase_number, Some("1".to_string()));
        assert!(ctx.parent_span_id.is_none());
        assert!(!ctx.trace_id.is_empty());
        assert!(!ctx.span_id.is_empty());
        assert!(!ctx.started_at.is_empty());
    }

    #[test]
    fn test_child_creates_linked_context() {
        let parent = TelemetryContext::new(
            "parent.op",
            Some("orch-123".to_string()),
            Some("my-feature".to_string()),
            Some("1".to_string()),
        );
        let child = parent.child("child.op");

        assert_eq!(child.operation, "child.op");
        assert_eq!(child.trace_id, parent.trace_id);
        assert_ne!(child.span_id, parent.span_id);
        assert_eq!(child.parent_span_id, Some(parent.span_id.clone()));
        assert_eq!(child.orchestration_id, parent.orchestration_id);
        assert_eq!(child.feature_name, parent.feature_name);
        assert_eq!(child.phase_number, parent.phase_number);
    }

    #[test]
    fn test_generate_trace_id_creates_uuid() {
        let id = generate_trace_id();
        assert_eq!(id.len(), 36); // UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        assert!(uuid::Uuid::parse_str(&id).is_ok());
    }

    #[test]
    fn test_generate_span_id_creates_uuid() {
        let id = generate_span_id();
        assert_eq!(id.len(), 36);
        assert!(uuid::Uuid::parse_str(&id).is_ok());
    }

    #[test]
    fn test_generate_unique_ids() {
        let id1 = generate_trace_id();
        let id2 = generate_trace_id();
        assert_ne!(id1, id2);

        let span1 = generate_span_id();
        let span2 = generate_span_id();
        assert_ne!(span1, span2);
    }
}
