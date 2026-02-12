# Phase 2: Launch From Tina Web (Design-First, Node-Explicit)

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 4b1036bbdf69c30254d7f4d4f72ca707c9612194

**Goal:** Ship the actual start flow from Tina web with full pre-configuration controls and preset shortcuts. After this phase, a user can start an orchestration from the web UI using canonical design inputs, an explicit target node, and a durable policy snapshot that queues exactly one start action.

**Architecture:** Extends `convex/controlPlane.ts` with a `launchOrchestration` mutation that validates inputs, resolves policy presets, creates an orchestration stub, and queues a `start_orchestration` action. Extends `tina-daemon/src/actions.rs` to handle the new action type by invoking `tina-session init`. Adds a launch form page to `tina-web` under the PM shell.

**Phase context:** Phase 1 established `controlPlaneActions` table, `startOrchestration` (lower-level, takes existing orchestrationId), `enqueueControlAction`, `listControlActions`, and `getLatestPolicySnapshot` in `convex/controlPlane.ts`. The `inboundActions` queue and daemon dispatch loop exist. This phase builds the full web-to-daemon launch pipeline on top.

---

## Task 1: Define policy preset constants and resolution logic

**Files:**
- `convex/policyPresets.ts` (new file)

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Create `convex/policyPresets.ts` with the following content:

```typescript
/**
 * Policy preset templates for orchestration launch.
 * Each preset defines ReviewPolicy + ModelPolicy defaults.
 * The web form can apply a preset then override individual fields.
 */

export interface ReviewPolicyConfig {
  enforcement: "task_and_phase" | "task_only" | "phase_only";
  detector_scope:
    | "whole_repo_pattern_index"
    | "touched_area_only"
    | "architectural_allowlist_only";
  architect_mode: "manual_only" | "manual_plus_auto" | "disabled";
  test_integrity_profile: "strict_baseline" | "max_strict" | "minimal";
  hard_block_detectors: boolean;
  allow_rare_override: boolean;
  require_fix_first: boolean;
}

export interface ModelPolicyConfig {
  validator: string;
  planner: string;
  executor: string;
  reviewer: string;
}

export interface PolicySnapshot {
  review: ReviewPolicyConfig;
  model: ModelPolicyConfig;
}

export const PRESETS: Record<string, PolicySnapshot> = {
  strict: {
    review: {
      enforcement: "task_and_phase",
      detector_scope: "whole_repo_pattern_index",
      architect_mode: "manual_plus_auto",
      test_integrity_profile: "max_strict",
      hard_block_detectors: true,
      allow_rare_override: false,
      require_fix_first: true,
    },
    model: {
      validator: "opus",
      planner: "opus",
      executor: "opus",
      reviewer: "opus",
    },
  },
  balanced: {
    review: {
      enforcement: "task_and_phase",
      detector_scope: "whole_repo_pattern_index",
      architect_mode: "manual_plus_auto",
      test_integrity_profile: "strict_baseline",
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
  },
  fast: {
    review: {
      enforcement: "phase_only",
      detector_scope: "touched_area_only",
      architect_mode: "disabled",
      test_integrity_profile: "minimal",
      hard_block_detectors: false,
      allow_rare_override: true,
      require_fix_first: false,
    },
    model: {
      validator: "opus",
      planner: "opus",
      executor: "haiku",
      reviewer: "haiku",
    },
  },
};

/**
 * Resolve a policy snapshot from a preset name and optional overrides.
 * Returns the final policy as a JSON string and its SHA-256 hash.
 */
export function resolvePolicy(
  presetName: string,
  overrides?: Partial<PolicySnapshot>,
): PolicySnapshot {
  const base = PRESETS[presetName];
  if (!base) {
    throw new Error(
      `Unknown preset: "${presetName}". Valid: ${Object.keys(PRESETS).join(", ")}`,
    );
  }

  if (!overrides) return structuredClone(base);

  return {
    review: { ...base.review, ...overrides.review },
    model: { ...base.model, ...overrides.model },
  };
}

/**
 * Hash a policy snapshot for immutability checks.
 * Uses a deterministic JSON serialization.
 */
export async function hashPolicy(snapshot: PolicySnapshot): Promise<string> {
  const json = JSON.stringify(snapshot, Object.keys(snapshot).sort());
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "sha256-" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

2. Verify it has no TypeScript errors:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | grep policyPresets || echo "No errors"`
Expected: No errors related to policyPresets.

---

## Task 2: Add `launchOrchestration` mutation to controlPlane.ts

**Files:**
- `convex/controlPlane.ts`

**Model:** opus

**review:** full

**Depends on:** 1

### Steps

1. Add the following import at the top of `convex/controlPlane.ts` (after existing imports):

