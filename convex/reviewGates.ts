import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertGate = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    gateId: v.union(
      v.literal("plan"),
      v.literal("review"),
      v.literal("finalize"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("blocked"),
      v.literal("approved"),
    ),
    owner: v.string(),
    decidedBy: v.optional(v.string()),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const orchestration = await ctx.db.get(args.orchestrationId);
    if (!orchestration) {
      throw new Error(`Orchestration not found: ${args.orchestrationId}`);
    }

    const existing = await ctx.db
      .query("reviewGates")
      .withIndex("by_orchestration_gate", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("gateId", args.gateId),
      )
      .first();

    const now = new Date().toISOString();
    const decidedAt =
      args.status === "approved" || args.status === "blocked" ? now : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        owner: args.owner,
        decidedBy: args.decidedBy,
        decidedAt,
        summary: args.summary,
      });
      return existing._id;
    }

    return await ctx.db.insert("reviewGates", {
      orchestrationId: args.orchestrationId,
      gateId: args.gateId,
      status: args.status,
      owner: args.owner,
      decidedBy: args.decidedBy,
      decidedAt,
      summary: args.summary,
    });
  },
});

export const getGate = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    gateId: v.union(
      v.literal("plan"),
      v.literal("review"),
      v.literal("finalize"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewGates")
      .withIndex("by_orchestration_gate", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("gateId", args.gateId),
      )
      .first();
  },
});

export const listGatesByOrchestration = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewGates")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();
  },
});
