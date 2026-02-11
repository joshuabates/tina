# Phase 1: Schema and Convex Functions

## Goal

Add the four new PM tables (`designs`, `tickets`, `workComments`, `projectCounters`) and their indexes to `convex/schema.ts`, implement the Convex mutation/query functions in dedicated files, and cover every operation with `convex-test` tests. At the end of this phase, all PM entity CRUD, status transitions, and key allocation are tested and passing.

## Deliverables

1. Schema additions in `convex/schema.ts` for `designs`, `tickets`, `workComments`, `projectCounters`
2. `convex/designs.ts` — create, get, list, update, transition mutations/queries
3. `convex/tickets.ts` — create, get, list, update, transition mutations/queries
4. `convex/workComments.ts` — add, list mutations/queries
5. `convex/projectCounters.ts` — internal key allocation (not directly exposed)
6. `convex/designs.test.ts` — full test coverage
7. `convex/tickets.test.ts` — full test coverage
8. `convex/workComments.test.ts` — full test coverage
9. Cascade delete support in `projects.ts:deleteProject`

## Sequencing

Steps are ordered so each builds on the previous and can be verified independently.

---

### Step 1: Add schema tables and indexes

**Edit `convex/schema.ts`** to add four new tables after the existing `telemetryRollups` table:

```typescript
designs: defineTable({
  projectId: v.id("projects"),
  designKey: v.string(),
  title: v.string(),
  markdown: v.string(),
  status: v.string(), // draft | in_review | approved | archived
  createdAt: v.string(),
  updatedAt: v.string(),
  archivedAt: v.optional(v.string()),
})
  .index("by_project", ["projectId"])
  .index("by_project_status", ["projectId", "status"])
  .index("by_key", ["designKey"]),

tickets: defineTable({
  projectId: v.id("projects"),
  designId: v.optional(v.id("designs")),
  ticketKey: v.string(),
  title: v.string(),
  description: v.string(),
  status: v.string(), // todo | in_progress | in_review | blocked | done | canceled
  priority: v.string(), // low | medium | high | urgent
  assignee: v.optional(v.string()),
  estimate: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  closedAt: v.optional(v.string()),
})
  .index("by_project", ["projectId"])
  .index("by_project_status", ["projectId", "status"])
  .index("by_design", ["designId"])
  .index("by_key", ["ticketKey"])
  .index("by_assignee", ["assignee"]),

workComments: defineTable({
  projectId: v.id("projects"),
  targetType: v.string(), // design | ticket
  targetId: v.string(),
  authorType: v.string(), // human | agent
  authorName: v.string(),
  body: v.string(),
  createdAt: v.string(),
  editedAt: v.optional(v.string()),
})
  .index("by_target", ["targetType", "targetId"])
  .index("by_project_created", ["projectId", "createdAt"]),

projectCounters: defineTable({
  projectId: v.id("projects"),
  counterType: v.string(), // design | ticket
  nextValue: v.number(),
})
  .index("by_project_type", ["projectId", "counterType"]),
```

**Verification:** `npx convex dev` deploys successfully (or `npx convex typecheck` passes).

---

### Step 2: Implement `convex/projectCounters.ts`

This is an internal module used by designs and tickets for atomic key allocation. It is not directly exposed as a public API.

**Create `convex/projectCounters.ts`:**

```typescript
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function allocateKey(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  counterType: "design" | "ticket",
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
```

Key behavior:
- First call for a project+counterType returns `1` and seeds the counter at `2`.
- Subsequent calls atomically read-and-increment.
- Uses `.unique()` because the `by_project_type` index should yield at most one row.

**Verification:** Tested indirectly through design and ticket creation tests in steps 3-4.

---

### Step 3: Implement `convex/designs.ts`

**Create `convex/designs.ts`** with these functions:

#### `createDesign` (mutation)
- Args: `projectId`, `title`, `markdown`
- Validates the project exists (throw if not found)
- Looks up project name for key prefix (e.g. project name "TINA" -> prefix "TINA")
- Allocates key via `allocateKey(ctx, projectId, "design")` -> `TINA-D1`
- Inserts with `status: "draft"`, timestamps set to `new Date().toISOString()`
- Returns the new design ID

#### `getDesign` (query)
- Args: `designId: v.id("designs")`
- Returns the design document or `null`

#### `getDesignByKey` (query)
- Args: `designKey: v.string()`
- Looks up by `by_key` index
- Returns the design document or `null`

