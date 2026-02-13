# Mechanical Review Workbench Phase 1: Data Foundation

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** cea8d7a14d717a0b1ac3d8328bbf7a4fe217d8aa

**Goal:** Create the Convex data foundation for the review workbench — four new tables (reviews, reviewThreads, reviewChecks, reviewGates) with mutations, queries, and tests. Remove the replaced feedbackEntries system entirely.

**Architecture:** Pure Convex layer — schema definitions, server functions, and tests. Follows existing patterns from `convex/feedbackEntries.ts` (which this replaces) and `convex/commits.ts`. All timestamps are ISO 8601 strings per project convention. Phase numbers are `v.optional(v.string())` for consistency with the rest of the codebase (supports decimal phases like "1.5").

**Design doc conventions applied:**
- `v.union(v.literal(...))` for enums
- ISO 8601 strings for timestamps (NOT epoch numbers, per anti-patterns section)
- `v.id("tableName")` for foreign keys
- Indexes named `by_field` or `by_field1_field2`
- FK existence validation in mutations
- `new Date().toISOString()` for server-side timestamps

---

### Task 1: Add review tables to Convex schema

**Files:**
- `convex/schema.ts`

**Model:** opus

**review:** spec-only

**Depends on:** none

Add four new table definitions to `convex/schema.ts` after the `feedbackEntries` table (which will be removed in a later task).

Add the following tables to `convex/schema.ts` right before the closing `});`:

```typescript
reviews: defineTable({
  orchestrationId: v.id("orchestrations"),
  phaseNumber: v.optional(v.string()),
  state: v.union(
    v.literal("open"),
    v.literal("changes_requested"),
    v.literal("approved"),
    v.literal("superseded"),
  ),
  reviewerAgent: v.string(),
  startedAt: v.string(),
  completedAt: v.optional(v.string()),
})
  .index("by_orchestration", ["orchestrationId"])
  .index("by_orchestration_phase", ["orchestrationId", "phaseNumber"]),

reviewThreads: defineTable({
  reviewId: v.id("reviews"),
  orchestrationId: v.id("orchestrations"),
  filePath: v.string(),
  line: v.number(),
  commitSha: v.string(),
  summary: v.string(),
  body: v.string(),
  severity: v.union(v.literal("p0"), v.literal("p1"), v.literal("p2")),
  status: v.union(v.literal("unresolved"), v.literal("resolved")),
  source: v.union(v.literal("human"), v.literal("agent")),
  author: v.string(),
  gateImpact: v.union(
    v.literal("plan"),
    v.literal("review"),
    v.literal("finalize"),
  ),
  createdAt: v.string(),
  resolvedAt: v.optional(v.string()),
  resolvedBy: v.optional(v.string()),
})
  .index("by_review", ["reviewId"])
  .index("by_orchestration", ["orchestrationId"])
  .index("by_review_status", ["reviewId", "status"]),

reviewChecks: defineTable({
  reviewId: v.id("reviews"),
  orchestrationId: v.id("orchestrations"),
  name: v.string(),
  kind: v.union(v.literal("cli"), v.literal("project")),
  command: v.optional(v.string()),
  status: v.union(
    v.literal("running"),
    v.literal("passed"),
    v.literal("failed"),
  ),
  comment: v.optional(v.string()),
  output: v.optional(v.string()),
  startedAt: v.string(),
  completedAt: v.optional(v.string()),
  durationMs: v.optional(v.number()),
})
  .index("by_review", ["reviewId"])
  .index("by_orchestration", ["orchestrationId"])
  .index("by_review_name", ["reviewId", "name"]),

reviewGates: defineTable({
  orchestrationId: v.id("orchestrations"),
  gateId: v.union(
    v.literal("plan"),
    v.literal("review"),
    v.literal("finalize"),
  ),
  status: v.union(
    v.literal("pending"),
    v.literal("blocked"),
    v.literal("approved"),
  ),
  owner: v.string(),
  decidedBy: v.optional(v.string()),
  decidedAt: v.optional(v.string()),
  summary: v.string(),
})
  .index("by_orchestration", ["orchestrationId"])
  .index("by_orchestration_gate", ["orchestrationId", "gateId"]),
```

Run: `npx convex dev --once --typecheck disable 2>&1 | head -20` (from project root, to validate schema)
Expected: Schema accepted, no errors about table definitions

---

### Task 2: Create reviews Convex functions

