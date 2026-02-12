# PM Workspace + Launch UX Realignment Phase 5: Launch Rewrite

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** aedf29883e9341fbd5cf0b0cfaebac77678de7d0

**Goal:** Rewrite the launch orchestration flow to: remove manual node/phase inputs, auto-resolve online node server-side, enforce design validation hard gates (markers + phase structure), and expose full transparent policy configuration in the launch modal.

**Architecture:** Four changes converge:

1. **Design validation gate** (`convex/designValidation.ts`): Pure function that checks a design's `requiredMarkers`, `completedMarkers`, `phaseCount`, and `phaseStructureValid` — returns pass/fail with error list. Used by the rewritten mutation as hard launch gates.
2. **Typed policy snapshot validator** (`convex/policyPresets.ts`): Convex `v.object()` validator matching `PolicySnapshot` shape, exported for use in mutation args. Eliminates `JSON.stringify` for overrides.
3. **Rewritten `launchOrchestration` mutation** (`convex/controlPlane.ts`): Removes `nodeId`, `totalPhases`, `policyPreset`, `policyOverrides` args. Adds `policySnapshot` (typed object). Auto-resolves online node. Derives `totalPhases` from `design.phaseCount`. Enforces design validation gates.
4. **Rewritten `LaunchModal`** (`tina-web/src/components/pm/LaunchModal.tsx`): Removes node picker and phase count input. Adds full policy editor (review + model fields) with preset accelerator buttons. Shows design validation status. Passes typed `PolicySnapshot` to mutation.

**Key files:**
- `convex/designValidation.ts` — New: launch validation gate function
- `convex/designValidation.test.ts` — New: tests for validation gates
- `convex/policyPresets.ts` — Add `policySnapshotValidator` export
- `convex/controlPlane.ts` — Rewrite `launchOrchestration` mutation
- `convex/controlPlane.test.ts` — Update launch tests for new signature
- `tina-web/src/components/pm/PolicyEditor.tsx` — New: full policy editor component
- `tina-web/src/components/pm/PolicyEditor.module.scss` — New: policy editor styles
- `tina-web/src/components/pm/LaunchModal.tsx` — Rewrite with policy editor
- `tina-web/src/components/pm/LaunchOrchestrationPage.tsx` — Update to new mutation args

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 1200 |

---

## Tasks

### Task 1: Create design validation gate function

**Files:**
- `convex/designValidation.ts` (new)

**Model:** opus

**review:** full

**Depends on:** none

Create a pure function that validates a design record is ready for launch.

**Steps:**

1. Create `convex/designValidation.ts`:

```typescript
/**
 * Design validation gate for launch.
 * Checks that design markers are complete and phase structure is valid.
 */

export interface LaunchValidationResult {
  valid: boolean;
  errors: string[];
}

interface DesignValidationInput {
  requiredMarkers?: string[];
  completedMarkers?: string[];
  phaseCount?: number;
  phaseStructureValid?: boolean;
}

export function validateDesignForLaunch(
  design: DesignValidationInput,
): LaunchValidationResult {
  const errors: string[] = [];

  const required = design.requiredMarkers ?? [];
  const completed = design.completedMarkers ?? [];

  if (required.length === 0) {
    errors.push("Design has no validation markers — set a complexity preset first");
  } else {
    const missing = required.filter((m) => !completed.includes(m));
    if (missing.length > 0) {
      errors.push(`Incomplete markers: ${missing.join(", ")}`);
    }
  }

  if (design.phaseStructureValid !== true) {
    errors.push("Phase structure is invalid — design must contain ## Phase N headings");
  }

  if ((design.phaseCount ?? 0) < 1) {
    errors.push("Design must have at least one phase");
  }

  return { valid: errors.length === 0, errors };
}
```

2. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | tail -5`

Expected: No type errors related to designValidation.

---

### Task 2: Write tests for design validation gate

**Files:**
- `convex/designValidation.test.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 1

**Steps:**

