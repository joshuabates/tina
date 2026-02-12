import { expect, test, describe } from "vitest";
import {
  REASON_CODES,
  categoryForCode,
  fromDispatchErrorCode,
  extractReasonCode,
} from "./reasonCodes";

describe("REASON_CODES", () => {
  test("has validation, dispatch, and execution codes", () => {
    const keys = Object.keys(REASON_CODES);
    const hasValidation = keys.some((k) => k.startsWith("VALIDATION_"));
    const hasDispatch = keys.some((k) => k.startsWith("DISPATCH_"));
    const hasExecution = keys.some((k) => k.startsWith("EXECUTION_"));
    expect(hasValidation).toBe(true);
    expect(hasDispatch).toBe(true);
    expect(hasExecution).toBe(true);
  });

  test("all values are lowercase snake_case strings", () => {
    for (const value of Object.values(REASON_CODES)) {
      expect(value).toMatch(/^[a-z_]+$/);
    }
  });

  test("all values are unique", () => {
    const values = Object.values(REASON_CODES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("categoryForCode", () => {
  test("returns 'validation' for validation codes", () => {
    expect(categoryForCode("validation_missing_field")).toBe("validation");
    expect(categoryForCode("validation_invalid_payload")).toBe("validation");
  });

  test("returns 'dispatch' for dispatch codes", () => {
    expect(categoryForCode("dispatch_cli_exit_nonzero")).toBe("dispatch");
    expect(categoryForCode("dispatch_payload_invalid")).toBe("dispatch");
  });

  test("returns 'execution' for execution codes", () => {
    expect(categoryForCode("execution_init_failed")).toBe("execution");
    expect(categoryForCode("execution_advance_failed")).toBe("execution");
  });

  test("returns 'execution' for unknown prefix", () => {
    expect(categoryForCode("unknown_something")).toBe("execution");
  });
});

describe("fromDispatchErrorCode", () => {
  test("maps payload_missing_field to dispatch_payload_invalid", () => {
    expect(fromDispatchErrorCode("payload_missing_field")).toBe(
      REASON_CODES.DISPATCH_PAYLOAD_INVALID,
    );
  });

  test("maps payload_invalid to dispatch_payload_invalid", () => {
    expect(fromDispatchErrorCode("payload_invalid")).toBe(
      REASON_CODES.DISPATCH_PAYLOAD_INVALID,
    );
  });

  test("maps unknown_action_type to dispatch_unknown_type", () => {
    expect(fromDispatchErrorCode("unknown_action_type")).toBe(
      REASON_CODES.DISPATCH_UNKNOWN_TYPE,
    );
  });

  test("maps cli_exit_non_zero to dispatch_cli_exit_nonzero", () => {
    expect(fromDispatchErrorCode("cli_exit_non_zero")).toBe(
      REASON_CODES.DISPATCH_CLI_EXIT_NONZERO,
    );
  });

  test("maps cli_spawn_failed to dispatch_cli_spawn_failed", () => {
    expect(fromDispatchErrorCode("cli_spawn_failed")).toBe(
      REASON_CODES.DISPATCH_CLI_SPAWN_FAILED,
    );
  });

  test("falls back to dispatch_payload_invalid for unknown codes", () => {
    expect(fromDispatchErrorCode("something_else")).toBe(
      REASON_CODES.DISPATCH_PAYLOAD_INVALID,
    );
  });
});

describe("extractReasonCode", () => {
  test("returns null for successful results", () => {
    const json = JSON.stringify({ success: true, message: "ok" });
    expect(extractReasonCode(json)).toBeNull();
  });

  test("returns mapped reason code when error_code is present", () => {
    const json = JSON.stringify({
      success: false,
      error_code: "cli_exit_non_zero",
      message: "exit 1",
    });
    expect(extractReasonCode(json)).toBe(
      REASON_CODES.DISPATCH_CLI_EXIT_NONZERO,
    );
  });

  test("returns dispatch_cli_exit_nonzero when no error_code in failure", () => {
    const json = JSON.stringify({
      success: false,
      message: "something went wrong",
    });
    expect(extractReasonCode(json)).toBe(
      REASON_CODES.DISPATCH_CLI_EXIT_NONZERO,
    );
  });

  test("returns dispatch_payload_invalid for invalid JSON", () => {
    expect(extractReasonCode("not json")).toBe(
      REASON_CODES.DISPATCH_PAYLOAD_INVALID,
    );
  });

  test("returns dispatch_payload_invalid for empty string", () => {
    expect(extractReasonCode("")).toBe(REASON_CODES.DISPATCH_PAYLOAD_INVALID);
  });
});
