# Control Plane Phase 6: Unified Action Timeline, Hardening, and Rollout

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 9b877143fc8338335f774f050daf53d62b91eee4

**Goal:** Make the control plane production-ready with observability, gating, and staged rollout. After this phase: (1) every control action's result propagates back to `controlPlaneActions` to close the audit loop, (2) a unified timeline query merges all operator-visible events into one chronological stream, (3) reason codes classify every failure for diagnostics, (4) dashboard queries surface launch success rate, median action latency, and failure distribution, (5) feature flags gate control-plane capabilities for staged rollout, and (6) comprehensive tests verify the full control-plane lifecycle.

**Architecture:** Extends existing Convex backend (`actions.ts`, `controlPlane.ts`, `events.ts`) and adds new modules (`timeline.ts`, `controlPlaneDashboard.ts`, `reasonCodes.ts`, `featureFlags.ts`). Adds `ActionTimeline` UI component to `tina-web`. No new Rust crates. No schema migrations beyond one new `featureFlags` table.

**Phase context:** Phases 1-5 built `controlPlaneActions` + `inboundActions` queue + daemon dispatch + web UI for launch, pause/resume/retry, policy reconfiguration, and task editing. The `completeAction` mutation in `actions.ts` finalizes `inboundActions` rows but does NOT propagate status back to `controlPlaneActions` — so the action log stays "pending" forever after daemon completes work. Phase 6 fixes this gap and layers observability, gating, and hardening on top.

---

## Task 1: Close the controlPlaneActions completion loop

**Files:**
- `convex/actions.ts`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Modify `completeAction` in `convex/actions.ts` (line 43) to propagate completion back to the linked `controlPlaneActions` row when `controlActionId` is present on the `inboundActions` document.

Replace the existing `completeAction` mutation handler (lines 43-60) with:

```typescript
export const completeAction = mutation({
  args: {
    actionId: v.id("inboundActions"),
    result: v.string(),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.actionId);
    if (!action) {
      throw new Error(`Action ${args.actionId} not found`);
    }
    const now = Date.now();
    await ctx.db.patch(args.actionId, {
      status: args.success ? "completed" : "failed",
      result: args.result,
      completedAt: now,
    });

    // Propagate completion back to controlPlaneActions if linked
    if (action.controlActionId) {
      const controlAction = await ctx.db.get(action.controlActionId);
      if (controlAction) {
        await ctx.db.patch(action.controlActionId, {
          status: args.success ? "completed" : "failed",
          result: args.result,
          completedAt: now,
        });
      }
    }
  },
});
```

2. Verify typecheck:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 2: Add reason-code taxonomy for control-plane failures

**Files:**
- `convex/reasonCodes.ts` (new file)

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Create `convex/reasonCodes.ts` with structured failure classification:

```typescript
/**
 * Reason-code taxonomy for control-plane action failures.
 *
 * Each code maps to a category (validation, dispatch, execution, timeout)
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

/** Map daemon DispatchErrorCode strings to reason codes */
export function fromDispatchErrorCode(errorCode: string): ReasonCode {
  const mapping: Record<string, ReasonCode> = {
    PayloadMissingField: REASON_CODES.DISPATCH_PAYLOAD_INVALID,
    PayloadInvalid: REASON_CODES.DISPATCH_PAYLOAD_INVALID,
    UnknownActionType: REASON_CODES.DISPATCH_UNKNOWN_TYPE,
    CliExitNonZero: REASON_CODES.DISPATCH_CLI_EXIT_NONZERO,
    CliSpawnFailed: REASON_CODES.DISPATCH_CLI_SPAWN_FAILED,
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
```

---

## Task 3: Add unified timeline query

**Files:**
- `convex/timeline.ts` (new file)

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. Create `convex/timeline.ts` that merges `controlPlaneActions`, `orchestrationEvents`, and `inboundActions` completion signals into one chronological stream:

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export interface TimelineEntry {
  id: string;
  timestamp: number;
  source: "control_action" | "event" | "action_completion";
  category: string;
  summary: string;
  detail: string | null;
  status: string | null;
  actionType: string | null;
  reasonCode: string | null;
}