1. Create `convex/designValidation.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { validateDesignForLaunch } from "./designValidation";

describe("validateDesignForLaunch", () => {
  test("valid: all markers complete + valid phase structure", () => {
    const result = validateDesignForLaunch({
      requiredMarkers: ["objective_defined", "scope_bounded"],
      completedMarkers: ["objective_defined", "scope_bounded"],
      phaseCount: 2,
      phaseStructureValid: true,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("invalid: missing markers", () => {
    const result = validateDesignForLaunch({
      requiredMarkers: ["objective_defined", "scope_bounded", "testing_strategy"],
      completedMarkers: ["objective_defined"],
      phaseCount: 1,
      phaseStructureValid: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("scope_bounded");
    expect(result.errors[0]).toContain("testing_strategy");
  });

  test("invalid: no validation markers set", () => {
    const result = validateDesignForLaunch({
      phaseCount: 1,
      phaseStructureValid: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("no validation markers");
  });

  test("invalid: phase structure invalid", () => {
    const result = validateDesignForLaunch({
      requiredMarkers: ["objective_defined"],
      completedMarkers: ["objective_defined"],
      phaseCount: 0,
      phaseStructureValid: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Phase structure is invalid"),
        expect.stringContaining("at least one phase"),
      ]),
    );
  });

  test("invalid: phaseCount is 0", () => {
    const result = validateDesignForLaunch({
      requiredMarkers: ["objective_defined"],
      completedMarkers: ["objective_defined"],
      phaseCount: 0,
      phaseStructureValid: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("at least one phase");
  });

  test("invalid: all fields undefined", () => {
    const result = validateDesignForLaunch({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  test("valid: extra completed markers ignored", () => {
    const result = validateDesignForLaunch({
      requiredMarkers: ["objective_defined"],
      completedMarkers: ["objective_defined", "extra_marker"],
      phaseCount: 1,
      phaseStructureValid: true,
    });
    expect(result.valid).toBe(true);
  });
});
```

2. Run tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx vitest run convex/designValidation.test.ts 2>&1 | tail -15`

Expected: All tests pass.

---

### Task 3: Add policySnapshotValidator to policyPresets

**Files:**
- `convex/policyPresets.ts`

**Model:** opus

**review:** full

**Depends on:** none

Export a Convex `v.object()` validator matching the `PolicySnapshot` interface so mutations can accept typed policy objects.

**Steps:**

1. Add the following import at the top of `convex/policyPresets.ts` (after the existing comment):

```typescript
import { v } from "convex/values";
```

2. Add the validator export after the `PolicySnapshot` interface definition (after line 30):

```typescript
/** Convex validator for PolicySnapshot — use in mutation args instead of stringified JSON. */
export const policySnapshotValidator = v.object({
  review: v.object({
    enforcement: v.string(),
    detector_scope: v.string(),
    architect_mode: v.string(),
    test_integrity_profile: v.string(),
    hard_block_detectors: v.boolean(),
    allow_rare_override: v.boolean(),
    require_fix_first: v.boolean(),
  }),
  model: v.object({
    validator: v.string(),
    planner: v.string(),
    executor: v.string(),
    reviewer: v.string(),
  }),
});
```

3. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | tail -5`

Expected: No type errors.

---

### Task 4: Rewrite launchOrchestration mutation

**Files:**
- `convex/controlPlane.ts`

**Model:** opus

**review:** full

**Depends on:** 1, 3

Rewrite the `launchOrchestration` mutation to: remove `nodeId`/`totalPhases`/`policyPreset`/`policyOverrides` args, add typed `policySnapshot`, auto-resolve online node, enforce design validation gates, and derive `totalPhases` from `design.phaseCount`.

**Steps:**

1. Add import at top of `convex/controlPlane.ts`:

```typescript
import { validateDesignForLaunch } from "./designValidation";
import { policySnapshotValidator, hashPolicy } from "./policyPresets";
import type { PolicySnapshot } from "./policyPresets";
```

Remove the existing import of `resolvePolicy, hashPolicy` from `./policyPresets` and replace with the above.

2. Replace the entire `launchOrchestration` mutation (lines 387-518) with:

```typescript
export const launchOrchestration = mutation({
  args: {
    projectId: v.id("projects"),
    designId: v.id("designs"),
    feature: v.string(),
    branch: v.string(),
    ticketIds: v.optional(v.array(v.id("tickets"))),
    policySnapshot: policySnapshotValidator,
    requestedBy: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const launchEnabled = await isFeatureFlagEnabled(ctx, CP_FLAGS.LAUNCH_FROM_WEB);
    if (!launchEnabled) {
      throw new Error(`Launch from web is not enabled. Set ${CP_FLAGS.LAUNCH_FROM_WEB} feature flag to enable.`);
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error(`Project not found: ${args.projectId}`);

    const design = await ctx.db.get(args.designId);
    if (!design) throw new Error(`Design not found: ${args.designId}`);
    if (design.projectId !== args.projectId) {
      throw new Error(`Design ${args.designId} does not belong to project ${args.projectId}`);
    }

    // Design validation gates
    const validation = validateDesignForLaunch(design);
    if (!validation.valid) {
      throw new Error(`Design not ready for launch: ${validation.errors.join("; ")}`);
    }

    // Auto-resolve online node
    const allNodes = await ctx.db.query("nodes").collect();
    const now = Date.now();
    const onlineNode = allNodes.find((n) => now - n.lastHeartbeat <= HEARTBEAT_TIMEOUT_MS);
    if (!onlineNode) {
      throw new Error("No online nodes available. Ensure a node is running and connected.");
    }

    // Validate ticket IDs if provided
    const ticketIds = args.ticketIds ?? [];
    for (const ticketId of ticketIds) {
      const ticket = await ctx.db.get(ticketId);
      if (!ticket) throw new Error(`Ticket not found: ${ticketId}`);
      if (ticket.projectId !== args.projectId) {
        throw new Error(`Ticket ${ticketId} does not belong to project ${args.projectId}`);
      }
    }

    const designOnly = ticketIds.length === 0;
    const totalPhases = design.phaseCount ?? 1;
    const policyJson = JSON.stringify(args.policySnapshot);
    const policyHash = await hashPolicy(args.policySnapshot as unknown as PolicySnapshot);
    const nowIso = new Date().toISOString();

    const orchestrationId = await ctx.db.insert("orchestrations", {
      nodeId: onlineNode._id,
      projectId: args.projectId,
      designId: args.designId,
      featureName: args.feature,
      designDocPath: `convex://${args.designId}`,
      branch: args.branch,
      totalPhases,
      currentPhase: 1,
      status: "launching",
      startedAt: nowIso,
      policySnapshot: policyJson,
      policySnapshotHash: policyHash,
      designOnly,
      policyRevision: 1,
    });

    const launchPayload = JSON.stringify({
      feature: args.feature,
      design_id: args.designId,
      cwd: project.repoPath,
      branch: args.branch,
      total_phases: totalPhases,
      policy: args.policySnapshot,
    });

    const actionId = await insertControlActionWithQueue(ctx, {
      orchestrationId,
      nodeId: onlineNode._id,
      actionType: "start_orchestration",
      payload: launchPayload,
      requestedBy: args.requestedBy,
      idempotencyKey: args.idempotencyKey,
    });

    await ctx.db.insert("orchestrationEvents", {
      orchestrationId,
      eventType: "launch_requested",
      source: "control_plane",
      summary: `Launch requested for "${args.feature}" on node "${onlineNode.name}"`,
      detail: JSON.stringify({
        designOnly,
        ticketCount: ticketIds.length,
        nodeAutoResolved: true,
        derivedPhases: totalPhases,
      }),
      recordedAt: nowIso,
    });

    return { orchestrationId, actionId };
  },
});
```

3. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | tail -10`

Expected: No type errors.

---

### Task 5: Update launchOrchestration tests

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** full

**Depends on:** 4

Update all existing `launchOrchestration` tests to the new mutation signature and add new tests for validation gates, auto node resolution, and derived phases.

**Steps:**

1. In `convex/controlPlane.test.ts`, add a `BALANCED_POLICY` constant near the top (after imports):

```typescript
const BALANCED_POLICY = {
  review: {
    enforcement: "task_and_phase" as const,
    detector_scope: "whole_repo_pattern_index" as const,
    architect_mode: "manual_plus_auto" as const,
    test_integrity_profile: "strict_baseline" as const,
    hard_block_detectors: true,
    allow_rare_override: true,
    require_fix_first: true,
  },
  model: {
    validator: "opus",
    planner: "opus",
    executor: "opus",
    reviewer: "opus",
  },
};
```

2. Update the `createLaunchFixture` import from `test_helpers.ts` — existing fixture creates a design without complexity preset. All launch tests now need a design with validation markers. Add a helper at the top of the launch test describe block:

```typescript
async function createValidatedLaunchFixture(t: ConvexHarness) {
  const nodeId = await createNode(t);
  const projectId = await createProject(t);
  const designId = await createDesign(t, {
    projectId,
    markdown: "# Test Feature\n\n## Phase 1: Build\n\nBuild it\n\n## Phase 2: Test\n\nTest it",
    complexityPreset: "simple",
  });
  // Complete all markers
  await t.mutation(api.designs.updateDesignMarkers, {
    designId,
    completedMarkers: ["objective_defined", "scope_bounded"],
  });
  return { nodeId, projectId, designId };
}
```

3. Update **every existing test** in `describe("controlPlane:launchOrchestration", ...)` (lines 779-970) to:
   - Replace `createLaunchFixture(t)` with `createValidatedLaunchFixture(t)`
   - Remove `nodeId` from launch args
   - Remove `totalPhases` from launch args
   - Replace `policyPreset: "balanced"` with `policySnapshot: BALANCED_POLICY`
   - Remove `policyOverrides` if present

Example of updated first test:
```typescript
  test("creates orchestration, action log, queue, and event", async () => {
    const t = convexTest(schema, modules);
    const { projectId, designId } = await createValidatedLaunchFixture(t);
    await enableAllControlPlaneFlags(t);

    const result = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId,
      designId,
      feature: "my-feature",
      branch: "tina/my-feature",
      policySnapshot: BALANCED_POLICY,
      requestedBy: "web-ui",
      idempotencyKey: "launch-1",
    });

    expect(result.orchestrationId).toBeTruthy();
    expect(result.actionId).toBeTruthy();

    const orchestration = await t.run(async (ctx) => {
      return await ctx.db.get(result.orchestrationId);
    });
    expect(orchestration).not.toBeNull();
    expect(orchestration!.status).toBe("launching");
    expect(orchestration!.featureName).toBe("my-feature");
    expect(orchestration!.policySnapshotHash).toMatch(/^sha256-/);
    expect(orchestration!.designOnly).toBe(true);
    // totalPhases derived from design (2 phases in fixture markdown)
    expect(orchestration!.totalPhases).toBe(2);
  });
```

