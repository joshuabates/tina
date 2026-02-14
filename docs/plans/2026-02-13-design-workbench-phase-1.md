# Design Workbench Phase 1: Rename designs → specs

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** fd177cd95ad8af1553adee40ebe2c10bcee591f5

**Goal:** Rename the existing `designs` concept (architecture/requirement documents) to `specs` across the entire codebase. After this phase, the word "design" in the codebase refers exclusively to visual explorations (introduced in Phase 2+), not architecture documents.

**Architecture:** This is a wide-surface rename touching Convex schema/functions, tina-web frontend, tina-data/tina-session/tina-daemon Rust crates, generated code, and all tests. No new features — purely mechanical rename with careful attention to not breaking existing functionality.

**IMPORTANT — What NOT to rename:**
- `"design"` as a `NavMode` in `tina-web/src/lib/navigation.ts` — this is the visual design workbench mode (future Phase 3+)
- `DesignModePage` component — visual design mode placeholder
- `DesignSidebar` in `AppShell.tsx` — visual design mode sidebar
- `"Design"` label in AppShell nav modes — visual design mode label
- `StatusSection.tsx` "Design Plan" button — will be addressed when design workbench is built

**Rename mapping (canonical reference):**

| Old (architecture doc) | New (spec) |
|----------------------|------------|
| `designs` (Convex table) | `specs` |
| `designKey` (field) | `specKey` |
| `designId` (FK in orchestrations, tickets) | `specId` |
| `v.id("designs")` | `v.id("specs")` |
| `"design"` (counterType) | `"spec"` |
| `"design"` (targetType in workComments) | `"spec"` |
| `designDocPath` (orchestration field) | `specDocPath` |
| `designOnly` (orchestration field) | `specOnly` |
| `designs.ts` (Convex file) | `specs.ts` |
| `designPresets.ts` | `specPresets.ts` |
| `designValidation.ts` | `specValidation.ts` |
| `createDesign` / `getDesign` / etc. | `createSpec` / `getSpec` / etc. |
| `DesignSummary` (schema) | `SpecSummary` |
| `DesignListQuery` / `DesignDetailQuery` | `SpecListQuery` / `SpecDetailQuery` |
| `DesignListPage` / `DesignDetailPage` | `SpecListPage` / `SpecDetailPage` |
| `CreateDesignModal` / `EditDesignModal` | `CreateSpecModal` / `EditSpecModal` |
| `useDesignValidation` | `useSpecValidation` |
| `/plan/designs` (route) | `/plan/specs` |
| `DesignRecord` (Rust) | `SpecRecord` |
| `design_key` / `design_id` (Rust) | `spec_key` / `spec_id` |
| `design_doc` / `design_doc_path` (Rust) | `spec_doc` / `spec_doc_path` |
| `design_only` (Rust) | `spec_only` |
| `ContextType::Design` (daemon) | `ContextType::Spec` |

---

### Task 1: Rename Convex schema table and FK references

**Files:**
- `convex/schema.ts`

**Model:** opus

**review:** full

**Depends on:** none

Rename the `designs` table definition to `specs` and update all field/FK references.

**Steps:**

1. In `convex/schema.ts`, rename the `designs` table to `specs`:
   - Table name: `designs` → `specs`
   - Field `designKey` → `specKey`
   - Index `by_key` field: `designKey` → `specKey`

2. Update `orchestrations` table:
   - `designId: v.optional(v.id("designs"))` → `specId: v.optional(v.id("specs"))`

3. Update `tickets` table:
   - `designId: v.optional(v.id("designs"))` → `specId: v.optional(v.id("specs"))`
   - Index `by_design` field: `designId` → rename to `by_spec` with `specId`

4. Update `workComments` table:
   - `targetType` comment: `// design | ticket` → `// spec | ticket`

