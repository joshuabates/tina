import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { validateDesignForLaunch } from "./designValidation";
import { policySnapshotValidator, hashPolicy } from "./policyPresets";
import type { PolicySnapshot } from "./policyPresets";
import { HEARTBEAT_TIMEOUT_MS } from "./nodes";

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

interface InsertControlActionParams {
  orchestrationId: Id<"orchestrations">;
  nodeId: Id<"nodes">;
  actionType: string;
  payload: string;
  requestedBy: string;
  idempotencyKey: string;
}

function parseJsonWithFeature(
  rawPayload: string,
  actionType: string,
): Record<string, unknown> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new Error("Invalid payload: must be valid JSON");
  }

  if (typeof parsed.feature !== "string" || !parsed.feature) {
    throw new Error(`Payload for "${actionType}" requires "feature" (string)`);
  }

  return parsed;
}

function validateRuntimePayload(actionType: string, rawPayload: string): void {
  const parsed = parseJsonWithFeature(rawPayload, actionType);

  const needsPhase = ["pause", "retry"];
  if (needsPhase.includes(actionType)) {
    if (typeof parsed.phase !== "string" || !parsed.phase) {
      throw new Error(`Payload for "${actionType}" requires "phase" (string)`);
    }
  }
}

const ALLOWED_MODELS = [
  "opus",
  "sonnet",
  "haiku",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
] as const;
const ALLOWED_ROLES = ["validator", "planner", "executor", "reviewer"] as const;

function validateModelName(model: unknown): asserts model is string {
  if (typeof model !== "string" || !(ALLOWED_MODELS as readonly string[]).includes(model)) {
    throw new Error(`Invalid model: "${model}". Allowed: ${ALLOWED_MODELS.join(", ")}`);
  }
}

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

function parseBasePayload(rawPayload: string, actionType: string): Record<string, unknown> {
  const parsed = parseJsonWithFeature(rawPayload, actionType);

  if (typeof parsed.targetRevision !== "number") {
    throw new Error(`Payload for "${actionType}" requires "targetRevision" (number)`);
  }

  return parsed;
}

function validatePolicyPayload(rawPayload: string): PolicyPayload {
  const parsed = parseBasePayload(rawPayload, "orchestration_set_policy");

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
  const parsed = parseBasePayload(rawPayload, "orchestration_set_role_model");

  if (typeof parsed.role !== "string" || !(ALLOWED_ROLES as readonly string[]).includes(parsed.role)) {
    throw new Error(`Invalid role: "${parsed.role}". Allowed: ${ALLOWED_ROLES.join(", ")}`);
  }
  validateModelName(parsed.model);

  return parsed as unknown as RoleModelPayload;
}

interface TaskEditPayload {
  feature: string;
  phaseNumber: string;
  taskNumber: number;
  revision: number;
  subject?: string;
  description?: string;
  model?: string;
}

interface TaskInsertPayload {
  feature: string;
  phaseNumber: string;
  afterTask: number;
  subject: string;
  description?: string;
  model?: string;
  dependsOn?: number[];
}

interface TaskSetModelPayload {
  feature: string;
  phaseNumber: string;
  taskNumber: number;
  revision: number;
  model: string;
}

function validateTaskEditPayload(rawPayload: string): TaskEditPayload {
  const parsed = parseJsonWithFeature(rawPayload, "task_edit");

  if (typeof parsed.phaseNumber !== "string" || !parsed.phaseNumber) {
    throw new Error('Payload for "task_edit" requires "phaseNumber" (string)');
  }
  if (typeof parsed.taskNumber !== "number") {
    throw new Error('Payload for "task_edit" requires "taskNumber" (number)');
  }
  if (typeof parsed.revision !== "number") {
    throw new Error('Payload for "task_edit" requires "revision" (number)');
  }

  const hasSubject = typeof parsed.subject === "string";
  const hasDescription = typeof parsed.description === "string";
  const hasModel = typeof parsed.model === "string";
  if (!hasSubject && !hasDescription && !hasModel) {
    throw new Error(
      'Payload for "task_edit" requires at least one edit field: "subject", "description", or "model"',
    );
  }

  if (hasModel) {
    validateModelName(parsed.model);
  }

  return parsed as unknown as TaskEditPayload;
}

