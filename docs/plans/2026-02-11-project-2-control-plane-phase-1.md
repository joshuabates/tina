# Phase 1: Control-Plane Contracts and Schema Foundation

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** ae112d5f4537b1658be99ea9f4276875e372e6aa

**Goal:** Establish the data contracts and schema for launch + runtime control actions with strict traceability and idempotency. After this phase, every control-plane action can be durably logged, deduplicated by idempotency key, and linked to the existing `inboundActions` queue for daemon dispatch.

**Architecture:** Extends existing Convex schema with a new `controlPlaneActions` table and new fields on `orchestrations` (via contract) and `inboundActions`. A new `convex/controlPlane.ts` module provides mutation/query entry points following the same patterns as `convex/actions.ts`.

**Phase context:** The existing codebase has `convex/actions.ts` for queue primitives, `convex/schema.ts` with `inboundActions` and `orchestrations` tables, and a contract generation pipeline (`contracts/orchestration-core.contract.json` → `scripts/generate-contracts.mjs` → generated files in convex/web/rust). This phase adds a control-plane layer on top.

---

## Task 1: Add `controlPlaneActions` table to Convex schema

**Files:**
- `convex/schema.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** none

### Steps

1. Open `convex/schema.ts` and add the `controlPlaneActions` table definition after the `inboundActions` table (line 124).

Add this table:

```typescript
controlPlaneActions: defineTable({
  orchestrationId: v.id("orchestrations"),
  actionType: v.string(),
  payload: v.string(),
  requestedBy: v.string(),
  idempotencyKey: v.string(),
  status: v.string(),
  result: v.optional(v.string()),
  queueActionId: v.optional(v.id("inboundActions")),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_orchestration_created", ["orchestrationId", "createdAt"])
  .index("by_status_created", ["status", "createdAt"])
  .index("by_idempotency", ["idempotencyKey"]),
```

2. Verify schema is valid:

Run: `cd /Users/joshua/Projects/tina && npx convex dev --once --typecheck=disable 2>&1 | tail -5`
Expected: Schema push succeeds or shows only unrelated warnings.

---

## Task 2: Add launch metadata fields to orchestration contract and extend generator for boolean kind

**Files:**
- `contracts/orchestration-core.contract.json`
- `scripts/generate-contracts.mjs`

**Model:** opus

**review:** spec-only

**Depends on:** none

### Steps

1. Open `contracts/orchestration-core.contract.json` and add 5 new fields after the existing `totalElapsedMins` entry:

```json
{ "name": "policySnapshot", "rust": "policy_snapshot", "kind": "string", "optional": true },
{ "name": "policySnapshotHash", "rust": "policy_snapshot_hash", "kind": "string", "optional": true },
{ "name": "presetOrigin", "rust": "preset_origin", "kind": "string", "optional": true },
{ "name": "designOnly", "rust": "design_only", "kind": "boolean", "optional": true },
{ "name": "updatedAt", "rust": "updated_at", "kind": "string", "optional": true }
```

2. Open `scripts/generate-contracts.mjs` and extend the three generator functions to handle `kind: "boolean"`:

In `convexValueExpr` (around line 17), add a branch for boolean:
```javascript
} else if (field.kind === "boolean") {
  base = "v.boolean()";
}
```

In `webSchemaExpr` (around line 36), handle boolean:
```javascript
if (field.kind === "boolean") {
  return field.optional ? "optionalBoolean" : "Schema.Boolean";
}
```

And add the `optionalBoolean` helper to the web output (after the `optionalNumber` line):
```javascript
"const optionalBoolean = Schema.optionalWith(Schema.Boolean, { as: \"Option\" });",
```

In `rustTypeExpr` (around line 44), handle boolean:
```javascript
function rustTypeExpr(field) {
  let base;
  if (field.kind === "number") base = "f64";
  else if (field.kind === "boolean") base = "bool";
  else base = "String";
  return field.optional ? `Option<${base}>` : base;
}
```

Update the JSDoc typedef to include `"boolean"`:
```javascript
/** @typedef {{name: string, rust: string, kind: "string" | "number" | "id" | "boolean", optional?: boolean, table?: string}} Field */
```

3. Run the contract generator:

Run: `cd /Users/joshua/Projects/tina && node scripts/generate-contracts.mjs`
Expected: Output lists 3 generated files without errors.

4. Verify generated Convex file includes new fields:

Run: `cd /Users/joshua/Projects/tina && grep -c 'policySnapshot\|designOnly\|updatedAt' convex/generated/orchestrationCore.ts`
Expected: 3 (one line per field group matched)

5. Verify generated Rust file includes boolean type:

Run: `cd /Users/joshua/Projects/tina && grep 'design_only' tina-data/src/generated/orchestration_core_fields.rs`
Expected: `    pub design_only: Option<bool>,`

---

## Task 3: Extend `inboundActions` with control-plane linkage fields

**Files:**
- `convex/schema.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** 1

### Steps

1. In `convex/schema.ts`, add two optional fields to the `inboundActions` table definition (after line 121, before the closing `)`):

```typescript
controlActionId: v.optional(v.id("controlPlaneActions")),
idempotencyKey: v.optional(v.string()),
```

2. Verify the schema is valid:

Run: `cd /Users/joshua/Projects/tina && npx convex dev --once --typecheck=disable 2>&1 | tail -5`
Expected: Schema push succeeds.

---

## Task 4: Regenerate contract artifacts and verify consistency

**Files:**
- `convex/generated/orchestrationCore.ts`
- `tina-web/src/schemas/generated/orchestrationCore.ts`
- `tina-data/src/generated/orchestration_core_fields.rs`

**Model:** haiku

**review:** spec-only

**Depends on:** 2

### Steps

1. Run the generator if not already run in Task 2:

Run: `cd /Users/joshua/Projects/tina && node scripts/generate-contracts.mjs`
Expected: 3 files listed.

2. Verify Convex generated file has all new fields:

Run: `cd /Users/joshua/Projects/tina && cat convex/generated/orchestrationCore.ts`
Expected: File includes `policySnapshot: v.optional(v.string())`, `policySnapshotHash: v.optional(v.string())`, `presetOrigin: v.optional(v.string())`, `designOnly: v.optional(v.boolean())`, `updatedAt: v.optional(v.string())`.

3. Verify web generated file has all new fields including `optionalBoolean`:

Run: `cd /Users/joshua/Projects/tina && cat tina-web/src/schemas/generated/orchestrationCore.ts`
Expected: File includes `optionalBoolean` helper and `designOnly: optionalBoolean`.

4. Verify Rust generated file:

Run: `cd /Users/joshua/Projects/tina && cat tina-data/src/generated/orchestration_core_fields.rs`
Expected: File includes `pub policy_snapshot: Option<String>`, `pub design_only: Option<bool>`, etc.

5. Verify Rust crate still compiles with new fields:

Run: `cd /Users/joshua/Projects/tina && cargo check -p tina-data 2>&1 | tail -5`
Expected: Compiles without errors.

---

## Task 5: Implement `convex/controlPlane.ts` with core mutations and queries

**Files:**
- `convex/controlPlane.ts` (new file)

**Model:** opus

**review:** full

**Depends on:** 1, 3, 4

### Steps

1. Create `convex/controlPlane.ts` with the following content:

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const ALLOWED_ACTION_TYPES = [
  "start_orchestration",
  "pause",
  "resume",
  "retry",
  "orchestration_set_policy",
  "orchestration_set_role_model",
  "task_edit",
  "task_insert",
  "task_set_model",
] as const;

const RUNTIME_ACTION_TYPES = [
  "pause",
  "resume",
  "retry",
  "orchestration_set_policy",
  "orchestration_set_role_model",
  "task_edit",
  "task_insert",
  "task_set_model",
] as const;

export const startOrchestration = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    nodeId: v.id("nodes"),
    policySnapshot: v.string(),
    policySnapshotHash: v.string(),
    presetOrigin: v.optional(v.string()),
    designOnly: v.optional(v.boolean()),
    requestedBy: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Check idempotency
    const existing = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_idempotency", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .first();
    if (existing) {
      return existing._id;
    }

    // Patch orchestration with policy metadata
    const patchFields: Record<string, unknown> = {
      policySnapshot: args.policySnapshot,
      policySnapshotHash: args.policySnapshotHash,
      updatedAt: new Date().toISOString(),
    };
    if (args.presetOrigin !== undefined) {
      patchFields.presetOrigin = args.presetOrigin;
    }
    if (args.designOnly !== undefined) {
      patchFields.designOnly = args.designOnly;
    }
    await ctx.db.patch(args.orchestrationId, patchFields);

    // Insert control-plane action log entry
    const actionId = await ctx.db.insert("controlPlaneActions", {
      orchestrationId: args.orchestrationId,
      actionType: "start_orchestration",
      payload: JSON.stringify({
        policySnapshotHash: args.policySnapshotHash,
        presetOrigin: args.presetOrigin,
        designOnly: args.designOnly,
      }),
      requestedBy: args.requestedBy,
      idempotencyKey: args.idempotencyKey,
      status: "pending",
      createdAt: Date.now(),
    });

    // Insert inboundActions queue row
    const queueActionId = await ctx.db.insert("inboundActions", {
      nodeId: args.nodeId,
      orchestrationId: args.orchestrationId,
      type: "start_orchestration",
      payload: JSON.stringify({
        policySnapshotHash: args.policySnapshotHash,
        presetOrigin: args.presetOrigin,
        designOnly: args.designOnly,
      }),
      status: "pending",
      createdAt: Date.now(),
      controlActionId: actionId,
      idempotencyKey: args.idempotencyKey,
    });

    // Link queue action back to control-plane action
    await ctx.db.patch(actionId, { queueActionId });

    return actionId;
  },
});