5. Update `projectCounters` table:
   - `counterType` comment: `// design | ticket` → `// spec | ticket`

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npx convex dev --once --typecheck=disable 2>&1 | head -20`
Expected: Schema validation passes (may show warnings about data)

---

### Task 2: Rename Convex designs.ts → specs.ts and support files

**Files:**
- `convex/designs.ts` → `convex/specs.ts`
- `convex/designPresets.ts` → `convex/specPresets.ts`
- `convex/designValidation.ts` → `convex/specValidation.ts`

**Model:** opus

**review:** full

**Depends on:** 1

**Steps:**

1. `git mv convex/designs.ts convex/specs.ts`

2. In `convex/specs.ts`:
   - Update `allocateKey` call: `"design"` → `"spec"`
   - Update `designKey` variable and field: `designKey` → `specKey`
   - Update key format: keep `${project.name.toUpperCase()}-D${keyNumber}` as `${project.name.toUpperCase()}-S${keyNumber}` (S for spec)
   - All `ctx.db.insert("designs", ...)` → `ctx.db.insert("specs", ...)`
   - All `ctx.db.query("designs")` → `ctx.db.query("specs")`
   - All `v.id("designs")` → `v.id("specs")`
   - Function names: `createDesign` → `createSpec`, `getDesign` → `getSpec`, `getDesignByKey` → `getSpecByKey`, `listDesigns` → `listSpecs`, `updateDesign` → `updateSpec`, `transitionDesign` → `transitionSpec`, `updateDesignMarkers` → `updateSpecMarkers`
   - All `args.designId` → `args.specId`, variable names `design` → `spec`
   - Error messages: "Design not found" → "Spec not found", etc.
   - Import: `from "./designPresets"` → `from "./specPresets"`

3. `git mv convex/designPresets.ts convex/specPresets.ts`

4. In `convex/specPresets.ts`:
   - Update doc comment: "designs" → "specs"
   - No functional changes needed (preset logic is generic)

5. `git mv convex/designValidation.ts convex/specValidation.ts`

6. In `convex/specValidation.ts`:
   - Update doc comment: "Design validation" → "Spec validation"
   - Rename `DesignValidationInput` → `SpecValidationInput`
   - Rename `validateDesignForLaunch` → `validateSpecForLaunch`
   - Error messages: "Design has no..." → "Spec has no...", "design must contain" → "spec must contain"

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && git status --short convex/`
Expected: Shows renamed files (R convex/designs.ts → convex/specs.ts, etc.) and modified specs.ts

---

### Task 3: Update Convex cross-referencing function files

**Files:**
- `convex/tickets.ts`
- `convex/orchestrations.ts`
- `convex/controlPlane.ts`
- `convex/workComments.ts`
- `convex/projectCounters.ts`
- `convex/projects.ts`

**Model:** opus

**review:** full

**Depends on:** 2

**Steps:**

1. `convex/tickets.ts`:
   - All `designId` args/fields → `specId`
   - All `v.id("designs")` → `v.id("specs")`
   - `clearDesignId` arg → `clearSpecId`
   - Variable `design` → `spec` in validation
   - Error messages: "Design not found" → "Spec not found", "Design X does not belong" → "Spec X does not belong"
   - Index usage: `"by_design"` → `"by_spec"`

2. `convex/orchestrations.ts`:
   - `designId` arg → `specId`
   - `v.id("designs")` → `v.id("specs")`
   - `patch.designId` → `patch.specId`

3. `convex/controlPlane.ts`:
   - Import: `validateDesignForLaunch` → `validateSpecForLaunch` from `"./specValidation"`
   - `validateStartExecutionPayload`: rename `hasDesignId` → `hasSpecId`, update payload field checks (`design_id`/`designId` → `spec_id`/`specId`), update error message
   - `launchOrchestration` args: `designId: v.id("designs")` → `specId: v.id("specs")`
   - Handler: `design` variable → `spec`, all `args.designId` → `args.specId`, error messages, `designOnly` → `specOnly`, `designDocPath` → `specDocPath` in insert, `design_id` → `spec_id` in payload JSON
   - `startOrchestration`: `designOnly` → `specOnly`

4. `convex/workComments.ts`:
   - `v.literal("design")` → `v.literal("spec")` in both `addComment` and `listComments`
   - Target validation: `"design"` branch → `"spec"` branch, cast `Id<"designs">` → `Id<"specs">`
   - Error: "Design not found" → "Spec not found"

5. `convex/projectCounters.ts`:
   - `"design"` literal → `"spec"` in type union and everywhere
   - `counterType: "design" | "ticket"` → `counterType: "spec" | "ticket"`