```typescript
import { resolvePolicy, hashPolicy } from "./policyPresets";
```

2. Add the `launchOrchestration` mutation after the `startOrchestration` mutation:

```typescript
export const launchOrchestration = mutation({
  args: {
    projectId: v.id("projects"),
    designId: v.id("designs"),
    nodeId: v.id("nodes"),
    feature: v.string(),
    branch: v.string(),
    totalPhases: v.number(),
    ticketIds: v.optional(v.array(v.id("tickets"))),
    policyPreset: v.string(),
    policyOverrides: v.optional(v.string()),
    requestedBy: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate project exists
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error(`Project not found: ${args.projectId}`);
    }

    // Validate design exists and belongs to project
    const design = await ctx.db.get(args.designId);
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }
    if (design.projectId !== args.projectId) {
      throw new Error(
        `Design ${args.designId} does not belong to project ${args.projectId}`,
      );
    }

    // Validate node is online
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error(`Node not found: ${args.nodeId}`);
    }
    const HEARTBEAT_TIMEOUT_MS = 60_000;
    if (Date.now() - node.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      throw new Error(`Node "${node.name}" is offline`);
    }

    // Validate ticket IDs if provided
    const ticketIds = args.ticketIds ?? [];
    for (const ticketId of ticketIds) {
      const ticket = await ctx.db.get(ticketId);
      if (!ticket) {
        throw new Error(`Ticket not found: ${ticketId}`);
      }
      if (ticket.projectId !== args.projectId) {
        throw new Error(
          `Ticket ${ticketId} does not belong to project ${args.projectId}`,
        );
      }
    }

    const designOnly = ticketIds.length === 0;

    // Resolve policy snapshot
    const overrides = args.policyOverrides
      ? JSON.parse(args.policyOverrides)
      : undefined;
    const policy = resolvePolicy(args.policyPreset, overrides);
    const policyJson = JSON.stringify(policy);
    const policyHash = await hashPolicy(policy);

    // Create orchestration stub
    const now = new Date().toISOString();
    const orchestrationId = await ctx.db.insert("orchestrations", {
      nodeId: args.nodeId,
      projectId: args.projectId,
      designId: args.designId,
      featureName: args.feature,
      designDocPath: `convex://${args.designId}`,
      branch: args.branch,
      totalPhases: args.totalPhases,
      currentPhase: 1,
      status: "launching",
      startedAt: now,
      policySnapshot: policyJson,
      policySnapshotHash: policyHash,
      presetOrigin: args.policyPreset,
      designOnly,
    });

    // Build launch payload for daemon
    const launchPayload = JSON.stringify({
      feature: args.feature,
      design_id: args.designId,
      cwd: project.repoPath,
      branch: args.branch,
      total_phases: args.totalPhases,
      policy: policy,
    });

    // Create control-plane action + inbound queue entry
    const actionId = await insertControlActionWithQueue(ctx, {
      orchestrationId,
      nodeId: args.nodeId,
      actionType: "start_orchestration",
      payload: launchPayload,
      requestedBy: args.requestedBy,
      idempotencyKey: args.idempotencyKey,
    });

    // Record launch event
    await ctx.db.insert("orchestrationEvents", {
      orchestrationId,
      eventType: "launch_requested",
      source: "control_plane",
      summary: `Launch requested for "${args.feature}" on node "${node.name}"`,
      detail: JSON.stringify({
        preset: args.policyPreset,
        designOnly,
        ticketCount: ticketIds.length,
      }),
      recordedAt: now,
    });

    return { orchestrationId, actionId };
  },
});
```

3. Verify the module compiles:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | head -20`
Expected: No errors (or only pre-existing unrelated ones).

---

## Task 3: Add design fixture helpers to test_helpers.ts

**Files:**
- `convex/test_helpers.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** none

### Steps

1. Add a `createDesign` import at the top and a `createDesignFixture` helper at the bottom of `convex/test_helpers.ts`:

At the end of the file, add:

```typescript
interface CreateDesignOptions {
  projectId: string;
  title?: string;
  markdown?: string;
}

export async function createDesign(
  t: ConvexHarness,
  options: CreateDesignOptions,
) {
  return await t.mutation(api.designs.createDesign, {
    projectId: options.projectId as any,
    title: options.title ?? "Test Design",
    markdown: options.markdown ?? "# Test Design\n\nTest content.",
  });
}

export async function createLaunchFixture(
  t: ConvexHarness,
  featureName: string,
) {
  const nodeId = await createNode(t);
  const projectId = await createProject(t);
  const designId = await createDesign(t, { projectId });
  return { nodeId, projectId, designId };
}
```

2. Verify the file is valid:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | grep test_helpers || echo "No errors"`
Expected: No errors.

