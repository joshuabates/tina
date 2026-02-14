# Design Workbench Phase 2: Design & Variation Data Model

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 825f5db762283ff6826856ed4170e2fc0b86e5d9

**Goal:** Introduce the design and variation data model across Convex, tina-web, tina-data, and tina-daemon. After this phase, designs and variations can be created/listed/viewed in tina-web, the daemon can sync design metadata from worktree `ui/designs/sets/` directories to Convex, and specs can be linked to designs via a join table.

**Architecture:** Three new Convex tables (`designs`, `designVariations`, `specDesigns`). Convex CRUD functions follow the `specs.ts` pattern. tina-web adds list/detail pages under the existing `plan` mode routes (alongside specs and tickets). tina-daemon extends its watcher with a `WatchEvent::Design` variant and adds a `sync_design_metadata` function. Convex file storage is used for screenshot uploads with `generateUploadUrl` + HTTP PUT + storage ID recording.

**IMPORTANT — Scope boundaries:**
- Phase 2 builds the data layer and basic UI. The vendored workbench runtime (Phase 3) does NOT exist yet.
- The daemon design sync watches `ui/designs/sets/` but the directory structure is created manually for testing — no scaffold tool yet.
- Screenshot upload via Convex file storage is included but may need adaptation based on Convex Rust SDK ergonomics.

---

### Task 1: Add Convex schema tables for designs, designVariations, and specDesigns

**Files:**
- `convex/schema.ts`

**Model:** opus

**review:** full

**Depends on:** none

Add three new table definitions to `convex/schema.ts` after the existing `specs` table definition (line ~284).

**Steps:**

1. Add the `designs` table after the `specs` table block:
```typescript
  designs: defineTable({
    projectId: v.id("projects"),
    designKey: v.string(),
    title: v.string(),
    prompt: v.string(), // the question being explored
    status: v.string(), // exploring | locked | archived
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_key", ["designKey"]),
```

2. Add the `designVariations` table:
```typescript
  designVariations: defineTable({
    designId: v.id("designs"),
    slug: v.string(),
    title: v.string(),
    status: v.string(), // exploring | selected | rejected
    screenshotStorageIds: v.optional(v.array(v.string())),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_design", ["designId"])
    .index("by_design_status", ["designId", "status"]),
```

3. Add the `specDesigns` join table:
```typescript
  specDesigns: defineTable({
    specId: v.id("specs"),
    designId: v.id("designs"),
  })
    .index("by_spec", ["specId"])
    .index("by_design", ["designId"]),
```

4. Update the `orchestrations` table to add optional `designId`:
```typescript
  orchestrations: defineTable({
    ...orchestrationCoreTableFields,
    projectId: v.optional(v.id("projects")),
    specId: v.optional(v.id("specs")),
    designId: v.optional(v.id("designs")),
  })
```