6. `convex/projects.ts`:
   - `deleteEntitiesWithComments(ctx, "designs", "design", ...)` → `deleteEntitiesWithComments(ctx, "specs", "spec", ...)`
   - Table type: `"designs" | "tickets"` → `"specs" | "tickets"`
   - Target type: `"design" | "ticket"` → `"spec" | "ticket"`

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npx tsc --noEmit --project convex/tsconfig.json 2>&1 | head -30`
Expected: No type errors (or only errors from test files not yet updated)

---

### Task 4: Update generated orchestration core code

**Files:**
- `scripts/generate-contracts.mjs`
- `convex/generated/orchestrationCore.ts`
- `tina-data/src/generated/orchestration_core_fields.rs`

**Model:** opus

**review:** full

**Depends on:** 1

**Steps:**

1. In `scripts/generate-contracts.mjs`:
   - Find the line `"    pub design_id: Option<String>,"` and change to `"    pub spec_id: Option<String>,"`
   - Find any `designDocPath` references and change to `specDocPath`
   - Find any `designOnly` references and change to `specOnly`
   - Check for `designId` in the TypeScript output section and change to `specId`

2. Run the generator:
   ```
   node scripts/generate-contracts.mjs
   ```

3. Verify `convex/generated/orchestrationCore.ts` now contains:
   - `specDocPath: v.string()` (was `designDocPath`)
   - `specOnly: v.optional(v.boolean())` (was `designOnly`)
   - No remaining `design` references

4. Verify `tina-data/src/generated/orchestration_core_fields.rs` now contains:
   - `pub spec_id: Option<String>` (was `design_id`)
   - `pub spec_doc_path: String` (was `design_doc_path` — check actual field name)
   - `pub spec_only: Option<bool>` (was `design_only`)

Run: `node "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/scripts/generate-contracts.mjs"`
Expected: Files regenerated without errors

---

### Task 5: Update Convex test files

**Files:**
- `convex/designs.test.ts` → `convex/specs.test.ts`
- `convex/tickets.test.ts`
- `convex/orchestrations.test.ts`
- `convex/controlPlane.test.ts`
- `convex/workComments.test.ts`
- `convex/projectCounters.test.ts`
- `convex/projects.test.ts`
- `convex/test_helpers.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 3

**Steps:**

1. `git mv convex/designs.test.ts convex/specs.test.ts`

2. In `convex/specs.test.ts`:
   - Update all imports: `api.designs.*` → `api.specs.*`
   - Update all table references: `"designs"` → `"specs"`
   - Update all field names: `designKey` → `specKey`, `designId` → `specId`
   - Update all function call references
   - Update test descriptions

3. In all other test files:
   - Update `api.designs.*` → `api.specs.*` references
   - Update `designId` → `specId` in test data
   - Update `"design"` → `"spec"` for counterType/targetType
   - Update `v.id("designs")` → `v.id("specs")`

