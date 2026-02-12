# Phase 4: Policy Reconfiguration for Future Work

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 137ab8edeab9677acdf2f62ca27d998dbe32cac3

**Goal:** Allow safe model/review policy changes that affect only future work. After this phase, operators can change model routing (e.g., switch executor from opus to haiku) and review policy settings mid-flight from the web UI, with revision-safe concurrency and no silent divergence from completed work.

**Architecture:** Extends `convex/controlPlane.ts` with policy-specific payload validation and optimistic concurrency (targetRevision) for `orchestration_set_policy` and `orchestration_set_role_model` action types. Adds `SetPolicy` and `SetRoleModel` subcommands to `tina-session orchestrate` that patch `SupervisorState.model_policy` and `SupervisorState.review_policy` and save via the existing `save()` flow. Adds daemon dispatch for both action types in `tina-daemon/src/actions.rs`. Adds a `PolicyConfigPanel` component to `tina-web` reading active policy from `supervisorStates.stateJson` and writing changes through `enqueueControlAction`.

**Phase context:** Phase 1 established the `controlPlaneActions` table, `enqueueControlAction`, and queue linkage. Phase 2 added `launchOrchestration` with policy snapshot persistence and preset resolution. Phase 3 added runtime controls (pause/resume/retry) with typed payload validation, structured error codes, and web control buttons. The `orchestration_set_policy` and `orchestration_set_role_model` action types are already listed in `RUNTIME_ACTION_TYPES` but have no dedicated validation or dispatch — they currently accept any `{}` payload and would fail at the daemon since `build_cli_args` doesn't handle them.

---

## Task 1: Add policyRevision to orchestrations schema and regenerate contracts

**Files:**
- `contracts/orchestration-core.contract.json`
- `convex/schema.ts` (via generated fields)
- `tina-web/src/schemas/generated/orchestrationCore.ts` (via generation)

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Read `contracts/orchestration-core.contract.json` and add a `policyRevision` field (optional number) to the fields list, after `designOnly`.

Add to the `fields` array:

```json
{
  "name": "policyRevision",
  "convex": "v.optional(v.number())",
  "effect": "optionalNumber",
  "rust": "Option<u64>"
}
```

