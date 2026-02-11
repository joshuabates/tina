# Telemetry Convex V1 Design

Date: 2026-02-11
Status: Approved for implementation planning
Scope: Design only (no code changes in this phase)

## 1. Context and Goal

TINA orchestration currently has weak cross-component observability at the exact seam where regressions have occurred: authoritative state transitions (`tina-session`) versus projected runtime state (`tina-daemon`) versus UI visibility (`tina-web`) and test verification (`tina-harness`).

The immediate goal is to introduce a cohesive telemetry layer that:

1. Explains why teams/tasks are missing instead of only showing final absence.
2. Correlates cause and effect across session, daemon, web, and harness.
3. Works now using Convex only.
4. Preserves an OpenTelemetry-compatible contract to allow near-term backend migration without rewriting producer code.

This design intentionally treats Convex as a short-term telemetry sink with retention and rollups, not an infinite raw telemetry archive.

## 2. Non-Goals

1. No OpenTelemetry backend deployment in this phase.
2. No high-cardinality permanent raw event retention.
3. No full rewrite of `tina-monitor` in this phase.
4. No behavior change to orchestration logic due to telemetry failures.

## 3. Requirements

### Functional requirements

1. End-to-end traceability for one orchestration run.
2. Span and event telemetry across:
   1. `tina-session`
   2. `tina-daemon`
   3. `tina-web`
   4. `tina-harness`
3. Ability to query:
   1. Timeline by orchestration
   2. Timeline by trace
   3. Projection skip reasons
   4. Query latency and failures
4. Explicit consistency-violation events from harness verification.

### Non-functional requirements

1. Telemetry writes are best-effort and non-blocking for orchestration progression.
2. Contract must be OTEL-compatible at field level.
3. Storage growth is controlled by retention and rollups.
4. Query patterns are index-driven and time-bounded.

## 4. Canonical Telemetry Contract

All telemetry writes share one correlation envelope:

1. `traceId` (string): one trace per orchestration run.
2. `spanId` (string): unique operation instance identifier.
3. `parentSpanId` (optional string): parent-child linkage.
4. `orchestrationId` (optional Convex orchestration id)
5. `featureName` (optional string)
6. `phaseNumber` (optional string)
7. `teamName` (optional string)
8. `taskId` (optional string)
9. `source` (string enum): `tina-session | tina-daemon | tina-web | tina-harness`
10. `recordedAt` (RFC3339 UTC string)

Event taxonomy:

1. `state.transition`
2. `projection.write`
3. `projection.skip`
4. `query.result`
5. `consistency.violation`
6. `operator.action`

Status values:

1. `ok`
2. `error`
3. `timeout`
4. `cancelled`
5. `open`

## 5. Convex Data Model (V1)

### `telemetrySpans`

Span boundaries for operation timing and status.

Fields:

1. Correlation envelope fields listed above.
2. `operation` (string), for example `orchestrate.advance`, `daemon.sync_tasks`.
3. `startedAt` (RFC3339 UTC string)
4. `endedAt` (optional RFC3339 UTC string)
5. `durationMs` (optional number)
6. `status` (string)
7. `errorCode` (optional string)
8. `errorDetail` (optional string)
9. `attrs` (optional JSON string)

### `telemetryEvents`

Discrete events attached to a trace/span.

Fields:

1. Correlation envelope fields listed above.
2. `eventType` (string taxonomy above)
3. `severity` (string: `debug | info | warn | error`)
4. `message` (string)
5. `status` (optional string)
6. `attrs` (optional JSON string)

### `telemetryRollups`

Aggregated metrics for efficient dashboards and long-term trend visibility.

Fields:

1. `windowStart` (RFC3339 UTC string)
2. `windowEnd` (RFC3339 UTC string)
3. `granularityMin` (number)
4. `source` (string)
5. `operation` (string)
6. `orchestrationId` (optional id)
7. `phaseNumber` (optional string)
8. `spanCount` (number)
9. `errorCount` (number)
10. `eventCount` (number)
11. `p95DurationMs` (optional number)
12. `maxDurationMs` (optional number)

### Index strategy

Spans/events:

1. `by_trace_time`
2. `by_orchestration_time`
3. `by_source_time`
4. `by_operation_time`

Rollups:

1. `by_window_source`
2. `by_window_operation`

## 6. Component Instrumentation Plan

### `tina-session` (authoritative state)

Primary file target:

1. `/Users/joshua/Projects/tina/tina-session/src/commands/orchestrate.rs`

Emit:

1. Spans around `next` and `advance`.
2. `state.transition` events with transition metadata.
3. Error events for transition failures.

### `tina-daemon` (projection path)

Primary file targets:

1. `/Users/joshua/Projects/tina/tina-daemon/src/sync.rs`
2. `/Users/joshua/Projects/tina/tina-daemon/src/main.rs`

Emit:

1. Spans around `sync_all`, `sync_team_members`, `sync_tasks`, `sync_commits`, `sync_plan`.
2. `projection.write` when rows are written.
3. `projection.skip` with required skip reason (`task_dir_missing`, `no_active_team`, parse error, unchanged cache, write failure, etc).

### `tina-web` (query consumer)

Primary target:

1. `/Users/joshua/Projects/tina/tina-web/src/services/data/queryDefs.ts`

Emit:

1. Query spans and `query.result` events for key orchestration detail and list queries.
2. Status and row-count metadata in `attrs`.

### `tina-harness` (consistency checker)

Primary targets:

1. `/Users/joshua/Projects/tina/tina-harness/src/commands/run.rs`
2. `/Users/joshua/Projects/tina/tina-harness/src/commands/verify.rs`

Emit:

1. Verification spans.
2. `consistency.violation` events when expected visibility does not match Convex/UI-observed state.

## 7. Shared API Surface

A single producer-facing interface is required. Example operation-level methods:

1. `startSpan(...)`
2. `endSpan(...)`
3. `emitEvent(...)`
4. `recordError(...)`

Implementation for this phase:

1. Sink mode: `convex` only.
2. API fields remain OTEL-compatible.
3. Future sink selection target: `convex | dual | otel`.

## 8. Retention, Sampling, and Safety Policy

### Retention policy

1. Raw success spans/events: 7 days
2. Raw error/warn spans/events: 30 days
3. Rollups: 180 days

### Sampling policy

1. `error` and `warn`: 100%
2. `info`: 25%
3. `tina-session` and `tina-daemon` operation spans: 100% in V1

### Safety policy

1. Telemetry failures never block orchestration progression.
2. Batch writes are capped and chunked to avoid transaction limits.
3. Queries are always bounded by indexed time windows and pagination.

## 9. Rollout Sequence

1. Add schema and Convex telemetry mutations/queries.
2. Add typed shared telemetry methods in `tina-data`.
3. Instrument `tina-session` authoritative transition path.
4. Instrument `tina-daemon` projection path.
5. Instrument `tina-web` query wrappers and `tina-harness` verification.
6. Add cron retention and rollup jobs.
7. Add initial telemetry timeline panel in `tina-web` orchestration detail view.

## 10. Acceptance Criteria

1. Every orchestrate `next/advance` transition has:
   1. One span with `operation` and status.
   2. One `state.transition` event.
2. Every daemon task/team sync pass emits:
   1. `projection.write` events for writes.
   2. `projection.skip` with explicit reason for skips.
3. Harness failures include a trace-correlated `consistency.violation` event.
4. Web query failures include `query.result` with error status and context.
5. Retention jobs remove expired raw events while preserving rollups and error windows.
6. Query performance remains index-bound (no unbounded full scans).

## 11. Migration Path to OpenTelemetry

This design is intentionally backend-agnostic at the API contract level.

Planned path:

1. Keep producer call sites unchanged.
2. Add `dual` sink mode (Convex + OTEL exporter).
3. Compare coverage and event parity during dual-run period.
4. Switch default sink from `convex` to `otel`.
5. Retain Convex as short-window operational correlation store if needed.

No schema or producer-field rewrite should be necessary for this migration.

## 12. Risks and Mitigations

1. Data growth risk:
   1. Mitigation: retention + sampling + rollups.
2. Query-cost risk:
   1. Mitigation: strict index-first query design and windowed reads.
3. Inconsistent correlation IDs:
   1. Mitigation: enforce required envelope validation at telemetry API boundary.
4. Producer overhead risk:
   1. Mitigation: best-effort writes and bounded batches.

## 13. Initial Work Plan (Design-Approved, Not Started)

1. Convex schema and telemetry endpoints
2. `tina-data` typed telemetry client methods
3. `tina-session` instrumentation
4. `tina-daemon` instrumentation
5. `tina-web` and `tina-harness` instrumentation
6. Retention and rollups
7. Telemetry timeline UI

No implementation work is included in this document creation step.