function validateTaskInsertPayload(rawPayload: string): TaskInsertPayload {
  const parsed = parseJsonWithFeature(rawPayload, "task_insert");

  if (typeof parsed.phaseNumber !== "string" || !parsed.phaseNumber) {
    throw new Error(
      'Payload for "task_insert" requires "phaseNumber" (string)',
    );
  }
  if (typeof parsed.afterTask !== "number") {
    throw new Error('Payload for "task_insert" requires "afterTask" (number)');
  }
  if (typeof parsed.subject !== "string" || !parsed.subject) {
    throw new Error('Payload for "task_insert" requires "subject" (string)');
  }
  if (parsed.model !== undefined) {
    validateModelName(parsed.model);
  }
  if (parsed.dependsOn !== undefined && !Array.isArray(parsed.dependsOn)) {
    throw new Error(
      'Payload for "task_insert" requires "dependsOn" to be an array',
    );
  }

  return parsed as unknown as TaskInsertPayload;
}

function validateTaskSetModelPayload(rawPayload: string): TaskSetModelPayload {
  const parsed = parseJsonWithFeature(rawPayload, "task_set_model");

  if (typeof parsed.phaseNumber !== "string" || !parsed.phaseNumber) {
    throw new Error(
      'Payload for "task_set_model" requires "phaseNumber" (string)',
    );
  }
  if (typeof parsed.taskNumber !== "number") {
    throw new Error(
      'Payload for "task_set_model" requires "taskNumber" (number)',
    );
  }
  if (typeof parsed.revision !== "number") {
    throw new Error(
      'Payload for "task_set_model" requires "revision" (number)',
    );
  }
  validateModelName(parsed.model);

  return parsed as unknown as TaskSetModelPayload;
}

async function checkAndIncrementRevision(
  ctx: MutationCtx,
  orchestrationId: Id<"orchestrations">,
  targetRevision: number,
): Promise<void> {
  const orch = await ctx.db.get(orchestrationId);
  if (!orch) throw new Error("Orchestration not found");
  const currentRevision = orch.policyRevision ?? 0;
  if (targetRevision !== currentRevision) {
    throw new Error(
      `Policy revision conflict: expected ${targetRevision}, current is ${currentRevision}. Reload and retry.`,
    );
  }
  await ctx.db.patch(orchestrationId, { policyRevision: currentRevision + 1 });
}

async function lookupPendingTaskWithRevision(
  ctx: MutationCtx,
  orchestrationId: Id<"orchestrations">,
  phaseNumber: string,
  taskNumber: number,
  revision: number,
) {
  const task = await ctx.db
    .query("executionTasks")
    .withIndex("by_orchestration_phase_task", (q) =>
      q
        .eq("orchestrationId", orchestrationId)
        .eq("phaseNumber", phaseNumber)
        .eq("taskNumber", taskNumber),
    )
    .first();
  if (!task) {
    throw new Error(
      `Task ${taskNumber} not found in phase ${phaseNumber}`,
    );
  }
  if (task.status !== "pending") {
    throw new Error(
      `Cannot modify task ${taskNumber}: status is "${task.status}" (must be "pending")`,
    );
  }
  if (task.revision !== revision) {
    throw new Error(
      `Task revision conflict: expected ${revision}, current is ${task.revision}. Reload and retry.`,
    );
  }
  return task;
}

