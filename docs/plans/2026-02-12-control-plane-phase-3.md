# Phase 3: Runtime Operator Controls (Pause/Resume/Retry)

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 073c9a3f5f75d326dd20eff77f4651c66ca3e148

**Goal:** Expose existing runtime controls (pause, resume, retry) safely through the control plane with end-to-end auditability. After this phase, an operator can pause/resume/retry orchestrations from the web UI, with every action traceable from request → queue → daemon result.

**Architecture:** Extends `convex/controlPlane.ts:enqueueControlAction` with per-type payload validation. Adds structured error codes to `tina-daemon/src/actions.rs` for deterministic failure reporting. Adds control buttons to `tina-web/src/components/StatusSection.tsx` wired to the `enqueueControlAction` mutation with loading guards.

**Phase context:** Phase 1 established the `controlPlaneActions` table, `enqueueControlAction`, and queue linkage. Phase 2 added `launchOrchestration` with full validation, daemon dispatch for `start_orchestration`, and the web launch form. The daemon already handles `pause`, `resume`, `retry` in `build_cli_args`. This phase adds typed payload validation, structured error responses, and the web control surface.

---

## Task 1: Add typed payload validation to enqueueControlAction

**Files:**
- `convex/controlPlane.ts`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Add a `validateRuntimePayload` helper function and integrate it into `enqueueControlAction`. The function parses the payload JSON and validates required fields per action type.

Edit `convex/controlPlane.ts` — add the validation function after the `InsertControlActionParams` interface (after line 26):

```typescript
interface RuntimePayload {
  feature: string;
  phase?: string;
}

function validateRuntimePayload(actionType: string, rawPayload: string): RuntimePayload {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new Error(`Invalid payload: must be valid JSON`);
  }

  if (typeof parsed.feature !== "string" || !parsed.feature) {
    throw new Error(`Payload for "${actionType}" requires "feature" (string)`);
  }

  const needsPhase = ["pause", "retry"];
  if (needsPhase.includes(actionType)) {
    if (typeof parsed.phase !== "string" || !parsed.phase) {
      throw new Error(`Payload for "${actionType}" requires "phase" (string)`);
    }
  }

  return {
    feature: parsed.feature as string,
    phase: typeof parsed.phase === "string" ? parsed.phase : undefined,
  };
}
```

2. Wire the validation into `enqueueControlAction` — add the validation call after the action type check (after line 269):

```typescript
    // Validate payload structure for runtime control actions
    if (["pause", "resume", "retry"].includes(args.actionType)) {
      validateRuntimePayload(args.actionType, args.payload);
    }
```

3. Run tests to ensure existing tests pass:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/controlPlane.test.ts`
Expected: All existing tests pass (payload validation only rejects malformed payloads, existing tests use `'{}'` or `'{"reason":"test"}'` which will now fail for pause/resume/retry since they lack `feature`).

Note: Some existing tests may need updating in Task 3 since they use empty `{}` payloads for pause/resume — those will be fixed there.

---

## Task 2: Add "launching" to status styles

**Files:**
- `tina-web/src/components/ui/status-styles.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** none

### Steps

1. Add "launching" to the `STATUS_VALUES` array and `statusStyleMap` in `status-styles.ts`.

Add `"launching"` to the `STATUS_VALUES` array after `"in_progress"`:

```typescript
  "in_progress",
  "launching",
```

Add a new entry to `statusStyleMap` after `in_progress`:

```typescript
  launching: {
    label: "Launching",
    textClass: "text-status-executing",
    iconBgClass: "bg-primary phase-glow",
    borderClass: "border-l-status-executing",
    badgeClass: "text-status-executing border-status-executing/30 bg-status-executing/12",
  },
```