2. Regenerate the shared contracts:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && node scripts/generate-contracts.mjs`
Expected: Files updated in `convex/generated/`, `tina-web/src/schemas/generated/`.

3. Update `launchOrchestration` in `convex/controlPlane.ts` to set `policyRevision: 1` when creating the orchestration stub. Find the `ctx.db.insert("orchestrations", {` call (~line 218) and add `policyRevision: 1,` after `designOnly`.

4. Verify TypeScript compiles:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx tsc --noEmit --project tina-web/tsconfig.json`
Expected: No errors.

5. Verify Convex functions compile:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 2: Add policy-specific payload validation to controlPlane.ts

**Files:**
- `convex/controlPlane.ts`

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. Add a set of allowed model names and validation helpers after the existing `validateRuntimePayload` function (after line 46):

```typescript
const ALLOWED_MODELS = ["opus", "sonnet", "haiku"] as const;
const ALLOWED_ROLES = ["validator", "planner", "executor", "reviewer"] as const;

interface PolicyPayload {
  feature: string;
  targetRevision: number;
  review?: Partial<{
    enforcement: string;
    detector_scope: string;
    architect_mode: string;
    test_integrity_profile: string;
    hard_block_detectors: boolean;
    allow_rare_override: boolean;
    require_fix_first: boolean;
  }>;
  model?: Partial<{
    validator: string;
    planner: string;
    executor: string;
    reviewer: string;
  }>;
}

interface RoleModelPayload {
  feature: string;
  targetRevision: number;
  role: string;
  model: string;
}

function validatePolicyPayload(rawPayload: string): PolicyPayload {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new Error("Invalid payload: must be valid JSON");
  }

  if (typeof parsed.feature !== "string" || !parsed.feature) {
    throw new Error('Payload for "orchestration_set_policy" requires "feature" (string)');
  }
  if (typeof parsed.targetRevision !== "number") {
    throw new Error('Payload for "orchestration_set_policy" requires "targetRevision" (number)');
  }

  // Validate model names if provided
  if (parsed.model && typeof parsed.model === "object") {
    const model = parsed.model as Record<string, unknown>;
    for (const [role, value] of Object.entries(model)) {
      if (!(ALLOWED_ROLES as readonly string[]).includes(role)) {
        throw new Error(`Unknown model role: "${role}". Allowed: ${ALLOWED_ROLES.join(", ")}`);
      }
      if (typeof value !== "string" || !(ALLOWED_MODELS as readonly string[]).includes(value)) {
        throw new Error(`Invalid model for "${role}": "${value}". Allowed: ${ALLOWED_MODELS.join(", ")}`);
      }
    }
  }

  return parsed as unknown as PolicyPayload;
}

function validateRoleModelPayload(rawPayload: string): RoleModelPayload {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new Error("Invalid payload: must be valid JSON");
  }

  if (typeof parsed.feature !== "string" || !parsed.feature) {
    throw new Error('Payload for "orchestration_set_role_model" requires "feature" (string)');
  }
  if (typeof parsed.targetRevision !== "number") {
    throw new Error('Payload for "orchestration_set_role_model" requires "targetRevision" (number)');
  }
  if (typeof parsed.role !== "string" || !(ALLOWED_ROLES as readonly string[]).includes(parsed.role)) {
    throw new Error(`Invalid role: "${parsed.role}". Allowed: ${ALLOWED_ROLES.join(", ")}`);
  }
  if (typeof parsed.model !== "string" || !(ALLOWED_MODELS as readonly string[]).includes(parsed.model)) {
    throw new Error(`Invalid model: "${parsed.model}". Allowed: ${ALLOWED_MODELS.join(", ")}`);
  }

  return parsed as unknown as RoleModelPayload;
}
```

2. Wire the validation and revision checking into `enqueueControlAction` handler. Replace the existing validation block (~lines 291-294) with expanded logic:

```typescript
    // Validate payload structure per action type
    if (["pause", "resume", "retry"].includes(args.actionType)) {
      validateRuntimePayload(args.actionType, args.payload);
    } else if (args.actionType === "orchestration_set_policy") {
      const policyPayload = validatePolicyPayload(args.payload);
      // Optimistic concurrency: check revision
      const orch = await ctx.db.get(args.orchestrationId);
      if (!orch) throw new Error("Orchestration not found");
      const currentRevision = orch.policyRevision ?? 0;
      if (policyPayload.targetRevision !== currentRevision) {
        throw new Error(
          `Policy revision conflict: expected ${policyPayload.targetRevision}, current is ${currentRevision}. Reload and retry.`,
        );
      }
      await ctx.db.patch(args.orchestrationId, { policyRevision: currentRevision + 1 });
    } else if (args.actionType === "orchestration_set_role_model") {
      const rolePayload = validateRoleModelPayload(args.payload);
      const orch = await ctx.db.get(args.orchestrationId);
      if (!orch) throw new Error("Orchestration not found");
      const currentRevision = orch.policyRevision ?? 0;
      if (rolePayload.targetRevision !== currentRevision) {
        throw new Error(
          `Policy revision conflict: expected ${rolePayload.targetRevision}, current is ${currentRevision}. Reload and retry.`,
        );
      }
      await ctx.db.patch(args.orchestrationId, { policyRevision: currentRevision + 1 });
    }
```

3. Run existing tests to ensure no regressions:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/controlPlane.test.ts`
Expected: All existing tests pass. The `orchestration_set_policy: "{}"` payloads in the "accepts all valid runtime action types" test will now fail since they lack required fields. These will be fixed in Task 3.

---

## Task 3: Add Convex tests for policy payload validation and revision checking

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 2

### Steps

1. Update the `orchestration_set_policy` and `orchestration_set_role_model` payloads in the "accepts all valid runtime action types" test to include required fields. Replace the two entries in the `payloads` record (~lines 350-351):

```typescript
      orchestration_set_policy: '{"feature":"test","targetRevision":0,"model":{"executor":"haiku"}}',
      orchestration_set_role_model: '{"feature":"test","targetRevision":0,"role":"executor","model":"haiku"}',
```

Note: `targetRevision: 0` because `createFeatureFixture` creates an orchestration without `policyRevision`, so `policyRevision ?? 0` = 0. Each of these enqueues will increment the revision, so they must be called in order. Since the loop iterates in array order and policy types come after pause/resume/retry (which don't check revision), this works. However, both policy types will each try revision 0 but the first one increments to 1, so the second would fail. Fix: make the test use separate orchestrations for policy action types, OR give each a unique targetRevision. Simplest: set `orchestration_set_role_model` to `targetRevision: 1` since `orchestration_set_policy` will have incremented it.

```typescript
      orchestration_set_policy: '{"feature":"test","targetRevision":0,"model":{"executor":"haiku"}}',
      orchestration_set_role_model: '{"feature":"test","targetRevision":1,"role":"executor","model":"haiku"}',
```

2. Add a new describe block for policy validation tests:

```typescript
describe("controlPlane:policyReconfiguration", () => {
  test("orchestration_set_policy validates required fields", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    // Missing feature
    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: '{"targetRevision":0}',
        requestedBy: "web-ui",
        idempotencyKey: "policy-no-feat",
      }),
    ).rejects.toThrow('requires "feature"');
  });

  test("orchestration_set_policy validates targetRevision is number", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: '{"feature":"test"}',
        requestedBy: "web-ui",
        idempotencyKey: "policy-no-rev",
      }),
    ).rejects.toThrow('requires "targetRevision"');
  });

  test("orchestration_set_policy rejects invalid model name", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: '{"feature":"test","targetRevision":0,"model":{"executor":"gpt-4"}}',
        requestedBy: "web-ui",
        idempotencyKey: "policy-bad-model",
      }),
    ).rejects.toThrow("Invalid model");
  });

  test("orchestration_set_policy rejects unknown role", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: '{"feature":"test","targetRevision":0,"model":{"coder":"opus"}}',
        requestedBy: "web-ui",
        idempotencyKey: "policy-bad-role",
      }),
    ).rejects.toThrow("Unknown model role");
  });

  test("orchestration_set_policy succeeds with valid payload", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: '{"feature":"test","targetRevision":0,"model":{"executor":"haiku","reviewer":"haiku"}}',
      requestedBy: "web-ui",
      idempotencyKey: "policy-valid",
    });
    expect(actionId).toBeTruthy();
  });

  test("orchestration_set_policy rejects stale revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    // First update succeeds (revision 0 -> 1)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: '{"feature":"test","targetRevision":0,"model":{"executor":"haiku"}}',
      requestedBy: "web-ui",
      idempotencyKey: "policy-rev-1",
    });

    // Second update with stale revision fails
    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: '{"feature":"test","targetRevision":0,"model":{"executor":"sonnet"}}',
        requestedBy: "web-ui",
        idempotencyKey: "policy-rev-stale",
      }),
    ).rejects.toThrow("Policy revision conflict");
  });

  test("orchestration_set_policy increments revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: '{"feature":"test","targetRevision":0,"model":{"executor":"haiku"}}',
      requestedBy: "web-ui",
      idempotencyKey: "policy-inc-1",
    });

    // Second update with correct revision succeeds
    const secondId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: '{"feature":"test","targetRevision":1,"model":{"reviewer":"haiku"}}',
      requestedBy: "web-ui",
      idempotencyKey: "policy-inc-2",
    });
    expect(secondId).toBeTruthy();
  });

  test("orchestration_set_role_model validates required fields", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_role_model",
        payload: '{"feature":"test","targetRevision":0}',
        requestedBy: "web-ui",
        idempotencyKey: "role-no-role",
      }),
    ).rejects.toThrow("Invalid role");
  });

  test("orchestration_set_role_model rejects invalid model", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_role_model",
        payload: '{"feature":"test","targetRevision":0,"role":"executor","model":"gpt-5"}',
        requestedBy: "web-ui",
        idempotencyKey: "role-bad-model",
      }),
    ).rejects.toThrow("Invalid model");
  });

  test("orchestration_set_role_model succeeds with valid payload", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: '{"feature":"test","targetRevision":0,"role":"executor","model":"haiku"}',
      requestedBy: "web-ui",
      idempotencyKey: "role-valid",
    });
    expect(actionId).toBeTruthy();
  });
});
```

3. Run the tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/controlPlane.test.ts`
Expected: All tests pass.

