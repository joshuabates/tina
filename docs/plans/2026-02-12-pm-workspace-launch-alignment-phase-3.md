# PM Workspace + Launch UX Realignment Phase 3: Ticket Model Cleanup

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 511a592b748db4277258484d1c277b2c64d84093

**Goal:** Remove `assignee` end-to-end from the ticket model — schema, API, UI, and tests. Update list/detail/create/edit contracts and filters.

**Architecture:** The design mandates removing ticket assignee complexity. This is a pure removal — no new fields, no replacements. The `assignee` field currently appears in:

1. **Convex schema** (`convex/schema.ts`): `assignee: v.optional(v.string())` + `by_assignee` index
2. **Convex API** (`convex/tickets.ts`): `createTicket` arg, `listTickets` arg + filter, `updateTicket` arg + handler
3. **Convex tests** (`convex/tickets.test.ts`): assignee filter test, update test, partial update test
4. **Frontend schema** (`tina-web/src/schemas/ticket.ts`): `assignee: optionalString`
5. **Frontend queryDefs** (`tina-web/src/services/data/queryDefs.ts`): `TicketListQuery` args
6. **Frontend schema/queryDefs tests**: assignee in decode/args tests
7. **UI components**: `CreateTicketModal`, `EditTicketModal`, `TicketListPage` column, `TicketDetailPage` metadata
8. **UI component tests**: assignee in builders, render assertions, form field tests
9. **Design mockup data** (`designs/src/designSets/project1-pm-workgraph/data.ts`): `TicketRecord.assignee`

Execution order: backend first (schema + API + tests), then frontend schema, then UI. Each step leaves tests green.

**Key files:**
- `convex/schema.ts` — Remove `assignee` field and `by_assignee` index
- `convex/tickets.ts` — Remove `assignee` from create/list/update
- `convex/tickets.test.ts` — Remove assignee-related tests
- `tina-web/src/schemas/ticket.ts` — Remove `assignee` from TicketSummary
- `tina-web/src/services/data/queryDefs.ts` — Remove `assignee` from TicketListQuery args
- `tina-web/src/services/data/__tests__/queryDefs.test.ts` — Remove assignee from tests
- `tina-web/src/schemas/__tests__/schemas.test.ts` — Remove assignee from decode tests
- `tina-web/src/components/pm/CreateTicketModal.tsx` — Remove assignee field
- `tina-web/src/components/pm/EditTicketModal.tsx` — Remove assignee field
- `tina-web/src/components/pm/TicketListPage.tsx` — Remove assignee column
- `tina-web/src/components/pm/TicketDetailPage.tsx` — Remove assignee metadata
- `tina-web/src/components/__tests__/TicketListPage.test.tsx` — Remove assignee from tests
- `tina-web/src/components/__tests__/TicketDetailPage.test.tsx` — Remove assignee from tests
- `designs/src/designSets/project1-pm-workgraph/data.ts` — Remove assignee from TicketRecord

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 300 |

---

## Tasks

### Task 1: Remove assignee from Convex schema and tickets API

**Files:**
- `convex/schema.ts`
- `convex/tickets.ts`

**Model:** opus

**review:** full

**Depends on:** none

Remove `assignee` from the tickets table schema, the `by_assignee` index, and all three API functions that reference it.

**Steps:**

1. In `convex/schema.ts`, remove the `assignee` field and `by_assignee` index from the `tickets` table definition.

Remove:
```
    assignee: v.optional(v.string()),
```
from the tickets table fields (line 285).

Remove:
```
    .index("by_assignee", ["assignee"]),
```
from the tickets table indexes (line 295).

2. In `convex/tickets.ts`, make these changes:

**`createTicket` mutation (line 5-51):**
- Remove `assignee: v.optional(v.string()),` from args (line 12)
- Remove `assignee: args.assignee,` from the insert object (line 45)

