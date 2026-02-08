import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const registerTeam = mutation({
  args: {
    teamName: v.string(),
    orchestrationId: v.id("orchestrations"),
    leadSessionId: v.string(),
    phaseNumber: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("teams")
      .withIndex("by_team_name", (q) => q.eq("teamName", args.teamName))
      .first();

    if (existing) {
      if (existing.orchestrationId !== args.orchestrationId) {
        throw new Error(
          `Team "${args.teamName}" already registered to a different orchestration`,
        );
      }
      await ctx.db.patch(existing._id, {
        leadSessionId: args.leadSessionId,
        phaseNumber: args.phaseNumber,
        createdAt: args.createdAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("teams", args);
  },
});

export const getByTeamName = query({
  args: {
    teamName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("teams")
      .withIndex("by_team_name", (q) => q.eq("teamName", args.teamName))
      .first();
  },
});