---

## Task 4: Add tina-session policy patch commands

**Files:**
- `tina-session/src/main.rs`
- `tina-session/src/commands/orchestrate.rs`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Add `SetPolicy` and `SetRoleModel` variants to the `OrchestrateCommands` enum in `main.rs` (after the `Advance` variant, ~line 578):

```rust
    /// Update model and/or review policy for future work
    SetPolicy {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Model policy as JSON (optional, only provided fields are updated)
        #[arg(long)]
        model_json: Option<String>,

        /// Review policy as JSON (optional, only provided fields are updated)
        #[arg(long)]
        review_json: Option<String>,
    },

    /// Update the model for a single role
    SetRoleModel {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Role to update (validator, planner, executor, reviewer)
        #[arg(long)]
        role: String,

        /// New model name (opus, sonnet, haiku)
        #[arg(long)]
        model: String,
    },
```

2. Add match arms for the new commands in the main dispatch (find the existing `OrchestrateCommands::Next` and `OrchestrateCommands::Advance` match arms and add after):

```rust
            OrchestrateCommands::SetPolicy {
                feature,
                model_json,
                review_json,
            } => commands::orchestrate::set_policy(&feature, model_json.as_deref(), review_json.as_deref()),
            OrchestrateCommands::SetRoleModel {
                feature,
                role,
                model,
            } => commands::orchestrate::set_role_model(&feature, &role, &model),
```