4. Similarly update all tests in `describe("controlPlane:launchOrchestration:integration", ...)` to use the new args format.

5. Remove the "rejects offline node" test (nodes are now auto-resolved, not user-selected). Replace with:

```typescript
  test("rejects when no nodes are online", async () => {
    const t = convexTest(schema, modules);
    const { projectId, designId } = await createValidatedLaunchFixture(t);
    await enableAllControlPlaneFlags(t);

    // Make node offline by setting old heartbeat
    const nodes = await t.run(async (ctx) => ctx.db.query("nodes").collect());
    for (const node of nodes) {
      await t.run(async (ctx) => {
        await ctx.db.patch(node._id, { lastHeartbeat: Date.now() - 120_000 });
      });
    }

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId,
        designId,
        feature: "my-feature",
        branch: "tina/my-feature",
        policySnapshot: BALANCED_POLICY,
        requestedBy: "web-ui",
        idempotencyKey: "launch-no-nodes",
      }),
    ).rejects.toThrow("No online nodes available");
  });
```

6. Remove the "rejects unknown preset name" test (presets are now frontend-only accelerators, not backend args).

7. Add new validation gate tests:

```typescript
  test("rejects launch when design markers incomplete", async () => {
    const t = convexTest(schema, modules);
    const nodeId = await createNode(t);
    const projectId = await createProject(t);
    const designId = await createDesign(t, {
      projectId,
      markdown: "# Test\n\n## Phase 1: Build\n\nBuild it",
      complexityPreset: "standard",
    });
    // Leave markers incomplete
    await enableAllControlPlaneFlags(t);

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId,
        designId,
        feature: "incomplete",
        branch: "tina/incomplete",
        policySnapshot: BALANCED_POLICY,
        requestedBy: "web-ui",
        idempotencyKey: "launch-incomplete",
      }),
    ).rejects.toThrow("Design not ready for launch");
  });

  test("rejects launch when phase structure invalid", async () => {
    const t = convexTest(schema, modules);
    const nodeId = await createNode(t);
    const projectId = await createProject(t);
    const designId = await createDesign(t, {
      projectId,
      markdown: "# No phases here",
      complexityPreset: "simple",
    });
    await t.mutation(api.designs.updateDesignMarkers, {
      designId,
      completedMarkers: ["objective_defined", "scope_bounded"],
    });
    await enableAllControlPlaneFlags(t);

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId,
        designId,
        feature: "bad-phases",
        branch: "tina/bad-phases",
        policySnapshot: BALANCED_POLICY,
        requestedBy: "web-ui",
        idempotencyKey: "launch-bad-phases",
      }),
    ).rejects.toThrow("Design not ready for launch");
  });

  test("derives totalPhases from design phaseCount", async () => {
    const t = convexTest(schema, modules);
    const { projectId, designId } = await createValidatedLaunchFixture(t);
    await enableAllControlPlaneFlags(t);

    const result = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId,
      designId,
      feature: "derived-phases",
      branch: "tina/derived-phases",
      policySnapshot: BALANCED_POLICY,
      requestedBy: "web-ui",
      idempotencyKey: "launch-derived",
    });

    const orchestration = await t.run(async (ctx) => {
      return await ctx.db.get(result.orchestrationId);
    });
    expect(orchestration!.totalPhases).toBe(2);
  });
```

8. Also update the integration test section and the `controlPlaneDashboard.test.ts` "launchOrchestration" section if it exists (check line 2784 reference from grep).

9. Run tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx vitest run convex/controlPlane.test.ts convex/designValidation.test.ts 2>&1 | tail -30`

Expected: All tests pass.

---

### Task 6: Create PolicyEditor component

**Files:**
- `tina-web/src/components/pm/PolicyEditor.tsx` (new)
- `tina-web/src/components/pm/PolicyEditor.module.scss` (new)

**Model:** opus

**review:** full

**Depends on:** none

Create a reusable policy editor component that renders all review and model policy fields with preset accelerator buttons.

**Steps:**

1. Create `tina-web/src/components/pm/PolicyEditor.tsx`:

```tsx
import { PRESETS } from "@convex/policyPresets"
import type { PolicySnapshot, ReviewPolicyConfig, ModelPolicyConfig } from "@convex/policyPresets"
import formStyles from "../FormDialog.module.scss"
import styles from "./PolicyEditor.module.scss"