2. Verify the web build succeeds:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx tsc --noEmit --project tina-web/tsconfig.json`
Expected: No errors.

---

## Task 3: Add Convex tests for pause/resume/retry payload validation

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. Update existing `enqueueControlAction` tests that use empty `{}` payloads to include required fields, then add new validation-specific tests. Add a new `describe` block after the existing `controlPlane:enqueueControlAction` block.

First, update the existing tests that pass `payload: "{}"` for pause/resume/retry. Find and update these in the existing `enqueueControlAction` describe block:

- Test "creates control action for valid runtime action type" — change `payload: "{}"` to `payload: '{"feature":"test","phase":"1"}'`
- Test "links inboundActions row back to control action" — change `payload: '{"reason":"test"}'` to `payload: '{"feature":"test","phase":"1"}'`
- Test "idempotency: returns same action ID on duplicate call" — both calls use resume, change `payload: "{}"` and `payload: '{"different":"data"}'` to `payload: '{"feature":"test"}'`
- Test "accepts all valid runtime action types" — change to use per-type valid payloads:

```typescript
    const payloads: Record<string, string> = {
      pause: '{"feature":"test","phase":"1"}',
      resume: '{"feature":"test"}',
      retry: '{"feature":"test","phase":"2"}',
      orchestration_set_policy: "{}",
      orchestration_set_role_model: "{}",
      task_edit: "{}",
      task_insert: "{}",
      task_set_model: "{}",
    };

    for (const actionType of runtimeTypes) {
      const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType,
        payload: payloads[actionType] ?? "{}",
        requestedBy: "web-ui",
        idempotencyKey: `test-${actionType}`,
      });
      expect(actionId).toBeTruthy();
    }
```

2. Add a new describe block for payload validation tests:

```typescript
describe("controlPlane:enqueueControlAction:payloadValidation", () => {
  test("pause rejects payload without feature", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "pause",
        payload: '{"phase":"1"}',
        requestedBy: "web-ui",
        idempotencyKey: "pause-no-feature",
      }),
    ).rejects.toThrow('requires "feature"');
  });

  test("pause rejects payload without phase", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "pause",
        payload: '{"feature":"test"}',
        requestedBy: "web-ui",
        idempotencyKey: "pause-no-phase",
      }),
    ).rejects.toThrow('requires "phase"');
  });

  test("resume rejects payload without feature", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "resume",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: "resume-no-feature",
      }),
    ).rejects.toThrow('requires "feature"');
  });

  test("resume accepts payload with feature only (no phase needed)", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"feature":"test"}',
      requestedBy: "web-ui",
      idempotencyKey: "resume-valid",
    });
    expect(actionId).toBeTruthy();
  });

  test("retry rejects payload without phase", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "retry",
        payload: '{"feature":"test"}',
        requestedBy: "web-ui",
        idempotencyKey: "retry-no-phase",
      }),
    ).rejects.toThrow('requires "phase"');
  });

  test("rejects invalid JSON payload", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "pause",
        payload: "not-json",
        requestedBy: "web-ui",
        idempotencyKey: "bad-json",
      }),
    ).rejects.toThrow("must be valid JSON");
  });

  test("pause accepts valid payload with feature and phase", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"my-feat","phase":"2"}',
      requestedBy: "web-ui",
      idempotencyKey: "pause-valid",
    });
    expect(actionId).toBeTruthy();
  });
});
```

3. Run the tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/controlPlane.test.ts`
Expected: All tests pass including the new payload validation tests.

---

## Task 4: Record orchestrationEvent on control action enqueue

**Files:**
- `convex/controlPlane.ts`

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. Add an orchestrationEvent write inside `enqueueControlAction` after the `insertControlActionWithQueue` call (before the return). This provides audit trail for every runtime control request.

In `enqueueControlAction`, after the `insertControlActionWithQueue` call and before the return, add:

```typescript
    // Record audit event
    await ctx.db.insert("orchestrationEvents", {
      orchestrationId: args.orchestrationId,
      eventType: "control_action_requested",
      source: "control_plane",
      summary: `${args.actionType} requested by ${args.requestedBy}`,
      detail: args.payload,
      recordedAt: new Date().toISOString(),
    });
```

The full handler should now look like:

```typescript
  handler: async (ctx, args) => {
    if (
      !(RUNTIME_ACTION_TYPES as readonly string[]).includes(args.actionType)
    ) {
      throw new Error(
        `Invalid actionType: "${args.actionType}". Allowed: ${RUNTIME_ACTION_TYPES.join(", ")}`,
      );
    }

    // Validate payload structure for runtime control actions
    if (["pause", "resume", "retry"].includes(args.actionType)) {
      validateRuntimePayload(args.actionType, args.payload);
    }

    const actionId = await insertControlActionWithQueue(ctx, {
      orchestrationId: args.orchestrationId,
      nodeId: args.nodeId,
      actionType: args.actionType,
      payload: args.payload,
      requestedBy: args.requestedBy,
      idempotencyKey: args.idempotencyKey,
    });

    // Record audit event
    await ctx.db.insert("orchestrationEvents", {
      orchestrationId: args.orchestrationId,
      eventType: "control_action_requested",
      source: "control_plane",
      summary: `${args.actionType} requested by ${args.requestedBy}`,
      detail: args.payload,
      recordedAt: new Date().toISOString(),
    });

    return actionId;
  },
```

2. Run tests to ensure no regressions:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/controlPlane.test.ts`
Expected: All existing tests pass.

---

## Task 5: Add Convex test for control action event recording

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** spec-only

**Depends on:** Task 3, Task 4

### Steps

1. Add a test within the `controlPlane:enqueueControlAction:payloadValidation` describe block (or a new sibling block) that verifies an orchestrationEvent is created:

```typescript
describe("controlPlane:enqueueControlAction:auditTrail", () => {
  test("records orchestrationEvent for each control action", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"test","phase":"1"}',
      requestedBy: "web:operator",
      idempotencyKey: "audit-test-1",
    });

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("control_plane");
    expect(events[0].summary).toContain("pause");
    expect(events[0].summary).toContain("web:operator");
  });

  test("records separate events for multiple actions", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"test","phase":"1"}',
      requestedBy: "web-ui",
      idempotencyKey: "audit-multi-1",
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"feature":"test"}',
      requestedBy: "web-ui",
      idempotencyKey: "audit-multi-2",
    });

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(2);
  });
});
```

2. Run the tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/controlPlane.test.ts`
Expected: All tests pass.

---

## Task 6: Add structured error codes to daemon dispatch

**Files:**
- `tina-daemon/src/actions.rs`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Add a `DispatchErrorCode` enum and a `DispatchResult` struct to `actions.rs` (after the `ActionPayload` struct):

```rust
/// Machine-parseable error codes for action dispatch results.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DispatchErrorCode {
    PayloadMissingField,
    PayloadInvalid,
    CliExitNonZero,
    CliSpawnFailed,
    UnknownActionType,
}

/// Structured result from action dispatch, serialized as JSON for the queue completion message.
#[derive(Debug, serde::Serialize)]
pub struct DispatchResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<DispatchErrorCode>,
    pub message: String,
}

impl DispatchResult {
    pub fn ok(message: String) -> Self {
        Self { success: true, error_code: None, message }
    }

    pub fn err(code: DispatchErrorCode, message: String) -> Self {
        Self { success: false, error_code: Some(code), message }
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| format!("{{\"success\":{},\"message\":\"{}\"}}", self.success, self.message))
    }
}
```

2. Update `dispatch_action` to use structured results. Replace the result handling (lines 52-67) with:

```rust
    // Build and execute CLI command
    let dispatch_result = match execute_action(&action.action_type, &payload).await {
        Ok(output) => DispatchResult::ok(output),
        Err(e) => {
            let code = classify_error(&e);
            DispatchResult::err(code, format!("{}", e))
        }
    };

    // Report result
    let mut client = client.lock().await;
    client
        .complete_action(&action.id, &dispatch_result.to_json(), dispatch_result.success)
        .await?;

    if dispatch_result.success {
        info!(action_type = %action.action_type, action_id = %action.id, "action completed");
    } else {
        error!(action_type = %action.action_type, action_id = %action.id, error = %dispatch_result.message, "action failed");
    }
```

