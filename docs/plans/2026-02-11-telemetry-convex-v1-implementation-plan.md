# Telemetry System V1 - Implementation Plan

Date: 2026-02-11
Based on: [2026-02-11-telemetry-convex-v1-design.md](./2026-02-11-telemetry-convex-v1-design.md)

## Goal

Add OpenTelemetry-compatible span/event telemetry across all TINA components, using Convex as the storage backend.

## Approach

Incrementally add telemetry infrastructure following existing patterns. All writes are best-effort (non-blocking). Follow 7-step rollout from design doc.

## Implementation Steps

### Step 1: Convex Schema and Backend Functions

**Files:**
- `convex/schema.ts` - Add telemetrySpans, telemetryEvents, telemetryRollups tables
- `convex/telemetry.ts` - New mutations/queries
- `convex/telemetry.test.ts` - Tests

**Tables:**
- `telemetrySpans`: Span boundaries with timing/status, indexes: by_trace_time, by_orchestration_time, by_source_time, by_operation_time
- `telemetryEvents`: Discrete events, same indexes
- `telemetryRollups`: Aggregated metrics, indexes: by_window_source, by_window_operation

**Mutations:**
- `recordSpan`: Dedup by spanId, upsert pattern
- `recordEvent`: Append-only insert
- `recordRollup`: Upsert by window+source+operation

**Queries:**
- `listSpans`: Time-bounded pagination, filters by trace/orchestration/source
- `listEvents`: Same pattern as existing listEvents
- `getRollups`: By window range + optional filters

### Step 2: tina-data Types and Client

**Files:**
- `tina-data/src/types.rs` - SpanRecord, EventRecord, RollupRecord
- `tina-data/src/convex_client.rs` - Client methods and arg helpers
- `tina-data/src/lib.rs` - Export new types
- `tina-data/Cargo.toml` - Add uuid, chrono dependencies

**Types:**
- `SpanRecord`: traceId, spanId, parentSpanId, orchestrationId, operation, startedAt, endedAt, durationMs, status, errorCode, errorDetail, attrs
- `EventRecord`: envelope fields + eventType, severity, message, status, attrs
- `RollupRecord`: window fields + metrics (spanCount, errorCount, p95DurationMs, etc.)

**Client methods:**
- `record_span(&mut self, span: &SpanRecord) -> Result<String>`
- `record_event(&mut self, event: &EventRecord) -> Result<String>`
- `list_spans(&mut self, filters: SpanFilters) -> Result<Vec<SpanRecord>>`
- `list_events(&mut self, filters: EventFilters) -> Result<Vec<EventRecord>>`

### Step 3: tina-session Instrumentation

**Files:**
- `tina-session/src/telemetry.rs` - New telemetry context module
- `tina-session/src/commands/orchestrate.rs` - Add spans/events
- `tina-session/Cargo.toml` - Add uuid crate

**Instrumentation points:**
- `next_action`: Span with operation="orchestrate.next"
- `advance_state`: Span with operation="orchestrate.advance", state.transition event
- Error paths: error events with status/detail

### Step 4: tina-daemon Instrumentation

**Files:**
- `tina-daemon/src/telemetry.rs` - Daemon telemetry context
- `tina-daemon/src/sync.rs` - Add spans/events to sync operations
- `tina-daemon/src/main.rs` - Initialize telemetry on startup
- `tina-daemon/Cargo.toml` - Add uuid crate

**Instrumentation points:**
- `sync_all`: Top-level span
- `sync_team_members`, `sync_tasks`, `sync_commits`, `sync_plan`: Individual spans
- Successful writes: projection.write events
- Skips: projection.skip events with explicit reasons

### Step 5: Web Queries and Harness Verification

**Files:**
- `tina-web/src/services/data/queryDefs.ts` - Telemetry query definitions
- `tina-web/src/services/data/__tests__/queryDefs.test.ts` - Tests
- `tina-harness/src/commands/verify.rs` - consistency.violation events
- `tina-harness/Cargo.toml` - Add uuid crate

**Query definitions:**
- `SpanListQuery`: With filters (traceId, orchestrationId, source, since, limit)
- `EventListQuery`: Same filter pattern
- `RollupQuery`: By window range

### Step 6: Retention and Rollup Jobs

**Files:**
- `convex/cron.ts` - Scheduled jobs
- `convex/cron.test.ts` - Tests with time manipulation

**Jobs:**
- Retention: Delete raw success spans/events >7d, errors >30d, keep rollups 180d
- Rollups: Aggregate spans into 15min/1h/24h windows, calculate p95/max durations

### Step 7: Telemetry Timeline UI

**Files:**
- `tina-web/src/components/TelemetryTimeline.tsx` - Timeline component
- `tina-web/src/pages/OrchestrationDetailPage.tsx` - Integration
- `tina-web/src/components/__tests__/TelemetryTimeline.test.tsx` - Tests

**Features:**
- Group events by phase
- Show spans with duration bars
- Collapsible panel in orchestration detail view

## Key Patterns

**Best-effort writes:**
```rust
if let Err(e) = client.record_span(&span).await {
    error!(error = %e, "telemetry span write failed");
}
```

**Span lifecycle:**
```rust
let span_id = telemetry.start_span("operation.name", attrs);
// ... do work ...
telemetry.end_span(span_id, status, error);
```

**Event emission:**
```rust
telemetry.emit_event("event.type", severity, message, attrs);
```

## Sampling and Retention

**Sampling: NONE** - 100% capture of all spans and events at all severity levels (required for debugging)

**Retention windows:**
- Raw success spans/events: 7 days
- Raw error/warn spans/events: 30 days
- Rollups: 180 days

## Testing Strategy

- Unit tests for arg builders and type conversions
- Convex function tests using convex-test + edge-runtime
- Integration tests in harness scenarios with --verify flag

## Rollout Order

1. Schema + backend (Step 1) - foundation
2. Rust client (Step 2) - shared layer
3. tina-session (Step 3) - authoritative state path
4. tina-daemon (Step 4) - projection path
5. Web + harness (Step 5) - query consumers
6. Retention (Step 6) - data lifecycle
7. UI (Step 7) - visualization

## Success Criteria

- All orchestrate next/advance transitions have spans + state.transition events
- All daemon sync operations emit projection.write or projection.skip events
- Harness failures include consistency.violation events with trace correlation
- Retention jobs clean up old data without affecting rollups
- Timeline UI shows event flow for any orchestration