export const getUnifiedTimeline = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    limit: v.optional(v.number()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TimelineEntry[]> => {
    const limit = args.limit ?? 100;
    const entries: TimelineEntry[] = [];

    // 1. Control-plane actions (requests + completions)
    const controlActions = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_orchestration_created", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();

    for (const action of controlActions) {
      if (args.since && action.createdAt < args.since) continue;

      // Request entry
      entries.push({
        id: `cpa-req-${action._id}`,
        timestamp: action.createdAt,
        source: "control_action",
        category: "request",
        summary: `${action.actionType} requested by ${action.requestedBy}`,
        detail: action.payload,
        status: action.status,
        actionType: action.actionType,
        reasonCode: null,
      });

      // Completion entry (if completed/failed)
      if (action.completedAt) {
        let reasonCode: string | null = null;
        if (action.status === "failed" && action.result) {
          try {
            const parsed = JSON.parse(action.result);
            reasonCode = parsed.error_code ?? null;
          } catch {
            // raw string result, no structured code
          }
        }

        entries.push({
          id: `cpa-done-${action._id}`,
          timestamp: action.completedAt,
          source: "action_completion",
          category: action.status === "failed" ? "failure" : "success",
          summary: `${action.actionType} ${action.status}`,
          detail: action.result ?? null,
          status: action.status,
          actionType: action.actionType,
          reasonCode,
        });
      }
    }

    // 2. Orchestration events (launch, shutdown, phase transitions, etc.)
    const events = await ctx.db
      .query("orchestrationEvents")
      .withIndex("by_orchestration_recorded", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();

    for (const event of events) {
      const ts = new Date(event.recordedAt).getTime();
      if (args.since && ts < args.since) continue;

      entries.push({
        id: `evt-${event._id}`,
        timestamp: ts,
        source: "event",
        category: event.eventType,
        summary: event.summary,
        detail: event.detail ?? null,
        status: null,
        actionType: null,
        reasonCode: null,
      });
    }

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => b.timestamp - a.timestamp);

    return entries.slice(0, limit);
  },
});
```

2. Verify typecheck:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 4: Add dashboard analytics queries

**Files:**
- `convex/controlPlaneDashboard.ts` (new file)

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. Create `convex/controlPlaneDashboard.ts` with three analytics queries:

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Launch success rate: fraction of start_orchestration actions that completed
 * successfully vs total attempted.
 */
export const launchSuccessRate = query({
  args: {
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = args.since ?? 0;

    const actions = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_status_created")
      .collect();

    const launches = actions.filter(
      (a) => a.actionType === "start_orchestration" && a.createdAt >= cutoff,
    );

    const total = launches.length;
    if (total === 0) return { total: 0, succeeded: 0, failed: 0, rate: null };

    const succeeded = launches.filter((a) => a.status === "completed").length;
    const failed = launches.filter((a) => a.status === "failed").length;

    return {
      total,
      succeeded,
      failed,
      rate: total > 0 ? succeeded / total : null,
    };
  },
});

/**
 * Median action latency: time from createdAt to completedAt for completed
 * actions, grouped by action type.
 */
export const actionLatency = query({
  args: {
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = args.since ?? 0;

    const actions = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_status_created")
      .collect();

    const completed = actions.filter(
      (a) => a.completedAt && a.createdAt >= cutoff,
    );

    // Group by action type
    const byType: Record<string, number[]> = {};
    for (const action of completed) {
      const latency = action.completedAt! - action.createdAt;
      if (!byType[action.actionType]) byType[action.actionType] = [];
      byType[action.actionType].push(latency);
    }

    // Calculate median for each type
    const results: Record<string, { count: number; medianMs: number; p95Ms: number }> = {};
    for (const [type, latencies] of Object.entries(byType)) {
      latencies.sort((a, b) => a - b);
      const mid = Math.floor(latencies.length / 2);
      const median =
        latencies.length % 2 === 0
          ? (latencies[mid - 1] + latencies[mid]) / 2
          : latencies[mid];
      const p95Idx = Math.min(
        Math.ceil(latencies.length * 0.95) - 1,
        latencies.length - 1,
      );
      results[type] = {
        count: latencies.length,
        medianMs: Math.round(median),
        p95Ms: Math.round(latencies[p95Idx]),
      };
    }

    return results;
  },
});

/**
 * Failure distribution: count of failed actions grouped by action type
 * and reason code (extracted from result JSON).
 */
export const failureDistribution = query({
  args: {
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = args.since ?? 0;

    const actions = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_status_created")
      .collect();

    const failed = actions.filter(
      (a) => a.status === "failed" && a.createdAt >= cutoff,
    );

    const distribution: Record<string, Record<string, number>> = {};
    for (const action of failed) {
      const actionType = action.actionType;
      let reasonCode = "unknown";
      if (action.result) {
        try {
          const parsed = JSON.parse(action.result);
          reasonCode = parsed.error_code ?? "unclassified";
        } catch {
          reasonCode = "unparseable_result";
        }
      }

      if (!distribution[actionType]) distribution[actionType] = {};
      distribution[actionType][reasonCode] =
        (distribution[actionType][reasonCode] ?? 0) + 1;
    }

    return {
      totalFailed: failed.length,
      byActionType: distribution,
    };
  },
});
```