const ENFORCEMENT_OPTIONS = ["task_and_phase", "task_only", "phase_only"] as const
const DETECTOR_SCOPE_OPTIONS = ["whole_repo_pattern_index", "touched_area_only", "architectural_allowlist_only"] as const
const ARCHITECT_MODE_OPTIONS = ["manual_only", "manual_plus_auto", "disabled"] as const
const TEST_INTEGRITY_OPTIONS = ["strict_baseline", "max_strict", "minimal"] as const
const MODEL_OPTIONS = ["opus", "sonnet", "haiku"] as const
const ROLES = ["validator", "planner", "executor", "reviewer"] as const
const PRESET_NAMES = Object.keys(PRESETS) as Array<keyof typeof PRESETS>

function labelFor(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

interface PolicyEditorProps {
  value: PolicySnapshot
  onChange: (snapshot: PolicySnapshot) => void
}

export function PolicyEditor({ value, onChange }: PolicyEditorProps) {
  const updateReview = (field: keyof ReviewPolicyConfig, fieldValue: unknown) => {
    onChange({ ...value, review: { ...value.review, [field]: fieldValue } })
  }

  const updateModel = (role: keyof ModelPolicyConfig, model: string) => {
    onChange({ ...value, model: { ...value.model, [role]: model } })
  }

  const applyPreset = (presetName: string) => {
    const preset = PRESETS[presetName]
    if (preset) onChange(structuredClone(preset))
  }

  return (
    <div className={styles.policyEditor}>
      <div className={styles.presetRow}>
        <span className={formStyles.formLabel}>Presets</span>
        <div className={styles.presetButtons}>
          {PRESET_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              className={styles.presetButton}
              onClick={() => applyPreset(name)}
            >
              {labelFor(name)}
            </button>
          ))}
        </div>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Model Policy</legend>
        <div className={styles.grid}>
          {ROLES.map((role) => (
            <div key={role} className={styles.fieldRow}>
              <label className={styles.fieldLabel}>{labelFor(role)}</label>
              <select
                className={formStyles.formInput}
                value={value.model[role]}
                onChange={(e) => updateModel(role, e.target.value)}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Review Policy</legend>
        <div className={styles.grid}>
          <SelectField
            label="Enforcement"
            value={value.review.enforcement}
            options={ENFORCEMENT_OPTIONS}
            onChange={(v) => updateReview("enforcement", v)}
          />
          <SelectField
            label="Detector Scope"
            value={value.review.detector_scope}
            options={DETECTOR_SCOPE_OPTIONS}
            onChange={(v) => updateReview("detector_scope", v)}
          />
          <SelectField
            label="Architect Mode"
            value={value.review.architect_mode}
            options={ARCHITECT_MODE_OPTIONS}
            onChange={(v) => updateReview("architect_mode", v)}
          />
          <SelectField
            label="Test Integrity"
            value={value.review.test_integrity_profile}
            options={TEST_INTEGRITY_OPTIONS}
            onChange={(v) => updateReview("test_integrity_profile", v)}
          />
          <CheckboxField
            label="Hard Block Detectors"
            checked={value.review.hard_block_detectors}
            onChange={(v) => updateReview("hard_block_detectors", v)}
          />
          <CheckboxField
            label="Allow Rare Override"
            checked={value.review.allow_rare_override}
            onChange={(v) => updateReview("allow_rare_override", v)}
          />
          <CheckboxField
            label="Require Fix First"
            checked={value.review.require_fix_first}
            onChange={(v) => updateReview("require_fix_first", v)}
          />
        </div>
      </fieldset>
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  return (
    <div className={styles.fieldRow}>
      <label className={styles.fieldLabel}>{label}</label>
      <select
        className={formStyles.formInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{labelFor(opt)}</option>
        ))}
      </select>
    </div>
  )
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className={styles.fieldRow}>
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
    </div>
  )
}
```

2. Create `tina-web/src/components/pm/PolicyEditor.module.scss`:

```scss
@use '../../styles/tokens' as *;

.policyEditor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.presetRow {
  display: flex;
  align-items: center;
  gap: 12px;
}

.presetButtons {
  display: flex;
  gap: 6px;
}

.presetButton {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid $border-color;
  background: $bg-card;
  color: $text-primary;
  cursor: pointer;
  text-transform: capitalize;

  &:hover {
    background: hsl(var(--accent) / 0.08);
  }
}

.fieldset {
  border: 1px solid $border-color;
  border-radius: 6px;
  padding: 10px 14px;
  margin: 0;
}