export const enqueueControlAction = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    nodeId: v.id("nodes"),
    actionType: v.string(),
    payload: v.string(),
    requestedBy: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate action type
    if (
      !(RUNTIME_ACTION_TYPES as readonly string[]).includes(args.actionType)
    ) {
      throw new Error(
        `Invalid actionType: "${args.actionType}". Allowed: ${RUNTIME_ACTION_TYPES.join(", ")}`,
      );
    }

    // Check idempotency
    const existing = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_idempotency", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .first();
    if (existing) {
      return existing._id;
    }

    // Insert control-plane action log entry
    const actionId = await ctx.db.insert("controlPlaneActions", {
      orchestrationId: args.orchestrationId,
      actionType: args.actionType,
      payload: args.payload,
      requestedBy: args.requestedBy,
      idempotencyKey: args.idempotencyKey,
      status: "pending",
      createdAt: Date.now(),
    });

    // Insert inboundActions queue row
    const queueActionId = await ctx.db.insert("inboundActions", {
      nodeId: args.nodeId,
      orchestrationId: args.orchestrationId,
      type: args.actionType,
      payload: args.payload,
      status: "pending",
      createdAt: Date.now(),
      controlActionId: actionId,
      idempotencyKey: args.idempotencyKey,
    });

    // Link queue action back to control-plane action
    await ctx.db.patch(actionId, { queueActionId });

    return actionId;
  },
});

