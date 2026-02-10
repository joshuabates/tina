import { Schema } from "effect"

export class QueryValidationError extends Schema.TaggedError<QueryValidationError>()(
  "QueryValidationError",
  { query: Schema.String, message: Schema.String },
) {}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  { resource: Schema.String, id: Schema.String },
) {}

export class PermissionError extends Schema.TaggedError<PermissionError>()(
  "PermissionError",
  { message: Schema.String },
) {}

export class TransientDataError extends Schema.TaggedError<TransientDataError>()(
  "TransientDataError",
  { query: Schema.String, message: Schema.String },
) {}