3. Add the `classify_error` helper after `execute_action`:

```rust
/// Classify an anyhow error into a deterministic error code.
fn classify_error(err: &anyhow::Error) -> DispatchErrorCode {
    let msg = err.to_string();
    if msg.contains("missing") && (msg.contains("field") || msg.contains("payload")) {
        DispatchErrorCode::PayloadMissingField
    } else if msg.contains("unknown action type") {
        DispatchErrorCode::UnknownActionType
    } else if msg.contains("exited with") {
        DispatchErrorCode::CliExitNonZero
    } else if msg.contains("parse") || msg.contains("invalid") {
        DispatchErrorCode::PayloadInvalid
    } else {
        DispatchErrorCode::CliSpawnFailed
    }
}
```

4. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && cargo check --manifest-path tina-daemon/Cargo.toml`
Expected: Compiles with no errors.

---

## Task 7: Add daemon tests for structured error codes

**Files:**
- `tina-daemon/src/actions.rs`

**Model:** opus

**review:** spec-only

**Depends on:** Task 6

### Steps

1. Add tests for `DispatchResult` and `classify_error` in the existing `#[cfg(test)] mod tests` block:

```rust
    #[test]
    fn test_dispatch_result_ok_json() {
        let result = DispatchResult::ok("phase advanced".to_string());
        let json: serde_json::Value = serde_json::from_str(&result.to_json()).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(json["message"], "phase advanced");
        assert!(json.get("error_code").is_none());
    }

    #[test]
    fn test_dispatch_result_err_json() {
        let result = DispatchResult::err(
            DispatchErrorCode::PayloadMissingField,
            "action payload missing 'phase' field".to_string(),
        );
        let json: serde_json::Value = serde_json::from_str(&result.to_json()).unwrap();
        assert_eq!(json["success"], false);
        assert_eq!(json["error_code"], "payload_missing_field");
        assert!(json["message"].as_str().unwrap().contains("phase"));
    }

    #[test]
    fn test_classify_error_missing_field() {
        let err = anyhow::anyhow!("action payload missing 'feature' field");
        assert!(matches!(classify_error(&err), DispatchErrorCode::PayloadMissingField));
    }

    #[test]
    fn test_classify_error_unknown_action() {
        let err = anyhow::anyhow!("unknown action type: foo");
        assert!(matches!(classify_error(&err), DispatchErrorCode::UnknownActionType));
    }

    #[test]
    fn test_classify_error_cli_exit() {
        let err = anyhow::anyhow!("tina-session exited with exit status: 1: stdout=, stderr=error");
        assert!(matches!(classify_error(&err), DispatchErrorCode::CliExitNonZero));
    }

    #[test]
    fn test_classify_error_parse() {
        let err = anyhow::anyhow!("failed to parse action payload: invalid JSON");
        assert!(matches!(classify_error(&err), DispatchErrorCode::PayloadInvalid));
    }
```

2. Run the daemon tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && cargo test --manifest-path tina-daemon/Cargo.toml`
Expected: All tests pass.

---

## Task 8: Add control buttons to StatusSection

**Files:**
- `tina-web/src/components/StatusSection.tsx`

**Model:** opus

**review:** full

**Depends on:** Task 1, Task 2

### Steps

1. Replace the existing StatusSection with a version that includes runtime control buttons. The control buttons use `useMutation` to call `enqueueControlAction` and include loading/disabled guards.

Replace the full content of `StatusSection.tsx`:

```tsx
import { useState } from "react"
import { Option } from "effect"
import { Settings, Pause, Play, RotateCcw } from "lucide-react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useFocusable } from "@/hooks/useFocusable"
import { MonoText } from "@/components/ui/mono-text"
import { StatPanel } from "@/components/ui/stat-panel"
import type { OrchestrationDetail } from "@/schemas"
import {
  statusLabel,
  statusTextClass,
  toStatusBadgeStatus,
} from "@/components/ui/status-styles"

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

