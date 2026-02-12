import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const seedExecutionTasks = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    tasks: v.array(
      v.object({
        taskNumber: v.number(),
        subject: v.string(),
        description: v.optional(v.string()),
        model: v.optional(v.string()),
        dependsOn: v.optional(v.array(v.number())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("executionTasks")
      .withIndex("by_orchestration_phase", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("phaseNumber", args.phaseNumber),
      )
      .first();
    if (existing) {
      throw new Error(
        `Execution tasks already seeded for phase ${args.phaseNumber}`,
      );
    }

    const now = Date.now();
    const ids: string[] = [];
    for (const task of args.tasks) {
      const id = await ctx.db.insert("executionTasks", {
        orchestrationId: args.orchestrationId,
        phaseNumber: args.phaseNumber,
        taskNumber: task.taskNumber,
        subject: task.subject,
        description: task.description,
        status: "pending",
        model: task.model,
        dependsOn: task.dependsOn,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const listExecutionTasks = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.phaseNumber !== undefined) {
      const phaseNumber = args.phaseNumber;
      return await ctx.db
        .query("executionTasks")
        .withIndex("by_orchestration_phase", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("phaseNumber", phaseNumber),
        )
        .collect();
    }
    return await ctx.db
      .query("executionTasks")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();
  },
});

export const getExecutionTask = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    taskNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("executionTasks")
      .withIndex("by_orchestration_phase_task", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("phaseNumber", args.phaseNumber)
          .eq("taskNumber", args.taskNumber),
      )
      .first();
  },
});