4. In `convex/test_helpers.ts`:
   - Update any design-related helper functions/data

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npm test 2>&1 | tail -20`
Expected: All Convex tests pass

---

### Task 6: Update tina-web schemas, queryDefs, and hooks

**Files:**
- `tina-web/src/schemas/design.ts` → `tina-web/src/schemas/spec.ts`
- `tina-web/src/schemas/ticket.ts`
- `tina-web/src/schemas/index.ts`
- `tina-web/src/services/data/queryDefs.ts`
- `tina-web/src/hooks/useDesignValidation.ts` → `tina-web/src/hooks/useSpecValidation.ts`
- `tina-web/src/hooks/index.ts`

**Model:** opus

**review:** full

**Depends on:** 2

**Steps:**

1. `git mv tina-web/src/schemas/design.ts tina-web/src/schemas/spec.ts`

2. In `tina-web/src/schemas/spec.ts`:
   - `DesignSummary` → `SpecSummary`
   - `designKey` field → `specKey`

3. In `tina-web/src/schemas/ticket.ts`:
   - `designId` field → `specId`

4. In `tina-web/src/schemas/index.ts`:
   - `export { DesignSummary } from "./design"` → `export { SpecSummary } from "./spec"`

5. In `tina-web/src/services/data/queryDefs.ts`:
   - Import: `DesignSummary` → `SpecSummary`
   - `DesignListQuery` → `SpecListQuery`: update key, query ref (`api.specs.listSpecs`), schema
   - `DesignDetailQuery` → `SpecDetailQuery`: update key, query ref (`api.specs.getSpec`), args (`specId`), schema
   - `TicketListQuery`: `designId` arg → `specId`

6. `git mv tina-web/src/hooks/useDesignValidation.ts tina-web/src/hooks/useSpecValidation.ts`

7. In `tina-web/src/hooks/useSpecValidation.ts`:
   - Import: `validateDesignForLaunch` → `validateSpecForLaunch` from `"@convex/specValidation"`
   - Import: `DesignSummary` → `SpecSummary`
   - Function name: `useDesignValidation` → `useSpecValidation`
   - Parameter: `design` → `spec`
   - Error message: "No design selected" → "No spec selected"

8. In `tina-web/src/hooks/index.ts`:
   - `export { useDesignValidation } from "./useDesignValidation"` → `export { useSpecValidation } from "./useSpecValidation"`

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors only from components not yet updated (DesignListPage, etc.)

---

### Task 7: Rename tina-web spec components (formerly DesignListPage, DesignDetailPage, modals)

**Files:**
- `tina-web/src/components/pm/DesignListPage.tsx` → `SpecListPage.tsx`
- `tina-web/src/components/pm/DesignListPage.module.scss` → `SpecListPage.module.scss`
- `tina-web/src/components/pm/DesignDetailPage.tsx` → `SpecDetailPage.tsx`
- `tina-web/src/components/pm/DesignDetailPage.module.scss` → `SpecDetailPage.module.scss`
- `tina-web/src/components/pm/CreateDesignModal.tsx` → `CreateSpecModal.tsx`
- `tina-web/src/components/pm/EditDesignModal.tsx` → `EditSpecModal.tsx`

**Model:** opus

**review:** full

**Depends on:** 6

**Steps:**

1. Git mv all files:
   ```
   git mv tina-web/src/components/pm/DesignListPage.tsx tina-web/src/components/pm/SpecListPage.tsx
   git mv tina-web/src/components/pm/DesignListPage.module.scss tina-web/src/components/pm/SpecListPage.module.scss
   git mv tina-web/src/components/pm/DesignDetailPage.tsx tina-web/src/components/pm/SpecDetailPage.tsx
   git mv tina-web/src/components/pm/DesignDetailPage.module.scss tina-web/src/components/pm/SpecDetailPage.module.scss
   git mv tina-web/src/components/pm/CreateDesignModal.tsx tina-web/src/components/pm/CreateSpecModal.tsx
   git mv tina-web/src/components/pm/EditDesignModal.tsx tina-web/src/components/pm/EditSpecModal.tsx
   ```

2. In `SpecListPage.tsx`:
   - Import: `DesignListQuery` → `SpecListQuery`, `DesignSummary` → `SpecSummary`, `CreateDesignModal` → `CreateSpecModal`, scss import path
   - Function name: `DesignListPage` → `SpecListPage`
   - All `data-testid="design-*"` → `data-testid="spec-*"`
   - Variable names: `designsResult` → `specsResult`, `designs` → `specs`, `design` → `spec`
   - SCSS class names: `styles.designList` → `styles.specList`, `styles.designKey` → `styles.specKey`, `styles.designTitle` → `styles.specTitle`
   - UI text: "Designs" → "Specs", "Create Design" → "Create Spec", "No designs yet" → "No specs yet"
   - Route path: `/plan/designs/` → `/plan/specs/`
   - Callback names: `handleCreated` param name stays generic

3. In `SpecListPage.module.scss`:
   - Rename CSS class names: `.designList` → `.specList`, `.designKey` → `.specKey`, `.designTitle` → `.specTitle`

4. In `SpecDetailPage.tsx`:
   - Import: `DesignDetailQuery` → `SpecDetailQuery`, `EditDesignModal` → `EditSpecModal`, `DesignSummary` → `SpecSummary`, scss import path
   - Function name: `DesignDetailPage` → `SpecDetailPage`
   - All `data-testid="design-*"` → `data-testid="spec-*"`
   - `api.designs.transitionDesign` → `api.specs.transitionSpec`
   - `api.designs.updateDesignMarkers` → `api.specs.updateSpecMarkers`
   - Variable names: `designResult` → `specResult`, `design` → `spec`
   - `Id<"designs">` → `Id<"specs">`
   - SCSS class names: `styles.designKey` → `styles.specKey`
   - Status labels: `DESIGN_STATUS_LABELS` → `SPEC_STATUS_LABELS`, `designStatusLabel` → `specStatusLabel`
   - UI text: "Discuss Design" → "Discuss Spec", "Design not found" → "Spec not found"
   - `contextType: "design"` → `contextType: "spec"`
   - `targetType="design"` → `targetType="spec"` in CommentTimeline

5. In `SpecDetailPage.module.scss`:
   - Rename CSS class names: `.designKey` → `.specKey`

6. In `CreateSpecModal.tsx`:
   - Function name: `CreateDesignModal` → `CreateSpecModal`
   - Interface: `CreateDesignModalProps` → `CreateSpecModalProps`
   - `api.designs.createDesign` → `api.specs.createSpec`
   - `data-testid="design-create-form"` → `data-testid="spec-create-form"`
   - UI text: "Create Design" → "Create Spec", "Design title" → "Spec title", "Design content" → "Spec content", "Failed to create design" → "Failed to create spec"
   - Variable names: `createDesign` → `createSpec`, `designId` → `specId`

7. In `EditSpecModal.tsx`:
   - Function name: `EditDesignModal` → `EditSpecModal`
   - Interface: `EditDesignModalProps` → `EditSpecModalProps`
   - Parameter type: `DesignSummary` → `SpecSummary`
   - `api.designs.updateDesign` → `api.specs.updateSpec`
   - `data-testid="design-edit-form"` → `data-testid="spec-edit-form"`
   - `Id<"designs">` → `Id<"specs">`
   - UI text: "Edit Design" → "Edit Spec", "Failed to update design" → "Failed to update spec"
   - Variable names: `updateDesign` → `updateSpec`

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors only from App.tsx and other components not yet updated

---

### Task 8: Update tina-web components with spec references (tickets, launch, routing)

**Files:**
- `tina-web/src/components/pm/TicketDetailPage.tsx`
- `tina-web/src/components/pm/EditTicketModal.tsx`
- `tina-web/src/components/pm/CreateTicketModal.tsx`
- `tina-web/src/components/pm/TicketListPage.tsx`
- `tina-web/src/components/pm/LaunchModal.tsx`
- `tina-web/src/components/pm/LaunchOrchestrationPage.tsx`
- `tina-web/src/components/pm/CommentTimeline.tsx`
- `tina-web/src/App.tsx`
- `tina-web/src/components/AppShell.tsx`

**Model:** opus

**review:** full

**Depends on:** 7

**Steps:**

1. In `TicketDetailPage.tsx`:
   - Import: `DesignListQuery` → `SpecListQuery`, `DesignSummary` → `SpecSummary` (if used)
   - `designsResult` → `specsResult`, `designs` → `specs`
   - `designMap` → `specMap`
   - `rawDesignId` → `rawSpecId` (reading from `ticket.specId` now)
   - `linkedDesign` → `linkedSpec`
   - Route: `/plan/designs/` → `/plan/specs/`
   - `styles.designLink` → `styles.specLink`
   - `data-testid="meta-design"` → `data-testid="meta-spec"`
   - Label: "Design" → "Spec"

2. In `EditTicketModal.tsx`:
   - Import: `DesignSummary` → `SpecSummary`
   - `designs` prop type → `specs: readonly SpecSummary[]`
   - `designId` state → `specId`
   - `Id<"designs">` → `Id<"specs">`
   - `clearDesignId` → `clearSpecId`
   - `ticket.designId` → `ticket.specId`
   - Label: "Design Link" → "Spec Link"
   - `id="edit-design"` → `id="edit-spec"`
   - Variable `d.designKey` → `d.specKey`

3. In `CreateTicketModal.tsx`:
   - Import: `DesignSummary` → `SpecSummary`
   - `designs` prop → `specs`
   - `designId` state → `specId`
   - `Id<"designs">` → `Id<"specs">`
   - Label: "Design Link" → "Spec Link"
   - `id="ticket-design"` → `id="ticket-spec"`
   - `d.designKey` → `d.specKey`

4. In `TicketListPage.tsx`:
   - Check for any design references and update

5. In `LaunchModal.tsx`:
   - Import: `DesignListQuery` → `SpecListQuery`, `useDesignValidation` → `useSpecValidation`
   - `selectedDesignId` → `selectedSpecId`
   - `designsResult` → `specsResult`
   - `designs` → `specs`, `selectedDesign` → `selectedSpec`
   - `validation` = `useSpecValidation(selectedSpec)`
   - `Id<"designs">` → `Id<"specs">`
   - `designId:` → `specId:` in launch call
   - UI text: "Select a design" → "Select a spec", "Design" label → "Spec"
   - `id="design-select"` → `id="spec-select"`

6. In `LaunchOrchestrationPage.tsx`:
   - Same changes as LaunchModal.tsx
   - Import: `DesignListQuery` → `SpecListQuery`, `useDesignValidation` → `useSpecValidation`
   - All design → spec renames
   - Error: "Please select a design" → "Please select a spec"
   - "Design validation must pass" → "Spec validation must pass"

7. In `App.tsx`:
   - Import: `DesignDetailPage` → `SpecDetailPage`, `DesignListPage` → `SpecListPage`
   - Routes: `path="designs"` → `path="specs"`, `path="designs/:designId"` → `path="specs/:specId"`
   - Component refs: `<DesignListPage />` → `<SpecListPage />`, `<DesignDetailPage />` → `<SpecDetailPage />`
   - **Keep** `path="design"` route (visual design mode) and `<DesignModePage />` as-is

8. In `AppShell.tsx`:
   - In the plan mode sidebar section: "Designs" → "Specs"
   - NavLink `to={.../plan/designs}` → `to={.../plan/specs}`
   - Link text: "All designs" → "All specs"
   - **Keep** the `DesignSidebar` component and `case "design"` as-is (visual design mode)

9. In `CommentTimeline.tsx`:
   - Check if it passes `targetType="design"` anywhere and update to `"spec"`
   - The component receives `targetType` as a prop, so callers are responsible — verify no hardcoded "design"

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx tsc --noEmit 2>&1 | head -30`
Expected: No type errors (or only test file errors)