.legend {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: hsl(var(--muted-foreground));
  padding: 0 4px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.fieldRow {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fieldLabel {
  font-size: 10px;
  font-weight: 500;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.checkboxLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
  padding-top: 6px;
}
```

3. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -10`

Expected: No type errors.

---

### Task 7: Rewrite LaunchModal with policy editor and validation display

**Files:**
- `tina-web/src/components/pm/LaunchModal.tsx`

**Model:** opus

**review:** full

**Depends on:** 4, 6

Rewrite the LaunchModal to: remove node picker and totalPhases, show design validation status, include the full policy editor, and pass typed PolicySnapshot to the rewritten mutation.

**Steps:**

1. Replace the entire contents of `tina-web/src/components/pm/LaunchModal.tsx`:

```tsx
import { useState, useMemo } from "react"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { generateIdempotencyKey } from "@/lib/utils"
import { FormDialog } from "../FormDialog"
import { PolicyEditor } from "./PolicyEditor"
import { PRESETS } from "@convex/policyPresets"
import type { PolicySnapshot } from "@convex/policyPresets"
import type { Id } from "@convex/_generated/dataModel"
import formStyles from "../FormDialog.module.scss"
import styles from "./LaunchModal.module.scss"
import { Option } from "effect"

function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

interface LaunchModalProps {
  projectId: string
  onClose: () => void
}

export function LaunchModal({ projectId, onClose }: LaunchModalProps) {
  const [selectedDesignId, setSelectedDesignId] = useState<string>("")
  const [featureName, setFeatureName] = useState<string>("")
  const [policySnapshot, setPolicySnapshot] = useState<PolicySnapshot>(
    structuredClone(PRESETS.balanced),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ orchestrationId: string } | null>(null)

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId,
    status: undefined,
  })

  const launch = useMutation(api.controlPlane.launchOrchestration)
  const branchName = featureName ? `tina/${kebabCase(featureName)}` : ""

  const designs = designsResult.status === "success" ? designsResult.data : []
  const selectedDesign = useMemo(
    () => designs.find((d) => d._id === selectedDesignId),
    [designs, selectedDesignId],
  )

  const validationStatus = useMemo(() => {
    if (!selectedDesign) return null
    const required = Option.getOrElse(selectedDesign.requiredMarkers, () => [] as string[])
    const completed = Option.getOrElse(selectedDesign.completedMarkers, () => [] as string[])
    const phaseValid = Option.getOrElse(selectedDesign.phaseStructureValid, () => false)
    const phaseCount = Option.getOrElse(selectedDesign.phaseCount, () => 0)
    const missing = required.filter((m: string) => !completed.includes(m))
    return {
      markersComplete: missing.length === 0 && required.length > 0,
      missingMarkers: missing,
      phaseValid,
      phaseCount,
      ready: missing.length === 0 && required.length > 0 && phaseValid && phaseCount >= 1,
    }
  }, [selectedDesign])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    setSubmitting(true)

    if (!featureName.trim()) {
      setError("Feature name is required")
      setSubmitting(false)
      return
    }

    if (!selectedDesignId) {
      setError("Please select a design")
      setSubmitting(false)
      return
    }

    try {
      const idempotencyKey = generateIdempotencyKey()
      const { orchestrationId } = await launch({
        projectId: projectId as Id<"projects">,
        designId: selectedDesignId as Id<"designs">,
        feature: featureName.trim(),
        branch: branchName.trim(),
        policySnapshot,
        requestedBy: "web-ui",
        idempotencyKey,
      })
      setResult({ orchestrationId: orchestrationId as string })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch orchestration")
    } finally {
      setSubmitting(false)
    }
  }

  const isLoading = isAnyQueryLoading(designsResult)
  const queryError = firstQueryError(designsResult)

  return (
    <FormDialog title="Launch Orchestration" onClose={onClose} maxWidth={640}>
      {result && (
        <div className={styles.successBanner}>
          Orchestration launched: <code>{result.orchestrationId}</code>
        </div>
      )}

      {queryError != null && <div className={formStyles.errorMessage}>Failed to load data</div>}
      {error && <div className={formStyles.errorMessage}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className={formStyles.formField}>
          <label className={formStyles.formLabel} htmlFor="design-select">
            Design
          </label>
          <select
            id="design-select"
            className={formStyles.formInput}
            value={selectedDesignId}
            onChange={(e) => setSelectedDesignId(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Select a design</option>
            {designs.map((design) => (
              <option key={design._id} value={design._id}>
                {design.title}
              </option>
            ))}
          </select>
        </div>

        {validationStatus && (
          <div className={styles.validationStatus} data-testid="validation-status">
            <div className={validationStatus.ready ? styles.statusReady : styles.statusNotReady}>
              {validationStatus.ready ? "Ready to launch" : "Not ready"}
            </div>
            {!validationStatus.markersComplete && (
              <div className={styles.statusDetail}>
                Missing markers: {validationStatus.missingMarkers.join(", ")}
              </div>
            )}
            {!validationStatus.phaseValid && (
              <div className={styles.statusDetail}>Invalid phase structure</div>
            )}
            {validationStatus.phaseCount > 0 && (
              <div className={styles.statusDetail}>
                Phases: {validationStatus.phaseCount}
              </div>
            )}
          </div>
        )}

        <div className={formStyles.formField}>
          <label className={formStyles.formLabel} htmlFor="feature-name">
            Feature Name
          </label>
          <input
            id="feature-name"
            className={formStyles.formInput}
            type="text"
            value={featureName}
            onChange={(e) => setFeatureName(e.target.value)}
            placeholder="e.g., Dark Mode Support"
            autoFocus
          />
          {branchName && <span className={styles.hint}>Branch: {branchName}</span>}
        </div>

        <PolicyEditor value={policySnapshot} onChange={setPolicySnapshot} />

        <div className={formStyles.formActions}>
          <button
            type="button"
            className={formStyles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={formStyles.submitButton}
            disabled={
              !featureName.trim() || !selectedDesignId || submitting || isLoading ||
              (validationStatus !== null && !validationStatus.ready)
            }
          >
            {submitting ? "Launching..." : "Launch"}
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
```

2. Update `tina-web/src/components/pm/LaunchModal.module.scss` — add validation status styles:

```scss
@use '../../styles/tokens' as *;

.presetButtons {
  display: flex;
  gap: 8px;
}

.presetButton {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid $border-color;
  background: $bg-card;
  color: $text-primary;
  cursor: pointer;
  text-transform: capitalize;

  &:hover {
    background: hsl(var(--accent) / 0.08);
  }

  &.active {
    background: $accent;
    color: $accent-foreground;
    border-color: $accent;
  }
}

.hint {
  display: block;
  font-size: 11px;
  color: $text-muted;
  margin-top: 4px;
  font-family: $font-mono;
}

.successBanner {
  font-size: 12px;
  color: hsl(var(--primary, 214 100% 50%));
  padding: 8px 12px;
  border: 1px solid hsl(var(--primary, 214 100% 50%) / 0.3);
  border-radius: 4px;
  background: hsl(var(--primary, 214 100% 50%) / 0.08);
  margin-bottom: 16px;
  font-family: $font-mono;

  code {
    font-weight: 600;
  }
}

.validationStatus {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid $border-color;
  margin-bottom: 8px;
  font-size: 12px;
}

.statusReady {
  color: hsl(var(--primary, 142 71% 45%));
  font-weight: 600;
  margin-bottom: 2px;
}

.statusNotReady {
  color: hsl(var(--destructive, 0 84% 60%));
  font-weight: 600;
  margin-bottom: 2px;
}

.statusDetail {
  font-size: 11px;
  color: $text-muted;
}
```

3. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -10`

Expected: No type errors.

---

### Task 8: Update LaunchOrchestrationPage to new mutation signature

**Files:**
- `tina-web/src/components/pm/LaunchOrchestrationPage.tsx`

**Model:** opus

**review:** full

**Depends on:** 4, 6

Update the standalone launch page to use the new mutation args (remove node picker, totalPhases, add PolicyEditor).

**Steps:**

1. Replace the entire contents of `tina-web/src/components/pm/LaunchOrchestrationPage.tsx`:

```tsx
import { useState, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { generateIdempotencyKey } from "@/lib/utils"
import { PolicyEditor } from "./PolicyEditor"
import { PRESETS } from "@convex/policyPresets"
import type { PolicySnapshot } from "@convex/policyPresets"
import type { Id } from "@convex/_generated/dataModel"
import { Option } from "effect"
import styles from "./LaunchOrchestrationPage.module.scss"

function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

export function LaunchOrchestrationPage() {
  const [searchParams] = useSearchParams()
  const projectIdParam = searchParams.get("project") || null

  const [selectedDesignId, setSelectedDesignId] = useState<string>("")
  const [featureName, setFeatureName] = useState<string>("")
  const [policySnapshot, setPolicySnapshot] = useState<PolicySnapshot>(
    structuredClone(PRESETS.balanced),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ orchestrationId: string } | null>(null)

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId: projectIdParam as string,
    status: undefined,
  })

  const launch = useMutation(api.controlPlane.launchOrchestration)

  if (!projectIdParam) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Launch Orchestration</h2>
        <div className={styles.hint}>Select a project from the sidebar</div>
      </div>
    )
  }

  if (isAnyQueryLoading(designsResult)) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Launch Orchestration</h2>
        <div className={styles.loading} data-testid="launch-orchestration-loading">
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(designsResult)
  if (queryError) throw queryError
  if (designsResult.status !== "success") return null

  const designs = designsResult.data
  const selectedDesign = designs.find((d) => d._id === selectedDesignId)

  const validationReady = (() => {
    if (!selectedDesign) return false
    const required = Option.getOrElse(selectedDesign.requiredMarkers, () => [] as string[])
    const completed = Option.getOrElse(selectedDesign.completedMarkers, () => [] as string[])
    const phaseValid = Option.getOrElse(selectedDesign.phaseStructureValid, () => false)
    const phaseCount = Option.getOrElse(selectedDesign.phaseCount, () => 0)
    const missing = required.filter((m: string) => !completed.includes(m))
    return missing.length === 0 && required.length > 0 && phaseValid && phaseCount >= 1
  })()

  const branchName = featureName ? `tina/${kebabCase(featureName)}` : ""

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    setSubmitting(true)

    if (!featureName.trim() || !selectedDesignId) {
      setError("Feature name and design are required")
      setSubmitting(false)
      return
    }

    try {
      const idempotencyKey = generateIdempotencyKey()
      const { orchestrationId } = await launch({
        projectId: projectIdParam as Id<"projects">,
        designId: selectedDesignId as Id<"designs">,
        feature: featureName.trim(),
        branch: branchName.trim(),
        policySnapshot,
        requestedBy: "web-ui",
        idempotencyKey,
      })
      setResult({ orchestrationId: orchestrationId as string })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch orchestration")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page} data-testid="launch-orchestration-page">
      <h2 className={styles.title}>Launch Orchestration</h2>

      {result && (
        <div className={styles.successBanner}>
          Orchestration launched: <code>{result.orchestrationId}</code>
        </div>
      )}

      {error && <div className={styles.errorMessage}>{error}</div>}

      <form className={styles.form} data-testid="launch-form" onSubmit={handleSubmit}>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-select">Design</label>
          <select
            id="design-select"
            className={styles.formInput}
            value={selectedDesignId}
            onChange={(e) => setSelectedDesignId(e.target.value)}
          >
            <option value="">Select a design</option>
            {designs.map((design) => (
              <option key={design._id} value={design._id}>{design.title}</option>
            ))}
          </select>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="feature-name">Feature Name</label>
          <input
            id="feature-name"
            className={styles.formInput}
            type="text"
            value={featureName}
            onChange={(e) => setFeatureName(e.target.value)}
            placeholder="e.g., Dark Mode Support"
            autoFocus
          />
          {branchName && <span className={styles.hint}>Branch: {branchName}</span>}
        </div>

        <PolicyEditor value={policySnapshot} onChange={setPolicySnapshot} />

        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.actionButton} ${styles.primary}`}
            disabled={!featureName.trim() || !selectedDesignId || submitting || !validationReady}
          >
            {submitting ? "Launching..." : "Launch"}
          </button>
        </div>
      </form>
    </div>
  )
}
```

2. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -10`

Expected: No type errors.

---

### Task 9: Update controlPlaneDashboard launch tests

**Files:**
- `convex/controlPlaneDashboard.test.ts`

**Model:** opus

**review:** full

**Depends on:** 4

Check whether `controlPlaneDashboard.test.ts` contains `launchOrchestration` calls and update them to the new signature.

**Steps:**

1. Search for `launchOrchestration` calls in `convex/controlPlaneDashboard.test.ts`:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && grep -n "launchOrchestration" convex/controlPlaneDashboard.test.ts`

2. If any calls exist, update them to the new signature:
   - Remove `nodeId`, `totalPhases`, `policyPreset` args
   - Add `policySnapshot: BALANCED_POLICY`
   - Ensure design fixture has complexity preset + completed markers

3. Run:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx vitest run convex/controlPlaneDashboard.test.ts 2>&1 | tail -20`

Expected: All tests pass.

---

### Task 10: Run full test suite and fix issues

**Files:**
- (any files needing fixes)

**Model:** opus

**review:** full

**Depends on:** 5, 7, 8, 9

Run the complete test suite across Convex and tina-web to verify no regressions.

**Steps:**

1. Run all Convex tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx vitest run convex/ 2>&1 | tail -30`

Expected: All Convex tests pass.