5. Add the `projectCounters` counterType comment to include `"design"`:
```typescript
    counterType: v.string(), // spec | ticket | design
```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npx convex dev --once --typecheck=disable 2>&1 | head -20`
Expected: Schema validation passes

---

### Task 2: Create convex/designs.ts with CRUD functions

**Files:**
- `convex/designs.ts`

**Model:** opus

**review:** full

**Depends on:** 1

Create a new `convex/designs.ts` file following the `convex/specs.ts` pattern with these functions:

**Steps:**

1. Create `convex/designs.ts` with these exports:

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { allocateKey } from "./projectCounters";

export const createDesign = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    prompt: v.string(),
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
      title: args.title,
      prompt: args.prompt,
      status: "exploring",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getDesign = query({
  args: { designId: v.id("designs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.designId);
  },
});

export const getDesignByKey = query({
  args: { designKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("designs")
      .withIndex("by_key", (q) => q.eq("designKey", args.designKey))
      .first();
  },
});

export const listDesigns = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let queryObj;
    const status = args.status;

    if (status !== undefined) {
      queryObj = ctx.db
        .query("designs")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", status),
        );
    } else {
      queryObj = ctx.db
        .query("designs")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId));
    }

    return await queryObj.order("desc").collect();
  },
});

export const updateDesign = mutation({
  args: {
    designId: v.id("designs"),
    title: v.optional(v.string()),
    prompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.title !== undefined) updates.title = args.title;
    if (args.prompt !== undefined) updates.prompt = args.prompt;

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
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const validTransitions: Record<string, string[]> = {
      exploring: ["locked"],
      locked: ["archived", "exploring"],
      archived: ["exploring"],
    };

    const allowed = validTransitions[design.status] || [];
    if (!allowed.includes(args.newStatus)) {
      throw new Error(
        `Invalid status transition from ${design.status} to ${args.newStatus}`,
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
```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | head -20`
Expected: No type errors from designs.ts

---

### Task 3: Create convex/designVariations.ts with CRUD functions

**Files:**
- `convex/designVariations.ts`

**Model:** opus

**review:** full

**Depends on:** 1

Create `convex/designVariations.ts` for variation management:

**Steps:**

1. Create `convex/designVariations.ts`:

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const createVariation = mutation({
  args: {
    designId: v.id("designs"),
    slug: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const now = new Date().toISOString();
    return await ctx.db.insert("designVariations", {
      designId: args.designId,
      slug: args.slug,
      title: args.title,
      status: "exploring",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getVariation = query({
  args: { variationId: v.id("designVariations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.variationId);
  },
});

export const listVariations = query({
  args: {
    designId: v.id("designs"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let queryObj;
    const status = args.status;

    if (status !== undefined) {
      queryObj = ctx.db
        .query("designVariations")
        .withIndex("by_design_status", (q) =>
          q.eq("designId", args.designId).eq("status", status),
        );
    } else {
      queryObj = ctx.db
        .query("designVariations")
        .withIndex("by_design", (q) => q.eq("designId", args.designId));
    }

    return await queryObj.order("desc").collect();
  },
});

export const transitionVariation = mutation({
  args: {
    variationId: v.id("designVariations"),
    newStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const variation = await ctx.db.get(args.variationId);
    if (!variation) {
      throw new Error(`Variation not found: ${args.variationId}`);
    }

    const validTransitions: Record<string, string[]> = {
      exploring: ["selected", "rejected"],
      selected: ["exploring"],
      rejected: ["exploring"],
    };

    const allowed = validTransitions[variation.status] || [];
    if (!allowed.includes(args.newStatus)) {
      throw new Error(
        `Invalid status transition from ${variation.status} to ${args.newStatus}`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.variationId, {
      status: args.newStatus,
      updatedAt: now,
    });
    return args.variationId;
  },
});

export const updateVariation = mutation({
  args: {
    variationId: v.id("designVariations"),
    title: v.optional(v.string()),
    screenshotStorageIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const variation = await ctx.db.get(args.variationId);
    if (!variation) {
      throw new Error(`Variation not found: ${args.variationId}`);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.title !== undefined) updates.title = args.title;
    if (args.screenshotStorageIds !== undefined) {
      updates.screenshotStorageIds = args.screenshotStorageIds;
    }

    await ctx.db.patch(args.variationId, updates);
    return args.variationId;
  },
});

export const generateScreenshotUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getScreenshotUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | head -20`
Expected: No type errors from designVariations.ts

---

### Task 4: Create convex/specDesigns.ts join table functions

**Files:**
- `convex/specDesigns.ts`

**Model:** opus

**review:** full

**Depends on:** 1

Create `convex/specDesigns.ts` for the many-to-many spec-design linkage:

**Steps:**

1. Create `convex/specDesigns.ts`:

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const linkSpecToDesign = mutation({
  args: {
    specId: v.id("specs"),
    designId: v.id("designs"),
  },
  handler: async (ctx, args) => {
    // Verify both exist
    const spec = await ctx.db.get(args.specId);
    if (!spec) throw new Error(`Spec not found: ${args.specId}`);
    const design = await ctx.db.get(args.designId);
    if (!design) throw new Error(`Design not found: ${args.designId}`);

    // Check for existing link
    const existing = await ctx.db
      .query("specDesigns")
      .withIndex("by_spec", (q) => q.eq("specId", args.specId))
      .filter((q) => q.eq(q.field("designId"), args.designId))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("specDesigns", {
      specId: args.specId,
      designId: args.designId,
    });
  },
});

export const unlinkSpecFromDesign = mutation({
  args: {
    specId: v.id("specs"),
    designId: v.id("designs"),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("specDesigns")
      .withIndex("by_spec", (q) => q.eq("specId", args.specId))
      .filter((q) => q.eq(q.field("designId"), args.designId))
      .first();

    if (link) {
      await ctx.db.delete(link._id);
    }
  },
});

export const listDesignsForSpec = query({
  args: { specId: v.id("specs") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("specDesigns")
      .withIndex("by_spec", (q) => q.eq("specId", args.specId))
      .collect();

    const designs = [];
    for (const link of links) {
      const design = await ctx.db.get(link.designId);
      if (design) designs.push(design);
    }
    return designs;
  },
});

