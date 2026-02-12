# Control Plane Phase 6.5 Remediation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 0b9e1e35b2d228d962c4ea672bb4a7e9e5595947

**Goal:** Address gaps from Phase 6 review: (1) regenerate Convex API types so `controlPlaneDashboard` is in the generated API, (2) use `extractReasonCode` from `reasonCodes.ts` in `timeline.ts` instead of inline JSON parsing.

**Architecture:** Targeted fixes to existing implementation. No new architecture.

**Phase context:** Phase 6 implemented the unified action timeline, dashboard analytics, reason codes, and feature flags. Review found two gaps: the generated Convex API types are missing the `controlPlaneDashboard` module (meaning tests referencing `api.controlPlaneDashboard` fail at compile time), and `convex/timeline.ts` duplicates reason-code extraction logic inline instead of reusing the `extractReasonCode` helper from `convex/reasonCodes.ts`.

**Issues to address:**
1. Regenerate Convex API types (`npx convex dev`) — `controlPlaneDashboard` is missing from `convex/_generated/api.d.ts`
2. Use `extractReasonCode` in `timeline.ts` — replace inline JSON parsing with the shared helper, update test expectations

---

## Task 1: Regenerate Convex API types

**Files:**
- `convex/_generated/api.d.ts` (regenerated)
- `convex/_generated/api.js` (regenerated)
- `convex/_generated/server.d.ts` (regenerated)
- `convex/_generated/server.js` (regenerated)
- `convex/_generated/dataModel.d.ts` (regenerated)

**Model:** haiku

**review:** spec-only

**Depends on:** none

### Steps

1. Regenerate the Convex types by running the dev server in `--once` mode:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex dev --once`
Expected: Generation succeeds. `convex/_generated/api.d.ts` now includes `import type * as controlPlaneDashboard from "../controlPlaneDashboard.js"` and the corresponding entry in the `fullApi` type.

2. Verify the regenerated types include `controlPlaneDashboard`:

Run: `grep controlPlaneDashboard /Users/joshua/Projects/tina/.worktrees/control-plane-v1/convex/_generated/api.d.ts`
Expected: Two lines — one import and one `fullApi` entry.

3. Verify typecheck passes:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 2: Use extractReasonCode in timeline.ts and update tests

**Files:**
- `convex/timeline.ts`
- `convex/timeline.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. In `convex/timeline.ts`, add import for `extractReasonCode` at the top (after the existing imports):

```typescript
import { extractReasonCode } from "./reasonCodes";
```

2. Replace the inline reason-code extraction block (lines 52-60) with a call to `extractReasonCode`. The current code:

```typescript
        let reasonCode: string | null = null;
        if (action.status === "failed" && action.result) {
          try {
            const parsed = JSON.parse(action.result);
            reasonCode = parsed.error_code ?? null;
          } catch {
            // raw string result, no structured code
          }
        }
```

Replace with:

```typescript
        let reasonCode: string | null = null;
        if (action.status === "failed" && action.result) {
          reasonCode = extractReasonCode(action.result);
        }
```

3. Update `convex/timeline.test.ts` test "extracts reason code from failed action result" (line 89). The test uses `error_code: "node_offline"` which is not a known dispatch error code. With `extractReasonCode`, `fromDispatchErrorCode("node_offline")` returns the fallback `dispatch_payload_invalid`.

Change the test data to use a known error code instead:

```typescript
        result: JSON.stringify({ success: false, error_code: "cli_exit_non_zero", message: "Process exited non-zero" }),
```

And update the expectation:

```typescript
    expect(completionEntry!.reasonCode).toBe("dispatch_cli_exit_nonzero");
```

4. Update `convex/timeline.test.ts` test "handles non-JSON result on failed action gracefully" (line 118). With `extractReasonCode`, non-JSON input returns `dispatch_payload_invalid` instead of `null`.

Change the expectation from:

```typescript
    expect(completionEntry!.reasonCode).toBeNull();
```

To:

```typescript
    expect(completionEntry!.reasonCode).toBe("dispatch_payload_invalid");
```

5. Verify typecheck:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

6. Run tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test`
Expected: All tests pass.

---

## Phase Estimates

| Task | Estimated Time | Complexity |
|------|---------------|------------|
| Task 1: Regenerate Convex API types | 2 min | Low - run codegen command |
| Task 2: Use extractReasonCode in timeline.ts | 5 min | Low - import swap + test updates |
| **Total** | **~7 min** | |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 50 |

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
