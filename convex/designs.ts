import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { allocateKey } from "./projectCounters";

const WORKBENCH_STATUSES = new Set(["exploring", "archived"]);

type PublicDesign = {
  _id: unknown;
  _creationTime: number;
  projectId: unknown;
  designKey: string;
  slug: string;
  title: string;
  prompt: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function isWorkbenchStatus(status: string): boolean {
  return WORKBENCH_STATUSES.has(status);
}

function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toPublicDesignOrNull(design: any): PublicDesign | null {
  if (!design) return null;
  if (!isWorkbenchStatus(design.status)) return null;
  if (typeof design.prompt !== "string") return null;
  return {
    _id: design._id,
    _creationTime: design._creationTime,
    projectId: design.projectId,
    designKey: design.designKey,
    slug:
      typeof design.slug === "string" && design.slug.length > 0
        ? design.slug
        : slugFromTitle(design.title),
    title: design.title,
    prompt: design.prompt,
    status: design.status,
    createdAt: design.createdAt,
    updatedAt: design.updatedAt,
  };
}

export const createDesign = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    prompt: v.string(),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error(`Project not found: ${args.projectId}`);
    }

    const keyNumber = await allocateKey(ctx, args.projectId, "design");
    const designKey = `${project.name.toUpperCase()}-D${keyNumber}`;
    const now = new Date().toISOString();

    return await ctx.db.insert("designs", {
      projectId: args.projectId,
      designKey,
      slug: args.slug ?? slugFromTitle(args.title),
      title: args.title,
      prompt: args.prompt,
      status: "exploring",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getDesign = query({
  args: {
    designId: v.id("designs"),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    return toPublicDesignOrNull(design);
  },
});

export const getDesignByKey = query({
  args: {
    designKey: v.string(),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db
      .query("designs")
      .withIndex("by_key", (q) => q.eq("designKey", args.designKey))
      .first();
    return toPublicDesignOrNull(design);
  },
});

export const listDesigns = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const status = args.status;

    if (status !== undefined) {
      if (!isWorkbenchStatus(status)) {
        return [];
      }
      const designs = await ctx.db
        .query("designs")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", status),
        )
        .order("desc")
        .collect();
      return designs
        .map((design) => toPublicDesignOrNull(design))
        .filter((design): design is PublicDesign => design !== null);
    }

    const designs = await ctx.db
      .query("designs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    return designs
      .map((design) => toPublicDesignOrNull(design))
      .filter((design): design is PublicDesign => design !== null);
  },
});

export const updateDesign = mutation({
  args: {
    designId: v.id("designs"),
    title: v.optional(v.string()),
    prompt: v.optional(v.string()),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    const publicDesign = toPublicDesignOrNull(design);
    if (!publicDesign) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    if (args.title !== undefined) {
      updates.title = args.title;
    }
    if (args.prompt !== undefined) {
      updates.prompt = args.prompt;
    }
    if (args.slug !== undefined) {
      updates.slug = args.slug;
    }

    await ctx.db.patch(args.designId, updates);
    return args.designId;
  },
});

export const transitionDesign = mutation({
  args: {
    designId: v.id("designs"),
    newStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    const publicDesign = toPublicDesignOrNull(design);
    if (!publicDesign) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const validTransitions: Record<string, string[]> = {
      exploring: ["archived"],
      archived: ["exploring"],
    };

    const allowed = validTransitions[publicDesign.status] || [];
    if (!allowed.includes(args.newStatus)) {
      throw new Error(
        `Invalid status transition from ${publicDesign.status} to ${args.newStatus}`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.designId, {
      status: args.newStatus,
      updatedAt: now,
    });
    return args.designId;
  },
});
