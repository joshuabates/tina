import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { resolvePolicy, hashPolicy } from "./policyPresets";
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
    let overrides;
    if (args.policyOverrides) {
      try {
        overrides = JSON.parse(args.policyOverrides);
      } catch {
        throw new Error("Invalid policyOverrides: must be valid JSON");
      }
    }
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

    return insertControlActionWithQueue(ctx, {
      orchestrationId: args.orchestrationId,
      nodeId: args.nodeId,
      actionType: args.actionType,
      payload: args.payload,
      requestedBy: args.requestedBy,
      idempotencyKey: args.idempotencyKey,
    });
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