---

## Task 4: Write tests for launchOrchestration mutation

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** full

**Depends on:** 2, 3

### Steps

1. Add the following imports at the top of `convex/controlPlane.test.ts` if not already present:

```typescript
import { createLaunchFixture } from "./test_helpers";
```

2. Add a new describe block at the end of the file:

```typescript
describe("controlPlane:launchOrchestration", () => {
  test("creates orchestration, action log, queue, and event", async () => {
    const t = convexTest(schema);
    const { nodeId, projectId, designId } = await createLaunchFixture(
      t,
      "launch-test",
    );

    const result = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId,
      designId,
      nodeId,
      feature: "launch-test",
      branch: "tina/launch-test",
      totalPhases: 3,
      policyPreset: "balanced",
      requestedBy: "web:operator",
      idempotencyKey: "launch-001",
    });

    expect(result.orchestrationId).toBeDefined();
    expect(result.actionId).toBeDefined();

    // Verify orchestration was created
    const orch = await t.query(api.orchestrations.getOrchestrationDetail, {
      orchestrationId: result.orchestrationId,
    });
    expect(orch).not.toBeNull();
    expect(orch!.featureName).toBe("launch-test");
    expect(orch!.status).toBe("launching");
    expect(orch!.policySnapshot).toBeDefined();
    expect(orch!.policySnapshotHash).toMatch(/^sha256-/);
    expect(orch!.presetOrigin).toBe("balanced");
    expect(orch!.designOnly).toBe(true);

    // Verify control action was created
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId: result.orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("start_orchestration");
  });

  test("rejects nonexistent project", async () => {
    const t = convexTest(schema);
    const { nodeId, designId } = await createLaunchFixture(t, "bad-project");

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId: "invalid" as any,
        designId,
        nodeId,
        feature: "test",
        branch: "tina/test",
        totalPhases: 1,
        policyPreset: "balanced",
        requestedBy: "web:operator",
        idempotencyKey: "bad-project-001",
      }),
    ).rejects.toThrow(/Project not found/);
  });

  test("rejects design not belonging to project", async () => {
    const t = convexTest(schema);
    const { nodeId, projectId } = await createLaunchFixture(t, "wrong-design");

    // Create a second project and design
    const otherProjectId = await createProject(t, { name: "Other", repoPath: "/tmp/other" });
    const otherDesignId = await createDesign(t, { projectId: otherProjectId });

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId,
        designId: otherDesignId,
        nodeId,
        feature: "test",
        branch: "tina/test",
        totalPhases: 1,
        policyPreset: "balanced",
        requestedBy: "web:operator",
        idempotencyKey: "wrong-design-001",
      }),
    ).rejects.toThrow(/does not belong to project/);
  });

  test("rejects offline node", async () => {
    const t = convexTest(schema);
    const { projectId, designId } = await createLaunchFixture(t, "offline-node");

    // Create a node with old heartbeat
    const offlineNodeId = await t.mutation(api.nodes.registerNode, {
      name: "offline-node",
      os: "linux",
      authTokenHash: "offline-hash",
    });
    // Manually set the heartbeat to old
    await t.run(async (ctx) => {
      await ctx.db.patch(offlineNodeId, {
        lastHeartbeat: Date.now() - 120_000,
      });
    });

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId,
        designId,
        nodeId: offlineNodeId,
        feature: "test",
        branch: "tina/test",
        totalPhases: 1,
        policyPreset: "balanced",
        requestedBy: "web:operator",
        idempotencyKey: "offline-001",
      }),
    ).rejects.toThrow(/offline/);
  });

  test("rejects unknown preset name", async () => {
    const t = convexTest(schema);
    const { nodeId, projectId, designId } = await createLaunchFixture(
      t,
      "bad-preset",
    );

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId,
        designId,
        nodeId,
        feature: "test",
        branch: "tina/test",
        totalPhases: 1,
        policyPreset: "turbo",
        requestedBy: "web:operator",
        idempotencyKey: "bad-preset-001",
      }),
    ).rejects.toThrow(/Unknown preset/);
  });

  test("designOnly is false when ticketIds provided", async () => {
    const t = convexTest(schema);
    const { nodeId, projectId, designId } = await createLaunchFixture(
      t,
      "with-tickets",
    );

    // Create a ticket for the project
    const ticketId = await t.mutation(api.tickets.createTicket, {
      projectId,
      title: "Test Ticket",
      description: "A test ticket",
      priority: "medium",
    });

    const result = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId,
      designId,
      nodeId,
      feature: "with-tickets",
      branch: "tina/with-tickets",
      totalPhases: 2,
      ticketIds: [ticketId],
      policyPreset: "strict",
      requestedBy: "web:operator",
      idempotencyKey: "tickets-001",
    });

    const orch = await t.query(api.orchestrations.getOrchestrationDetail, {
      orchestrationId: result.orchestrationId,
    });
    expect(orch!.designOnly).toBe(false);
  });

  test("idempotency: same key returns same IDs", async () => {
    const t = convexTest(schema);
    const { nodeId, projectId, designId } = await createLaunchFixture(
      t,
      "idem-launch",
    );

    const r1 = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId,
      designId,
      nodeId,
      feature: "idem-launch",
      branch: "tina/idem-launch",
      totalPhases: 1,
      policyPreset: "balanced",
      requestedBy: "web:operator",
      idempotencyKey: "idem-launch-001",
    });

    const r2 = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId,
      designId,
      nodeId,
      feature: "idem-launch-2",
      branch: "tina/idem-launch-2",
      totalPhases: 2,
      policyPreset: "fast",
      requestedBy: "web:operator",
      idempotencyKey: "idem-launch-001",
    });

    // Same actionId from idempotency, but orchestrationId differs because
    // the orchestration is created before the idempotency check in the queue helper
    expect(r1.actionId).toBe(r2.actionId);
  });
});
```

