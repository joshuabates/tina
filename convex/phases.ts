import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const upsertPhase = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    status: v.string(),
    planPath: v.optional(v.string()),
    gitRange: v.optional(v.string()),
    planningMins: v.optional(v.number()),
    executionMins: v.optional(v.number()),
    reviewMins: v.optional(v.number()),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("phases")
      .withIndex("by_orchestration_phase", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("phaseNumber", args.phaseNumber),
      )
      .first();

    if (existing) {
      // COALESCE-like: only overwrite with non-undefined values
      const patch: Record<string, unknown> = { status: args.status };
      if (args.planPath !== undefined) patch.planPath = args.planPath;
      if (args.gitRange !== undefined) patch.gitRange = args.gitRange;
      if (args.planningMins !== undefined) patch.planningMins = args.planningMins;
      if (args.executionMins !== undefined)
        patch.executionMins = args.executionMins;
      if (args.reviewMins !== undefined) patch.reviewMins = args.reviewMins;
      if (args.startedAt !== undefined) patch.startedAt = args.startedAt;
      if (args.completedAt !== undefined) patch.completedAt = args.completedAt;

      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("phases", args);
  },
});