**`listTickets` query (line 76-117):**
- Remove `assignee: v.optional(v.string()),` from args (line 81)
- Remove the assignee filter block (lines 107-109):
```typescript
    if (args.assignee) {
      queryObj = queryObj.filter((q) => q.eq(q.field("assignee"), args.assignee));
    }
```

**`updateTicket` mutation (line 119-179):**
- Remove `assignee: v.optional(v.string()),` from args (line 127)
- Remove the assignee update block (lines 169-171):
```typescript
    if (args.assignee !== undefined) {
      updates.assignee = args.assignee;
    }
```

3. Verify Convex tests still compile (some will fail until Task 2):

Run: `cd /Users/joshua/Projects/tina && npx vitest run convex/tickets.test.ts 2>&1 | tail -20`

Expected: Tests referencing `assignee` args will fail. This is expected — Task 2 fixes them.

---

### Task 2: Update Convex ticket tests to remove assignee references

**Files:**
- `convex/tickets.test.ts`

**Model:** opus

**review:** full

**Depends on:** 1

Remove all assignee-related test cases and clean up any remaining references.

**Steps:**

1. In `convex/tickets.test.ts`:

**Remove the "filters by assignee" test entirely (lines 362-399)** — the entire `test("filters by assignee", ...)` block.

**Update "updates priority and assignee" test (lines 484-506)** — rename to "updates priority and estimate" and remove `assignee` from the mutation call and assertion:

Replace:
```typescript
    test("updates priority and assignee", async () => {
```
with:
```typescript
    test("updates priority and estimate", async () => {
```

Remove `assignee: "dev-team",` from the `updateTicket` call (line 498).
Remove `expect(ticket?.assignee).toBe("dev-team");` (line 504).

**Update "partial updates only modify specified fields" test (lines 508-529)** — remove `assignee` from the `createTicket` call and assertion:

Remove `assignee: "alice",` from the `createTicket` call (line 517).
Remove `expect(ticket?.assignee).toBe("alice");` (line 527).

**Remove the assertion in "creates ticket with correct key format" test (line 30)**:
Remove `expect(ticket?.assignee).toBeUndefined();` (line 30).

2. Run Convex tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run convex/tickets.test.ts 2>&1 | tail -20`

Expected: All Convex ticket tests pass.

---

### Task 3: Remove assignee from frontend schema and queryDefs

**Files:**
- `tina-web/src/schemas/ticket.ts`
- `tina-web/src/services/data/queryDefs.ts`
- `tina-web/src/schemas/__tests__/schemas.test.ts`
- `tina-web/src/services/data/__tests__/queryDefs.test.ts`

**Model:** opus

**review:** full

**Depends on:** none

Remove `assignee` from the frontend data layer — the Effect schema, query definitions, and their tests.

**Steps:**

1. In `tina-web/src/schemas/ticket.ts`, remove the `assignee` field from `TicketSummary`:

Remove:
```typescript
  assignee: optionalString,
```

2. In `tina-web/src/services/data/queryDefs.ts`, remove `assignee` from `TicketListQuery` args (line 148):

Remove:
```typescript
    assignee: Schema.optional(Schema.String),
```

3. In `tina-web/src/schemas/__tests__/schemas.test.ts`:

In the "decodes a ticket with minimal optional fields" test (around line 198-206):
Remove:
```typescript
    expect(Option.isNone(result.assignee)).toBe(true)
```

In the "decodes a ticket with all optional fields present" test (around line 208-231):
Remove `assignee: "worker-1",` from the raw object.
Remove:
```typescript
    expect(Option.getOrThrow(result.assignee)).toBe("worker-1")
```

4. In `tina-web/src/services/data/__tests__/queryDefs.test.ts`:

In the "args schema accepts optional filters" test (around line 473-483):
Remove `assignee: "alice",` from the args object.
Remove `expect(decoded.assignee).toBe("alice")`.

In the "schema decodes valid ticket list data" test (around line 489-511):
Remove `assignee: undefined,` from the ticket object.

In the "schema decodes valid ticket detail data" test (around line 532-548):
Remove `assignee: "alice",` from the ticket object.

5. Run schema and queryDefs tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/schemas/__tests__/schemas.test.ts tina-web/src/services/data/__tests__/queryDefs.test.ts 2>&1 | tail -20`