2. Verify typecheck:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 5: Add feature flag infrastructure for staged rollout

**Files:**
- `convex/schema.ts`
- `convex/featureFlags.ts` (new file)

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Add `featureFlags` table to `convex/schema.ts` after the `projectCounters` table (line 315):

```typescript
  featureFlags: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    description: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
```

2. Create `convex/featureFlags.ts` with queries and mutations:

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Control-plane feature flag keys for staged rollout. */
export const CP_FLAGS = {
  LAUNCH_FROM_WEB: "cp.launch_from_web",
  RUNTIME_CONTROLS: "cp.runtime_controls",
  POLICY_RECONFIGURATION: "cp.policy_reconfiguration",
  TASK_RECONFIGURATION: "cp.task_reconfiguration",
} as const;

export const getFlag = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const flag = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    return flag?.enabled ?? false;
  },
});

export const listFlags = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("featureFlags").collect();
  },
});

export const setFlag = mutation({
  args: {
    key: v.string(),
    enabled: v.boolean(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("featureFlags", {
      key: args.key,
      enabled: args.enabled,
      description: args.description,
      updatedAt: Date.now(),
    });
  },
});
```

3. Verify typecheck:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 6: Add feature flag guards to control-plane mutations

**Files:**
- `convex/controlPlane.ts`

**Model:** opus

**review:** full

**Depends on:** Task 5

### Steps

1. Add feature flag check helper at the top of `convex/controlPlane.ts` (after the imports, before `RUNTIME_ACTION_TYPES`):

```typescript
import type { QueryCtx, MutationCtx } from "./_generated/server";

async function checkFeatureFlag(ctx: MutationCtx | QueryCtx, key: string): Promise<boolean> {
  const flag = await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .first();
  return flag?.enabled ?? false;
}
```

Note: the existing import of `MutationCtx` at line 2 should be updated to also include `QueryCtx`.

2. Add a feature flag guard at the beginning of `launchOrchestration` handler (after `handler: async (ctx, args) => {`, before the project validation):

```typescript
    // Feature flag gate
    const launchEnabled = await checkFeatureFlag(ctx, "cp.launch_from_web");
    if (!launchEnabled) {
      throw new Error("Launch from web is not enabled. Set cp.launch_from_web feature flag to enable.");
    }
```

3. Add a feature flag guard at the beginning of `enqueueControlAction` handler, mapping action types to their respective flags:

After `if (!(RUNTIME_ACTION_TYPES as readonly string[]).includes(args.actionType))` block (line 530), add:

```typescript
    // Feature flag gates per action category
    const FLAG_MAP: Record<string, string> = {
      pause: "cp.runtime_controls",
      resume: "cp.runtime_controls",
      retry: "cp.runtime_controls",
      orchestration_set_policy: "cp.policy_reconfiguration",
      orchestration_set_role_model: "cp.policy_reconfiguration",
      task_edit: "cp.task_reconfiguration",
      task_insert: "cp.task_reconfiguration",
      task_set_model: "cp.task_reconfiguration",
    };
    const flagKey = FLAG_MAP[args.actionType];
    if (flagKey) {
      const flagEnabled = await checkFeatureFlag(ctx, flagKey);
      if (!flagEnabled) {
        throw new Error(
          `Action "${args.actionType}" is not enabled. Set ${flagKey} feature flag to enable.`,
        );
      }
    }
```

4. Verify typecheck:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 7: Add ActionTimeline UI component

**Files:**
- `tina-web/src/components/ActionTimeline.tsx` (new file)
- `tina-web/src/components/ActionTimeline.module.scss` (new file)
- `tina-web/src/services/data/queryDefs.ts`

**Model:** opus

**review:** full

**Depends on:** Task 3

### Steps

1. Add the timeline query definition in `tina-web/src/services/data/queryDefs.ts`. After the `NodeListQuery` definition (around line 174), add:

```typescript
export const TimelineQuery = createQueryDef(
  api.timeline.getUnifiedTimeline,
  {
    orchestrationId: "",
    limit: 100,
  },
  "TimelineQuery",
);
```

Make sure the `api` import from `@convex/_generated/api` is already present (it should be).

2. Create `tina-web/src/components/ActionTimeline.module.scss`:

```scss
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.entry {
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.625rem;
  border-left: 2px solid var(--border);
  margin-left: 0.375rem;

  &.request {
    border-left-color: hsl(var(--primary) / 0.5);
  }

  &.success {
    border-left-color: hsl(var(--status-success));
  }

  &.failure {
    border-left-color: hsl(var(--status-blocked));
  }

  &.event {
    border-left-color: hsl(var(--muted-foreground) / 0.4);
  }
}

.timestamp {
  flex-shrink: 0;
  width: 3.5rem;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.summary {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  flex-shrink: 0;
  padding: 0 0.25rem;
  border-radius: 0.125rem;
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;

  &.completed {
    color: hsl(var(--status-success));
    background: hsl(var(--status-success) / 0.1);
  }

  &.failed {
    color: hsl(var(--status-blocked));
    background: hsl(var(--status-blocked) / 0.1);
  }

  &.pending {
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted) / 0.5);
  }
}
```

3. Create `tina-web/src/components/ActionTimeline.tsx`:

```tsx
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TimelineQuery } from "@/services/data/queryDefs"
import { StatPanel } from "@/components/ui/stat-panel"
import styles from "./ActionTimeline.module.scss"

