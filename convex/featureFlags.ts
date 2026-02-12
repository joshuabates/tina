import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

/** Control-plane feature flag keys for staged rollout. */
export const CP_FLAGS = {
  LAUNCH_FROM_WEB: "cp.launch_from_web",
  RUNTIME_CONTROLS: "cp.runtime_controls",
  POLICY_RECONFIGURATION: "cp.policy_reconfiguration",
  TASK_RECONFIGURATION: "cp.task_reconfiguration",
} as const;

/** Shared logic: check if a feature flag is enabled. */
export async function isFeatureFlagEnabled(
  ctx: MutationCtx | QueryCtx,
  key: string,
): Promise<boolean> {
  const flag = await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return flag?.enabled ?? false;
}

export const getFlag = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return isFeatureFlagEnabled(ctx, args.key);
  },
});

export const listFlags = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("featureFlags").collect();
  },
});

export const setFlag = mutation({
  args: {
    key: v.string(),
    enabled: v.boolean(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        ...(args.description !== undefined && { description: args.description }),
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("featureFlags", {
      key: args.key,
      enabled: args.enabled,
      description: args.description,
      updatedAt: Date.now(),
    });
  },
});