2. Run TypeScript type checks:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | tail -10`

Expected: No type errors.

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -10`

Expected: No type errors.

3. Run all tina-web tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && npx vitest run tina-web/ 2>&1 | tail -30`

Expected: All tina-web tests pass.

4. Verify no node/totalPhases references remain in launch path:

Run: `cd /Users/joshua/Projects/tina/.worktrees/pm-workspace-launch-ux-realignment && grep -n "total-phases\|node-select\|totalPhases.*input\|nodeId.*select" tina-web/src/components/pm/LaunchModal.tsx tina-web/src/components/pm/LaunchOrchestrationPage.tsx`

Expected: No matches.

---

## Phase Estimates

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Create design validation gate function | 3 min |
| 2 | Write tests for design validation gate | 4 min |
| 3 | Add policySnapshotValidator to policyPresets | 2 min |
| 4 | Rewrite launchOrchestration mutation | 5 min |
| 5 | Update launchOrchestration tests | 10 min |
| 6 | Create PolicyEditor component | 5 min |
| 7 | Rewrite LaunchModal with policy editor | 5 min |
| 8 | Update LaunchOrchestrationPage | 5 min |
| 9 | Update controlPlaneDashboard launch tests | 5 min |
| 10 | Full test suite verification | 5 min |
| **Total** | | **~49 min** |

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
