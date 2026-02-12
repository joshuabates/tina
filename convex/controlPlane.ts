import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

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
    // Patch orchestration with policy metadata
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