interface ActionTimelineProps {
  orchestrationId: string
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function entryClassName(source: string, category: string): string {
  if (source === "action_completion") {
    return category === "failure" ? styles.failure : styles.success
  }
  if (source === "control_action") return styles.request
  return styles.event
}

function badgeClassName(status: string | null): string {
  if (status === "completed") return styles.completed
  if (status === "failed") return styles.failed
  return styles.pending
}

export function ActionTimeline({ orchestrationId }: ActionTimelineProps) {
  const result = useTypedQuery(TimelineQuery, { orchestrationId, limit: 50 })

  const isLoading = result.status !== "success"
  const entries = result.status === "success" ? result.data : []

  return (
    <StatPanel title="Action Timeline">
      {isLoading && (
        <div className="text-[8px] text-muted-foreground animate-pulse">
          Loading timeline...
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="text-[8px] text-muted-foreground">No actions recorded</div>
      )}

      {!isLoading && entries.length > 0 && (
        <div className={styles.timeline} role="log" aria-label="Action timeline">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`${styles.entry} ${entryClassName(entry.source, entry.category)}`}
            >
              <span className={styles.timestamp}>{formatTime(entry.timestamp)}</span>
              <span className={styles.summary}>{entry.summary}</span>
              {entry.status && (
                <span className={`${styles.badge} ${badgeClassName(entry.status)}`}>
                  {entry.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </StatPanel>
  )
}
```

4. Wire the `ActionTimeline` into `RightPanel.tsx`. Add import and render it after `ReviewSection`:

In `tina-web/src/components/RightPanel.tsx`, add import:
```typescript
import { ActionTimeline } from "@/components/ActionTimeline"
```

And add the component inside the `<div className={styles.stack}>`, after `<ReviewSection ... />`:
```tsx
        <ActionTimeline orchestrationId={detail._id} />
```

5. Verify build:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1/tina-web && npx tsc --noEmit`
Expected: No errors.

---

## Task 8: Add Convex tests for completion loop, timeline, dashboard, and feature flags

**Files:**
- `convex/timeline.test.ts` (new file)
- `convex/controlPlaneDashboard.test.ts` (new file)
- `convex/featureFlags.test.ts` (new file)

**Model:** opus

**review:** full

**Depends on:** Task 1, Task 3, Task 4, Task 5, Task 6

### Steps

1. Create `convex/featureFlags.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

describe("featureFlags", () => {
  it("getFlag returns false for unset flag", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.featureFlags.getFlag, { key: "cp.launch_from_web" });
    expect(result).toBe(false);
  });

  it("setFlag creates and getFlag returns true", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.launch_from_web",
      enabled: true,
      description: "Enable launch from web UI",
    });
    const result = await t.query(api.featureFlags.getFlag, { key: "cp.launch_from_web" });
    expect(result).toBe(true);
  });

  it("setFlag updates existing flag", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.launch_from_web",
      enabled: true,
    });
    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.launch_from_web",
      enabled: false,
    });
    const result = await t.query(api.featureFlags.getFlag, { key: "cp.launch_from_web" });
    expect(result).toBe(false);
  });

  it("listFlags returns all flags", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.featureFlags.setFlag, { key: "cp.launch_from_web", enabled: true });
    await t.mutation(api.featureFlags.setFlag, { key: "cp.runtime_controls", enabled: false });
    const flags = await t.query(api.featureFlags.listFlags, {});
    expect(flags).toHaveLength(2);
  });
});
```

2. Create `convex/timeline.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";
import { createFeatureFixture, createNode } from "./test_helpers";

describe("timeline:getUnifiedTimeline", () => {
  it("returns empty timeline for new orchestration", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "test-feature");
    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId: orchestrationId as any,
    });
    expect(entries).toHaveLength(0);
  });

  it("includes control action requests", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "test-feature");

    // Enable feature flag for runtime controls
    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.runtime_controls",
      enabled: true,
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId: orchestrationId as any,
      nodeId: nodeId as any,
      actionType: "pause",
      payload: JSON.stringify({ feature: "test-feature", phase: "1" }),
      requestedBy: "web-ui",
      idempotencyKey: "test-pause-1",
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId: orchestrationId as any,
    });

    // Should have: control_action request + event (control_action_requested)
    const controlActions = entries.filter((e: any) => e.source === "control_action");
    const events = entries.filter((e: any) => e.source === "event");
    expect(controlActions.length).toBeGreaterThanOrEqual(1);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("includes completion entries after completeAction", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "test-feature");

    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.runtime_controls",
      enabled: true,
    });

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId: orchestrationId as any,
      nodeId: nodeId as any,
      actionType: "resume",
      payload: JSON.stringify({ feature: "test-feature" }),
      requestedBy: "web-ui",
      idempotencyKey: "test-resume-1",
    });

    // Look up the inbound action linked to this control action
    const controlAction = await t.run(async (ctx) => {
      return await ctx.db.get(actionId as any);
    });
    const queueActionId = controlAction!.queueActionId;

    // Complete the queue action
    await t.mutation(api.actions.completeAction, {
      actionId: queueActionId as any,
      result: JSON.stringify({ success: true, message: "resumed" }),
      success: true,
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId: orchestrationId as any,
    });

    const completions = entries.filter((e: any) => e.source === "action_completion");
    expect(completions.length).toBeGreaterThanOrEqual(1);
    expect(completions[0].category).toBe("success");
  });

  it("respects limit parameter", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "test-feature");

    // Insert multiple events
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.events.recordEvent, {
        orchestrationId: orchestrationId as any,
        eventType: "test_event",
        source: "test",
        summary: `Event ${i}`,
        recordedAt: new Date(Date.now() + i * 1000).toISOString(),
      });
    }

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId: orchestrationId as any,
      limit: 3,
    });
    expect(entries).toHaveLength(3);
  });

  it("sorts entries by timestamp descending", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "test-feature");

    await t.mutation(api.events.recordEvent, {
      orchestrationId: orchestrationId as any,
      eventType: "early",
      source: "test",
      summary: "Early event",
      recordedAt: "2026-02-12T10:00:00Z",
    });

    await t.mutation(api.events.recordEvent, {
      orchestrationId: orchestrationId as any,
      eventType: "late",
      source: "test",
      summary: "Late event",
      recordedAt: "2026-02-12T11:00:00Z",
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId: orchestrationId as any,
    });

    expect(entries.length).toBeGreaterThanOrEqual(2);
    // Descending: later event first
    expect(entries[0].timestamp).toBeGreaterThanOrEqual(entries[1].timestamp);
  });
});

describe("actions:completeAction propagation", () => {
  it("propagates completion to controlPlaneActions", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "test-feature");

    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.runtime_controls",
      enabled: true,
    });

    const controlActionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId: orchestrationId as any,
      nodeId: nodeId as any,
      actionType: "pause",
      payload: JSON.stringify({ feature: "test-feature", phase: "1" }),
      requestedBy: "web-ui",
      idempotencyKey: "test-pause-propagation",
    });

    // Get the queue action ID
    const controlAction = await t.run(async (ctx) => {
      return await ctx.db.get(controlActionId as any);
    });
    expect(controlAction!.status).toBe("pending");

    // Complete the queue action
    await t.mutation(api.actions.completeAction, {
      actionId: controlAction!.queueActionId as any,
      result: JSON.stringify({ success: true, message: "paused" }),
      success: true,
    });

    // Verify controlPlaneActions row was updated
    const updated = await t.run(async (ctx) => {
      return await ctx.db.get(controlActionId as any);
    });
    expect(updated!.status).toBe("completed");
    expect(updated!.completedAt).toBeDefined();
  });

  it("propagates failure to controlPlaneActions", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "test-feature");

    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.runtime_controls",
      enabled: true,
    });

    const controlActionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId: orchestrationId as any,
      nodeId: nodeId as any,
      actionType: "retry",
      payload: JSON.stringify({ feature: "test-feature", phase: "1" }),
      requestedBy: "web-ui",
      idempotencyKey: "test-retry-fail",
    });

    const controlAction = await t.run(async (ctx) => {
      return await ctx.db.get(controlActionId as any);
    });

    // Complete with failure
    await t.mutation(api.actions.completeAction, {
      actionId: controlAction!.queueActionId as any,
      result: JSON.stringify({ success: false, error_code: "CliExitNonZero", message: "exit 1" }),
      success: false,
    });

    const updated = await t.run(async (ctx) => {
      return await ctx.db.get(controlActionId as any);
    });
    expect(updated!.status).toBe("failed");
    expect(updated!.result).toContain("CliExitNonZero");
  });
});
```

3. Create `convex/controlPlaneDashboard.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";
import { createFeatureFixture } from "./test_helpers";

describe("controlPlaneDashboard:launchSuccessRate", () => {
  it("returns zero stats when no actions exist", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.controlPlaneDashboard.launchSuccessRate, {});
    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0, rate: null });
  });

  it("counts successful launches", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "test-feature");

    // Insert a completed start_orchestration control action directly
    await t.run(async (ctx) => {
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId: orchestrationId as any,
        actionType: "start_orchestration",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: "launch-1",
        status: "completed",
        createdAt: Date.now(),
        completedAt: Date.now() + 5000,
      });
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId: orchestrationId as any,
        actionType: "start_orchestration",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: "launch-2",
        status: "failed",
        createdAt: Date.now(),
        completedAt: Date.now() + 3000,
      });
    });

    const result = await t.query(api.controlPlaneDashboard.launchSuccessRate, {});
    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.rate).toBe(0.5);
  });
});

describe("controlPlaneDashboard:actionLatency", () => {
  it("returns empty object when no completed actions", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.controlPlaneDashboard.actionLatency, {});
    expect(result).toEqual({});
  });

  it("calculates median latency by action type", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "test-feature");

    const baseTime = Date.now();
    await t.run(async (ctx) => {
      // Three pause actions with known latencies: 1000, 2000, 3000ms
      for (let i = 0; i < 3; i++) {
        const latency = (i + 1) * 1000;
        await ctx.db.insert("controlPlaneActions", {
          orchestrationId: orchestrationId as any,
          actionType: "pause",
          payload: "{}",
          requestedBy: "web-ui",
          idempotencyKey: `pause-${i}`,
          status: "completed",
          createdAt: baseTime + i * 10000,
          completedAt: baseTime + i * 10000 + latency,
        });
      }
    });

    const result = await t.query(api.controlPlaneDashboard.actionLatency, {});
    expect(result.pause).toBeDefined();
    expect(result.pause.count).toBe(3);
    expect(result.pause.medianMs).toBe(2000);
  });
});

describe("controlPlaneDashboard:failureDistribution", () => {
  it("groups failures by action type and reason code", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "test-feature");

    await t.run(async (ctx) => {
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId: orchestrationId as any,
        actionType: "pause",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: "fail-1",
        status: "failed",
        result: JSON.stringify({ success: false, error_code: "CliExitNonZero", message: "exit 1" }),
        createdAt: Date.now(),
        completedAt: Date.now() + 1000,
      });
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId: orchestrationId as any,
        actionType: "pause",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: "fail-2",
        status: "failed",
        result: JSON.stringify({ success: false, error_code: "CliSpawnFailed", message: "spawn" }),
        createdAt: Date.now(),
        completedAt: Date.now() + 1000,
      });
    });

    const result = await t.query(api.controlPlaneDashboard.failureDistribution, {});
    expect(result.totalFailed).toBe(2);
    expect(result.byActionType.pause).toBeDefined();
    expect(result.byActionType.pause.CliExitNonZero).toBe(1);
    expect(result.byActionType.pause.CliSpawnFailed).toBe(1);
  });
});
```

4. Run all tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test`
Expected: All tests pass.

---

## Task 9: Add feature flag gate tests for controlPlane mutations

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 6, Task 8

### Steps

1. Add a new test suite at the end of `convex/controlPlane.test.ts` for feature flag gating:

```typescript
describe("controlPlane:featureFlags", () => {
  it("launchOrchestration rejects when flag disabled", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, projectId, designId } = await createLaunchFixture(t);

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId: projectId as any,
        designId: designId as any,
        nodeId: nodeId as any,
        feature: "gated-feature",
        branch: "tina/gated-feature",
        totalPhases: 1,
        policyPreset: "balanced",
        requestedBy: "web-ui",
        idempotencyKey: "gated-launch-1",
      }),
    ).rejects.toThrow("Launch from web is not enabled");
  });

  it("launchOrchestration succeeds when flag enabled", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, projectId, designId } = await createLaunchFixture(t);

    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.launch_from_web",
      enabled: true,
    });

    const result = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId: projectId as any,
      designId: designId as any,
      nodeId: nodeId as any,
      feature: "gated-feature",
      branch: "tina/gated-feature",
      totalPhases: 1,
      policyPreset: "balanced",
      requestedBy: "web-ui",
      idempotencyKey: "gated-launch-1",
    });
    expect(result.orchestrationId).toBeDefined();
  });

  it("enqueueControlAction rejects runtime controls when flag disabled", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "test-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId: orchestrationId as any,
        nodeId: nodeId as any,
        actionType: "pause",
        payload: JSON.stringify({ feature: "test-feature", phase: "1" }),
        requestedBy: "web-ui",
        idempotencyKey: "gated-pause-1",
      }),
    ).rejects.toThrow("cp.runtime_controls");
  });

  it("enqueueControlAction rejects task reconfiguration when flag disabled", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "test-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId: orchestrationId as any,
        nodeId: nodeId as any,
        actionType: "task_edit",
        payload: JSON.stringify({
          feature: "test-feature",
          phaseNumber: "1",
          taskNumber: 1,
          revision: 1,
          subject: "edited",
        }),
        requestedBy: "web-ui",
        idempotencyKey: "gated-edit-1",
      }),
    ).rejects.toThrow("cp.task_reconfiguration");
  });
});
```

2. **Important:** Existing tests in `controlPlane.test.ts` that call `enqueueControlAction` or `launchOrchestration` will now fail because feature flags aren't set. Each existing test that calls these mutations needs a feature flag setup line added. Add a helper at the top of the test file:

```typescript
async function enableAllControlPlaneFlags(t: any) {
  await t.mutation(api.featureFlags.setFlag, { key: "cp.launch_from_web", enabled: true });
  await t.mutation(api.featureFlags.setFlag, { key: "cp.runtime_controls", enabled: true });
  await t.mutation(api.featureFlags.setFlag, { key: "cp.policy_reconfiguration", enabled: true });
  await t.mutation(api.featureFlags.setFlag, { key: "cp.task_reconfiguration", enabled: true });
}
```

Then call `await enableAllControlPlaneFlags(t);` at the start of every existing test that uses `launchOrchestration` or `enqueueControlAction`. This is a mechanical change across all existing test cases.

3. Run tests to verify:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test`
Expected: All tests pass.