---

### Task 9: Update tina-web test files

**Files:**
- `tina-web/src/components/__tests__/DesignDetailPage.test.tsx`
- `tina-web/src/components/__tests__/DesignListPage.test.tsx`
- `tina-web/src/components/__tests__/CreateDesignModal.test.tsx`
- `tina-web/src/components/__tests__/TicketDetailPage.test.tsx`
- `tina-web/src/components/__tests__/TicketListPage.test.tsx`
- `tina-web/src/components/__tests__/CommentTimeline.test.tsx`
- `tina-web/src/components/__tests__/PmRoutes.test.tsx`
- `tina-web/src/components/__tests__/PmShell.test.tsx`
- `tina-web/src/components/__tests__/FormDialog.test.tsx`
- `tina-web/src/components/__tests__/StatusSection.test.tsx`
- `tina-web/src/services/data/__tests__/queryDefs.test.ts`
- `tina-web/src/schemas/__tests__/schemas.test.ts`
- `tina-web/src/test/builders/domain/entities.ts`
- `tina-web/src/test/builders/domain.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 8

**Steps:**

1. Rename test files:
   ```
   git mv tina-web/src/components/__tests__/DesignDetailPage.test.tsx tina-web/src/components/__tests__/SpecDetailPage.test.tsx
   git mv tina-web/src/components/__tests__/DesignListPage.test.tsx tina-web/src/components/__tests__/SpecListPage.test.tsx
   git mv tina-web/src/components/__tests__/CreateDesignModal.test.tsx tina-web/src/components/__tests__/CreateSpecModal.test.tsx
   ```

2. In all renamed test files:
   - Update imports to reference new component/query/schema names
   - Update `data-testid` selectors: `design-*` → `spec-*`
   - Update test descriptions
   - Update mock data field names

3. In ticket test files:
   - Update `designId` → `specId` references
   - Update `designs` → `specs` mock data

4. In `queryDefs.test.ts` and `schemas.test.ts`:
   - Update all design → spec references

5. In test builders (`entities.ts`, `domain.ts`):
   - Update `DesignSummary` → `SpecSummary`
   - Update `designKey` → `specKey`
   - Update builder function names

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx vitest run 2>&1 | tail -30`
Expected: All tina-web tests pass