#### `listDesigns` (query)
- Args: `projectId: v.id("projects")`, `status: v.optional(v.string())`
- If `status` is provided, uses `by_project_status` index
- Otherwise uses `by_project` index
- Returns designs sorted by `createdAt` desc

#### `updateDesign` (mutation)
- Args: `designId: v.id("designs")`, `title: v.optional(v.string())`, `markdown: v.optional(v.string())`
- Patches only provided fields + sets `updatedAt`
- Returns the design ID
- Throws if design not found

#### `transitionDesign` (mutation)
- Args: `designId: v.id("designs")`, `newStatus: v.string()`
- Validates the transition is allowed:
  - `draft` -> `in_review`
  - `in_review` -> `approved` | `draft` (reject back to draft)
  - `approved` -> `archived`
  - `archived` -> `draft` (unarchive)
- Throws on invalid transition with descriptive error
- Sets `archivedAt` when transitioning to `archived`, clears it when leaving `archived`
- Sets `updatedAt`
- Returns the design ID

**Key format:** The project name is used as the key prefix. Look up the project by ID, use `project.name.toUpperCase()` for the prefix. Design keys are `{PREFIX}-D{number}` (e.g. `TINA-D1`, `TINA-D2`).

**Verification:** See step 5 for tests.

---

### Step 4: Implement `convex/tickets.ts`

**Create `convex/tickets.ts`** with these functions:

#### `createTicket` (mutation)
- Args: `projectId`, `title`, `description`, `priority` (default `"medium"`), `designId?`, `assignee?`, `estimate?`
- Validates project exists
- If `designId` provided, validates design exists
- Allocates key via `allocateKey(ctx, projectId, "ticket")` -> `TINA-1`
- Inserts with `status: "todo"`, timestamps set
- Returns the new ticket ID

#### `getTicket` (query)
- Args: `ticketId: v.id("tickets")`
- Returns the ticket document or `null`

#### `getTicketByKey` (query)
- Args: `ticketKey: v.string()`
- Looks up by `by_key` index
- Returns the ticket document or `null`

#### `listTickets` (query)
- Args: `projectId: v.id("projects")`, `status: v.optional(v.string())`, `designId: v.optional(v.id("designs"))`, `assignee: v.optional(v.string())`
- Uses the most specific index available:
  - If `designId` provided, use `by_design` index, filter status/assignee in-memory
  - If `status` provided, use `by_project_status` index, filter assignee in-memory
  - Otherwise use `by_project` index
- Returns tickets sorted by `createdAt` desc

#### `updateTicket` (mutation)
- Args: `ticketId: v.id("tickets")`, `title?`, `description?`, `priority?`, `assignee?`, `estimate?`, `designId?`
- Patches only provided fields + sets `updatedAt`
- If `designId` provided, validates design exists
- Throws if ticket not found
- Returns the ticket ID

#### `transitionTicket` (mutation)
- Args: `ticketId: v.id("tickets")`, `newStatus: v.string()`
- Validates the transition is allowed:
  - `todo` -> `in_progress` | `blocked` | `canceled`
  - `in_progress` -> `in_review` | `blocked` | `canceled`
  - `in_review` -> `done` | `in_progress` (rework)
  - `blocked` -> `todo` | `in_progress` | `canceled`
  - `done` -> `todo` (reopen)
  - `canceled` -> `todo` (reopen)
- Sets `closedAt` when transitioning to `done` or `canceled`, clears it otherwise
- Sets `updatedAt`
- Throws on invalid transition with descriptive error
- Returns the ticket ID

**Key format:** Ticket keys are `{PREFIX}-{number}` (e.g. `TINA-1`, `TINA-2`). Same project name lookup as designs.

**Verification:** See step 6 for tests.

---

### Step 5: Implement `convex/workComments.ts`

**Create `convex/workComments.ts`** with these functions:

#### `addComment` (mutation)
- Args: `projectId`, `targetType` (`"design"` | `"ticket"`), `targetId` (string — the Convex ID as string), `authorType` (`"human"` | `"agent"`), `authorName`, `body`
- Validates target exists:
  - If `targetType === "design"`, look up design by ID
  - If `targetType === "ticket"`, look up ticket by ID
- Inserts with `createdAt` set to `new Date().toISOString()`
- Returns the new comment ID

#### `listComments` (query)
- Args: `targetType: v.string()`, `targetId: v.string()`
- Uses `by_target` index
- Returns comments sorted by `createdAt` asc (chronological)

**Verification:** See step 7 for tests.

---

### Step 6: Write `convex/designs.test.ts`

