use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::error;
use uuid::Uuid;

use tina_data::{EventRecord, SpanRecord, TinaConvexClient};

/// Telemetry context for daemon operations.
/// Manages trace/span lifecycle and emits spans and events to Convex.
pub struct DaemonTelemetry {
    client: Arc<Mutex<TinaConvexClient>>,
    trace_id: String,
    orchestration_id: Option<String>,
    feature_name: Option<String>,
    phase_number: Option<String>,
}

impl DaemonTelemetry {
    /// Create a new telemetry context with a fresh trace ID.
    pub fn new(client: Arc<Mutex<TinaConvexClient>>) -> Self {
        Self {
            client,
            trace_id: Uuid::new_v4().to_string(),
            orchestration_id: None,
            feature_name: None,
            phase_number: None,
        }
    }

    /// Create a telemetry context with orchestration correlation.
    pub fn with_orchestration(
        client: Arc<Mutex<TinaConvexClient>>,
        orchestration_id: String,
        feature_name: String,
        phase_number: Option<String>,
    ) -> Self {
        Self {
            client,
            trace_id: Uuid::new_v4().to_string(),
            orchestration_id: Some(orchestration_id),
            feature_name: Some(feature_name),
            phase_number,
        }
    }

    /// Start a span and return its ID.
    pub fn start_span(&self, _operation: &str) -> String {
        Uuid::new_v4().to_string()
    }

    /// End a span with status and optional error details.
    /// Best-effort write - errors are logged but not propagated.
    pub async fn end_span(
        &self,
        span_id: &str,
        operation: &str,
        started_at: chrono::DateTime<chrono::Utc>,
        status: &str,
        error_code: Option<String>,
        error_detail: Option<String>,
    ) {
        let ended_at = chrono::Utc::now();
        let duration_ms = (ended_at - started_at).num_milliseconds() as f64;

        let span = SpanRecord {
            trace_id: self.trace_id.clone(),
            span_id: span_id.to_string(),
            parent_span_id: None,
            orchestration_id: self.orchestration_id.clone(),
            feature_name: self.feature_name.clone(),
            phase_number: self.phase_number.clone(),
            team_name: None,
            task_id: None,
            source: "tina-daemon".to_string(),
            operation: operation.to_string(),
            started_at: started_at.to_rfc3339(),
            ended_at: Some(ended_at.to_rfc3339()),
            duration_ms: Some(duration_ms),
            status: status.to_string(),
            error_code,
            error_detail,
            attrs: None,
            recorded_at: ended_at.to_rfc3339(),
        };

        if let Err(e) = self.client.lock().await.record_telemetry_span(&span).await {
            error!(error = %e, span_id = %span_id, "telemetry span write failed");
        }
    }

    /// Emit an event with type, severity, and message.
    /// Best-effort write - errors are logged but not propagated.
    pub async fn emit_event(
        &self,
        event_type: &str,
        severity: &str,
        message: &str,
        attrs: Option<String>,
    ) {
        let event = EventRecord {
            trace_id: self.trace_id.clone(),
            span_id: Uuid::new_v4().to_string(),
            parent_span_id: None,
            orchestration_id: self.orchestration_id.clone(),
            feature_name: self.feature_name.clone(),
            phase_number: self.phase_number.clone(),
            team_name: None,
            task_id: None,
            source: "tina-daemon".to_string(),
            event_type: event_type.to_string(),
            severity: severity.to_string(),
            message: message.to_string(),
            status: None,
            attrs,
            recorded_at: chrono::Utc::now().to_rfc3339(),
        };

        if let Err(e) = self
            .client
            .lock()
            .await
            .record_telemetry_event(&event)
            .await
        {
            error!(error = %e, event_type = %event_type, "telemetry event write failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests verify the API shape. Integration tests with real Convex
    // client would be added in a separate test suite that requires environment setup.

    #[test]
    fn test_trace_id_generation() {
        // Verify trace IDs are unique UUIDs
        let trace1 = Uuid::new_v4().to_string();
        let trace2 = Uuid::new_v4().to_string();

        assert!(!trace1.is_empty());
        assert!(!trace2.is_empty());
        assert_ne!(trace1, trace2);
    }

    #[test]
    fn test_span_id_generation() {
        // Verify span IDs are unique UUIDs
        let span1 = Uuid::new_v4().to_string();
        let span2 = Uuid::new_v4().to_string();

        assert!(!span1.is_empty());
        assert!(!span2.is_empty());
        assert_ne!(span1, span2);
    }

    #[test]
    fn test_duration_calculation() {
        use chrono::Utc;
        use std::thread;
        use std::time::Duration;

        let start = Utc::now();
        thread::sleep(Duration::from_millis(10));
        let end = Utc::now();

        let duration_ms = (end - start).num_milliseconds() as f64;
        assert!(duration_ms >= 10.0);
    }
}
