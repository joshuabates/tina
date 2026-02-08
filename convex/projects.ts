import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