---

## Task 10: Add reasonCodes unit tests

**Files:**
- `convex/reasonCodes.test.ts` (new file)

**Model:** haiku

**review:** spec-only

**Depends on:** Task 2

### Steps

1. Create `convex/reasonCodes.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  categoryForCode,
  fromDispatchErrorCode,
  extractReasonCode,
  REASON_CODES,
} from "./reasonCodes";

describe("reasonCodes", () => {
  describe("categoryForCode", () => {
    it("classifies validation codes", () => {
      expect(categoryForCode("validation_missing_field")).toBe("validation");
      expect(categoryForCode("validation_revision_conflict")).toBe("validation");
    });

    it("classifies dispatch codes", () => {
      expect(categoryForCode("dispatch_cli_exit_nonzero")).toBe("dispatch");
      expect(categoryForCode("dispatch_cli_spawn_failed")).toBe("dispatch");
    });

    it("classifies execution codes", () => {
      expect(categoryForCode("execution_init_failed")).toBe("execution");
    });
  });

  describe("fromDispatchErrorCode", () => {
    it("maps CliExitNonZero", () => {
      expect(fromDispatchErrorCode("CliExitNonZero")).toBe(
        REASON_CODES.DISPATCH_CLI_EXIT_NONZERO,
      );
    });

    it("maps CliSpawnFailed", () => {
      expect(fromDispatchErrorCode("CliSpawnFailed")).toBe(
        REASON_CODES.DISPATCH_CLI_SPAWN_FAILED,
      );
    });

    it("maps UnknownActionType", () => {
      expect(fromDispatchErrorCode("UnknownActionType")).toBe(
        REASON_CODES.DISPATCH_UNKNOWN_TYPE,
      );
    });

    it("returns fallback for unknown code", () => {
      expect(fromDispatchErrorCode("SomethingNew")).toBe(
        REASON_CODES.DISPATCH_PAYLOAD_INVALID,
      );
    });
  });

  describe("extractReasonCode", () => {
    it("returns null for successful result", () => {
      expect(
        extractReasonCode(JSON.stringify({ success: true, message: "ok" })),
      ).toBeNull();
    });

    it("extracts error_code from failed result", () => {
      expect(
        extractReasonCode(
          JSON.stringify({ success: false, error_code: "CliExitNonZero", message: "exit 1" }),
        ),
      ).toBe(REASON_CODES.DISPATCH_CLI_EXIT_NONZERO);
    });

    it("returns default for failed result without error_code", () => {
      expect(
        extractReasonCode(JSON.stringify({ success: false, message: "boom" })),
      ).toBe(REASON_CODES.DISPATCH_CLI_EXIT_NONZERO);
    });

    it("returns fallback for unparseable JSON", () => {
      expect(extractReasonCode("not json")).toBe(REASON_CODES.DISPATCH_PAYLOAD_INVALID);
    });
  });
});
```

2. Run tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --grep reasonCodes`
Expected: All tests pass.

---

## Phase Estimates

| Task | Estimated Time | Complexity |
|------|---------------|------------|
| Task 1: Completion loop fix | 5 min | Low - small mutation change |
| Task 2: Reason-code taxonomy | 5 min | Low - new file, constants only |
| Task 3: Unified timeline query | 10 min | Medium - merges 3 data sources |
| Task 4: Dashboard analytics queries | 10 min | Medium - aggregation logic |
| Task 5: Feature flag infrastructure | 8 min | Low - new table + CRUD |
| Task 6: Feature flag guards | 10 min | Medium - touches existing code |
| Task 7: ActionTimeline UI | 12 min | Medium - new component + wiring |
| Task 8: Convex tests (timeline, dashboard, flags) | 15 min | Medium - multiple test files |
| Task 9: Feature flag gate tests + existing test fixes | 15 min | Medium - mechanical but many |
| Task 10: Reason-code unit tests | 5 min | Low - pure function tests |
| **Total** | **~95 min** | |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 1200 |

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