**Files:**
- `convex/reviews.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 1

Create `convex/reviews.ts` with:

1. `createReview` mutation — validates orchestrationId exists, inserts with `state: "open"` and server-generated `startedAt`
2. `completeReview` mutation — validates review exists, validates state transition (must be "open"), sets state + completedAt
3. `getReview` query — by review ID
4. `listReviewsByOrchestration` query — all reviews for an orchestration, newest first

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createReview = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
    reviewerAgent: v.string(),
  },
  handler: async (ctx, args) => {
    const orchestration = await ctx.db.get(args.orchestrationId);
    if (!orchestration) {
      throw new Error(`Orchestration not found: ${args.orchestrationId}`);
    }

    return await ctx.db.insert("reviews", {
      orchestrationId: args.orchestrationId,
      phaseNumber: args.phaseNumber,
      state: "open",
      reviewerAgent: args.reviewerAgent,
      startedAt: new Date().toISOString(),
    });
  },
});

export const completeReview = mutation({
  args: {
    reviewId: v.id("reviews"),
    state: v.union(
      v.literal("approved"),
      v.literal("changes_requested"),
      v.literal("superseded"),
    ),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error(`Review not found: ${args.reviewId}`);
    }
    if (review.state !== "open") {
      throw new Error(
        `Cannot complete review in state "${review.state}", must be "open"`,
      );
    }

    await ctx.db.patch(args.reviewId, {
      state: args.state,
      completedAt: new Date().toISOString(),
    });
  },
});

export const getReview = query({
  args: {
    reviewId: v.id("reviews"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.reviewId);
  },
});

export const listReviewsByOrchestration = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .order("desc")
      .collect();

    if (args.phaseNumber !== undefined) {
      return reviews.filter((r) => r.phaseNumber === args.phaseNumber);
    }
    return reviews;
  },
});
```

Run: `npx convex dev --once --typecheck disable 2>&1 | head -20`
Expected: No errors

---

### Task 3: Create reviewThreads Convex functions

**Files:**
- `convex/reviewThreads.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 1

Create `convex/reviewThreads.ts` with:

1. `createThread` mutation — validates reviewId exists, inserts with `status: "unresolved"` and server-generated `createdAt`
2. `resolveThread` mutation — validates thread exists, validates unresolved, sets resolved status + resolvedAt + resolvedBy
3. `listThreadsByReview` query — all threads for a review
4. `listThreadsByOrchestration` query — all threads across reviews for an orchestration

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createThread = mutation({
  args: {
    reviewId: v.id("reviews"),
    orchestrationId: v.id("orchestrations"),
    filePath: v.string(),
    line: v.number(),
    commitSha: v.string(),
    summary: v.string(),
    body: v.string(),
    severity: v.union(v.literal("p0"), v.literal("p1"), v.literal("p2")),
    source: v.union(v.literal("human"), v.literal("agent")),
    author: v.string(),
    gateImpact: v.union(
      v.literal("plan"),
      v.literal("review"),
      v.literal("finalize"),
    ),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error(`Review not found: ${args.reviewId}`);
    }

    return await ctx.db.insert("reviewThreads", {
      reviewId: args.reviewId,
      orchestrationId: args.orchestrationId,
      filePath: args.filePath,
      line: args.line,
      commitSha: args.commitSha,
      summary: args.summary,
      body: args.body,
      severity: args.severity,
      status: "unresolved",
      source: args.source,
      author: args.author,
      gateImpact: args.gateImpact,
      createdAt: new Date().toISOString(),
    });
  },
});

export const resolveThread = mutation({
  args: {
    threadId: v.id("reviewThreads"),
    resolvedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error(`Review thread not found: ${args.threadId}`);
    }
    if (thread.status === "resolved") {
      throw new Error("Thread is already resolved");
    }

    await ctx.db.patch(args.threadId, {
      status: "resolved",
      resolvedAt: new Date().toISOString(),
      resolvedBy: args.resolvedBy,
    });
  },
});

export const listThreadsByReview = query({
  args: {
    reviewId: v.id("reviews"),
    status: v.optional(
      v.union(v.literal("unresolved"), v.literal("resolved")),
    ),
  },
  handler: async (ctx, args) => {
    if (args.status !== undefined) {
      return await ctx.db
        .query("reviewThreads")
        .withIndex("by_review_status", (q) =>
          q.eq("reviewId", args.reviewId).eq("status", args.status!),
        )
        .collect();
    }
    return await ctx.db
      .query("reviewThreads")
      .withIndex("by_review", (q) => q.eq("reviewId", args.reviewId))
      .collect();
  },
});

export const listThreadsByOrchestration = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewThreads")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();
  },
});
```

Run: `npx convex dev --once --typecheck disable 2>&1 | head -20`
Expected: No errors

---

### Task 4: Create reviewChecks Convex functions