type ControlActionType = "pause" | "resume" | "retry"

const PAUSABLE_STATUSES = new Set(["executing", "planning", "reviewing"])
const RESUMABLE_STATUSES = new Set(["blocked"])
const RETRYABLE_STATUSES = new Set(["blocked"])

interface StatusSectionProps {
  detail: OrchestrationDetail
}

export function StatusSection({ detail }: StatusSectionProps) {
  useFocusable("rightPanel.status", 2)

  const enqueueAction = useMutation(api.controlPlane.enqueueControlAction)
  const [pendingAction, setPendingAction] = useState<ControlActionType | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const normalizedStatus = toStatusBadgeStatus(detail.status)
  const statusDisplayLabel = statusLabel(normalizedStatus).toUpperCase()
  const statusColorClass = statusTextClass(normalizedStatus)

  const phaseProgress = `PHASE ${detail.currentPhase}/${detail.totalPhases}`
  const progressPct = detail.totalPhases > 0
    ? Math.min(100, Math.max(0, (detail.currentPhase / detail.totalPhases) * 100))
    : 0

  const elapsedTime = Option.getOrElse(detail.totalElapsedMins, () => "--")
  const elapsedDisplay = elapsedTime === "--" ? "--" : `${elapsedTime}m`

  const canPause = PAUSABLE_STATUSES.has(detail.status) && !pendingAction
  const canResume = RESUMABLE_STATUSES.has(detail.status) && !pendingAction
  const canRetry = RETRYABLE_STATUSES.has(detail.status) && !pendingAction

  const handleControlAction = async (actionType: ControlActionType) => {
    setPendingAction(actionType)
    setActionError(null)

    const payload: Record<string, string> = { feature: detail.featureName }
    if (actionType !== "resume") {
      payload.phase = String(detail.currentPhase)
    }

    try {
      await enqueueAction({
        orchestrationId: detail._id as Id<"orchestrations">,
        nodeId: detail.nodeId as Id<"nodes">,
        actionType,
        payload: JSON.stringify(payload),
        requestedBy: "web-ui",
        idempotencyKey: generateIdempotencyKey(),
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <StatPanel
      title="Orchestration"
      headerAction={<Settings className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />}
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className={`text-[8px] font-semibold uppercase tracking-wide opacity-80 ${statusColorClass}`}>
            {statusDisplayLabel}
          </span>
          <MonoText className="text-[8px] text-muted-foreground">{phaseProgress}</MonoText>
        </div>

        <div className="w-full h-1 rounded-full overflow-hidden bg-muted/70">
          <div
            className="h-full rounded-full bg-primary/65 transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex justify-end">
          <MonoText className="text-[8px] text-muted-foreground">ELAPSED: {elapsedDisplay}</MonoText>
        </div>

        {actionError && (
          <div className="text-[7px] text-status-blocked truncate" role="alert">
            {actionError}
          </div>
        )}

        <div className="grid grid-cols-3 gap-1.5">
          <button
            className="w-full flex items-center justify-center gap-1 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground disabled:opacity-40 disabled:pointer-events-none"
            disabled={!canPause}
            onClick={() => handleControlAction("pause")}
            aria-label="Pause orchestration"
            data-testid="control-pause"
          >
            <Pause className="h-2.5 w-2.5" />
            {pendingAction === "pause" ? "..." : "Pause"}
          </button>
          <button
            className="w-full flex items-center justify-center gap-1 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground disabled:opacity-40 disabled:pointer-events-none"
            disabled={!canResume}
            onClick={() => handleControlAction("resume")}
            aria-label="Resume orchestration"
            data-testid="control-resume"
          >
            <Play className="h-2.5 w-2.5" />
            {pendingAction === "resume" ? "..." : "Resume"}
          </button>
          <button
            className="w-full flex items-center justify-center gap-1 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground disabled:opacity-40 disabled:pointer-events-none"
            disabled={!canRetry}
            onClick={() => handleControlAction("retry")}
            aria-label="Retry orchestration phase"
            data-testid="control-retry"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            {pendingAction === "retry" ? "..." : "Retry"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="w-full px-2 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground"
            onClick={() => {
              // TODO: Open design doc
            }}
            aria-label="Open design plan"
          >
            Design Plan
          </button>
          <button
            className="w-full px-2 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground"
            onClick={() => {
              // TODO: Open phase plan
            }}
            aria-label="Open phase plan"
          >
            Phase Plan
          </button>
        </div>
      </div>
    </StatPanel>
  )
}
```

2. Check TypeScript compiles:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx tsc --noEmit --project tina-web/tsconfig.json`
Expected: No errors.

---

## Task 9: Update StatusSection tests for control buttons

**Files:**
- `tina-web/src/components/__tests__/StatusSection.test.tsx`

**Model:** opus

**review:** full

**Depends on:** Task 8

### Steps

1. Update the existing test file to add mocks for the Convex mutation and test control button visibility and behavior. The existing tests should still pass with minor adjustments for the new DOM structure.

Add convex/react mock at the top, after existing mocks:

```typescript
vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => vi.fn()),
}))
```

Add the import:

```typescript
import { useMutation } from "convex/react"
```

Then add a new describe block after the existing tests:

```typescript
describe("StatusSection control buttons", () => {
  const mockEnqueue = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseFocusable.mockReturnValue(focusableState())
    vi.mocked(useMutation).mockReturnValue(mockEnqueue)
  })

  it("shows enabled Pause button when status is executing", () => {
    renderStatus({ status: "executing" })

    const pauseBtn = screen.getByTestId("control-pause")
    expect(pauseBtn).not.toBeDisabled()
  })

  it("shows disabled Resume/Retry when status is executing", () => {
    renderStatus({ status: "executing" })

    expect(screen.getByTestId("control-resume")).toBeDisabled()
    expect(screen.getByTestId("control-retry")).toBeDisabled()
  })

  it("shows enabled Resume/Retry when status is blocked", () => {
    renderStatus({ status: "blocked" })

    expect(screen.getByTestId("control-resume")).not.toBeDisabled()
    expect(screen.getByTestId("control-retry")).not.toBeDisabled()
  })

  it("shows disabled Pause when status is blocked", () => {
    renderStatus({ status: "blocked" })

    expect(screen.getByTestId("control-pause")).toBeDisabled()
  })

  it("shows all buttons disabled when status is complete", () => {
    renderStatus({ status: "complete" })

    expect(screen.getByTestId("control-pause")).toBeDisabled()
    expect(screen.getByTestId("control-resume")).toBeDisabled()
    expect(screen.getByTestId("control-retry")).toBeDisabled()
  })

  it("calls enqueueControlAction with correct pause payload on click", async () => {
    const { user } = renderStatusWithUser({
      status: "executing",
      featureName: "my-feature",
      currentPhase: 2,
    })

    mockEnqueue.mockResolvedValue("action-id")

    await user.click(screen.getByTestId("control-pause"))

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "pause",
        requestedBy: "web-ui",
      }),
    )

    // Verify payload contains feature and phase
    const callPayload = JSON.parse(mockEnqueue.mock.calls[0][0].payload)
    expect(callPayload.feature).toBe("my-feature")
    expect(callPayload.phase).toBe("2")
  })

  it("calls enqueueControlAction with correct resume payload (no phase)", async () => {
    const { user } = renderStatusWithUser({
      status: "blocked",
      featureName: "my-feature",
      currentPhase: 2,
    })

    mockEnqueue.mockResolvedValue("action-id")

    await user.click(screen.getByTestId("control-resume"))

    const callPayload = JSON.parse(mockEnqueue.mock.calls[0][0].payload)
    expect(callPayload.feature).toBe("my-feature")
    expect(callPayload.phase).toBeUndefined()
  })

  it("shows error message when action fails", async () => {
    const { user } = renderStatusWithUser({ status: "executing" })

    mockEnqueue.mockRejectedValue(new Error("Queue full"))

    await user.click(screen.getByTestId("control-pause"))

    expect(screen.getByRole("alert")).toHaveTextContent("Queue full")
  })

  it("control buttons have accessible aria-labels", () => {
    renderStatus({ status: "executing" })

    expect(screen.getByRole("button", { name: "Pause orchestration" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Resume orchestration" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry orchestration phase" })).toBeInTheDocument()
  })
})
```

2. Add the `renderStatusWithUser` helper near the top of the file (after `renderStatus`):

```typescript
import userEvent from "@testing-library/user-event"

function renderStatusWithUser(overrides: Partial<typeof baseDetail> = {}) {
  const user = userEvent.setup()
  const result = render(
    <StatusSection
      detail={{
        ...baseDetail,
        ...overrides,
      }}
    />,
  )
  return { ...result, user }
}
```

3. Run the web tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx vitest run tina-web/src/components/__tests__/StatusSection.test.tsx`
Expected: All tests pass.

---

## Task 10: Integration test for full pause/resume/retry flow

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 3, Task 5

### Steps

1. Add a comprehensive integration test that verifies the full flow: enqueue → action-log → queue → event trail for each of the three control action types.

Add a new describe block at the end of the test file:

```typescript
describe("controlPlane:runtime-controls:integration", () => {
  test("e2e: pause creates action log, queue entry, and event", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"cp-feature","phase":"1"}',
      requestedBy: "web:operator",
      idempotencyKey: "e2e-pause-001",
    });

    // 1. Control-plane action log
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("pause");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].requestedBy).toBe("web:operator");
    expect(actions[0].queueActionId).toBeDefined();

    // 2. Queue entry linked back
    const queueAction = await t.run(async (ctx) => {
      return await ctx.db.get(actions[0].queueActionId!);
    });
    expect(queueAction).not.toBeNull();
    expect(queueAction!.controlActionId).toBe(actionId);
    expect(queueAction!.type).toBe("pause");

    // 3. Audit event
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("pause");
  });

  test("e2e: resume creates action log, queue entry, and event", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"feature":"cp-feature"}',
      requestedBy: "web:operator",
      idempotencyKey: "e2e-resume-001",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("resume");

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("resume");
  });

  test("e2e: retry creates action log, queue entry, and event", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "retry",
      payload: '{"feature":"cp-feature","phase":"2"}',
      requestedBy: "web:operator",
      idempotencyKey: "e2e-retry-001",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("retry");

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("retry");
  });

  test("pause + resume sequence maintains correct audit trail", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"cp-feature","phase":"1"}',
      requestedBy: "web-ui",
      idempotencyKey: "seq-pause",
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"feature":"cp-feature"}',
      requestedBy: "web-ui",
      idempotencyKey: "seq-resume",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(2);
    // Most recent first (desc order)
    expect(actions[0].actionType).toBe("resume");
    expect(actions[1].actionType).toBe("pause");

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(2);
  });
});
```

2. Run all Convex tests to verify:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/controlPlane.test.ts`
Expected: All tests pass.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 500 |

---

## Phase Estimates

| Task | Estimated Minutes | Description |
|------|-------------------|-------------|
| Task 1 | 3 | Payload validation in enqueueControlAction |
| Task 2 | 2 | Add "launching" to status styles |
| Task 3 | 5 | Convex payload validation tests |
| Task 4 | 3 | Event recording on control action |
| Task 5 | 3 | Event recording tests |
| Task 6 | 5 | Daemon structured error codes |
| Task 7 | 4 | Daemon error code tests |
| Task 8 | 5 | StatusSection control buttons |
| Task 9 | 5 | StatusSection UI tests |
| Task 10 | 5 | Integration tests |
| **Total** | **40** | |

---

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