Expected: All tests pass.

---

### Task 4: Remove assignee from TicketListPage and its tests

**Files:**
- `tina-web/src/components/pm/TicketListPage.tsx`
- `tina-web/src/components/__tests__/TicketListPage.test.tsx`

**Model:** opus

**review:** full

**Depends on:** 3

Remove the Assignee column from the ticket table and the assignee field references from tests.

**Steps:**

1. In `tina-web/src/components/pm/TicketListPage.tsx`:

Remove the `<th>Assignee</th>` header (line 105).

Remove the assignee `<td>` cell from the table row (lines 150-155):
```tsx
                  <td>
                    {Option.isSome(ticket.assignee)
                      ? ticket.assignee.value
                      : <span className={styles.unassigned}>—</span>
                    }
                  </td>
```

If `Option` is no longer used elsewhere in the file after this removal, remove it from the import statement.

2. In `tina-web/src/components/__tests__/TicketListPage.test.tsx`:

Remove `assignee` from the `buildTicketSummary` function default (line 64):
Remove `assignee: none<string>(),`

Remove `assignee` from the ticket fixture overrides (lines 94, 104):
Remove `assignee: some("alice"),` from ticket t1.
Remove `assignee: none<string>(),` from ticket t2.

**Remove the "displays assignee when present" test entirely** (lines 192-196).

**Remove the "shows assignee text input in modal" test entirely** (lines 289-301) — from the create form describe block.

If `some` is no longer imported elsewhere after these removals, clean up the import.

3. Run TicketListPage tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/TicketListPage.test.tsx 2>&1 | tail -20`

Expected: All tests pass.

---

### Task 5: Remove assignee from TicketDetailPage, modals, and their tests

**Files:**
- `tina-web/src/components/pm/TicketDetailPage.tsx`
- `tina-web/src/components/pm/CreateTicketModal.tsx`
- `tina-web/src/components/pm/EditTicketModal.tsx`
- `tina-web/src/components/__tests__/TicketDetailPage.test.tsx`

**Model:** opus

**review:** full

**Depends on:** 3

Remove assignee from the ticket detail metadata display, create modal, edit modal, and their tests.

**Steps:**

1. In `tina-web/src/components/pm/TicketDetailPage.tsx`:

Remove the entire assignee metadata block (lines 194-202):
```tsx
        <div className={styles.metadataItem} data-testid="meta-assignee">
          <div className={styles.metadataLabel}>Assignee</div>
          <div className={styles.metadataValue}>
            {Option.isSome(ticket.assignee)
              ? ticket.assignee.value
              : <span className={styles.unassigned}>Unassigned</span>
            }
          </div>
        </div>
```

If `Option` is no longer used elsewhere in the file after this removal, remove it from the import.

2. In `tina-web/src/components/pm/CreateTicketModal.tsx`:

Remove `const [assignee, setAssignee] = useState("")` (line 26).
Remove `...(assignee.trim() ? { assignee: assignee.trim() } : {}),` from the createTicket call (line 44).
Remove the entire assignee form field JSX (lines 109-119):
```tsx
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="ticket-assignee">Assignee</label>
          <input
            id="ticket-assignee"
            className={styles.formInput}
            type="text"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Assignee name"
          />
        </div>
```

3. In `tina-web/src/components/pm/EditTicketModal.tsx`:

Remove the assignee state initialization (lines 26-28):
```typescript
  const [assignee, setAssignee] = useState(
    Option.isSome(ticket.assignee) ? ticket.assignee.value : "",
  )