export const listSpecsForDesign = query({
  args: { designId: v.id("designs") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("specDesigns")
      .withIndex("by_design", (q) => q.eq("designId", args.designId))
      .collect();

    const specs = [];
    for (const link of links) {
      const spec = await ctx.db.get(link.specId);
      if (spec) specs.push(spec);
    }
    return specs;
  },
});
```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | head -20`
Expected: No type errors from specDesigns.ts

---

### Task 5: Add Convex tests for designs, designVariations, and specDesigns

**Files:**
- `convex/designs.test.ts`
- `convex/designVariations.test.ts`
- `convex/specDesigns.test.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 2, 3, 4

Create test files following the `convex/specs.test.ts` pattern.

**Steps:**

1. Read `convex/specs.test.ts` for test patterns and helpers.

2. Create `convex/designs.test.ts` with tests:
   - `createDesign` allocates a design key with `D` prefix
   - `getDesign` retrieves by ID
   - `getDesignByKey` retrieves by key
   - `listDesigns` returns project designs, filters by status
   - `updateDesign` patches title and prompt
   - `transitionDesign` validates status transitions (exploring→locked, locked→archived, invalid transitions throw)

3. Create `convex/designVariations.test.ts` with tests:
   - `createVariation` creates with initial `exploring` status
   - `listVariations` returns design variations, filters by status
   - `transitionVariation` validates transitions (exploring→selected, exploring→rejected, selected→exploring)
   - `updateVariation` patches title and screenshot storage IDs
   - `generateScreenshotUploadUrl` returns a URL

4. Create `convex/specDesigns.test.ts` with tests:
   - `linkSpecToDesign` creates a link and is idempotent
   - `unlinkSpecFromDesign` removes a link
   - `listDesignsForSpec` returns linked designs
   - `listSpecsForDesign` returns linked specs
   - Many-to-many: one spec linked to multiple designs, one design linked to multiple specs

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npm test -- --reporter verbose 2>&1 | tail -30`
Expected: All new tests pass

---

### Task 6: Add tina-web schemas and queryDefs for designs

**Files:**
- `tina-web/src/schemas/design.ts`
- `tina-web/src/schemas/designVariation.ts`
- `tina-web/src/schemas/index.ts`
- `tina-web/src/services/data/queryDefs.ts`

**Model:** opus

**review:** full

**Depends on:** 2, 3, 4

**Steps:**

1. Create `tina-web/src/schemas/design.ts`:
```typescript
import { Schema } from "effect"
import { convexDocumentFields, optionalString, optionalStringArray } from "./common"

export const DesignSummary = Schema.Struct({
  ...convexDocumentFields,
  projectId: Schema.String,
  designKey: Schema.String,
  title: Schema.String,
  prompt: Schema.String,
  status: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})

export type DesignSummary = typeof DesignSummary.Type
```

2. Create `tina-web/src/schemas/designVariation.ts`:
```typescript
import { Schema } from "effect"
import { convexDocumentFields, optionalStringArray } from "./common"

export const DesignVariation = Schema.Struct({
  ...convexDocumentFields,
  designId: Schema.String,
  slug: Schema.String,
  title: Schema.String,
  status: Schema.String,
  screenshotStorageIds: optionalStringArray,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})

export type DesignVariation = typeof DesignVariation.Type
```

3. In `tina-web/src/schemas/index.ts`, add:
```typescript
export { DesignSummary } from "./design"
export { DesignVariation } from "./designVariation"
```

4. In `tina-web/src/services/data/queryDefs.ts`, add imports and query definitions:

Add to imports:
```typescript
import { DesignSummary, DesignVariation } from "@/schemas"
```

Add after the `SpecDetailQuery`:
```typescript
export const DesignListQuery = queryDef({
  key: "designs.list",
  query: api.designs.listDesigns,
  args: Schema.Struct({
    projectId: Schema.String,
    status: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(DesignSummary),
})

export const DesignDetailQuery = queryDef({
  key: "designs.get",
  query: api.designs.getDesign,
  args: Schema.Struct({ designId: Schema.String }),
  schema: Schema.NullOr(DesignSummary),
})

export const DesignVariationListQuery = queryDef({
  key: "designVariations.list",
  query: api.designVariations.listVariations,
  args: Schema.Struct({
    designId: Schema.String,
    status: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(DesignVariation),
})

export const LinkedDesignsQuery = queryDef({
  key: "specDesigns.designsForSpec",
  query: api.specDesigns.listDesignsForSpec,
  args: Schema.Struct({ specId: Schema.String }),
  schema: Schema.Array(DesignSummary),
})

export const LinkedSpecsQuery = queryDef({
  key: "specDesigns.specsForDesign",
  query: api.specDesigns.listSpecsForDesign,
  args: Schema.Struct({ designId: Schema.String }),
  schema: Schema.Array(SpecSummary),
})
```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors (or only errors from components not yet created)