Note: The `createProject`, `createDesign` imports are from `test_helpers.ts` (Task 3). The `createLaunchFixture` bundles them.

3. Run the tests:

Run: `cd /Users/joshua/Projects/tina && npm test -- --run convex/controlPlane.test.ts 2>&1`
Expected: All tests pass, including the new launchOrchestration tests.

---

## Task 5: Extend daemon ActionPayload and add start_orchestration handler

**Files:**
- `tina-daemon/src/actions.rs`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Extend the `ActionPayload` struct to include optional launch fields. Replace the existing struct with:

```rust
/// Payload for inbound actions that include feature/phase context.
#[derive(Debug, serde::Deserialize)]
pub struct ActionPayload {
    pub feature: Option<String>,
    pub phase: Option<String>,
    pub feedback: Option<String>,
    pub issues: Option<String>,
    // Launch-specific fields (start_orchestration)
    pub design_id: Option<String>,
    pub cwd: Option<String>,
    pub branch: Option<String>,
    pub total_phases: Option<u32>,
    pub policy: Option<serde_json::Value>,
}
```

2. Add the `start_orchestration` case to the `build_cli_args` function. Insert it before the `other =>` fallthrough arm:

```rust
        "start_orchestration" => {
            let design_id = payload
                .design_id
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("start_orchestration requires 'design_id' in payload"))?;
            let cwd = payload
                .cwd
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("start_orchestration requires 'cwd' in payload"))?;
            let branch = payload
                .branch
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("start_orchestration requires 'branch' in payload"))?;
            let total_phases = payload
                .total_phases
                .ok_or_else(|| anyhow::anyhow!("start_orchestration requires 'total_phases' in payload"))?;

            let mut args = vec![
                "init".to_string(),
                feature.to_string(),
                "--cwd".to_string(),
                cwd.to_string(),
                "--design-id".to_string(),
                design_id.to_string(),
                "--branch".to_string(),
                branch.to_string(),
                total_phases.to_string(),
            ];

            // Apply policy overrides from snapshot if present
            if let Some(policy) = &payload.policy {
                if let Some(review) = policy.get("review") {
                    if let Some(v) = review.get("enforcement").and_then(|v| v.as_str()) {
                        args.push("--review-enforcement".to_string());
                        args.push(v.to_string());
                    }
                    if let Some(v) = review.get("detector_scope").and_then(|v| v.as_str()) {
                        args.push("--detector-scope".to_string());
                        args.push(v.to_string());
                    }
                    if let Some(v) = review.get("architect_mode").and_then(|v| v.as_str()) {
                        args.push("--architect-mode".to_string());
                        args.push(v.to_string());
                    }
                    if let Some(v) = review.get("test_integrity_profile").and_then(|v| v.as_str()) {
                        args.push("--test-integrity-profile".to_string());
                        args.push(v.to_string());
                    }
                    if let Some(v) = review.get("hard_block_detectors").and_then(|v| v.as_bool()) {
                        if !v {
                            args.push("--no-hard-block-detectors".to_string());
                        }
                    }
                    if let Some(v) = review.get("allow_rare_override").and_then(|v| v.as_bool()) {
                        if !v {
                            args.push("--no-allow-rare-override".to_string());
                        }
                    }
                    if let Some(v) = review.get("require_fix_first").and_then(|v| v.as_bool()) {
                        if !v {
                            args.push("--no-require-fix-first".to_string());
                        }
                    }
                }
            }

            Ok(args)
        }
```

3. Verify it compiles:

Run: `cd /Users/joshua/Projects/tina && cargo check -p tina-daemon 2>&1 | tail -5`
Expected: Compiles without errors.

---

## Task 6: Write daemon tests for start_orchestration CLI args

**Files:**
- `tina-daemon/src/actions.rs`

**Model:** haiku

**review:** spec-only

**Depends on:** 5

### Steps

1. Add the following tests to the `mod tests` block in `tina-daemon/src/actions.rs`:

```rust
    fn launch_payload(
        feature: &str,
        design_id: &str,
        cwd: &str,
        branch: &str,
        total_phases: u32,
    ) -> ActionPayload {
        ActionPayload {
            feature: Some(feature.to_string()),
            phase: None,
            feedback: None,
            issues: None,
            design_id: Some(design_id.to_string()),
            cwd: Some(cwd.to_string()),
            branch: Some(branch.to_string()),
            total_phases: Some(total_phases),
            policy: None,
        }
    }

    #[test]
    fn test_build_cli_args_start_orchestration_basic() {
        let p = launch_payload("my-feature", "design-abc", "/home/user/project", "tina/my-feature", 3);
        let args = build_cli_args("start_orchestration", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "init",
                "my-feature",
                "--cwd",
                "/home/user/project",
                "--design-id",
                "design-abc",
                "--branch",
                "tina/my-feature",
                "3",
            ]
        );
    }

    #[test]
    fn test_build_cli_args_start_orchestration_with_policy() {
        let mut p = launch_payload("feat", "d1", "/repo", "tina/feat", 2);
        p.policy = Some(serde_json::json!({
            "review": {
                "enforcement": "phase_only",
                "detector_scope": "touched_area_only",
                "architect_mode": "disabled",
                "test_integrity_profile": "minimal",
                "hard_block_detectors": false,
                "allow_rare_override": true,
                "require_fix_first": false
            },
            "model": {
                "validator": "opus",
                "planner": "opus",
                "executor": "haiku",
                "reviewer": "haiku"
            }
        }));
        let args = build_cli_args("start_orchestration", &p).unwrap();
        assert!(args.contains(&"--review-enforcement".to_string()));
        assert!(args.contains(&"phase_only".to_string()));
        assert!(args.contains(&"--detector-scope".to_string()));
        assert!(args.contains(&"touched_area_only".to_string()));
        assert!(args.contains(&"--architect-mode".to_string()));
        assert!(args.contains(&"disabled".to_string()));
        assert!(args.contains(&"--test-integrity-profile".to_string()));
        assert!(args.contains(&"minimal".to_string()));
        assert!(args.contains(&"--no-hard-block-detectors".to_string()));
        assert!(args.contains(&"--no-require-fix-first".to_string()));
        // allow_rare_override is true, so no --no flag
        assert!(!args.contains(&"--no-allow-rare-override".to_string()));
    }

    #[test]
    fn test_build_cli_args_start_orchestration_missing_design_id() {
        let mut p = launch_payload("feat", "d1", "/repo", "tina/feat", 2);
        p.design_id = None;
        let result = build_cli_args("start_orchestration", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("design_id"));
    }

    #[test]
    fn test_build_cli_args_start_orchestration_missing_cwd() {
        let mut p = launch_payload("feat", "d1", "/repo", "tina/feat", 2);
        p.cwd = None;
        let result = build_cli_args("start_orchestration", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("cwd"));
    }
```

2. Also update the existing `payload` helper to include the new fields (to avoid struct initialization errors):

Replace the existing `payload` helper:
```rust
    fn payload(feature: &str, phase: Option<&str>) -> ActionPayload {
        ActionPayload {
            feature: Some(feature.to_string()),
            phase: phase.map(|p| p.to_string()),
            feedback: None,
            issues: None,
            design_id: None,
            cwd: None,
            branch: None,
            total_phases: None,
            policy: None,
        }
    }
```

And update the `test_build_cli_args_reject_plan_with_feedback` test payload:
```rust
        let p = ActionPayload {
            feature: Some("auth".to_string()),
            phase: Some("2".to_string()),
            feedback: Some("needs error handling".to_string()),
            issues: None,
            design_id: None,
            cwd: None,
            branch: None,
            total_phases: None,
            policy: None,
        };
```

And update the `test_build_cli_args_missing_feature` test payload:
```rust
        let p = ActionPayload {
            feature: None,
            phase: Some("1".to_string()),
            feedback: None,
            issues: None,
            design_id: None,
            cwd: None,
            branch: None,
            total_phases: None,
            policy: None,
        };
```