export const listControlActions = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const actions = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_orchestration_created", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .order("desc")
      .take(limit);
    return actions;
  },
});

export const getLatestPolicySnapshot = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    const orchestration = await ctx.db.get(args.orchestrationId);
    if (!orchestration) {
      return null;
    }
    const { policySnapshot, policySnapshotHash, presetOrigin } =
      orchestration as Record<string, unknown>;
    if (!policySnapshot) {
      return null;
    }
    return {
      policySnapshot: policySnapshot as string,
      policySnapshotHash: (policySnapshotHash as string) ?? null,
      presetOrigin: (presetOrigin as string | undefined) ?? null,
    };
  },
});
```

2. Verify the file has no TypeScript errors:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | head -20`
Expected: No errors (or only pre-existing unrelated ones).

---

## Task 6: Write tests for control-plane module

**Files:**
- `convex/controlPlane.test.ts` (new file)

**Model:** opus

**review:** full

**Depends on:** 5

### Steps

1. Create `convex/controlPlane.test.ts` with the following test suite:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createNode, createOrchestration } from "./test_helpers";

async function setupFixture(t: ReturnType<typeof convexTest>) {
  const nodeId = await createNode(t);
  const orchestrationId = await createOrchestration(t, {
    nodeId,
    featureName: "control-plane-test",
  });
  return { nodeId, orchestrationId };
}

