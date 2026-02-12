import { query, mutation } from "./_generated/server";
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