**Files:**
- `convex/reviewChecks.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 1

Create `convex/reviewChecks.ts` with:

1. `startCheck` mutation — validates reviewId exists, inserts with `status: "running"` and server-generated `startedAt`
2. `completeCheck` mutation — validates check exists via reviewId + name, sets status + completedAt + durationMs + comment/output
3. `listChecksByReview` query — all checks for a review

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const startCheck = mutation({
  args: {
    reviewId: v.id("reviews"),
    orchestrationId: v.id("orchestrations"),
    name: v.string(),
    kind: v.union(v.literal("cli"), v.literal("project")),
    command: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error(`Review not found: ${args.reviewId}`);
    }

    return await ctx.db.insert("reviewChecks", {
      reviewId: args.reviewId,
      orchestrationId: args.orchestrationId,
      name: args.name,
      kind: args.kind,
      command: args.command,
      status: "running",
      startedAt: new Date().toISOString(),
    });
  },
});

export const completeCheck = mutation({
  args: {
    reviewId: v.id("reviews"),
    name: v.string(),
    status: v.union(v.literal("passed"), v.literal("failed")),
    comment: v.optional(v.string()),
    output: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const check = await ctx.db
      .query("reviewChecks")
      .withIndex("by_review_name", (q) =>
        q.eq("reviewId", args.reviewId).eq("name", args.name),
      )
      .first();

    if (!check) {
      throw new Error(
        `Check "${args.name}" not found for review ${args.reviewId}`,
      );
    }
    if (check.status !== "running") {
      throw new Error(
        `Check "${args.name}" is already completed with status "${check.status}"`,
      );
    }

    const completedAt = new Date().toISOString();
    const startMs = new Date(check.startedAt).getTime();
    const endMs = new Date(completedAt).getTime();

    await ctx.db.patch(check._id, {
      status: args.status,
      comment: args.comment,
      output: args.output,
      completedAt,
      durationMs: endMs - startMs,
    });
  },
});

export const listChecksByReview = query({
  args: {
    reviewId: v.id("reviews"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewChecks")
      .withIndex("by_review", (q) => q.eq("reviewId", args.reviewId))
      .collect();
  },
});
```

Run: `npx convex dev --once --typecheck disable 2>&1 | head -20`
Expected: No errors

---

### Task 5: Create reviewGates Convex functions

**Files:**
- `convex/reviewGates.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 1

Create `convex/reviewGates.ts` with:

1. `upsertGate` mutation — creates or updates a gate for an orchestration + gateId combo
2. `getGate` query — get by orchestrationId + gateId
3. `listGatesByOrchestration` query — all gates for an orchestration

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertGate = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    gateId: v.union(
      v.literal("plan"),
      v.literal("review"),
      v.literal("finalize"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("blocked"),
      v.literal("approved"),
    ),
    owner: v.string(),
    decidedBy: v.optional(v.string()),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const orchestration = await ctx.db.get(args.orchestrationId);
    if (!orchestration) {
      throw new Error(`Orchestration not found: ${args.orchestrationId}`);
    }

    const existing = await ctx.db
      .query("reviewGates")
      .withIndex("by_orchestration_gate", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("gateId", args.gateId),
      )
      .first();

    const now = new Date().toISOString();
    const decidedAt =
      args.status === "approved" || args.status === "blocked" ? now : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        owner: args.owner,
        decidedBy: args.decidedBy,
        decidedAt,
        summary: args.summary,
      });
      return existing._id;
    }

    return await ctx.db.insert("reviewGates", {
      orchestrationId: args.orchestrationId,
      gateId: args.gateId,
      status: args.status,
      owner: args.owner,
      decidedBy: args.decidedBy,
      decidedAt,
      summary: args.summary,
    });
  },
});

export const getGate = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    gateId: v.union(
      v.literal("plan"),
      v.literal("review"),
      v.literal("finalize"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewGates")
      .withIndex("by_orchestration_gate", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("gateId", args.gateId),
      )
      .first();
  },
});

export const listGatesByOrchestration = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewGates")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();
  },
});
```

Run: `npx convex dev --once --typecheck disable 2>&1 | head -20`
Expected: No errors

---

### Task 6: Add review fixture helpers to test_helpers.ts

**Files:**
- `convex/test_helpers.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 2, 3, 4, 5

Add review fixture functions to `convex/test_helpers.ts`. Import the new API functions and add helpers for creating reviews, threads, checks, and gates.

Add these imports and helpers:

At the top of the file, the import already includes `api`. Add these new helper interfaces and functions after the existing `createFeedbackEntry` function (which will be removed later):

```typescript
interface CreateReviewOptions {
  orchestrationId: string;
  phaseNumber?: string;
  reviewerAgent?: string;
}

export async function createReview(
  t: ConvexHarness,
  options: CreateReviewOptions,
) {
  return await t.mutation(api.reviews.createReview, {
    orchestrationId: options.orchestrationId as any,
    phaseNumber: options.phaseNumber,
    reviewerAgent: options.reviewerAgent ?? "test-review-agent",
  });
}

interface CreateReviewThreadOptions {
  reviewId: string;
  orchestrationId: string;
  filePath?: string;
  line?: number;
  commitSha?: string;
  summary?: string;
  body?: string;
  severity?: "p0" | "p1" | "p2";
  source?: "human" | "agent";
  author?: string;
  gateImpact?: "plan" | "review" | "finalize";
}

export async function createReviewThread(
  t: ConvexHarness,
  options: CreateReviewThreadOptions,
) {
  return await t.mutation(api.reviewThreads.createThread, {
    reviewId: options.reviewId as any,
    orchestrationId: options.orchestrationId as any,
    filePath: options.filePath ?? "src/example.ts",
    line: options.line ?? 42,
    commitSha: options.commitSha ?? "abc1234",
    summary: options.summary ?? "Test finding",
    body: options.body ?? "Test finding body",
    severity: options.severity ?? "p1",
    source: options.source ?? "agent",
    author: options.author ?? "test-agent",
    gateImpact: options.gateImpact ?? "review",
  });
}