---

### Task 10: Update tina-data Rust types and client

**Files:**
- `tina-data/src/types.rs`
- `tina-data/src/convex_client.rs`
- `tina-data/src/tina_state.rs`

**Model:** opus

**review:** full

**Depends on:** 4

**Steps:**

1. In `tina-data/src/types.rs`:
   - `DesignRecord` → `SpecRecord`
   - `design_key` field → `spec_key`
   - Serde rename attribute: `#[serde(rename = "designKey")]` → `#[serde(rename = "specKey")]` (if present)
   - `TicketRecord.design_id` → `spec_id`
   - Update doc comments

2. In `tina-data/src/convex_client.rs`:
   - All method names: `create_design` → `create_spec`, `get_design` → `get_spec`, `get_design_by_key` → `get_spec_by_key`, `list_designs` → `list_specs`, `update_design` → `update_spec`, `transition_design` → `transition_spec`
   - All Convex function path references: `"designs:createDesign"` → `"specs:createSpec"`, etc.
   - Return types: `DesignRecord` → `SpecRecord`
   - Field names in args: `"designId"` → `"specId"`, `"designKey"` → `"specKey"`
   - Parameter names: `design_id` → `spec_id`, `design_key` → `spec_key`
   - Ticket-related: `design_id` param → `spec_id`, `"designId"` arg → `"specId"`, `clearDesignId` → `clearSpecId`