---

### Task 7: Create tina-web DesignListPage and CreateDesignModal

**Files:**
- `tina-web/src/components/pm/DesignListPage.tsx`
- `tina-web/src/components/pm/DesignListPage.module.scss`
- `tina-web/src/components/pm/CreateDesignModal.tsx`

**Model:** opus

**review:** full

**Depends on:** 6

Create the design list page following the `SpecListPage.tsx` pattern.

**Steps:**

1. Create `tina-web/src/components/pm/DesignListPage.module.scss` — copy from `SpecListPage.module.scss`, replacing `.specList` → `.designList`, `.specKey` → `.designKey`, `.specTitle` → `.designTitle`.

2. Create `tina-web/src/components/pm/DesignListPage.tsx`:
```typescript
import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignListQuery } from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { formatRelativeTimeShort } from "@/lib/time"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus, statusLabel } from "@/components/ui/status-styles"
import { CreateDesignModal } from "./CreateDesignModal"
import type { DesignSummary } from "@/schemas"
import styles from "./DesignListPage.module.scss"

export function DesignListPage() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [showCreateForm, setShowCreateForm] = useState(false)

  const projectId = projectIdParam ?? null

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId: projectId as string,
  })

  if (!projectId) {
    return (
      <div data-testid="design-list-page" className={styles.designList}>
        <div className={styles.noProject}>Select a project from the sidebar</div>
      </div>
    )
  }

  if (isAnyQueryLoading(designsResult)) {
    return (
      <div data-testid="design-list-page" className={styles.designList}>
        <div className={styles.header}>
          <h2 className={styles.title}>Designs</h2>
        </div>
        <div data-testid="design-list-loading" className={styles.loading}>
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(designsResult)
  if (queryError) {
    throw queryError
  }

  if (designsResult.status !== "success") {
    return null
  }

  const designs = designsResult.data

  const handleRowClick = (design: DesignSummary) => {
    navigate(`/projects/${projectId}/plan/designs/${design._id}`)
  }

  const handleCreated = (designId: string) => {
    setShowCreateForm(false)
    navigate(`/projects/${projectId}/plan/designs/${designId}`)
  }

  return (
    <div data-testid="design-list-page" className={styles.designList}>
      <div className={styles.header}>
        <h2 className={styles.title}>Designs</h2>
        <button
          className={styles.createButton}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          Create Design
        </button>
      </div>

      {showCreateForm && (
        <CreateDesignModal
          projectId={projectId}
          onClose={() => setShowCreateForm(false)}
          onCreated={handleCreated}
        />
      )}

      {designs.length === 0 ? (
        <div className={styles.empty}>No designs yet. Create one to get started.</div>
      ) : (
        <table className={styles.table} role="table">
          <thead>
            <tr>
              <th>Design</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {designs.map((design) => (
              <tr
                key={design._id}
                onClick={() => handleRowClick(design)}
                role="row"
              >
                <td>
                  <div className={styles.designKey}>{design.designKey}</div>
                  <div className={styles.designTitle}>{design.title}</div>
                </td>
                <td>
                  <StatusBadge
                    status={toStatusBadgeStatus(design.status)}
                    label={statusLabel(toStatusBadgeStatus(design.status))}
                  />
                </td>
                <td>{formatRelativeTimeShort(design.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

3. Create `tina-web/src/components/pm/CreateDesignModal.tsx`:
```typescript
import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

interface CreateDesignModalProps {
  projectId: string
  onClose: () => void
  onCreated: (designId: string) => void
}

