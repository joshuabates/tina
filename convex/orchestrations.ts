import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { deduplicateTaskEvents } from "./tasks";

export const upsertOrchestration = mutation({
  args: {
    nodeId: v.id("nodes"),
    projectId: v.optional(v.id("projects")),
    featureName: v.string(),
    designDocPath: v.string(),
    branch: v.string(),
    worktreePath: v.optional(v.string()),
    totalPhases: v.number(),
    currentPhase: v.number(),
    status: v.string(),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    totalElapsedMins: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orchestrations")
      .withIndex("by_feature", (q) => q.eq("featureName", args.featureName))
      .filter((q) => q.eq(q.field("nodeId"), args.nodeId))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        designDocPath: args.designDocPath,
        branch: args.branch,
        worktreePath: args.worktreePath,
        totalPhases: args.totalPhases,
        currentPhase: args.currentPhase,
        status: args.status,
        startedAt: args.startedAt,
        completedAt: args.completedAt,
        totalElapsedMins: args.totalElapsedMins,
      };
      if (args.projectId !== undefined) {
        patch.projectId = args.projectId;
      }
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("orchestrations", args);
  },
});

export const listOrchestrations = query({
  args: {},
  handler: async (ctx) => {
    const orchestrations = await ctx.db.query("orchestrations").collect();

    const results = await Promise.all(
      orchestrations.map(async (orch) => {
        const node = await ctx.db.get(orch.nodeId);
        return {
          ...orch,
          nodeName: node?.name ?? "unknown",
        };
      }),
    );

    return results.sort((a, b) => {
      if (a.startedAt > b.startedAt) return -1;
      if (a.startedAt < b.startedAt) return 1;
      return 0;
    });
  },
});

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const orchestrations = await ctx.db
      .query("orchestrations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const results = await Promise.all(
      orchestrations.map(async (orch) => {
        const node = await ctx.db.get(orch.nodeId);
        return {
          ...orch,
          nodeName: node?.name ?? "unknown",
        };
      }),
    );

    return results.sort((a, b) => {
      if (a.startedAt > b.startedAt) return -1;
      if (a.startedAt < b.startedAt) return 1;
      return 0;
    });
  },
});

export const getByFeature = query({
  args: {
    featureName: v.string(),
  },
  handler: async (ctx, args) => {
    const orchestrations = await ctx.db
      .query("orchestrations")
      .withIndex("by_feature", (q) => q.eq("featureName", args.featureName))
      .collect();

    if (orchestrations.length === 0) {
      return null;
    }

    // Return the latest by startedAt
    orchestrations.sort((a, b) => {
      if (a.startedAt > b.startedAt) return -1;
      if (a.startedAt < b.startedAt) return 1;
      return 0;
    });

    return orchestrations[0];
  },
});

export const getOrchestrationDetail = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    const orchestration = await ctx.db.get(args.orchestrationId);
    if (!orchestration) {
      return null;
    }

    const phases = await ctx.db
      .query("phases")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();

    const allTaskEvents = await ctx.db
      .query("taskEvents")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();

    const deduplicated = deduplicateTaskEvents(allTaskEvents);

    const orchestratorTasks = deduplicated.filter((t) => !t.phaseNumber);
    const phaseTasks: Record<string, typeof deduplicated> = {};
    for (const task of deduplicated) {
      if (task.phaseNumber) {
        if (!phaseTasks[task.phaseNumber]) phaseTasks[task.phaseNumber] = [];
        phaseTasks[task.phaseNumber].push(task);
      }
    }

    const teamMembers = await ctx.db
      .query("teamMembers")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();

    const node = await ctx.db.get(orchestration.nodeId);

    return {
      ...orchestration,
      nodeName: node?.name ?? "unknown",
      phases,
      tasks: deduplicated,
      orchestratorTasks,
      phaseTasks,
      teamMembers,
    };
  },
});
