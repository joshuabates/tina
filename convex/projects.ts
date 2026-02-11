import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

async function deleteRowsByOrchestrationId(
  ctx: MutationCtx,
  table:
    | "phases"
    | "taskEvents"
    | "orchestrationEvents"
    | "teamMembers"
    | "teams"
    | "inboundActions"
    | "commits"
    | "plans",
  orchestrationId: Id<"orchestrations">,
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_orchestration", (q) => q.eq("orchestrationId", orchestrationId))
    .collect();

  for (const row of rows) {
    await ctx.db.delete(row._id);
  }

  return rows.length;
}

async function deleteSupervisorStateByFeatureName(
  ctx: MutationCtx,
  featureName: string,
) {
  const states = await ctx.db
    .query("supervisorStates")
    .withIndex("by_feature", (q) => q.eq("featureName", featureName))
    .collect();

  for (const state of states) {
    await ctx.db.delete(state._id);
  }

  return states.length;
}

async function deleteEntitiesWithComments(
  ctx: MutationCtx,
  table: "designs" | "tickets",
  targetType: "design" | "ticket",
  projectId: Id<"projects">,
) {
  const entities = await ctx.db
    .query(table)
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();

  for (const entity of entities) {
    const comments = await ctx.db
      .query("workComments")
      .withIndex("by_target", (q) =>
        q.eq("targetType", targetType).eq("targetId", entity._id),
      )
      .collect();
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }
    await ctx.db.delete(entity._id);
  }
}

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();

    const results = await Promise.all(
      projects.map(async (project) => {
        const orchestrations = await ctx.db
          .query("orchestrations")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();

        const latest = orchestrations.sort((a, b) =>
          a.startedAt > b.startedAt ? -1 : 1,
        )[0];

        return {
          ...project,
          orchestrationCount: orchestrations.length,
          latestFeature: latest?.featureName ?? null,
          latestStatus: latest?.status ?? null,
        };
      }),
    );

    return results.sort((a, b) => (a.name < b.name ? -1 : 1));
  },
});

export const createProject = mutation({
  args: {
    name: v.string(),
    repoPath: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("projects", {
      name: args.name,
      repoPath: args.repoPath,
      createdAt: now,
    });
  },
});

export const findOrCreateByRepoPath = mutation({
  args: {
    name: v.string(),
    repoPath: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_repo_path", (q) => q.eq("repoPath", args.repoPath))
      .first();

    if (existing) {
      return existing._id;
    }

    const now = new Date().toISOString();
    return await ctx.db.insert("projects", {
      name: args.name,
      repoPath: args.repoPath,
      createdAt: now,
    });
  },
});

export const deleteProject = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return {
        deleted: false,
        deletedProjectId: args.projectId,
        deletedOrchestrations: 0,
      };
    }

    const orchestrations = await ctx.db
      .query("orchestrations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const orchestration of orchestrations) {
      await deleteRowsByOrchestrationId(ctx, "inboundActions", orchestration._id);
      await deleteRowsByOrchestrationId(
        ctx,
        "orchestrationEvents",
        orchestration._id,
      );
      await deleteRowsByOrchestrationId(ctx, "taskEvents", orchestration._id);
      await deleteRowsByOrchestrationId(ctx, "teamMembers", orchestration._id);
      await deleteRowsByOrchestrationId(ctx, "teams", orchestration._id);
      await deleteRowsByOrchestrationId(ctx, "phases", orchestration._id);
      await deleteSupervisorStateByFeatureName(ctx, orchestration.featureName);
      await deleteRowsByOrchestrationId(ctx, "commits", orchestration._id);
      await deleteRowsByOrchestrationId(ctx, "plans", orchestration._id);
      await ctx.db.delete(orchestration._id);
    }

    // Delete project-scoped PM entities
    await deleteEntitiesWithComments(ctx, "designs", "design", args.projectId);
    await deleteEntitiesWithComments(ctx, "tickets", "ticket", args.projectId);

    // Delete project counters
    const counters = await ctx.db
      .query("projectCounters")
      .withIndex("by_project_type", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const counter of counters) {
      await ctx.db.delete(counter._id);
    }

    await ctx.db.delete(args.projectId);

    return {
      deleted: true,
      deletedProjectId: args.projectId,
      deletedOrchestrations: orchestrations.length,
    };
  },
});