```

Remove `assignee?: string` from the payload type (line 53).
Remove `...(assignee.trim() ? { assignee: assignee.trim() } : {}),` from the payload (line 60).
Remove the entire assignee form field JSX (lines 113-123):
```tsx
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="edit-assignee">Assignee</label>
          <input
            id="edit-assignee"
            className={styles.formInput}
            type="text"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Assignee name"
          />
        </div>
```

If `Option` is no longer used in `EditTicketModal.tsx` after this removal, remove it from the import.

4. In `tina-web/src/components/__tests__/TicketDetailPage.test.tsx`:

Remove `assignee: none<string>(),` from `buildTicket` defaults (line 49).

**Remove "renders assignee metadata when present" test entirely** (lines 156-163).

**Remove "renders unassigned when no assignee" test entirely** (lines 165-170).

**Update the "edit form has title, description, priority, assignee, estimate, design fields" test** — rename to "edit form has title, description, priority, estimate, design fields" and remove:
```typescript
      expect(screen.getByLabelText(/assignee/i)).toBeInTheDocument()
```

**Update the "edit form pre-fills current ticket values" test** — remove `assignee: some("alice")` from `buildTicket` and remove:
```typescript
      expect(screen.getByLabelText(/assignee/i)).toHaveValue("alice")
```

5. Run TicketDetailPage tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/TicketDetailPage.test.tsx 2>&1 | tail -20`

Expected: All tests pass.

---

### Task 6: Remove assignee from design mockup data

**Files:**
- `designs/src/designSets/project1-pm-workgraph/data.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Remove `assignee` from the mock data types and records used in design prototyping.

**Steps:**

1. In `designs/src/designSets/project1-pm-workgraph/data.ts`:

Remove `assignee: string;` from the `TicketRecord` type (line 29).

Remove `assignee: "..."` from each ticket record in the data array (lines 111, 122, 133, 144, 155).

2. Check for any compilation issues:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project designs/tsconfig.json 2>&1 | tail -10`

Expected: No type errors (or if no tsconfig exists for designs, manually verify the file is valid TypeScript).

---

### Task 7: Run full test suite and verify clean removal

**Files:**
- (any files needing fixes)

**Model:** opus

**review:** full

**Depends on:** 1, 2, 3, 4, 5, 6

Run the full test suite across both Convex and tina-web. Verify no remaining references to `assignee` in ticket-related code.

**Steps:**

1. Run Convex tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run convex/tickets.test.ts 2>&1 | tail -20`

Expected: All Convex ticket tests pass.

2. Run tina-web tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run --reporter=verbose 2>&1 | tail -50`

Expected: All tests pass. If any fail, investigate and fix.

3. Run TypeScript type check:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -20`

Expected: No type errors.

4. Verify no remaining assignee references in ticket code:

Run: `cd /Users/joshua/Projects/tina && grep -rn "assignee" convex/tickets.ts convex/schema.ts tina-web/src/schemas/ticket.ts tina-web/src/services/data/queryDefs.ts tina-web/src/components/pm/TicketListPage.tsx tina-web/src/components/pm/TicketDetailPage.tsx tina-web/src/components/pm/CreateTicketModal.tsx tina-web/src/components/pm/EditTicketModal.tsx 2>&1`

Expected: No output (no remaining assignee references in ticket code). Note: `assignee` may still exist in non-ticket code (e.g., `TaskListPanel.tsx` uses `assignee` for task ownership — this is unrelated to tickets and should NOT be removed).

---

## Phase Estimates

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Remove assignee from Convex schema and API | 3 min |
| 2 | Update Convex ticket tests | 3 min |
| 3 | Remove assignee from frontend schema + queryDefs + tests | 4 min |
| 4 | Remove assignee from TicketListPage + tests | 3 min |
| 5 | Remove assignee from TicketDetailPage + modals + tests | 5 min |
| 6 | Remove assignee from design mockup data | 2 min |
| 7 | Full test suite + verification | 3 min |
| **Total** | | **~23 min** |

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