3. Add the implementation functions in `tina-session/src/commands/orchestrate.rs`. Add at the end of the file (before any `#[cfg(test)]` block if present):

```rust
/// Update model and/or review policy for future work.
pub fn set_policy(
    feature: &str,
    model_json: Option<&str>,
    review_json: Option<&str>,
) -> anyhow::Result<u8> {
    if model_json.is_none() && review_json.is_none() {
        anyhow::bail!("at least one of --model-json or --review-json is required");
    }

    let mut state = tina_session::state::schema::SupervisorState::load(feature)?;

    if let Some(json) = model_json {
        let patch: tina_session::state::schema::ModelPolicy = serde_json::from_str(json)
            .map_err(|e| anyhow::anyhow!("invalid model policy JSON: {}", e))?;
        state.model_policy = patch;
    }

    if let Some(json) = review_json {
        let patch: tina_session::state::schema::ReviewPolicy = serde_json::from_str(json)
            .map_err(|e| anyhow::anyhow!("invalid review policy JSON: {}", e))?;
        state.review_policy = patch;
    }

    state.save()?;

    let output = serde_json::json!({
        "success": true,
        "model_policy": state.model_policy,
        "review_policy": state.review_policy,
    });
    println!("{}", serde_json::to_string(&output)?);
    Ok(0)
}

/// Update the model for a single role.
pub fn set_role_model(feature: &str, role: &str, model: &str) -> anyhow::Result<u8> {
    let valid_roles = ["validator", "planner", "executor", "reviewer"];
    if !valid_roles.contains(&role) {
        anyhow::bail!(
            "invalid role: '{}'. Allowed: {}",
            role,
            valid_roles.join(", ")
        );
    }

    let valid_models = ["opus", "sonnet", "haiku"];
    if !valid_models.contains(&model) {
        anyhow::bail!(
            "invalid model: '{}'. Allowed: {}",
            model,
            valid_models.join(", ")
        );
    }

    let mut state = tina_session::state::schema::SupervisorState::load(feature)?;

    match role {
        "validator" => state.model_policy.validator = model.to_string(),
        "planner" => state.model_policy.planner = model.to_string(),
        "executor" => state.model_policy.executor = model.to_string(),
        "reviewer" => state.model_policy.reviewer = model.to_string(),
        _ => unreachable!(),
    }

    state.save()?;

    let output = serde_json::json!({
        "success": true,
        "role": role,
        "model": model,
        "model_policy": state.model_policy,
    });
    println!("{}", serde_json::to_string(&output)?);
    Ok(0)
}
```

4. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && cargo check --manifest-path tina-session/Cargo.toml`
Expected: Compiles with no errors.

---

## Task 5: Add daemon dispatch for policy action types

**Files:**
- `tina-daemon/src/actions.rs`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Add `model_policy` and `review_policy` fields to the `ActionPayload` struct (after the existing `policy` field, ~line 22):

```rust
    pub model_policy: Option<serde_json::Value>,
    pub review_policy: Option<serde_json::Value>,
    pub role: Option<String>,
    pub model: Option<String>,
```

2. Add match arms for the two policy action types in `build_cli_args` (before the `other => bail!("unknown action type: {}", other)` arm, ~line 302):

```rust
        "orchestration_set_policy" => {
            let mut args = vec![
                "orchestrate".to_string(),
                "set-policy".to_string(),
                "--feature".to_string(),
                feature.to_string(),
            ];
            if let Some(model_policy) = &payload.model_policy {
                args.push("--model-json".to_string());
                args.push(serde_json::to_string(model_policy)?);
            }
            if let Some(review_policy) = &payload.review_policy {
                args.push("--review-json".to_string());
                args.push(serde_json::to_string(review_policy)?);
            }
            Ok(args)
        }
        "orchestration_set_role_model" => {
            let role = payload
                .role
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("orchestration_set_role_model requires 'role' in payload"))?;
            let model = payload
                .model
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("orchestration_set_role_model requires 'model' in payload"))?;
            Ok(vec![
                "orchestrate".to_string(),
                "set-role-model".to_string(),
                "--feature".to_string(),
                feature.to_string(),
                "--role".to_string(),
                role.to_string(),
                "--model".to_string(),
                model.to_string(),
            ])
        }
```

3. Update the `payload` test helper to include the new fields (find the existing `fn payload` helper, ~line 310):

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
            model_policy: None,
            review_policy: None,
            role: None,
            model: None,
        }
    }
```

Also update the `launch_payload` helper similarly (add the four new `None` fields).

4. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && cargo check --manifest-path tina-daemon/Cargo.toml`
Expected: Compiles with no errors.

---

## Task 6: Add daemon tests for policy action dispatch

**Files:**
- `tina-daemon/src/actions.rs`

**Model:** opus

**review:** spec-only

**Depends on:** Task 5

### Steps

1. Add tests for `orchestration_set_policy` CLI arg building in the existing test module:

```rust
    #[test]
    fn test_set_policy_with_model_json() {
        let mut p = payload("auth", None);
        p.model_policy = Some(serde_json::json!({"executor": "haiku", "reviewer": "haiku"}));
        let args = build_cli_args("orchestration_set_policy", &p).unwrap();
        assert_eq!(args[0], "orchestrate");
        assert_eq!(args[1], "set-policy");
        assert_eq!(args[2], "--feature");
        assert_eq!(args[3], "auth");
        assert_eq!(args[4], "--model-json");
        let model_val: serde_json::Value = serde_json::from_str(&args[5]).unwrap();
        assert_eq!(model_val["executor"], "haiku");
    }

    #[test]
    fn test_set_policy_with_review_json() {
        let mut p = payload("auth", None);
        p.review_policy = Some(serde_json::json!({"enforcement": "phase_only"}));
        let args = build_cli_args("orchestration_set_policy", &p).unwrap();
        assert!(args.contains(&"--review-json".to_string()));
    }

    #[test]
    fn test_set_role_model_basic() {
        let mut p = payload("auth", None);
        p.role = Some("executor".to_string());
        p.model = Some("haiku".to_string());
        let args = build_cli_args("orchestration_set_role_model", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "set-role-model",
                "--feature",
                "auth",
                "--role",
                "executor",
                "--model",
                "haiku",
            ]
        );
    }

    #[test]
    fn test_set_role_model_missing_role() {
        let p = payload("auth", None);
        let result = build_cli_args("orchestration_set_role_model", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("role"));
    }

    #[test]
    fn test_set_role_model_missing_model() {
        let mut p = payload("auth", None);
        p.role = Some("executor".to_string());
        let result = build_cli_args("orchestration_set_role_model", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("model"));
    }
```

2. Run the daemon tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && cargo test --manifest-path tina-daemon/Cargo.toml`
Expected: All tests pass.

---

## Task 7: Add getActivePolicy query to Convex

