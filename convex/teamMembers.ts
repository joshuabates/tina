import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const upsertTeamMember = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    agentName: v.string(),
    agentType: v.optional(v.string()),
    model: v.optional(v.string()),
    joinedAt: v.optional(v.string()),
    recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("teamMembers")
      .withIndex("by_orchestration_phase_agent", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("phaseNumber", args.phaseNumber)
          .eq("agentName", args.agentName),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        agentType: args.agentType ?? existing.agentType,
        model: args.model ?? existing.model,
        joinedAt: args.joinedAt ?? existing.joinedAt,
        recordedAt: args.recordedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("teamMembers", args);
  },
});
