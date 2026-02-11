import { Schema } from "effect"
import { convexDocumentFields, optionalString, optionalNumber } from "./common"

export const TelemetrySpan = Schema.Struct({
  ...convexDocumentFields,
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: optionalString,
  orchestrationId: optionalString,
  featureName: optionalString,
  phaseNumber: optionalString,
  teamName: optionalString,
  taskId: optionalString,
  source: Schema.String,
  operation: Schema.String,
  startedAt: Schema.String,
  endedAt: optionalString,
  durationMs: optionalNumber,
  status: Schema.String,
  errorCode: optionalString,
  errorDetail: optionalString,
  attrs: optionalString,
  recordedAt: Schema.String,
})

export type TelemetrySpan = typeof TelemetrySpan.Type

export const TelemetryEvent = Schema.Struct({
  ...convexDocumentFields,
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: optionalString,
  orchestrationId: optionalString,
  featureName: optionalString,
  phaseNumber: optionalString,
  teamName: optionalString,
  taskId: optionalString,
  source: Schema.String,
  eventType: Schema.String,
  severity: Schema.String,
  message: Schema.String,
  status: optionalString,
  attrs: optionalString,
  recordedAt: Schema.String,
})

export type TelemetryEvent = typeof TelemetryEvent.Type

export const TelemetryRollup = Schema.Struct({
  ...convexDocumentFields,
  windowStart: Schema.String,
  windowEnd: Schema.String,
  granularityMin: Schema.Number,
  source: Schema.String,
  operation: Schema.String,
  orchestrationId: optionalString,
  phaseNumber: optionalString,
  spanCount: Schema.Number,
  errorCount: Schema.Number,
  eventCount: Schema.Number,
  p95DurationMs: optionalNumber,
  maxDurationMs: optionalNumber,
})

export type TelemetryRollup = typeof TelemetryRollup.Type
