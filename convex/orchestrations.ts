import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { deduplicateTaskEvents, loadTaskEventsForOrchestration } from "./tasks";
import { deleteOrchestrationAssociationsStep } from "./deleteHelpers";

function normalizeLegacyOrchestration<
  T extends {
    specDocPath?: string;
    designDocPath?: string;
    specOnly?: boolean;
    designOnly?: boolean;
  },
>(orchestration: T): Omit<T, "designDocPath" | "designOnly"> & {
  specDocPath: string;
  specOnly?: boolean;
} {
  const specDocPath = orchestration.specDocPath ?? orchestration.designDocPath ?? "";
  const specOnly = orchestration.specOnly ?? orchestration.designOnly;
  const { designDocPath: _legacyDesignDocPath, designOnly: _legacyDesignOnly, ...rest } =
    orchestration;

  if (specOnly === undefined) {
    return {
      ...rest,
      specDocPath,
    };
  }

  return {
    ...rest,
    specDocPath,
    specOnly,
  };
}

function isOrchestratorControlTask(subject: string) {
  const normalized = subject.trim().toLowerCase();
  return (
    normalized === "validate-design" ||
    normalized === "finalize" ||
    normalized.startsWith("plan-phase-") ||
    normalized.startsWith("execute-phase-") ||
    normalized.startsWith("review-phase-")
  );
}

export const upsertOrchestration = mutation({
  args: {
    nodeId: v.id("nodes"),
    projectId: v.optional(v.id("projects")),
    specId: v.optional(v.id("specs")),
    featureName: v.string(),
    specDocPath: v.string(),
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
        specDocPath: args.specDocPath,
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
      if (args.specId !== undefined) {
        patch.specId = args.specId;
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
          ...normalizeLegacyOrchestration(orch),
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
          ...normalizeLegacyOrchestration(orch),
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

    return normalizeLegacyOrchestration(orchestrations[0]);
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

    const allTaskEvents = await loadTaskEventsForOrchestration(
      ctx,
      args.orchestrationId,
    );

    const deduplicated = deduplicateTaskEvents(allTaskEvents);

    const orchestratorTasks = deduplicated.filter(
      (t) => !t.phaseNumber || isOrchestratorControlTask(t.subject),
    );
    const phaseTasks: Record<string, typeof deduplicated> = {};
    for (const task of deduplicated) {
      if (task.phaseNumber && !isOrchestratorControlTask(task.subject)) {
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
      ...normalizeLegacyOrchestration(orchestration),
      nodeName: node?.name ?? "unknown",
      phases,
      tasks: deduplicated,
      orchestratorTasks,
      phaseTasks,
      teamMembers,
    };
  },
});

export const deleteOrchestration = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    const orchestration = await ctx.db.get(args.orchestrationId);
    if (!orchestration) {
      return {
        done: true,
        deleted: false,
        deletedOrchestrationId: args.orchestrationId,
      };
    }

    const stepResult = await deleteOrchestrationAssociationsStep(
      ctx,
      args.orchestrationId,
      orchestration.featureName,
    );

    if (!stepResult.done) {
      return { done: false };
    }

    await ctx.db.delete(args.orchestrationId);
    return {
      done: true,
      deleted: true,
      deletedOrchestrationId: args.orchestrationId,
    };
  },
});