async function insertControlActionWithQueue(
  ctx: MutationCtx,
  params: InsertControlActionParams,
): Promise<Id<"controlPlaneActions">> {
  const existing = await ctx.db
    .query("controlPlaneActions")
    .withIndex("by_idempotency", (q) =>
      q.eq("idempotencyKey", params.idempotencyKey),
    )
    .first();
  if (existing) {
    return existing._id;
  }

  const now = Date.now();

  const actionId = await ctx.db.insert("controlPlaneActions", {
    orchestrationId: params.orchestrationId,
    actionType: params.actionType,
    payload: params.payload,
    requestedBy: params.requestedBy,
    idempotencyKey: params.idempotencyKey,
    status: "pending",
    createdAt: now,
  });

  const queueActionId = await ctx.db.insert("inboundActions", {
    nodeId: params.nodeId,
    orchestrationId: params.orchestrationId,
    type: params.actionType,
    payload: params.payload,
    status: "pending",
    createdAt: now,
    controlActionId: actionId,
    idempotencyKey: params.idempotencyKey,
  });

  await ctx.db.patch(actionId, { queueActionId });

  return actionId;
}

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
    // Only set policy snapshot if not already set (immutable once written)
    const existing = await ctx.db.get(args.orchestrationId);
    if (!existing) {
      throw new Error("Orchestration not found");
    }

    if (!existing.policySnapshot) {
      const patchFields: {
        policySnapshot: string;
        policySnapshotHash: string;
        updatedAt: string;
        presetOrigin?: string;
        designOnly?: boolean;
      } = {
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
    }

    const payload = JSON.stringify({
      policySnapshotHash: args.policySnapshotHash,
      presetOrigin: args.presetOrigin,
      designOnly: args.designOnly,
    });

    return insertControlActionWithQueue(ctx, {
      orchestrationId: args.orchestrationId,
      nodeId: args.nodeId,
      actionType: "start_orchestration",
      payload,
      requestedBy: args.requestedBy,
      idempotencyKey: args.idempotencyKey,
    });
  },
});

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
    if (
      !(RUNTIME_ACTION_TYPES as readonly string[]).includes(args.actionType)
    ) {
      throw new Error(
        `Invalid actionType: "${args.actionType}". Allowed: ${RUNTIME_ACTION_TYPES.join(", ")}`,
      );
    }

    // Validate payload structure per action type
    if (["pause", "resume", "retry"].includes(args.actionType)) {
      validateRuntimePayload(args.actionType, args.payload);
    } else if (args.actionType === "orchestration_set_policy") {
      const policyPayload = validatePolicyPayload(args.payload);
      await checkAndIncrementRevision(ctx, args.orchestrationId, policyPayload.targetRevision);
    } else if (args.actionType === "orchestration_set_role_model") {
      const rolePayload = validateRoleModelPayload(args.payload);
      await checkAndIncrementRevision(ctx, args.orchestrationId, rolePayload.targetRevision);
    } else if (args.actionType === "task_edit") {
      const payload = validateTaskEditPayload(args.payload);
      const task = await lookupPendingTaskWithRevision(
        ctx, args.orchestrationId, payload.phaseNumber, payload.taskNumber, payload.revision,
      );
      const patch: Record<string, unknown> = {
        revision: task.revision + 1,
        updatedAt: Date.now(),
      };
      if (payload.subject !== undefined) patch.subject = payload.subject;
      if (payload.description !== undefined)
        patch.description = payload.description;
      if (payload.model !== undefined) patch.model = payload.model;
      await ctx.db.patch(task._id, patch);
    } else if (args.actionType === "task_insert") {
      const payload = validateTaskInsertPayload(args.payload);
      if (payload.afterTask > 0) {
        const afterTask = await ctx.db
          .query("executionTasks")
          .withIndex("by_orchestration_phase_task", (q) =>
            q
              .eq("orchestrationId", args.orchestrationId)
              .eq("phaseNumber", payload.phaseNumber)
              .eq("taskNumber", payload.afterTask),
          )
          .first();
        if (!afterTask) {
          throw new Error(
            `afterTask ${payload.afterTask} not found in phase ${payload.phaseNumber}`,
          );
        }
      }
      if (payload.dependsOn) {
        for (const dep of payload.dependsOn) {
          const depTask = await ctx.db
            .query("executionTasks")
            .withIndex("by_orchestration_phase_task", (q) =>
              q
                .eq("orchestrationId", args.orchestrationId)
                .eq("phaseNumber", payload.phaseNumber)
                .eq("taskNumber", dep),
            )
            .first();
          if (!depTask) {
            throw new Error(
              `Dependency task ${dep} not found in phase ${payload.phaseNumber}`,
            );
          }
        }
      }
      const allTasks = await ctx.db
        .query("executionTasks")
        .withIndex("by_orchestration_phase", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("phaseNumber", payload.phaseNumber),
        )
        .collect();
      const maxTaskNumber = allTasks.reduce(
        (max, t) => Math.max(max, t.taskNumber),
        0,
      );
      const newTaskNumber = maxTaskNumber + 1;
      const now = Date.now();
      await ctx.db.insert("executionTasks", {
        orchestrationId: args.orchestrationId,
        phaseNumber: payload.phaseNumber,
        taskNumber: newTaskNumber,
        subject: payload.subject,
        description: payload.description,
        status: "pending",
        model: payload.model,
        dependsOn: payload.dependsOn,
        revision: 1,
        insertedBy: args.requestedBy,
        createdAt: now,
        updatedAt: now,
      });
    } else if (args.actionType === "task_set_model") {
      const payload = validateTaskSetModelPayload(args.payload);
      const task = await lookupPendingTaskWithRevision(
        ctx, args.orchestrationId, payload.phaseNumber, payload.taskNumber, payload.revision,
      );
      await ctx.db.patch(task._id, {
        model: payload.model,
        revision: task.revision + 1,
        updatedAt: Date.now(),
      });
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
});

export const listControlActions = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_orchestration_created", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .order("desc")
      .take(limit);
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
    if (!orchestration.policySnapshot) {
      return null;
    }
    return {
      policySnapshot: orchestration.policySnapshot,
      policySnapshotHash: orchestration.policySnapshotHash ?? null,
      presetOrigin: orchestration.presetOrigin ?? null,
    };
  },
});

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
      .order("desc")
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