**Files:**
- `convex/controlPlane.ts`

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. Add a `getActivePolicy` query after the existing `getLatestPolicySnapshot` query (~line 354). This query reads the active policy from `supervisorStates.stateJson`, which contains the live `model_policy` and `review_policy` as set by `tina-session`:

```typescript
export const getActivePolicy = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    const orchestration = await ctx.db.get(args.orchestrationId);
    if (!orchestration) return null;

    // Read the live policy from supervisorStates (updated by tina-session save())
    const supervisorState = await ctx.db
      .query("supervisorStates")
      .withIndex("by_feature", (q) => q.eq("featureName", orchestration.featureName))
      .first();

    if (!supervisorState) return null;

    try {
      const state = JSON.parse(supervisorState.stateJson);
      return {
        modelPolicy: state.model_policy ?? null,
        reviewPolicy: state.review_policy ?? null,
        policyRevision: orchestration.policyRevision ?? 0,
        launchSnapshot: orchestration.policySnapshot ?? null,
        presetOrigin: orchestration.presetOrigin ?? null,
      };
    } catch {
      return null;
    }
  },
});
```

2. Verify Convex functions compile:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 8: Add PolicyConfigPanel component to tina-web

**Files:**
- `tina-web/src/components/PolicyConfigPanel.tsx` (new file)

**Model:** opus

**review:** full

**Depends on:** Task 7

### Steps

1. Create `tina-web/src/components/PolicyConfigPanel.tsx`:

```tsx
import { useState, useCallback } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { generateIdempotencyKey } from "@/lib/utils"
import { StatPanel } from "@/components/ui/stat-panel"
import { MonoText } from "@/components/ui/mono-text"

const MODEL_OPTIONS = ["opus", "sonnet", "haiku"] as const
const ROLES = ["validator", "planner", "executor", "reviewer"] as const

interface PolicyConfigPanelProps {
  orchestrationId: string
  nodeId: string
  featureName: string
}

export function PolicyConfigPanel({ orchestrationId, nodeId, featureName }: PolicyConfigPanelProps) {
  const activePolicy = useQuery(api.controlPlane.getActivePolicy, {
    orchestrationId: orchestrationId as Id<"orchestrations">,
  })

  const enqueueAction = useMutation(api.controlPlane.enqueueControlAction)
  const [pendingRole, setPendingRole] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleRoleModelChange = useCallback(
    async (role: string, newModel: string) => {
      if (!activePolicy) return
      setPendingRole(role)
      setError(null)
      setSuccess(null)

      try {
        await enqueueAction({
          orchestrationId: orchestrationId as Id<"orchestrations">,
          nodeId: nodeId as Id<"nodes">,
          actionType: "orchestration_set_role_model",
          payload: JSON.stringify({
            feature: featureName,
            targetRevision: activePolicy.policyRevision,
            role,
            model: newModel,
          }),
          requestedBy: "web-ui",
          idempotencyKey: generateIdempotencyKey(),
        })
        setSuccess(`${role} → ${newModel}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed")
      } finally {
        setPendingRole(null)
      }
    },
    [activePolicy, enqueueAction, orchestrationId, nodeId, featureName],
  )

  if (!activePolicy) {
    return (
      <StatPanel title="Policy">
        <MonoText className="text-[8px] text-muted-foreground">Loading...</MonoText>
      </StatPanel>
    )
  }

  const modelPolicy = activePolicy.modelPolicy ?? {}

  return (
    <StatPanel title="Policy">
      <div className="space-y-2">
        <MonoText className="text-[7px] text-muted-foreground/70 uppercase tracking-wider">
          Applies to future actions only
        </MonoText>

        {error && (
          <div className="text-[7px] text-status-blocked truncate" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="text-[7px] text-emerald-400 truncate" role="status">
            Updated: {success}
          </div>
        )}

        <div className="space-y-1.5">
          {ROLES.map((role) => (
            <div key={role} className="flex items-center justify-between gap-2">
              <MonoText className="text-[8px] text-muted-foreground capitalize w-16">
                {role}
              </MonoText>
              <select
                className="flex-1 text-[8px] bg-muted/45 border border-border/70 rounded px-1.5 py-0.5 text-foreground"
                value={modelPolicy[role] ?? "opus"}
                onChange={(e) => handleRoleModelChange(role, e.target.value)}
                disabled={pendingRole !== null}
                data-testid={`policy-model-${role}`}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {pendingRole && (
          <MonoText className="text-[7px] text-muted-foreground animate-pulse">
            Updating {pendingRole}...
          </MonoText>
        )}

        {activePolicy.presetOrigin && (
          <MonoText className="text-[7px] text-muted-foreground/50">
            Base preset: {activePolicy.presetOrigin}
          </MonoText>
        )}
      </div>
    </StatPanel>
  )
}
```

2. Verify TypeScript compiles:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx tsc --noEmit --project tina-web/tsconfig.json`
Expected: No errors.

---

## Task 9: Add tests for PolicyConfigPanel

**Files:**
- `tina-web/src/components/__tests__/PolicyConfigPanel.test.tsx` (new file)

**Model:** opus

**review:** full

**Depends on:** Task 8

### Steps

1. Create the test file:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PolicyConfigPanel } from "../PolicyConfigPanel"

const mockEnqueue = vi.fn()
const mockUseQuery = vi.fn()

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => mockEnqueue),
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
  }
})

