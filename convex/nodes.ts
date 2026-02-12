import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const HEARTBEAT_TIMEOUT_MS = 60_000;

export const registerNode = mutation({
  args: {
    name: v.string(),
    os: v.string(),
    authTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("nodes")
      .withIndex("by_name_auth", (q) =>
        q.eq("name", args.name).eq("authTokenHash", args.authTokenHash),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        os: args.os,
        status: "online",
        lastHeartbeat: now,
      });
      return existing._id;
    }
    const nodeId = await ctx.db.insert("nodes", {
      name: args.name,
      os: args.os,
      status: "online",
      lastHeartbeat: now,
      registeredAt: now,
      authTokenHash: args.authTokenHash,
    });
    return nodeId;
  },
});

export const heartbeat = mutation({
  args: {
    nodeId: v.id("nodes"),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error(`Node ${args.nodeId} not found`);
    }
    await ctx.db.patch(args.nodeId, {
      lastHeartbeat: Date.now(),
      status: "online",
    });
  },
});

export const listNodes = query({
  args: {},
  handler: async (ctx) => {
    const nodes = await ctx.db.query("nodes").collect();
    const now = Date.now();
    return nodes.map((node) => ({
      ...node,
      status:
        now - node.lastHeartbeat > HEARTBEAT_TIMEOUT_MS ? "offline" : "online",
    }));
  },
});