**Create `convex/designs.test.ts`** following the existing test patterns (see `commits.test.ts`, `projects.test.ts`).

Test cases:

**`designs:createDesign`**
- Creates a design with auto-generated key (`TINA-D1` for first design)
- Sequential creates produce incrementing keys (`TINA-D1`, `TINA-D2`)
- Initializes with `status: "draft"` and timestamps set
- Throws when project does not exist

**`designs:getDesign`**
- Returns design by ID
- Returns `null` for non-existent ID

**`designs:getDesignByKey`**
- Returns design by key string
- Returns `null` for non-existent key

**`designs:listDesigns`**
- Lists all designs for a project
- Filters by status when status arg provided
- Returns empty array when no designs exist
- Does not return designs from other projects

**`designs:updateDesign`**
- Updates title only
- Updates markdown only
- Updates both title and markdown
- Sets `updatedAt` on update
- Throws when design does not exist

**`designs:transitionDesign`**
- `draft` -> `in_review` succeeds
- `in_review` -> `approved` succeeds
- `in_review` -> `draft` (reject) succeeds
- `approved` -> `archived` succeeds, sets `archivedAt`
- `archived` -> `draft` succeeds, clears `archivedAt`
- Invalid transition throws (e.g. `draft` -> `approved`)
- Throws when design does not exist

**Verification:** `npm test -- convex/designs.test.ts` passes.

---

### Step 7: Write `convex/tickets.test.ts`

**Create `convex/tickets.test.ts`** following the same patterns.

Test cases:

**`tickets:createTicket`**
- Creates a ticket with auto-generated key (`TINA-1`)
- Sequential creates produce incrementing keys (`TINA-1`, `TINA-2`)
- Initializes with `status: "todo"` and `priority` set
- Links to design when `designId` provided
- Throws when project does not exist
- Throws when `designId` references non-existent design

**`tickets:getTicket`**
- Returns ticket by ID
- Returns `null` for non-existent ID

**`tickets:getTicketByKey`**
- Returns ticket by key string
- Returns `null` for non-existent key

**`tickets:listTickets`**
- Lists all tickets for a project
- Filters by status
- Filters by design
- Returns empty array when no tickets exist
- Does not return tickets from other projects

**`tickets:updateTicket`**
- Updates individual fields
- Updates `designId` link
- Sets `updatedAt`
- Throws when ticket does not exist

**`tickets:transitionTicket`**
- `todo` -> `in_progress` succeeds
- `in_progress` -> `in_review` succeeds
- `in_review` -> `done` succeeds, sets `closedAt`
- `done` -> `todo` (reopen) succeeds, clears `closedAt`
- `in_progress` -> `blocked` succeeds
- `blocked` -> `in_progress` succeeds
- `canceled` -> `todo` (reopen) succeeds
- Invalid transition throws (e.g. `todo` -> `done`)
- Throws when ticket does not exist

**Verification:** `npm test -- convex/tickets.test.ts` passes.

---

### Step 8: Write `convex/workComments.test.ts`

**Create `convex/workComments.test.ts`** following the same patterns.

Test cases:

**`workComments:addComment`**
- Adds a comment on a design
- Adds a comment on a ticket
- Sets `createdAt` timestamp
- Supports both `human` and `agent` author types
- Throws when target design does not exist
- Throws when target ticket does not exist

**`workComments:listComments`**
- Lists comments for a design in chronological order
- Lists comments for a ticket in chronological order
- Returns empty array when no comments exist
- Does not return comments for other targets

**Verification:** `npm test -- convex/workComments.test.ts` passes.

---

### Step 9: Update cascade delete in `projects.ts`

**Edit `convex/projects.ts`** — add cleanup of new tables in `deleteProject`:

In the `deleteRowsByOrchestrationId` table union, the new tables are not orchestration-scoped (they're project-scoped), so add direct project-scoped cleanup:

```typescript
// Inside deleteProject handler, after orchestration cleanup loop:
// Delete project-scoped PM entities
const designs = await ctx.db
  .query("designs")
  .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
  .collect();
for (const design of designs) {
  // Delete comments targeting this design
  const designComments = await ctx.db
    .query("workComments")
    .withIndex("by_target", (q) =>
      q.eq("targetType", "design").eq("targetId", design._id),
    )
    .collect();
  for (const comment of designComments) {
    await ctx.db.delete(comment._id);
  }
  await ctx.db.delete(design._id);
}

const tickets = await ctx.db
  .query("tickets")
  .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
  .collect();
for (const ticket of tickets) {
  const ticketComments = await ctx.db
    .query("workComments")
    .withIndex("by_target", (q) =>
      q.eq("targetType", "ticket").eq("targetId", ticket._id),
    )
    .collect();
  for (const comment of ticketComments) {
    await ctx.db.delete(comment._id);
  }
  await ctx.db.delete(ticket._id);
}

// Delete project counters
const counters = await ctx.db
  .query("projectCounters")
  .withIndex("by_project_type", (q) => q.eq("projectId", args.projectId))
  .collect();
for (const counter of counters) {
  await ctx.db.delete(counter._id);
}
```

**Verification:** Existing `projects.test.ts` still passes. Optionally add a test that creates designs/tickets/comments under a project, deletes the project, and verifies all PM entities are gone.

---

### Step 10: Add test helpers

**Edit `convex/test_helpers.ts`** to add helpers for PM entity creation:

```typescript
export async function createProject(
  t: ConvexHarness,
  options: { name?: string; repoPath?: string } = {},
) {
  return await t.mutation(api.projects.createProject, {
    name: options.name ?? "TINA",
    repoPath: options.repoPath ?? "/Users/joshua/Projects/tina",
  });
}
```

This helper simplifies project creation in PM tests since every PM test needs a project.

**Verification:** All tests pass with updated helpers.

---

## File Inventory

### New files created
| File | Purpose |
|------|---------|
| `convex/projectCounters.ts` | Internal atomic key allocation for design/ticket keys |
| `convex/designs.ts` | Design CRUD + transition mutations and queries |
| `convex/tickets.ts` | Ticket CRUD + transition mutations and queries |
| `convex/workComments.ts` | Comment add + list mutations and queries |
| `convex/designs.test.ts` | Design function test coverage |
| `convex/tickets.test.ts` | Ticket function test coverage |
| `convex/workComments.test.ts` | Comment function test coverage |

### Files modified
| File | Change |
|------|--------|
| `convex/schema.ts` | Add `designs`, `tickets`, `workComments`, `projectCounters` tables |
| `convex/projects.ts` | Add PM entity cascade delete in `deleteProject` |
| `convex/test_helpers.ts` | Add `createProject` helper |

### Files unchanged
| File | Reason |
|------|--------|
| All existing `convex/*.ts` | No changes to existing orchestration functions |
| All existing `convex/*.test.ts` | Existing tests unaffected |

## Design Decisions

1. **Key prefix from project name:** The design says keys are like `TINA-D12` and `TINA-142`. The prefix comes from `project.name.toUpperCase()`. Projects must have meaningful short names (e.g. "TINA", not "My Long Project Name"). This is enforced by convention, not validation, in Project 1.

2. **`targetId` as string in `workComments`:** The design specifies `targetId: string`. This stores the Convex `_id` as a plain string. The comment functions validate that the target actually exists, but the schema uses `v.string()` rather than a polymorphic ID type since the target table varies.

3. **Counter initialization at 1:** First key allocated is always `1` (design `D1`, ticket `1`). The counter row is created on first use with `nextValue: 2`.

4. **Status transition validation:** Both designs and tickets enforce a transition graph server-side. Invalid transitions throw with a descriptive error message including current status, attempted status, and allowed transitions. This ensures CLI and UI consumers both get the same validation.

5. **No `projects` table changes:** The `projects` table schema is not modified. PM entities reference projects via `projectId: v.id("projects")`.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Counter race conditions under concurrent writes | Convex mutations are serializable — `.unique()` + `.patch()` is atomic within a mutation |
| `by_target` index uses `targetType + targetId` but comment deletion iterates | Acceptable for Project 1 volumes; could add `by_project` index to `workComments` if needed |
| Design key prefix depends on project name consistency | Convention-only in Project 1; Phase 2 CLI can validate/normalize |
| Cascade delete could be slow for projects with many entities | Acceptable for Project 1; could batch in future |

## Acceptance Criteria

1. `npm test` — all existing Convex tests pass (no regressions)
2. `npm test -- convex/designs.test.ts` — all design tests pass
3. `npm test -- convex/tickets.test.ts` — all ticket tests pass
4. `npm test -- convex/workComments.test.ts` — all comment tests pass
5. Key allocation produces correct sequential keys per project
6. Status transitions enforce the allowed transition graph
7. Invalid operations throw descriptive errors
8. `deleteProject` cleans up all PM entities
9. No changes to existing orchestration-related tables or functions
