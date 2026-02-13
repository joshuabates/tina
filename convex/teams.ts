import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const registerTeam = mutation({
  args: {
    teamName: v.string(),
    orchestrationId: v.id("orchestrations"),
    leadSessionId: v.string(),
    localDirName: v.string(),
    tmuxSessionName: v.optional(v.string()),
    phaseNumber: v.optional(v.string()),
    parentTeamId: v.optional(v.id("teams")),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.localDirName.trim().length === 0) {
      throw new Error("localDirName must be non-empty");
    }

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
      const patch: Record<string, unknown> = {
        leadSessionId: args.leadSessionId,
        localDirName: args.localDirName,
        phaseNumber: args.phaseNumber,
        createdAt: args.createdAt,
      };
      if (args.tmuxSessionName !== undefined) {
        patch.tmuxSessionName = args.tmuxSessionName;
      }
      if (args.parentTeamId !== undefined) {
        patch.parentTeamId = args.parentTeamId;
      }
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("teams", {
      ...args,
    });
  },
});

export const listActiveTeams = query({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").collect();

    const results = await Promise.all(
      teams.map(async (team) => {
        const orchestration = await ctx.db.get(team.orchestrationId);
        if (!orchestration) return null;

        // Keep blocked orchestrations in sync so post-failure team/task state
        // is still visible in tina-web.
        const isActive = orchestration.status !== "complete";
        if (!isActive) return null;

        return {
          ...team,
          orchestrationStatus: orchestration.status,
          featureName: orchestration.featureName,
        };
      }),
    );

    return results.filter((r) => r !== null);
  },
});

export const listByParent = query({
  args: {
    parentTeamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("teams")
      .withIndex("by_parent", (q) => q.eq("parentTeamId", args.parentTeamId))
      .collect();
  },
});

export const listAllTeams = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("teams").collect();
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
