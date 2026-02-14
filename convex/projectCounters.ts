import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export async function allocateKey(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  counterType: "spec" | "ticket" | "design",
): Promise<number> {
  const existing = await ctx.db
    .query("projectCounters")
    .withIndex("by_project_type", (q) =>
      q.eq("projectId", projectId).eq("counterType", counterType),
    )
    .unique();

  if (existing) {
    const value = existing.nextValue;
    await ctx.db.patch(existing._id, { nextValue: value + 1 });
    return value;
  }

  await ctx.db.insert("projectCounters", {
    projectId,
    counterType,
    nextValue: 2,
  });
  return 1;
}

// Internal API for testing
export const allocateKeyMutation = internalMutation({
  args: {
    projectId: v.id("projects"),
    counterType: v.union(v.literal("spec"), v.literal("ticket"), v.literal("design")),
  },
  handler: async (ctx, args) => {
    return allocateKey(ctx, args.projectId, args.counterType);
  },
});

export const getCounter = internalQuery({
  args: {
    projectId: v.id("projects"),
    counterType: v.union(v.literal("spec"), v.literal("ticket"), v.literal("design")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projectCounters")
      .withIndex("by_project_type", (q) =>
        q.eq("projectId", args.projectId).eq("counterType", args.counterType),
      )
      .unique();
  },
});