describe("controlPlane:startOrchestration", () => {
  test("creates action log entry and queue row", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    const actionId = await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: JSON.stringify({ model: "opus" }),
      policySnapshotHash: "sha256-abc123",
      presetOrigin: "balanced",
      requestedBy: "web:operator",
      idempotencyKey: "launch-001",
    });

    expect(actionId).toBeDefined();

    // Verify action log entry
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("start_orchestration");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].queueActionId).toBeDefined();
  });

  test("idempotency: same key returns same action ID", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    const id1 = await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: JSON.stringify({ model: "opus" }),
      policySnapshotHash: "sha256-abc",
      requestedBy: "web:operator",
      idempotencyKey: "launch-idem",
    });

    const id2 = await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: JSON.stringify({ model: "sonnet" }),
      policySnapshotHash: "sha256-different",
      requestedBy: "web:operator",
      idempotencyKey: "launch-idem",
    });

    expect(id1).toBe(id2);

    // Verify only one queue row created
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
  });

  test("patches orchestration with policy snapshot", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: JSON.stringify({ model: "opus" }),
      policySnapshotHash: "sha256-policy",
      presetOrigin: "strict",
      designOnly: true,
      requestedBy: "web:operator",
      idempotencyKey: "launch-policy",
    });

    const snapshot = await t.query(api.controlPlane.getLatestPolicySnapshot, {
      orchestrationId,
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.policySnapshot).toBe(JSON.stringify({ model: "opus" }));
    expect(snapshot!.policySnapshotHash).toBe("sha256-policy");
    expect(snapshot!.presetOrigin).toBe("strict");
  });

  test("idempotent call does not overwrite policy snapshot", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: JSON.stringify({ model: "opus" }),
      policySnapshotHash: "sha256-first",
      presetOrigin: "strict",
      requestedBy: "web:operator",
      idempotencyKey: "launch-no-overwrite",
    });

    // Same idempotency key with different policy
    await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: JSON.stringify({ model: "sonnet" }),
      policySnapshotHash: "sha256-second",
      presetOrigin: "fast",
      requestedBy: "web:operator",
      idempotencyKey: "launch-no-overwrite",
    });

    const snapshot = await t.query(api.controlPlane.getLatestPolicySnapshot, {
      orchestrationId,
    });
    expect(snapshot!.policySnapshotHash).toBe("sha256-first");
    expect(snapshot!.presetOrigin).toBe("strict");
  });
});