const defaultPolicy = {
  modelPolicy: { validator: "opus", planner: "opus", executor: "opus", reviewer: "opus" },
  reviewPolicy: {},
  policyRevision: 1,
  launchSnapshot: "{}",
  presetOrigin: "balanced",
}

function renderPanel(policyOverride?: Partial<typeof defaultPolicy> | null) {
  if (policyOverride === null) {
    mockUseQuery.mockReturnValue(null)
  } else {
    mockUseQuery.mockReturnValue({ ...defaultPolicy, ...policyOverride })
  }
  return render(
    <PolicyConfigPanel
      orchestrationId="orch1"
      nodeId="node1"
      featureName="test-feature"
    />,
  )
}

describe("PolicyConfigPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading state when policy is null", () => {
    renderPanel(null)
    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("renders all four role selectors", () => {
    renderPanel()
    expect(screen.getByTestId("policy-model-validator")).toBeInTheDocument()
    expect(screen.getByTestId("policy-model-planner")).toBeInTheDocument()
    expect(screen.getByTestId("policy-model-executor")).toBeInTheDocument()
    expect(screen.getByTestId("policy-model-reviewer")).toBeInTheDocument()
  })

  it("shows future-only guard text", () => {
    renderPanel()
    expect(screen.getByText(/applies to future actions only/i)).toBeInTheDocument()
  })

  it("shows preset origin", () => {
    renderPanel({ presetOrigin: "strict" })
    expect(screen.getByText(/strict/)).toBeInTheDocument()
  })

  it("displays current model values in selects", () => {
    renderPanel({
      modelPolicy: { validator: "opus", planner: "opus", executor: "haiku", reviewer: "sonnet" },
    })
    expect(screen.getByTestId("policy-model-executor")).toHaveValue("haiku")
    expect(screen.getByTestId("policy-model-reviewer")).toHaveValue("sonnet")
  })

  it("calls enqueueControlAction on select change", async () => {
    const user = userEvent.setup()
    renderPanel()
    mockEnqueue.mockResolvedValue("action-id")

    await user.selectOptions(screen.getByTestId("policy-model-executor"), "haiku")

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "orchestration_set_role_model",
        requestedBy: "web-ui",
      }),
    )
    const callPayload = JSON.parse(mockEnqueue.mock.calls[0][0].payload)
    expect(callPayload.role).toBe("executor")
    expect(callPayload.model).toBe("haiku")
    expect(callPayload.targetRevision).toBe(1)
  })

  it("shows error on mutation failure", async () => {
    const user = userEvent.setup()
    renderPanel()
    mockEnqueue.mockRejectedValue(new Error("Policy revision conflict"))

    await user.selectOptions(screen.getByTestId("policy-model-executor"), "haiku")

    expect(screen.getByRole("alert")).toHaveTextContent("Policy revision conflict")
  })

  it("shows success message after update", async () => {
    const user = userEvent.setup()
    renderPanel()
    mockEnqueue.mockResolvedValue("action-id")

    await user.selectOptions(screen.getByTestId("policy-model-reviewer"), "sonnet")

    expect(screen.getByRole("status")).toHaveTextContent("reviewer → sonnet")
  })
})
```

2. Run the tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx vitest run tina-web/src/components/__tests__/PolicyConfigPanel.test.tsx`
Expected: All tests pass.