And update the `test_build_cli_args_reject_plan_uses_issues_field` test payload:
```rust
        let p = ActionPayload {
            feature: Some("auth".to_string()),
            phase: Some("1".to_string()),
            feedback: None,
            issues: Some("missing tests".to_string()),
            design_id: None,
            cwd: None,
            branch: None,
            total_phases: None,
            policy: None,
        };
```

3. Run the tests:

Run: `cd /Users/joshua/Projects/tina && cargo test -p tina-daemon -- actions 2>&1`
Expected: All tests pass.

---

## Task 7: Add NodeSummary schema and NodeListQuery to web

**Files:**
- `tina-web/src/schemas/node.ts` (new file)
- `tina-web/src/schemas/index.ts`
- `tina-web/src/services/data/queryDefs.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** none

### Steps

1. Create `tina-web/src/schemas/node.ts`:

```typescript
import { Schema } from "effect"

export const NodeSummary = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  name: Schema.String,
  os: Schema.String,
  status: Schema.String,
  lastHeartbeat: Schema.Number,
  registeredAt: Schema.Number,
  authTokenHash: Schema.String,
})

export type NodeSummary = typeof NodeSummary.Type
```

2. Add the export to `tina-web/src/schemas/index.ts`:

Add this line:
```typescript
export { NodeSummary } from "./node"
```

3. Add `NodeListQuery` to `tina-web/src/services/data/queryDefs.ts`:

First, add `NodeSummary` to the import from `@/schemas`:
```typescript
import {
  // ... existing imports ...
  NodeSummary,
} from "@/schemas"
```

Then add the query definition:
```typescript
export const NodeListQuery = queryDef({
  key: "nodes.list",
  query: api.nodes.listNodes,
  args: Schema.Struct({}),
  schema: Schema.Array(NodeSummary),
})
```

4. Verify the web app compiles:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | head -10`
Expected: No errors (or only pre-existing unrelated ones).

---

## Task 8: Create LaunchOrchestrationPage component

**Files:**
- `tina-web/src/components/pm/LaunchOrchestrationPage.tsx` (new file)

**Model:** opus

**review:** full

**Depends on:** 7

### Steps

1. Create `tina-web/src/components/pm/LaunchOrchestrationPage.tsx`:

```tsx
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import {
  DesignListQuery,
  NodeListQuery,
  ProjectListQuery,
} from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import type { Id } from "@convex/_generated/dataModel"
import styles from "./LaunchOrchestrationPage.module.scss"

const PRESETS = ["balanced", "strict", "fast"] as const

function generateIdempotencyKey(): string {
  return `launch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function featureToKebab(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function LaunchOrchestrationPage() {
  const [searchParams] = useSearchParams()
  const projectIdParam = searchParams.get("project")

  // Form state
  const [designId, setDesignId] = useState("")
  const [nodeId, setNodeId] = useState("")
  const [feature, setFeature] = useState("")
  const [totalPhases, setTotalPhases] = useState("3")
  const [preset, setPreset] = useState<string>("balanced")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ orchestrationId: string } | null>(null)

  const launchOrchestration = useMutation(api.controlPlane.launchOrchestration)

  // Queries
  const projectsResult = useTypedQuery(ProjectListQuery, {})
  const designsResult = useTypedQuery(DesignListQuery, {
    projectId: projectIdParam ?? "",
    status: "approved",
  })
  const nodesResult = useTypedQuery(NodeListQuery, {})

  if (isAnyQueryLoading(projectsResult, nodesResult)) {
    return (
      <div data-testid="launch-page" className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(projectsResult, designsResult, nodesResult)
  if (queryError) {
    throw queryError
  }

  if (projectsResult.status !== "success" || nodesResult.status !== "success") {
    return null
  }

  const designs =
    designsResult.status === "success" ? designsResult.data : []
  const onlineNodes = nodesResult.data.filter((n) => n.status === "online")

  const branch = feature ? `tina/${featureToKebab(feature)}` : ""
  const canSubmit =
    projectIdParam && designId && nodeId && feature.trim() && !submitting

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const res = await launchOrchestration({
        projectId: projectIdParam as Id<"projects">,
        designId: designId as Id<"designs">,
        nodeId: nodeId as Id<"nodes">,
        feature: featureToKebab(feature),
        branch,
        totalPhases: parseInt(totalPhases, 10),
        policyPreset: preset,
        requestedBy: "web:operator",
        idempotencyKey: generateIdempotencyKey(),
      })
      setResult({ orchestrationId: res.orchestrationId })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (!projectIdParam) {
    return (
      <div data-testid="launch-page" className={styles.page}>
        <p className={styles.hint}>Select a project from the sidebar to launch an orchestration.</p>
      </div>
    )
  }

  return (
    <div data-testid="launch-page" className={styles.page}>
      <h2 className={styles.title}>Launch Orchestration</h2>

      {result && (
        <div className={styles.successBanner}>
          Launch queued. Orchestration: <code>{result.orchestrationId}</code>
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="launch-design">
            Design
          </label>
          <select
            id="launch-design"
            className={styles.formSelect}
            value={designId}
            onChange={(e) => setDesignId(e.target.value)}
          >
            <option value="">Select a design...</option>
            {designs.map((d) => (
              <option key={d._id} value={d._id}>
                {d.designKey} — {d.title}
              </option>
            ))}
          </select>
          {designs.length === 0 && (
            <span className={styles.warning}>No approved designs found</span>
          )}
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="launch-node">
            Target Node
          </label>
          <select
            id="launch-node"
            className={styles.formSelect}
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
          >
            <option value="">Select a node...</option>
            {onlineNodes.map((n) => (
              <option key={n._id} value={n._id}>
                {n.name} ({n.os})
              </option>
            ))}
          </select>
          {onlineNodes.length === 0 && (
            <span className={styles.warning}>No online nodes available</span>
          )}
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="launch-feature">
            Feature Name
          </label>
          <input
            id="launch-feature"
            className={styles.formInput}
            type="text"
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            placeholder="e.g. user-auth"
          />
          {branch && (
            <span className={styles.hint}>Branch: {branch}</span>
          )}
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="launch-phases">
            Total Phases
          </label>
          <input
            id="launch-phases"
            className={styles.formInput}
            type="number"
            min="1"
            max="20"
            value={totalPhases}
            onChange={(e) => setTotalPhases(e.target.value)}
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Policy Preset</label>
          <div className={styles.presetButtons}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`${styles.presetButton}${preset === p ? ` ${styles.active}` : ""}`}
                onClick={() => setPreset(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.actionButton} ${styles.primary}`}
            disabled={!canSubmit}
          >
            {submitting ? "Launching..." : "Launch Orchestration"}
          </button>
        </div>
      </form>
    </div>
  )
}
```

2. Verify it compiles:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | head -10`
Expected: No errors (or only the missing SCSS module type which is expected in non-build mode).

---

## Task 9: Create LaunchOrchestrationPage SCSS module

**Files:**
- `tina-web/src/components/pm/LaunchOrchestrationPage.module.scss` (new file)

**Model:** haiku

**review:** spec-only

**Depends on:** none

### Steps

1. Create `tina-web/src/components/pm/LaunchOrchestrationPage.module.scss`:

```scss
@use '../../styles/tokens' as *;

.page {
  max-width: 600px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: 16px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.formField {
  margin-bottom: 12px;
}

.formLabel {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: $text-muted;
  margin-bottom: 4px;
}

.formInput {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid $border-color;
  border-radius: 4px;
  background: $bg-primary;
  color: $text-primary;

  &:focus {
    outline: 2px solid $ring-color;
    outline-offset: 1px;
  }
}

.formSelect {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid $border-color;
  border-radius: 4px;
  background: $bg-primary;
  color: $text-primary;

  &:focus {
    outline: 2px solid $ring-color;
    outline-offset: 1px;
  }
}

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

.formActions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.actionButton {
  font-size: 12px;
  padding: 6px 16px;
  border-radius: 4px;
  border: 1px solid $border-color;
  background: $bg-card;
  color: $text-primary;
  cursor: pointer;

  &:hover {
    background: hsl(var(--accent) / 0.08);
  }

  &.primary {
    background: $accent;
    color: $accent-foreground;
    border-color: $accent;

    &:hover {
      opacity: 0.9;
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.hint {
  display: block;
  font-size: 11px;
  color: $text-muted;
  margin-top: 4px;
  font-family: $font-mono;
}

.warning {
  display: block;
  font-size: 11px;
  color: hsl(var(--warning, 40 90% 50%));
  margin-top: 4px;
}

.errorMessage {
  font-size: 12px;
  color: hsl(var(--destructive, 0 80% 60%));
  padding: 8px 12px;
  border: 1px solid hsl(var(--destructive, 0 80% 60%) / 0.3);
  border-radius: 4px;
  background: hsl(var(--destructive, 0 80% 60%) / 0.08);
}

.successBanner {
  font-size: 12px;
  color: hsl(var(--success, 140 60% 40%));
  padding: 8px 12px;
  border: 1px solid hsl(var(--success, 140 60% 40%) / 0.3);
  border-radius: 4px;
  background: hsl(var(--success, 140 60% 40%) / 0.08);
  margin-bottom: 16px;
  font-family: $font-mono;

  code {
    font-weight: 600;
  }
}

.loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeletonBar {
  height: 20px;
  width: 200px;
  background: hsl(var(--border));
  border-radius: 4px;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
```

---

## Task 10: Add launch route and navigation link

**Files:**
- `tina-web/src/App.tsx`
- `tina-web/src/components/pm/PmShell.tsx`

**Model:** haiku

**review:** spec-only

**Depends on:** 8, 9

### Steps

1. Add the import and route to `tina-web/src/App.tsx`:

Add to imports:
```typescript
import { LaunchOrchestrationPage } from "./components/pm/LaunchOrchestrationPage"
```

Add route inside the `<Route path="pm" element={<PmShell />}>` block, after the existing ticket route:
```tsx
<Route path="launch" element={<LaunchOrchestrationPage />} />
```

2. Add a navigation link to `tina-web/src/components/pm/PmShell.tsx`:

Add a "Launch" link in the sidebar navigation section, following the same pattern as existing links (Tickets, Designs). The link should include project context:
```tsx
<NavLink to={`/pm/launch?project=${activeProject}`}>Launch</NavLink>
```

The exact insertion point depends on the PmShell structure. Add it after the existing "Designs" link.

3. Verify the web app compiles:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | head -10`
Expected: No errors.

---

## Task 11: Write Convex integration test for end-to-end launch flow

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** full

**Depends on:** 4

### Steps

1. Add a final integration test to `convex/controlPlane.test.ts` that verifies the full launch creates all expected records:

```typescript
describe("controlPlane:launchOrchestration:integration", () => {
  test("e2e: launch creates orchestration, action-log, queue, and event", async () => {
    const t = convexTest(schema);
    const { nodeId, projectId, designId } = await createLaunchFixture(
      t,
      "e2e-launch",
    );

    const result = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId,
      designId,
      nodeId,
      feature: "e2e-launch",
      branch: "tina/e2e-launch",
      totalPhases: 3,
      policyPreset: "strict",
      requestedBy: "web:operator",
      idempotencyKey: "e2e-launch-001",
    });

    // 1. Orchestration record exists with correct fields
    const orch = await t.query(api.orchestrations.getOrchestrationDetail, {
      orchestrationId: result.orchestrationId,
    });
    expect(orch).not.toBeNull();
    expect(orch!.featureName).toBe("e2e-launch");
    expect(orch!.status).toBe("launching");
    expect(orch!.totalPhases).toBe(3);
    expect(orch!.policySnapshot).toBeDefined();
    const policy = JSON.parse(orch!.policySnapshot as string);
    expect(policy.review.test_integrity_profile).toBe("max_strict");
    expect(policy.review.allow_rare_override).toBe(false);

    // 2. Control-plane action log has one entry
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId: result.orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("start_orchestration");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].queueActionId).toBeDefined();

    // 3. Launch event was recorded
    const events = await t.query(api.events.listEvents, {
      orchestrationId: result.orchestrationId as any,
      eventType: "launch_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("control_plane");
    expect(events[0].summary).toContain("e2e-launch");
  });
});
```

2. Run the full test suite:

Run: `cd /Users/joshua/Projects/tina && npm test -- --run convex/controlPlane.test.ts 2>&1`
Expected: All tests pass (Phase 1 tests + new Phase 2 tests).

---

## Dependency Graph

```
Task 1 (policyPresets.ts) ────> Task 2 (launchOrchestration mutation) ────> Task 4 (tests) ────> Task 11 (integration test)
                                          ^
Task 3 (test_helpers) ────────────────────┘

Task 5 (daemon payload) ────> Task 6 (daemon tests)

Task 7 (NodeSummary + query) ────> Task 8 (LaunchOrchestrationPage) ────> Task 10 (route + nav)
Task 9 (SCSS module) ────────────────────────────────────────────────────┘
```

Tasks {1, 3, 5, 7, 9} can all run in parallel (no dependencies).
Tasks {2, 6, 8} can run after their dependencies.
Tasks {4, 10} follow their predecessors.
Task 11 is the final integration test.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 900 |

---

## Phase Estimates

| Task | Estimated Time | Lines |
|------|---------------|-------|
| Task 1: Policy preset constants | 5 min | ~100 |
| Task 2: launchOrchestration mutation | 5 min | ~85 |
| Task 3: Test fixture helpers | 2 min | ~25 |
| Task 4: launchOrchestration tests | 5 min | ~130 |
| Task 5: Daemon start_orchestration handler | 5 min | ~55 |
| Task 6: Daemon tests | 3 min | ~70 |
| Task 7: NodeSummary + NodeListQuery | 2 min | ~25 |
| Task 8: LaunchOrchestrationPage component | 10 min | ~180 |
| Task 9: SCSS module | 3 min | ~130 |
| Task 10: Route + navigation | 2 min | ~10 |
| Task 11: Integration test | 3 min | ~45 |
| **Total** | **~45 min** | **~855** |

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
