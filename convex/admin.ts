import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "inboundActions",
      "orchestrationEvents",
      "taskEvents",
      "teamMembers",
      "teams",
      "phases",
      "supervisorStates",
      "orchestrations",
      "nodes",
      "projects",
    ] as const;

    const counts: Record<string, number> = {};

    for (const table of tables) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
      counts[table] = rows.length;
    }

    return counts;
  },
});

export const getTeamHierarchy = query({
  args: { orchestrationId: v.id("orchestrations") },
  handler: async (ctx, args) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      )
      .collect();
    return teams;
  },
});