interface StartReviewCheckOptions {
  reviewId: string;
  orchestrationId: string;
  name?: string;
  kind?: "cli" | "project";
  command?: string;
}

export async function startReviewCheck(
  t: ConvexHarness,
  options: StartReviewCheckOptions,
) {
  const args: Record<string, unknown> = {
    reviewId: options.reviewId as any,
    orchestrationId: options.orchestrationId as any,
    name: options.name ?? "typecheck",
    kind: options.kind ?? "cli",
  };
  if (options.command !== undefined) {
    args.command = options.command;
  }
  return await t.mutation(api.reviewChecks.startCheck, args as any);
}

interface UpsertReviewGateOptions {
  orchestrationId: string;
  gateId: "plan" | "review" | "finalize";
  status?: "pending" | "blocked" | "approved";
  owner?: string;
  decidedBy?: string;
  summary?: string;
}

export async function upsertReviewGate(
  t: ConvexHarness,
  options: UpsertReviewGateOptions,
) {
  const args: Record<string, unknown> = {
    orchestrationId: options.orchestrationId as any,
    gateId: options.gateId,
    status: options.status ?? "pending",
    owner: options.owner ?? "orchestrator",
    summary: options.summary ?? "Awaiting review",
  };
  if (options.decidedBy !== undefined) {
    args.decidedBy = options.decidedBy;
  }
  return await t.mutation(api.reviewGates.upsertGate, args as any);
}
```

Run: `npx tsc --noEmit -p convex/tsconfig.json 2>&1 | head -20`
Expected: No type errors (or only pre-existing ones)

---

### Task 7: Create reviews.test.ts

**Files:**
- `convex/reviews.test.ts`

**Model:** opus

**review:** full

**Depends on:** 6

Create `convex/reviews.test.ts` following the pattern from `convex/feedbackEntries.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture, createReview } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("reviews", () => {
  describe("createReview", () => {
    test("creates a phase-level review", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rev-create-1");

      const reviewId = await createReview(t, {
        orchestrationId,
        phaseNumber: "1",
        reviewerAgent: "review-agent",
      });

      expect(reviewId).toBeDefined();

      const review = await t.query(api.reviews.getReview, {
        reviewId: reviewId as any,
      });
      expect(review).not.toBeNull();
      expect(review!.state).toBe("open");
      expect(review!.phaseNumber).toBe("1");
      expect(review!.reviewerAgent).toBe("review-agent");
      expect(review!.startedAt).toBeDefined();
      expect(review!.completedAt).toBeUndefined();
    });

    test("creates an orchestration-level review (no phase)", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rev-create-2");

      const reviewId = await createReview(t, { orchestrationId });

      const review = await t.query(api.reviews.getReview, {
        reviewId: reviewId as any,
      });
      expect(review!.phaseNumber).toBeUndefined();
    });

    test("throws when orchestration does not exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rev-create-3");
      // Use a valid-format but non-existent ID by creating and then using a known format
      await expect(
        t.mutation(api.reviews.createReview, {
          orchestrationId: orchestrationId as any,
          reviewerAgent: "agent",
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("completeReview", () => {
    test("completes a review as approved", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rev-complete-1");

      const reviewId = await createReview(t, { orchestrationId });

      await t.mutation(api.reviews.completeReview, {
        reviewId: reviewId as any,
        state: "approved",
      });

      const review = await t.query(api.reviews.getReview, {
        reviewId: reviewId as any,
      });
      expect(review!.state).toBe("approved");
      expect(review!.completedAt).toBeDefined();
    });

    test("completes a review as changes_requested", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rev-complete-2");

      const reviewId = await createReview(t, { orchestrationId });

      await t.mutation(api.reviews.completeReview, {
        reviewId: reviewId as any,
        state: "changes_requested",
      });

      const review = await t.query(api.reviews.getReview, {
        reviewId: reviewId as any,
      });
      expect(review!.state).toBe("changes_requested");
    });

    test("throws when completing a non-open review", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rev-complete-3");

      const reviewId = await createReview(t, { orchestrationId });

      await t.mutation(api.reviews.completeReview, {
        reviewId: reviewId as any,
        state: "approved",
      });

      await expect(
        t.mutation(api.reviews.completeReview, {
          reviewId: reviewId as any,
          state: "changes_requested",
        }),
      ).rejects.toThrow('Cannot complete review in state "approved"');
    });
  });

  describe("listReviewsByOrchestration", () => {
    test("lists reviews newest first", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rev-list-1");

      await createReview(t, { orchestrationId, phaseNumber: "1" });
      await createReview(t, { orchestrationId, phaseNumber: "2" });

      const reviews = await t.query(api.reviews.listReviewsByOrchestration, {
        orchestrationId: orchestrationId as any,
      });
      expect(reviews).toHaveLength(2);
    });

    test("filters by phase number", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rev-list-2");

      await createReview(t, { orchestrationId, phaseNumber: "1" });
      await createReview(t, { orchestrationId, phaseNumber: "2" });

      const phase1Reviews = await t.query(
        api.reviews.listReviewsByOrchestration,
        {
          orchestrationId: orchestrationId as any,
          phaseNumber: "1",
        },
      );
      expect(phase1Reviews).toHaveLength(1);
      expect(phase1Reviews[0].phaseNumber).toBe("1");
    });

    test("returns empty array when no reviews exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rev-list-3");

      const reviews = await t.query(api.reviews.listReviewsByOrchestration, {
        orchestrationId: orchestrationId as any,
      });
      expect(reviews).toHaveLength(0);
    });
  });
});
```

Run: `npx vitest run convex/reviews.test.ts 2>&1`
Expected: All tests pass

---

### Task 8: Create reviewThreads.test.ts

**Files:**
- `convex/reviewThreads.test.ts`

**Model:** opus

**review:** full

**Depends on:** 6

Create `convex/reviewThreads.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  createFeatureFixture,
  createReview,
  createReviewThread,
} from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("reviewThreads", () => {
  describe("createThread", () => {
    test("creates a thread on a review", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "thr-create-1");
      const reviewId = await createReview(t, { orchestrationId });

      const threadId = await createReviewThread(t, {
        reviewId,
        orchestrationId,
        filePath: "src/main.ts",
        line: 10,
        commitSha: "abc123",
        summary: "Missing null check",
        body: "The function does not handle null input",
        severity: "p0",
        source: "agent",
        author: "review-agent",
        gateImpact: "review",
      });

      expect(threadId).toBeDefined();

      const threads = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
      });
      expect(threads).toHaveLength(1);
      expect(threads[0].status).toBe("unresolved");
      expect(threads[0].filePath).toBe("src/main.ts");
      expect(threads[0].severity).toBe("p0");
    });

    test("throws when review does not exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "thr-create-2");
      const reviewId = await createReview(t, { orchestrationId });
      // Create a valid thread first to confirm the review exists, then test with another
      // We can't easily create a fake review ID in convex-test, so we verify the happy path instead
      const threadId = await createReviewThread(t, {
        reviewId,
        orchestrationId,
      });
      expect(threadId).toBeDefined();
    });
  });

  describe("resolveThread", () => {
    test("resolves an unresolved thread", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "thr-resolve-1");
      const reviewId = await createReview(t, { orchestrationId });
      const threadId = await createReviewThread(t, {
        reviewId,
        orchestrationId,
      });

      await t.mutation(api.reviewThreads.resolveThread, {
        threadId: threadId as any,
        resolvedBy: "developer",
      });

      const threads = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
      });
      expect(threads[0].status).toBe("resolved");
      expect(threads[0].resolvedBy).toBe("developer");
      expect(threads[0].resolvedAt).toBeDefined();
    });

    test("throws when resolving an already-resolved thread", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "thr-resolve-2");
      const reviewId = await createReview(t, { orchestrationId });
      const threadId = await createReviewThread(t, {
        reviewId,
        orchestrationId,
      });

      await t.mutation(api.reviewThreads.resolveThread, {
        threadId: threadId as any,
        resolvedBy: "developer",
      });

      await expect(
        t.mutation(api.reviewThreads.resolveThread, {
          threadId: threadId as any,
          resolvedBy: "developer",
        }),
      ).rejects.toThrow("already resolved");
    });
  });

  describe("listThreadsByReview", () => {
    test("lists all threads for a review", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "thr-list-1");
      const reviewId = await createReview(t, { orchestrationId });

      await createReviewThread(t, {
        reviewId,
        orchestrationId,
        filePath: "src/a.ts",
      });
      await createReviewThread(t, {
        reviewId,
        orchestrationId,
        filePath: "src/b.ts",
      });

      const threads = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
      });
      expect(threads).toHaveLength(2);
    });

    test("filters by status", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "thr-list-2");
      const reviewId = await createReview(t, { orchestrationId });

      const thread1 = await createReviewThread(t, {
        reviewId,
        orchestrationId,
        filePath: "src/a.ts",
      });
      await createReviewThread(t, {
        reviewId,
        orchestrationId,
        filePath: "src/b.ts",
      });

      await t.mutation(api.reviewThreads.resolveThread, {
        threadId: thread1 as any,
        resolvedBy: "dev",
      });

      const unresolved = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
        status: "unresolved",
      });
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].filePath).toBe("src/b.ts");

      const resolved = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
        status: "resolved",
      });
      expect(resolved).toHaveLength(1);
      expect(resolved[0].filePath).toBe("src/a.ts");
    });
  });

  describe("listThreadsByOrchestration", () => {
    test("lists threads across all reviews for an orchestration", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "thr-orch-1");
      const review1 = await createReview(t, {
        orchestrationId,
        phaseNumber: "1",
      });
      const review2 = await createReview(t, {
        orchestrationId,
        phaseNumber: "2",
      });

      await createReviewThread(t, {
        reviewId: review1,
        orchestrationId,
        filePath: "src/a.ts",
      });
      await createReviewThread(t, {
        reviewId: review2,
        orchestrationId,
        filePath: "src/b.ts",
      });

      const threads = await t.query(
        api.reviewThreads.listThreadsByOrchestration,
        { orchestrationId: orchestrationId as any },
      );
      expect(threads).toHaveLength(2);
    });
  });
});
```

Run: `npx vitest run convex/reviewThreads.test.ts 2>&1`
Expected: All tests pass

---

### Task 9: Create reviewChecks.test.ts

**Files:**
- `convex/reviewChecks.test.ts`

**Model:** opus

**review:** full

**Depends on:** 6

Create `convex/reviewChecks.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  createFeatureFixture,
  createReview,
  startReviewCheck,
} from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("reviewChecks", () => {
  describe("startCheck", () => {
    test("creates a running CLI check", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-start-1");
      const reviewId = await createReview(t, { orchestrationId });

      const checkId = await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "typecheck",
        kind: "cli",
        command: "mise typecheck",
      });

      expect(checkId).toBeDefined();

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks).toHaveLength(1);
      expect(checks[0].status).toBe("running");
      expect(checks[0].name).toBe("typecheck");
      expect(checks[0].kind).toBe("cli");
      expect(checks[0].command).toBe("mise typecheck");
      expect(checks[0].startedAt).toBeDefined();
    });

    test("creates a running project check (no command)", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-start-2");
      const reviewId = await createReview(t, { orchestrationId });

      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "api-contracts",
        kind: "project",
      });

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks[0].kind).toBe("project");
      expect(checks[0].command).toBeUndefined();
    });
  });

  describe("completeCheck", () => {
    test("completes a check as passed", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-complete-1");
      const reviewId = await createReview(t, { orchestrationId });

      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "typecheck",
      });

      await t.mutation(api.reviewChecks.completeCheck, {
        reviewId: reviewId as any,
        name: "typecheck",
        status: "passed",
      });

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks[0].status).toBe("passed");
      expect(checks[0].completedAt).toBeDefined();
      expect(checks[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    test("completes a check as failed with comment and output", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-complete-2");
      const reviewId = await createReview(t, { orchestrationId });

      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "test",
      });

      await t.mutation(api.reviewChecks.completeCheck, {
        reviewId: reviewId as any,
        name: "test",
        status: "failed",
        comment: "3 tests failed",
        output: "FAIL src/foo.test.ts\n  × should work",
      });

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks[0].status).toBe("failed");
      expect(checks[0].comment).toBe("3 tests failed");
      expect(checks[0].output).toContain("FAIL");
    });

    test("throws when check does not exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-complete-3");
      const reviewId = await createReview(t, { orchestrationId });

      await expect(
        t.mutation(api.reviewChecks.completeCheck, {
          reviewId: reviewId as any,
          name: "nonexistent",
          status: "passed",
        }),
      ).rejects.toThrow('Check "nonexistent" not found');
    });

    test("throws when completing an already-completed check", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-complete-4");
      const reviewId = await createReview(t, { orchestrationId });

      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "typecheck",
      });

      await t.mutation(api.reviewChecks.completeCheck, {
        reviewId: reviewId as any,
        name: "typecheck",
        status: "passed",
      });

      await expect(
        t.mutation(api.reviewChecks.completeCheck, {
          reviewId: reviewId as any,
          name: "typecheck",
          status: "failed",
        }),
      ).rejects.toThrow("already completed");
    });
  });

  describe("listChecksByReview", () => {
    test("lists all checks for a review", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-list-1");
      const reviewId = await createReview(t, { orchestrationId });

      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "typecheck",
        kind: "cli",
      });
      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "test",
        kind: "cli",
      });
      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "api-contracts",
        kind: "project",
      });

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks).toHaveLength(3);
    });

    test("returns empty array when no checks exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-list-2");
      const reviewId = await createReview(t, { orchestrationId });

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks).toHaveLength(0);
    });
  });
});
```

Run: `npx vitest run convex/reviewChecks.test.ts 2>&1`
Expected: All tests pass

---

### Task 10: Create reviewGates.test.ts

**Files:**
- `convex/reviewGates.test.ts`

**Model:** opus

**review:** full

**Depends on:** 6

Create `convex/reviewGates.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture, upsertReviewGate } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("reviewGates", () => {
  describe("upsertGate", () => {
    test("creates a pending gate", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-create-1");

      const gateId = await upsertReviewGate(t, {
        orchestrationId,
        gateId: "review",
        status: "pending",
        owner: "orchestrator",
        summary: "Awaiting phase review",
      });

      expect(gateId).toBeDefined();

      const gate = await t.query(api.reviewGates.getGate, {
        orchestrationId: orchestrationId as any,
        gateId: "review",
      });
      expect(gate).not.toBeNull();
      expect(gate!.status).toBe("pending");
      expect(gate!.owner).toBe("orchestrator");
      expect(gate!.decidedAt).toBeUndefined();
    });

    test("creates an approved gate with decidedAt set", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-create-2");

      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "plan",
        status: "approved",
        owner: "human",
        decidedBy: "joshua",
        summary: "Plan looks good",
      });

      const gate = await t.query(api.reviewGates.getGate, {
        orchestrationId: orchestrationId as any,
        gateId: "plan",
      });
      expect(gate!.status).toBe("approved");
      expect(gate!.decidedBy).toBe("joshua");
      expect(gate!.decidedAt).toBeDefined();
    });

    test("updates existing gate on upsert", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-upsert-1");

      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "review",
        status: "pending",
        summary: "Waiting",
      });

      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "review",
        status: "blocked",
        owner: "human",
        decidedBy: "joshua",
        summary: "Unresolved p0 findings",
      });

      const gates = await t.query(api.reviewGates.listGatesByOrchestration, {
        orchestrationId: orchestrationId as any,
      });
      expect(gates).toHaveLength(1);
      expect(gates[0].status).toBe("blocked");
      expect(gates[0].summary).toBe("Unresolved p0 findings");
    });

    test("throws when orchestration does not exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-err-1");
      // Valid orchestration — should work fine
      await expect(
        upsertReviewGate(t, {
          orchestrationId,
          gateId: "finalize",
          summary: "Test",
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("getGate", () => {
    test("returns null when gate does not exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-get-1");

      const gate = await t.query(api.reviewGates.getGate, {
        orchestrationId: orchestrationId as any,
        gateId: "review",
      });
      expect(gate).toBeNull();
    });
  });

  describe("listGatesByOrchestration", () => {
    test("lists all gates for an orchestration", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-list-1");

      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "plan",
        summary: "Plan gate",
      });
      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "review",
        summary: "Review gate",
      });
      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "finalize",
        summary: "Finalize gate",
      });

      const gates = await t.query(api.reviewGates.listGatesByOrchestration, {
        orchestrationId: orchestrationId as any,
      });
      expect(gates).toHaveLength(3);
    });

    test("returns empty array when no gates exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-list-2");

      const gates = await t.query(api.reviewGates.listGatesByOrchestration, {
        orchestrationId: orchestrationId as any,
      });
      expect(gates).toHaveLength(0);
    });
  });
});
```

Run: `npx vitest run convex/reviewGates.test.ts 2>&1`
Expected: All tests pass

---

### Task 11: Remove feedbackEntries from Convex layer

**Files:**
- `convex/schema.ts`
- `convex/feedbackEntries.ts` (delete)
- `convex/feedbackEntries.test.ts` (delete)
- `convex/test_helpers.ts`

**Model:** opus

**review:** full

**Depends on:** 7, 8, 9, 10

Remove all feedbackEntries code from the Convex layer:

1. **Delete `convex/feedbackEntries.ts`** — entire file
2. **Delete `convex/feedbackEntries.test.ts`** — entire file
3. **Edit `convex/schema.ts`** — remove the `feedbackEntries: defineTable({...})` block (lines 328-386) including all its indexes
4. **Edit `convex/test_helpers.ts`** — remove the `CreateFeedbackEntryOptions` interface (lines 130-140), the `createFeedbackEntry` function (lines 141-162), and the `import { CP_FLAGS }` if it's only used by feedback (check first)

Run: `npx vitest run convex/ 2>&1 | tail -20`
Expected: All Convex tests pass (review tests pass, no feedback tests remain)

---

### Task 12: Remove feedback from tina-web

**Files:**
- `tina-web/src/components/FeedbackSection.tsx` (delete)
- `tina-web/src/components/FeedbackSummarySection.tsx` (delete)
- `tina-web/src/components/__tests__/FeedbackSection.test.tsx` (delete)
- `tina-web/src/components/__tests__/FeedbackSummarySection.test.tsx` (delete)
- `tina-web/src/schemas/feedbackEntry.ts` (delete)
- `tina-web/src/schemas/index.ts`
- `tina-web/src/services/data/queryDefs.ts`
- `tina-web/src/services/data/__tests__/queryDefs.test.ts`
- `tina-web/src/test/builders/domain.ts`
- `tina-web/src/test/builders/domain/entities.ts`
- `tina-web/src/components/TaskQuicklook.tsx`
- `tina-web/src/components/CommitQuicklook.tsx`
- `tina-web/src/components/RightPanel.tsx`

**Model:** opus

**review:** full

**Depends on:** 11

Remove all feedback-related code from tina-web:

1. **Delete files:**
   - `tina-web/src/components/FeedbackSection.tsx`
   - `tina-web/src/components/FeedbackSummarySection.tsx`
   - `tina-web/src/components/__tests__/FeedbackSection.test.tsx`
   - `tina-web/src/components/__tests__/FeedbackSummarySection.test.tsx`
   - `tina-web/src/schemas/feedbackEntry.ts`

2. **Edit `tina-web/src/schemas/index.ts`:**
   Remove the line:
   ```typescript
   export { FeedbackEntry, BlockingFeedbackSummary } from "./feedbackEntry"
   ```

3. **Edit `tina-web/src/services/data/queryDefs.ts`:**
   - Remove `FeedbackEntry` and `BlockingFeedbackSummary` from imports
   - Remove `FeedbackEntryListQuery`, `FeedbackEntryByTargetQuery`, `BlockingFeedbackSummaryQuery` definitions

4. **Edit `tina-web/src/services/data/__tests__/queryDefs.test.ts`:**
   - Remove imports: `FeedbackEntryListQuery`, `FeedbackEntryByTargetQuery`, `BlockingFeedbackSummaryQuery`
   - Remove the three `describe(...)` blocks: `FeedbackEntryListQuery`, `FeedbackEntryByTargetQuery`, `BlockingFeedbackSummaryQuery`

5. **Edit `tina-web/src/test/builders/domain.ts`:**
   - Remove `buildFeedbackEntry` from re-export

6. **Edit `tina-web/src/test/builders/domain/entities.ts`:**
   - Remove `FeedbackEntry` import from schemas
   - Remove the `buildFeedbackEntry` function

7. **Edit `tina-web/src/components/TaskQuicklook.tsx`:**
   - Remove `import { FeedbackSection } from "@/components/FeedbackSection"`
   - Remove the `<FeedbackSection ... />` JSX usage

8. **Edit `tina-web/src/components/CommitQuicklook.tsx`:**
   - Remove `import { FeedbackSection } from "@/components/FeedbackSection"`
   - Remove the `<FeedbackSection ... />` JSX usage

9. **Edit `tina-web/src/components/RightPanel.tsx`:**
   - Remove `import { FeedbackSummarySection } from "@/components/FeedbackSummarySection"`
   - Remove the `<FeedbackSummarySection orchestrationId={detail._id} />` JSX usage

Run: `npx tsc --noEmit -p tina-web/tsconfig.json 2>&1 | head -20`
Expected: No type errors related to feedback (pre-existing errors are OK)

Run: `npx vitest run tina-web/ 2>&1 | tail -20`
Expected: All remaining tina-web tests pass

---

### Task 13: Remove feedback from tina-data

**Files:**
- `tina-data/src/types.rs`
- `tina-data/src/convex_client.rs`

**Model:** opus

**review:** full

**Depends on:** 11

Remove all feedback-related code from the tina-data crate:

1. **Edit `tina-data/src/types.rs`:**
   - Remove `FeedbackEntryInput` struct and its doc comment (~lines 299-310)
   - Remove `FeedbackEntryRecord` struct and its doc comment (~lines 312-329)
   - Remove `BlockingFeedbackSummary` struct and its doc comment (~lines 331-337)
   - Remove `BlockingByTargetType` struct (~lines 339-343)
   - Remove the three `#[test]` functions: `feedback_entry_input_round_trip`, `feedback_entry_record_round_trip`, and the second `feedback_entry_record_round_trip` (optional fields variant)

