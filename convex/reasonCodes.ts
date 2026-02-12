/**
 * Reason-code taxonomy for control-plane action failures.
 *
 * Each code maps to a category (validation, dispatch, execution)
 * for dashboard aggregation and operator diagnostics.
 */

export const REASON_CODES = {
  // Validation failures (action rejected before queuing)
  VALIDATION_MISSING_FIELD: "validation_missing_field",
  VALIDATION_INVALID_PAYLOAD: "validation_invalid_payload",
  VALIDATION_UNKNOWN_ACTION: "validation_unknown_action",
  VALIDATION_REVISION_CONFLICT: "validation_revision_conflict",
  VALIDATION_INVALID_STATE: "validation_invalid_state",
  VALIDATION_ENTITY_NOT_FOUND: "validation_entity_not_found",
  VALIDATION_NODE_OFFLINE: "validation_node_offline",

  // Dispatch failures (daemon could not execute)
  DISPATCH_CLI_EXIT_NONZERO: "dispatch_cli_exit_nonzero",
  DISPATCH_CLI_SPAWN_FAILED: "dispatch_cli_spawn_failed",
  DISPATCH_PAYLOAD_INVALID: "dispatch_payload_invalid",
  DISPATCH_UNKNOWN_TYPE: "dispatch_unknown_type",

  // Execution failures (CLI ran but produced error)
  EXECUTION_INIT_FAILED: "execution_init_failed",
  EXECUTION_ADVANCE_FAILED: "execution_advance_failed",
  EXECUTION_POLICY_WRITE_FAILED: "execution_policy_write_failed",
  EXECUTION_TASK_MUTATION_FAILED: "execution_task_mutation_failed",
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];

export type ReasonCategory = "validation" | "dispatch" | "execution";

export function categoryForCode(code: string): ReasonCategory {
  if (code.startsWith("validation_")) return "validation";
  if (code.startsWith("dispatch_")) return "dispatch";
  return "execution";
}

/** Map daemon DispatchErrorCode strings to reason codes. */
export function fromDispatchErrorCode(errorCode: string): ReasonCode {
  const mapping: Record<string, ReasonCode> = {
    payload_missing_field: REASON_CODES.DISPATCH_PAYLOAD_INVALID,
    payload_invalid: REASON_CODES.DISPATCH_PAYLOAD_INVALID,
    unknown_action_type: REASON_CODES.DISPATCH_UNKNOWN_TYPE,
    cli_exit_non_zero: REASON_CODES.DISPATCH_CLI_EXIT_NONZERO,
    cli_spawn_failed: REASON_CODES.DISPATCH_CLI_SPAWN_FAILED,
  };
  return mapping[errorCode] ?? REASON_CODES.DISPATCH_PAYLOAD_INVALID;
}

/**
 * Parse a daemon dispatch result JSON and extract the reason code.
 * Daemon results have shape: { success: bool, error_code?: string, message: string }
 */
export function extractReasonCode(resultJson: string): ReasonCode | null {
  try {
    const parsed = JSON.parse(resultJson);
    if (parsed.success) return null;
    if (parsed.error_code) return fromDispatchErrorCode(parsed.error_code);
    return REASON_CODES.DISPATCH_CLI_EXIT_NONZERO;
  } catch {
    return REASON_CODES.DISPATCH_PAYLOAD_INVALID;
  }
}