describe("controlPlane:enqueueControlAction", () => {
  test("creates action log entry for pause", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: JSON.stringify({ feature: "control-plane-test", phase: "1" }),
      requestedBy: "web:operator",
      idempotencyKey: "pause-001",
    });

    expect(actionId).toBeDefined();

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("pause");
    expect(actions[0].queueActionId).toBeDefined();
  });

  test("idempotency: same key returns same action ID", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    const id1 = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: JSON.stringify({ feature: "test" }),
      requestedBy: "web:operator",
      idempotencyKey: "resume-idem",
    });

    const id2 = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: JSON.stringify({ feature: "test" }),
      requestedBy: "web:operator",
      idempotencyKey: "resume-idem",
    });

    expect(id1).toBe(id2);
  });

  test("rejects invalid action type", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "delete_everything",
        payload: "{}",
        requestedBy: "web:operator",
        idempotencyKey: "bad-type",
      }),
    ).rejects.toThrow(/Invalid actionType/);
  });

  test("action log and queue are cross-linked", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "retry",
      payload: JSON.stringify({ feature: "test", phase: "2" }),
      requestedBy: "cli:joshua",
      idempotencyKey: "retry-link",
    });

    // Get the action to find its queueActionId
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    const action = actions.find((a: any) => a._id === actionId);
    expect(action).toBeDefined();
    expect(action!.queueActionId).toBeDefined();
  });
});

describe("controlPlane:listControlActions", () => {
  test("returns actions ordered newest-first", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: "{}",
      requestedBy: "web:operator",
      idempotencyKey: "action-1",
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: "{}",
      requestedBy: "web:operator",
      idempotencyKey: "action-2",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(2);
    // Newest first
    expect(actions[0].actionType).toBe("resume");
    expect(actions[1].actionType).toBe("pause");
  });

  test("respects limit parameter", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    for (let i = 0; i < 5; i++) {
      await t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "pause",
        payload: "{}",
        requestedBy: "web:operator",
        idempotencyKey: `limit-test-${i}`,
      });
    }

    const limited = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
      limit: 2,
    });
    expect(limited).toHaveLength(2);
  });
});

describe("controlPlane:getLatestPolicySnapshot", () => {
  test("returns null for orchestration without snapshot", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await setupFixture(t);

    const snapshot = await t.query(api.controlPlane.getLatestPolicySnapshot, {
      orchestrationId,
    });
    expect(snapshot).toBeNull();
  });

  test("returns snapshot fields after startOrchestration", async () => {
    const t = convexTest(schema);
    const { nodeId, orchestrationId } = await setupFixture(t);

    await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: JSON.stringify({ review: "strict" }),
      policySnapshotHash: "sha256-snapshot",
      presetOrigin: "custom",
      requestedBy: "web:operator",
      idempotencyKey: "snapshot-query",
    });

    const snapshot = await t.query(api.controlPlane.getLatestPolicySnapshot, {
      orchestrationId,
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.policySnapshot).toBe(
      JSON.stringify({ review: "strict" }),
    );
    expect(snapshot!.policySnapshotHash).toBe("sha256-snapshot");
    expect(snapshot!.presetOrigin).toBe("custom");
  });
});
```

2. Run the tests:

Run: `cd /Users/joshua/Projects/tina && npm test -- --run convex/controlPlane.test.ts 2>&1`
Expected: All tests pass (12 tests, 0 failures).

---

## Dependency Graph

```
Task 1 (controlPlaneActions table) ─┐
                                     ├─> Task 3 (inboundActions linkage) ─┐
Task 2 (contract + generator) ──────┤                                     ├─> Task 5 (controlPlane.ts) ─> Task 6 (tests)
                                     └─> Task 4 (regenerate artifacts) ───┘
```

Tasks 1 and 2 can run in parallel. Task 3 depends on Task 1. Task 4 depends on Task 2. Task 5 depends on Tasks 1, 3, 4. Task 6 depends on Task 5.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 500 |

---

## Phase Estimates

| Task | Estimated Time | Lines |
|------|---------------|-------|
| Task 1: controlPlaneActions schema | 2 min | ~15 |
| Task 2: Contract + generator extension | 5 min | ~35 |
| Task 3: inboundActions linkage | 2 min | ~5 |
| Task 4: Regenerate artifacts | 2 min | ~0 (generated) |
| Task 5: controlPlane.ts mutations/queries | 10 min | ~145 |
| Task 6: Tests | 10 min | ~220 |
| **Total** | **~31 min** | **~420** |

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