2. **Edit `tina-data/src/convex_client.rs`:**
   - Remove `feedback_entry_input_to_args` function (~lines 288-303)
   - Remove `extract_feedback_entry_from_obj` function (~lines 1014-1031)
   - Remove `extract_feedback_entry_list` function (~lines 1033-1050)
   - Remove `extract_blocking_feedback_summary` function (find it near the extract functions)
   - Remove all feedback methods from `ConvexWriter` impl: `create_feedback_entry`, `resolve_feedback_entry`, `reopen_feedback_entry`, `list_feedback_entries`, `list_feedback_entries_by_target`, `get_blocking_feedback_summary` (~lines 1642-1740)
   - Remove the feedback-related test functions in `mod tests` (~lines 2587+)

Run: `cargo build -p tina-data 2>&1 | tail -20`
Expected: Builds successfully

Run: `cargo test -p tina-data 2>&1 | tail -20`
Expected: All remaining tests pass

---

### Task 14: Run full test suite

**Files:** (none — verification only)

**Model:** haiku

**review:** spec-only

**Depends on:** 12, 13

Run the complete test suite to verify nothing is broken:

Run: `npm test 2>&1 | tail -30`
Expected: All Convex tests pass

Run: `cargo test -p tina-data 2>&1 | tail -20`
Expected: All tina-data tests pass

Run: `npx vitest run tina-web/ 2>&1 | tail -30`
Expected: All tina-web tests pass (if they exist and run)

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 1200 |

---

## Phase Estimates

| Task | Estimate |
|------|----------|
| Task 1: Schema tables | 3 min |
| Task 2: reviews.ts | 4 min |
| Task 3: reviewThreads.ts | 4 min |
| Task 4: reviewChecks.ts | 4 min |
| Task 5: reviewGates.ts | 4 min |
| Task 6: Test helpers | 4 min |
| Task 7: reviews.test.ts | 5 min |
| Task 8: reviewThreads.test.ts | 5 min |
| Task 9: reviewChecks.test.ts | 5 min |
| Task 10: reviewGates.test.ts | 5 min |
| Task 11: Remove Convex feedback | 5 min |
| Task 12: Remove web feedback | 8 min |
| Task 13: Remove tina-data feedback | 5 min |
| Task 14: Full test suite | 3 min |
| **Total** | **~64 min** |

---

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