export function CreateDesignModal({
  projectId,
  onClose,
  onCreated,
}: CreateDesignModalProps) {
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const createDesign = useMutation(api.designs.createDesign)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      const designId = await createDesign({
        projectId: projectId as Id<"projects">,
        title: title.trim(),
        prompt: prompt.trim(),
      })
      onCreated(designId as unknown as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create design")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="Create Design" onClose={onClose}>
      <form onSubmit={handleSubmit} data-testid="design-create-form">
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-title">
            Title
          </label>
          <input
            id="design-title"
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Design title"
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-prompt">
            Prompt
          </label>
          <textarea
            id="design-prompt"
            className={styles.formTextarea}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What visual question is this design exploring?"
          />
        </div>
        {error && <div className={styles.errorMessage}>{error}</div>}
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={!title.trim() || submitting}
          >
            {submitting ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors from new components

---

### Task 8: Create tina-web DesignDetailPage with variations list

**Files:**
- `tina-web/src/components/pm/DesignDetailPage.tsx`
- `tina-web/src/components/pm/DesignDetailPage.module.scss`

**Model:** opus

**review:** full

**Depends on:** 6

Create the design detail page following the `SpecDetailPage.tsx` pattern. Shows design info, prompt, status transitions, linked specs, and a list of variations.

**Steps:**

1. Create `tina-web/src/components/pm/DesignDetailPage.module.scss` — copy from `SpecDetailPage.module.scss`, renaming `.specKey` → `.designKey`. Add a `.variationsSection`, `.variationCard`, `.variationSlug`, `.variationTitle`, `.variationStatus` classes.

2. Create `tina-web/src/components/pm/DesignDetailPage.tsx`:

The page shows:
- Design key, title, status badge, prompt text
- Status transition buttons (exploring→locked, locked→archived/exploring, archived→exploring)
- Linked specs list (from `LinkedSpecsQuery`)
- Variations list (from `DesignVariationListQuery`) with status badges
- Comment timeline

Follow the `SpecDetailPage.tsx` component structure: use `useTypedQuery` for data, `useMutation` for transitions, handle loading/error/not-found states.

Key differences from SpecDetailPage:
- Status transitions: exploring→locked, locked→archived or back to exploring, archived→exploring
- Shows `prompt` field (rendered as text, not markdown)
- Shows variations list with slug, title, status
- Shows linked specs instead of validation section
- No markdown editor (designs don't have a markdown body)

Status labels:
```typescript
const DESIGN_STATUS_LABELS: Record<string, string> = {
  exploring: "Exploring",
  locked: "Locked",
  archived: "Archived",
}
```

Variation status labels:
```typescript
const VARIATION_STATUS_LABELS: Record<string, string> = {
  exploring: "Exploring",
  selected: "Selected",
  rejected: "Rejected",
}
```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors from DesignDetailPage

---

### Task 9: Add tina-web routing for designs (App.tsx, AppShell.tsx)

**Files:**
- `tina-web/src/App.tsx`
- `tina-web/src/components/AppShell.tsx`

**Model:** opus

**review:** full

**Depends on:** 7, 8

Wire up the design pages in routing and sidebar.

**Steps:**

1. In `tina-web/src/App.tsx`:
   - Add imports:
     ```typescript
     import { DesignListPage } from "./components/pm/DesignListPage"
     import { DesignDetailPage } from "./components/pm/DesignDetailPage"
     ```
   - Add routes inside the `<Route path="projects/:projectId/plan" ...>` `<Route element={<PmShell />}>` block (after the specs routes at line ~117):
     ```tsx
     <Route path="designs" element={<DesignListPage />} />
     <Route path="designs/:designId" element={<DesignDetailPage />} />
     ```

2. In `tina-web/src/components/AppShell.tsx`:
   - In `PlanSidebar`, add a "Designs" section after the "Specs" section (after line ~83):
     ```tsx
     <div className={styles.modeSidebarSection}>
       <div className={styles.modeSidebarSectionTitle}>Designs</div>
       <NavLink
         className={({ isActive }) =>
           isActive
             ? `${styles.modeSidebarLink} ${styles.modeSidebarLinkActive}`
             : styles.modeSidebarLink
         }
         to={`/projects/${projectId}/plan/designs`}
         data-sidebar-action
       >
         All designs
       </NavLink>
     </div>
     ```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors

---

### Task 10: Add "Linked Designs" section to SpecDetailPage

**Files:**
- `tina-web/src/components/pm/SpecDetailPage.tsx`

**Model:** opus

**review:** full

**Depends on:** 6

Add a "Linked Designs" section to the spec detail page showing designs linked via the join table.

**Steps:**

1. In `SpecDetailPage.tsx`:
   - Add import:
     ```typescript
     import { LinkedDesignsQuery } from "@/services/data/queryDefs"
     import { useNavigate } from "react-router-dom"  // already imported via useParams
     ```
   - Add a query for linked designs:
     ```typescript
     const linkedDesignsResult = useTypedQuery(LinkedDesignsQuery, {
       specId: specId ?? "",
     })
     ```
   - After the validation section (before the comments section), add:
     ```tsx
     <div className={styles.section}>
       <h3 className={styles.sectionTitle}>Linked Designs</h3>
       {linkedDesignsResult.status === "success" && linkedDesignsResult.data.length > 0 ? (
         <ul className={styles.linkedList}>
           {linkedDesignsResult.data.map((design) => (
             <li key={design._id} className={styles.linkedItem}>
               <button
                 className={styles.linkedLink}
                 onClick={() => navigate(`/projects/${routeProjectId}/plan/designs/${design._id}`)}
               >
                 <span className={styles.linkedKey}>{design.designKey}</span>
                 <span>{design.title}</span>
               </button>
             </li>
           ))}
         </ul>
       ) : (
         <p className={styles.emptyHint}>No linked designs.</p>
       )}
     </div>
     ```
   - Add `navigate` from `useNavigate` (check if already available — SpecDetailPage doesn't use `useNavigate` currently, so add it)

2. In `SpecDetailPage.module.scss`, add:
   ```scss
   .linkedList {
     list-style: none;
     padding: 0;
     margin: 0;
   }

   .linkedItem {
     margin-bottom: 4px;
   }

   .linkedLink {
     display: flex;
     align-items: center;
     gap: 8px;
     padding: 4px 8px;
     border: none;
     background: none;
     cursor: pointer;
     font-size: 12px;
     color: $text-primary;
     border-radius: 4px;
     width: 100%;
     text-align: left;

     &:hover {
       background: hsl(var(--accent) / 0.08);
     }
   }

   .linkedKey {
     font-family: $font-mono;
     font-size: 11px;
     font-weight: 600;
   }

   .emptyHint {
     font-size: 12px;
     color: $text-muted;
     margin: 0;
   }
   ```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors

---

### Task 11: Add tina-web tests for design pages

**Files:**
- `tina-web/src/components/__tests__/DesignListPage.test.tsx`
- `tina-web/src/components/__tests__/DesignDetailPage.test.tsx`
- `tina-web/src/components/__tests__/CreateDesignModal.test.tsx`
- `tina-web/src/test/builders/domain/entities.ts`
- `tina-web/src/test/builders/domain.ts`
- `tina-web/src/schemas/__tests__/schemas.test.ts`
- `tina-web/src/services/data/__tests__/queryDefs.test.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 7, 8, 9, 10

Add frontend tests following the existing test patterns (SpecListPage.test.tsx, CreateSpecModal.test.tsx).

**Steps:**

1. In test builders (`entities.ts` and/or `domain.ts`), add:
   - `buildDesignSummary(overrides?)` builder function returning a `DesignSummary`
   - `buildDesignVariation(overrides?)` builder function returning a `DesignVariation`

2. Create `DesignListPage.test.tsx`:
   - Renders design list with data
   - Shows loading state
   - Shows empty state
   - Click navigates to detail page

3. Create `CreateDesignModal.test.tsx`:
   - Renders form fields (title, prompt)
   - Submit calls createDesign mutation
   - Validation prevents empty title

4. Create `DesignDetailPage.test.tsx`:
   - Renders design detail with data
   - Shows status badge
   - Shows prompt text
   - Shows linked specs
   - Shows variations list

5. Update `schemas.test.ts` to validate `DesignSummary` and `DesignVariation` schemas.

6. Update `queryDefs.test.ts` to include new query definitions.

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx vitest run 2>&1 | tail -30`
Expected: All tina-web tests pass

---

### Task 12: Add tina-data Rust types and convex_client methods for designs

**Files:**
- `tina-data/src/types.rs`
- `tina-data/src/convex_client.rs`

**Model:** opus

**review:** full

**Depends on:** 2, 3

Add Rust record types and Convex client methods for designs and variations, following the `SpecRecord` and `PlanRecord` patterns.

**Steps:**

1. In `tina-data/src/types.rs`, add after `SpecRecord`:

```rust
/// Design record for Convex `designs` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignRecord {
    pub id: String,
    pub project_id: String,
    pub design_key: String,
    pub title: String,
    pub prompt: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Design variation record for Convex `designVariations` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignVariationRecord {
    pub id: String,
    pub design_id: String,
    pub slug: String,
    pub title: String,
    pub status: String,
    pub screenshot_storage_ids: Option<Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
}
```

2. In `tina-data/src/convex_client.rs`, add client methods after the spec methods:

```rust
    // --- Design methods ---

    pub async fn create_design(
        &mut self,
        project_id: &str,
        title: &str,
        prompt: &str,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("projectId".into(), Value::from(project_id));
        args.insert("title".into(), Value::from(title));
        args.insert("prompt".into(), Value::from(prompt));
        let result = self.client.mutation("designs:createDesign", args).await?;
        extract_id(result)
    }

    pub async fn list_designs(
        &mut self,
        project_id: &str,
        status: Option<&str>,
    ) -> Result<Vec<DesignRecord>> {
        let mut args = BTreeMap::new();
        args.insert("projectId".into(), Value::from(project_id));
        if let Some(s) = status {
            args.insert("status".into(), Value::from(s));
        }
        let result = self.client.query("designs:listDesigns", args).await?;
        extract_list(result)
    }

    pub async fn create_variation(
        &mut self,
        design_id: &str,
        slug: &str,
        title: &str,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("designId".into(), Value::from(design_id));
        args.insert("slug".into(), Value::from(slug));
        args.insert("title".into(), Value::from(title));
        let result = self.client.mutation("designVariations:createVariation", args).await?;
        extract_id(result)
    }

    pub async fn list_variations(
        &mut self,
        design_id: &str,
    ) -> Result<Vec<DesignVariationRecord>> {
        let mut args = BTreeMap::new();
        args.insert("designId".into(), Value::from(design_id));
        let result = self.client.query("designVariations:listVariations", args).await?;
        extract_list(result)
    }

    pub async fn update_variation_screenshots(
        &mut self,
        variation_id: &str,
        storage_ids: &[String],
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("variationId".into(), Value::from(variation_id));
        let ids: Vec<Value> = storage_ids.iter().map(|s| Value::from(s.as_str())).collect();
        args.insert("screenshotStorageIds".into(), Value::Array(ids));
        let result = self.client.mutation("designVariations:updateVariation", args).await?;
        extract_id(result)
    }

    pub async fn generate_screenshot_upload_url(&mut self) -> Result<String> {
        let args = BTreeMap::new();
        let result = self
            .client
            .mutation("designVariations:generateScreenshotUploadUrl", args)
            .await?;
        match result {
            Value::String(url) => Ok(url),
            _ => anyhow::bail!("Expected string URL from generateScreenshotUploadUrl"),
        }
    }

    pub async fn link_spec_to_design(
        &mut self,
        spec_id: &str,
        design_id: &str,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("specId".into(), Value::from(spec_id));
        args.insert("designId".into(), Value::from(design_id));
        let result = self.client.mutation("specDesigns:linkSpecToDesign", args).await?;
        extract_id(result)
    }
```

Also add the `extract_list` helper if it doesn't exist — or adapt existing pattern for deserializing `Vec<T>`. Check how `extract_plan_list` works and follow the same pattern for designs and variations.

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && cargo check --manifest-path tina-data/Cargo.toml 2>&1 | tail -10`
Expected: Compiles without errors

---

### Task 13: Extend tina-daemon watcher and sync for design metadata

**Files:**
- `tina-daemon/src/watcher.rs`
- `tina-daemon/src/sync.rs`
- `tina-daemon/src/main.rs`

**Model:** opus

**review:** full

**Depends on:** 12

Extend the daemon to watch `ui/designs/sets/` in worktrees and sync design/variation metadata to Convex.

**Steps:**

1. In `tina-daemon/src/watcher.rs`:
   - Add `Design(PathBuf)` variant to `WatchEvent` enum:
     ```rust
     /// A design set file changed (meta.ts or screenshots)
     Design(PathBuf),
     ```
   - Add `design_dirs: Vec<PathBuf>` field to `DaemonWatcher`
   - Add `watch_design_dir` method (following `watch_plan_dir` pattern)
   - Update `classify_watch_path` to detect design paths: if the path is within a design dir and the filename is `meta.ts` or has an image extension (`.png`, `.jpg`, `.webp`), classify as `WatchEvent::Design`

2. In `tina-daemon/src/sync.rs`:
   - Add `design_dirs: Vec<PathBuf>` to `SyncCache`
   - Add `find_worktree_by_design_path` method to `SyncCache` (following `find_worktree_by_plan_path`)
   - Add `sync_design_metadata` async function:
     ```rust
     pub async fn sync_design_metadata(
         client: &Arc<Mutex<TinaConvexClient>>,
         orchestration_id: &str,
         worktree_path: &Path,
         telemetry: Option<&DaemonTelemetry>,
     ) -> Result<()> {
         let sets_dir = worktree_path.join("ui").join("designs").join("sets");
         if !sets_dir.exists() {
             return Ok(());
         }

         // Read first-level dirs as designs, second-level as variations
         for design_entry in std::fs::read_dir(&sets_dir)? {
             let design_entry = design_entry?;
             if !design_entry.file_type()?.is_dir() {
                 continue;
             }
             let design_slug = design_entry.file_name().to_string_lossy().to_string();

             // Read meta.ts for title if present, else use slug
             let meta_path = design_entry.path().join("meta.ts");
             let title = if meta_path.exists() {
                 extract_title_from_meta(&meta_path).unwrap_or_else(|| design_slug.clone())
             } else {
                 design_slug.clone()
             };

             info!(design = %design_slug, "syncing design metadata");

             // For each variation subdirectory
             for var_entry in std::fs::read_dir(design_entry.path())? {
                 let var_entry = var_entry?;
                 if !var_entry.file_type()?.is_dir() {
                     continue;
                 }
                 let var_slug = var_entry.file_name().to_string_lossy().to_string();
                 info!(design = %design_slug, variation = %var_slug, "found variation");
             }
         }

         Ok(())
     }
     ```
   - Add a simple `extract_title_from_meta` helper that reads a `meta.ts` file and extracts a `title` field via regex pattern matching

3. In `tina-daemon/src/main.rs`:
   - In the worktree setup loop, add design dir watching after plan dir watching:
     ```rust
     let designs_dir = worktree.worktree_path.join("ui").join("designs").join("sets");
     if designs_dir.exists() {
         if let Err(e) = watcher.watch_design_dir(&designs_dir) {
             warn!(
                 feature = %worktree.feature,
                 path = %designs_dir.display(),
                 error = %e,
                 "failed to watch designs directory"
             );
         }
     }
     ```
   - In the event loop, add a handler for `WatchEvent::Design`:
     ```rust
     WatchEvent::Design(path) => {
         if let Some(worktree) = cache.find_worktree_by_design_path(&path) {
             if let Err(e) = sync_design_metadata(
                 &client,
                 &worktree.orchestration_id,
                 &worktree.worktree_path,
                 telemetry.as_ref(),
             ).await {
                 error!(error = %e, "failed to sync design metadata");
             }
         }
     }
     ```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && cargo check --manifest-path tina-daemon/Cargo.toml 2>&1 | tail -10`
Expected: Compiles without errors

---

### Task 14: Run full test suite and fix remaining issues

**Files:**
- Any files with remaining issues

**Model:** opus

**review:** full

**Depends on:** 5, 11, 13

**Steps:**

1. Run Convex tests:
   ```
   cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npm test
   ```
   Fix any failures.

2. Run Rust tests:
   ```
   cargo check --manifest-path tina-data/Cargo.toml
   cargo check --manifest-path tina-session/Cargo.toml
   cargo check --manifest-path tina-daemon/Cargo.toml
   cargo check --manifest-path tina-monitor/Cargo.toml
   cargo check --manifest-path tina-harness/Cargo.toml
   ```
   Fix any compilation errors (other crates may need the new `DesignRecord` type if they import from `tina-data`).

3. Run tina-web tests:
   ```
   cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx vitest run
   ```
   Fix any failures.

4. Search for any issues:
   ```
   grep -rn 'v.id("designs")' convex/ --include='*.ts' | grep -v node_modules | grep -v '_generated'
   ```
   Verify all new references are correct (no conflicts with Phase 1's design→spec rename).

5. Commit all changes:
   ```
   git add -A && git commit -m "feat: add design & variation data model (Phase 2)"
   ```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npm test 2>&1 | tail -5 && cargo check --manifest-path tina-data/Cargo.toml 2>&1 | tail -5 && cargo check --manifest-path tina-daemon/Cargo.toml 2>&1 | tail -5`
Expected: All tests pass, all crates compile

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 1500 |

---

## Phase Estimates

| Task | Estimated Time | Notes |
|------|---------------|-------|
| Task 1: Convex schema tables | 3 min | Schema additions |
| Task 2: Convex designs.ts CRUD | 5 min | New file, following specs.ts pattern |
| Task 3: Convex designVariations.ts | 5 min | New file, includes file storage |
| Task 4: Convex specDesigns.ts | 3 min | Join table, simple |
| Task 5: Convex tests | 5 min | 3 test files |
| Task 6: tina-web schemas + queryDefs | 3 min | 3 files |
| Task 7: DesignListPage + CreateDesignModal | 5 min | Following SpecListPage pattern |
| Task 8: DesignDetailPage | 5 min | Following SpecDetailPage pattern |
| Task 9: Routing + sidebar | 3 min | App.tsx + AppShell.tsx |
| Task 10: SpecDetailPage linked designs | 3 min | Small section addition |
| Task 11: tina-web tests | 5 min | Following existing patterns |
| Task 12: tina-data Rust types + client | 5 min | Following spec pattern |
| Task 13: tina-daemon watcher + sync | 5 min | New watcher event + sync function |
| Task 14: Full test suite | 5 min | Verification + fixes |
| **Total** | **~65 min** | |

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