3. In `tina-data/src/tina_state.rs`:
   - Update test data: `"design_doc"` → `"spec_doc"` (if applicable based on state schema)

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && cargo check --manifest-path tina-data/Cargo.toml 2>&1 | tail -10`
Expected: Compiles without errors

---

### Task 11: Update tina-session Rust code

**Files:**
- `tina-session/src/commands/work/design.rs` → `tina-session/src/commands/work/spec.rs`
- `tina-session/src/commands/work/mod.rs`
- `tina-session/src/commands/work/ticket.rs`
- `tina-session/src/convex.rs`
- `tina-session/src/state/schema.rs`
- `tina-session/src/state/orchestrate.rs`
- `tina-session/src/state/validation.rs`
- `tina-session/src/commands/orchestrate.rs`
- `tina-session/src/commands/init.rs`
- `tina-session/src/commands/start.rs`
- `tina-session/src/commands/state.rs`
- `tina-session/src/commands/state_sync.rs`
- `tina-session/src/main.rs`

**Model:** opus

**review:** full

**Depends on:** 10

**Steps:**

1. `git mv tina-session/src/commands/work/design.rs tina-session/src/commands/work/spec.rs`

2. In `tina-session/src/commands/work/mod.rs`:
   - `mod design;` → `mod spec;`
   - Update any `design::*` references to `spec::*`
   - Update subcommand name: `"design"` → `"spec"`

3. In `tina-session/src/commands/work/spec.rs` (formerly design.rs):
   - `map_design_id_error` → `map_spec_id_error`
   - All `design_id` → `spec_id`, `design` → `spec` variables
   - `create_design` → `create_spec`, `get_design` → `get_spec`, etc.
   - Error messages: "Invalid design id" → "Invalid spec id", "Design not found" → "Spec not found"
   - JSON field: `"designId"` → `"specId"`, `"designKey"` → `"specKey"`, `"designs"` → `"specs"`
   - Print: "Created design:" → "Created spec:", "Wrote design" → "Wrote spec"
   - `Path: .designId` → `Path: .specId`, `v.id("designs")` → `v.id("specs")`
   - Function `resolve` and `resolve_to_file`: update all design → spec

4. In `tina-session/src/commands/work/ticket.rs`:
   - Update `design_id` param → `spec_id`

5. In `tina-session/src/convex.rs`:
   - Import: `DesignRecord` → `SpecRecord`
   - `OrchestrationEntry` struct: `design_doc_path` → `spec_doc_path`, `design_id` → `spec_id`
   - All method names: `create_design` → `create_spec`, etc.
   - Method body: delegate to `self.client.create_spec(...)` etc.
   - Ticket methods: `design_id` param → `spec_id`
   - Comment methods: update doc comments
   - Mapping functions: `design_doc_path` → `spec_doc_path`, `design_id` → `spec_id`

6. In `tina-session/src/state/schema.rs`:
   - `design_doc: PathBuf` → `spec_doc: PathBuf`
   - `design_id: Option<String>` → `spec_id: Option<String>`
   - Update any `design_only` → `spec_only` fields
   - `ModelPolicy` comment: "design validator" → "spec validator"
   - "design validation" → "spec validation" in comments

7. In state, orchestrate, init, start, state_sync files:
   - All `design_doc` → `spec_doc`, `design_id` → `spec_id`, `design_doc_path` → `spec_doc_path`
   - CLI arg: `--design-id` → `--spec-id` (check if this is a public CLI arg)
   - Update match arms and function calls

8. In `tina-session/src/main.rs`:
   - Update CLI arg definitions if `--design-id` exists
   - Update subcommand routing: `"design"` → `"spec"`

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && cargo check --manifest-path tina-session/Cargo.toml 2>&1 | tail -10`
Expected: Compiles without errors

---

### Task 12: Update tina-daemon Rust code

**Files:**
- `tina-daemon/src/sessions.rs`
- `tina-daemon/src/actions.rs`

