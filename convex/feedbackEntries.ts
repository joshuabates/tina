import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  loadTaskEventsForOrchestration,
  deduplicateTaskEvents,
} from "./tasks";

export const createFeedbackEntry = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    targetType: v.union(v.literal("task"), v.literal("commit")),
    targetTaskId: v.optional(v.string()),
    targetCommitSha: v.optional(v.string()),
    entryType: v.union(
      v.literal("comment"),
      v.literal("suggestion"),
      v.literal("ask_for_change"),
    ),
    body: v.string(),
    authorType: v.union(v.literal("human"), v.literal("agent")),
    authorName: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.targetType === "task") {
      if (!args.targetTaskId) {
        throw new Error(
          "targetTaskId is required when targetType is 'task'",
        );
      }
      if (args.targetCommitSha !== undefined) {
        throw new Error(
          "targetCommitSha must not be set when targetType is 'task'",
        );
      }
      const events = await loadTaskEventsForOrchestration(
        ctx,
        args.orchestrationId,
      );
      const tasks = deduplicateTaskEvents(events);
      const taskExists = tasks.some((t) => t.taskId === args.targetTaskId);
      if (!taskExists) {
        throw new Error(`Task not found: ${args.targetTaskId}`);
      }
    } else {
      if (!args.targetCommitSha) {
        throw new Error(
          "targetCommitSha is required when targetType is 'commit'",
        );
      }
      if (args.targetTaskId !== undefined) {
        throw new Error(
          "targetTaskId must not be set when targetType is 'commit'",
        );
      }
      const commit = await ctx.db
        .query("commits")
        .withIndex("by_sha", (q) => q.eq("sha", args.targetCommitSha!))
        .first();
      if (!commit) {
        throw new Error(`Commit not found: ${args.targetCommitSha}`);
      }
      if (commit.orchestrationId !== args.orchestrationId) {
        throw new Error(
          `Orchestration mismatch: commit belongs to ${commit.orchestrationId}, got ${args.orchestrationId}`,
        );
      }
    }

    const now = new Date().toISOString();
    return await ctx.db.insert("feedbackEntries", {
      orchestrationId: args.orchestrationId,
      targetType: args.targetType,
      targetTaskId: args.targetTaskId,
      targetCommitSha: args.targetCommitSha,
      entryType: args.entryType,
      body: args.body,
      authorType: args.authorType,
      authorName: args.authorName,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const resolveFeedbackEntry = mutation({
  args: {
    entryId: v.id("feedbackEntries"),
    resolvedBy: v.string(),
    expectedUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      throw new Error(`Feedback entry not found: ${args.entryId}`);
    }
    if (entry.status === "resolved") {
      throw new Error("Feedback entry is already resolved");
    }
    if (
      args.expectedUpdatedAt !== undefined &&
      entry.updatedAt !== args.expectedUpdatedAt
    ) {
      throw new Error(
        `Stale update: expected updatedAt ${args.expectedUpdatedAt}, got ${entry.updatedAt}`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.entryId, {
      status: "resolved",
      resolvedBy: args.resolvedBy,
      resolvedAt: now,
      updatedAt: now,
    });
  },
});

export const reopenFeedbackEntry = mutation({
  args: {
    entryId: v.id("feedbackEntries"),
    expectedUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      throw new Error(`Feedback entry not found: ${args.entryId}`);
    }
    if (entry.status === "open") {
      throw new Error("Feedback entry is already open");
    }
    if (
      args.expectedUpdatedAt !== undefined &&
      entry.updatedAt !== args.expectedUpdatedAt
    ) {
      throw new Error(
        `Stale update: expected updatedAt ${args.expectedUpdatedAt}, got ${entry.updatedAt}`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.entryId, {
      status: "open",
      resolvedBy: undefined,
      resolvedAt: undefined,
      updatedAt: now,
    });
  },
});

export const listFeedbackEntriesByOrchestration = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    targetType: v.optional(v.union(v.literal("task"), v.literal("commit"))),
    entryType: v.optional(
      v.union(
        v.literal("comment"),
        v.literal("suggestion"),
        v.literal("ask_for_change"),
      ),
    ),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
    authorType: v.optional(v.union(v.literal("human"), v.literal("agent"))),
  },
  handler: async (ctx, args) => {
    let entries;

    if (args.status !== undefined) {
      entries = await ctx.db
        .query("feedbackEntries")
        .withIndex("by_orchestration_status_created", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("status", args.status!),
        )
        .order("desc")
        .collect();
    } else if (args.targetType !== undefined) {
      entries = await ctx.db
        .query("feedbackEntries")
        .withIndex("by_orchestration_target_created", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("targetType", args.targetType!),
        )
        .order("desc")
        .collect();
    } else {
      entries = await ctx.db
        .query("feedbackEntries")
        .withIndex("by_orchestration_created", (q) =>
          q.eq("orchestrationId", args.orchestrationId),
        )
        .order("desc")
        .collect();
    }

    if (args.targetType !== undefined && args.status !== undefined) {
      entries = entries.filter((e) => e.targetType === args.targetType);
    }
    if (args.entryType !== undefined) {
      entries = entries.filter((e) => e.entryType === args.entryType);
    }
    if (args.authorType !== undefined) {
      entries = entries.filter((e) => e.authorType === args.authorType);
    }

    return entries;
  },
});

export const listFeedbackEntriesByTarget = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    targetType: v.union(v.literal("task"), v.literal("commit")),
    targetRef: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.targetType === "task") {
      const entries = await ctx.db
        .query("feedbackEntries")
        .withIndex("by_target_status_created", (q) =>
          q.eq("targetType", "task").eq("targetTaskId", args.targetRef),
        )
        .order("desc")
        .collect();
      return entries.filter(
        (e) => e.orchestrationId === args.orchestrationId,
      );
    } else {
      const entries = await ctx.db
        .query("feedbackEntries")
        .withIndex("by_target_commit_status_created", (q) =>
          q
            .eq("targetType", "commit")
            .eq("targetCommitSha", args.targetRef),
        )
        .order("desc")
        .collect();
      return entries.filter(
        (e) => e.orchestrationId === args.orchestrationId,
      );
    }
  },
});

export const getBlockingFeedbackSummary = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("feedbackEntries")
      .withIndex("by_orchestration_type_status", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("entryType", "ask_for_change")
          .eq("status", "open"),
      )
      .collect();

    return {
      openAskForChangeCount: entries.length,
      entries,
    };
  },
});