---

## Task 10: Integration test for policy update end-to-end flow

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 3, Task 7

### Steps

1. Add integration tests that verify the full policy reconfiguration flow:

```typescript
describe("controlPlane:policyReconfiguration:integration", () => {
  test("e2e: set_policy creates action log, queue entry, event, and increments revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: '{"feature":"cp-feature","targetRevision":0,"model":{"executor":"haiku"}}',
      requestedBy: "web:operator",
      idempotencyKey: "e2e-policy-001",
    });

    // 1. Control-plane action log
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("orchestration_set_policy");
    expect(actions[0].status).toBe("pending");

    // 2. Queue entry linked back
    const queueAction = await t.run(async (ctx) => {
      return await ctx.db.get(actions[0].queueActionId!);
    });
    expect(queueAction).not.toBeNull();
    expect(queueAction!.controlActionId).toBe(actionId);

    // 3. Audit event
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("orchestration_set_policy");

    // 4. Revision incremented
    const orch = await t.run(async (ctx) => {
      return await ctx.db.get(orchestrationId);
    });
    expect(orch!.policyRevision).toBe(1);
  });

  test("e2e: set_role_model creates action log and increments revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: '{"feature":"cp-feature","targetRevision":0,"role":"executor","model":"haiku"}',
      requestedBy: "web:operator",
      idempotencyKey: "e2e-role-001",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("orchestration_set_role_model");

    const orch = await t.run(async (ctx) => {
      return await ctx.db.get(orchestrationId);
    });
    expect(orch!.policyRevision).toBe(1);
  });

  test("sequential policy updates with correct revisions all succeed", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    // First: set executor to haiku (rev 0 -> 1)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: '{"feature":"cp-feature","targetRevision":0,"role":"executor","model":"haiku"}',
      requestedBy: "web-ui",
      idempotencyKey: "seq-policy-1",
    });

    // Second: set reviewer to sonnet (rev 1 -> 2)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: '{"feature":"cp-feature","targetRevision":1,"role":"reviewer","model":"sonnet"}',
      requestedBy: "web-ui",
      idempotencyKey: "seq-policy-2",
    });

    // Third: full policy set (rev 2 -> 3)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: '{"feature":"cp-feature","targetRevision":2,"model":{"executor":"opus","reviewer":"opus"}}',
      requestedBy: "web-ui",
      idempotencyKey: "seq-policy-3",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(3);

    const orch = await t.run(async (ctx) => {
      return await ctx.db.get(orchestrationId);
    });
    expect(orch!.policyRevision).toBe(3);
  });

  test("concurrent requests with same revision: first wins, second fails", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    // First request succeeds
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: '{"feature":"cp-feature","targetRevision":0,"role":"executor","model":"haiku"}',
      requestedBy: "user-a",
      idempotencyKey: "concurrent-a",
    });

    // Second request with same revision fails
    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_role_model",
        payload: '{"feature":"cp-feature","targetRevision":0,"role":"reviewer","model":"sonnet"}',
        requestedBy: "user-b",
        idempotencyKey: "concurrent-b",
      }),
    ).rejects.toThrow("Policy revision conflict");
  });
});
```

2. Run all Convex tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/controlPlane.test.ts`
Expected: All tests pass.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 800 |

---

## Phase Estimates

| Task | Estimated Minutes | Description |
|------|-------------------|-------------|
| Task 1 | 4 | Add policyRevision to schema + regenerate contracts |
| Task 2 | 5 | Policy payload validation + revision checking |
| Task 3 | 5 | Convex tests for policy validation |
| Task 4 | 5 | tina-session set-policy and set-role-model commands |
| Task 5 | 4 | Daemon dispatch for policy action types |
| Task 6 | 4 | Daemon tests for policy dispatch |
| Task 7 | 3 | Convex getActivePolicy query |
| Task 8 | 5 | Web PolicyConfigPanel component |
| Task 9 | 5 | Web PolicyConfigPanel tests |
| Task 10 | 5 | Integration tests for policy update flow |
| **Total** | **45** | |

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