**Model:** opus

**review:** full

**Depends on:** 11

**Steps:**

1. In `tina-daemon/src/sessions.rs`:
   - `ContextType::Design` → `ContextType::Spec`
   - String representation: `"Design"` → `"Spec"`
   - Context seed: `"Design session. Design ID:"` → `"Spec session. Spec ID:"`
   - Test: `build_context_seed_design_type` → `build_context_seed_spec_type`
   - Test data: `ContextType::Design` → `ContextType::Spec`, `"design-001"` → `"spec-001"`, `"Auth system design"` → `"Auth system spec"`

2. In `tina-daemon/src/actions.rs`:
   - `design_id` field in payload struct → `spec_id`
   - All `payload.design_id` → `payload.spec_id`
   - CLI args: `"--design-id"` → `"--spec-id"`
   - Error messages: `"design_id"` → `"spec_id"`, `"start_orchestration requires 'design_id'"` → `"start_orchestration requires 'spec_id'"`
   - `"start_execution requires 'plan'/'plan_path' or 'design_id'"` → `"start_execution requires 'plan'/'plan_path' or 'spec_id'"`
   - All test data: `design_id: Some("design_abc".to_string())` → `spec_id: Some("spec_abc".to_string())`
   - Test names: `test_build_cli_args_start_execution_without_plan_uses_design_id` → `...uses_spec_id`, `test_start_orchestration_missing_design_id` → `...missing_spec_id`, etc.
   - Test assertions: update expected arg strings

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && cargo check --manifest-path tina-daemon/Cargo.toml 2>&1 | tail -10`
Expected: Compiles without errors

---

### Task 13: Run full test suite and fix remaining issues

**Files:**
- Any files with remaining issues

**Model:** opus

**review:** full

**Depends on:** 5, 9, 12

**Steps:**

1. Run Convex tests:
   ```
   cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npm test
   ```
   Fix any failures.

2. Run Rust tests:
   ```
   cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && cargo test --manifest-path tina-data/Cargo.toml
   cargo test --manifest-path tina-session/Cargo.toml
   cargo test --manifest-path tina-daemon/Cargo.toml
   ```
   Fix any failures.

3. Run tina-web tests:
   ```
   cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench/tina-web" && npx vitest run
   ```
   Fix any failures.

4. Search for any remaining `"design"` references that should be `"spec"`:
   ```
   grep -rn '"design"' convex/ --include='*.ts' | grep -v node_modules | grep -v '_generated'
   grep -rn 'designId\|designKey\|Design' tina-web/src/ --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v DesignMode | grep -v DesignSidebar | grep -v node_modules
   ```
   Fix any missed renames.

5. Commit all changes:
   ```
   git add -A && git commit -m "refactor: rename designs to specs (Phase 1)"
   ```

Run: `cd "/Users/joshua/Projects/tina/.worktrees/Design workbench/.worktrees/design-workbench" && npm test 2>&1 | tail -5 && cargo test --manifest-path tina-data/Cargo.toml 2>&1 | tail -5 && cargo test --manifest-path tina-session/Cargo.toml 2>&1 | tail -5 && cargo test --manifest-path tina-daemon/Cargo.toml 2>&1 | tail -5`
Expected: All tests pass

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 0 (rename-only, no net new lines) |

Note: This phase is purely a rename refactor. Total line count should stay approximately the same. No new files are created (only renamed). No new functions are added.

---

## Phase Estimates

| Task | Estimated Time | Notes |
|------|---------------|-------|
| Task 1: Convex schema rename | 3 min | Single file, mechanical |
| Task 2: Convex function file renames | 5 min | 3 files, extensive internal updates |
| Task 3: Convex cross-references | 5 min | 6 files, mechanical |
| Task 4: Generated code update | 3 min | Script + regenerate |
| Task 5: Convex test files | 5 min | 7+ test files |
| Task 6: tina-web schemas/hooks | 4 min | 6 files |
| Task 7: tina-web spec components | 5 min | 6 files + scss |
| Task 8: tina-web other components + routing | 5 min | 9 files |
| Task 9: tina-web test files | 5 min | 10+ test files |
| Task 10: tina-data Rust | 4 min | 3 files |
| Task 11: tina-session Rust | 5 min | 13 files |
| Task 12: tina-daemon Rust | 4 min | 2 files |
| Task 13: Full test suite | 5 min | Verification + fixes |
| **Total** | **~58 min** | |

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
