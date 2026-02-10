# Phase 7: Polish & E2E

## Summary

Final phase of the tina-web rebuild. Adds Playwright e2e tests, refines loading/error states, adds responsive panel sizing, performs an accessibility pass, and removes the route-level feature gate.

## Current State (Post Phase 6)

- 332 tests passing across 34 test files (all Vitest unit/component tests)
- TypeScript compiles cleanly (`tsc --noEmit` passes)
- Full three-column layout working: PhaseTimeline + TaskList | RightPanel
- Playwright config exists at `tina-web/playwright.config.ts` (testDir: `e2e/`, webServer configured) but no e2e tests yet
- `e2e/` directory does not exist
- Keyboard navigation implemented: sidebar, phaseTimeline, taskList sections with roving tabindex
- Quicklook modals (Phase, Task) have focus trap, Escape/Space dismiss, aria-modal
- DataErrorBoundary handles all four error types (QueryValidation, NotFound, Permission, Transient)
- No route-level feature gate was actually implemented (App.tsx routes directly to AppShell/OrchestrationPage) -- "remove feature gate" is a no-op verification

## Implementation Steps

### Step 1: Playwright e2e test infrastructure + first smoke test

**Files created:**
- `tina-web/e2e/smoke.spec.ts`

**What:**
- Create the `e2e/` directory
- Write a smoke test that loads the app, verifies the AppShell renders (header, sidebar nav, main content area, footer status bar)
- Verify the app does not crash on load with no Convex data (graceful empty state)
- This uses the real dev server (`npm run dev`) per the existing playwright.config.ts webServer config
- Test should verify page title, presence of landmark roles (`banner`, `navigation`, `main`)

**Tests (Playwright):**
- `smoke.spec.ts`: page loads, landmark regions present, no console errors

**Acceptance:** `npm run test:e2e` passes with the smoke test

---

### Step 2: E2E test for sidebar navigation flow

**Files created:**
- `tina-web/e2e/navigation.spec.ts`

**What:**
- Test navigating the sidebar: verify orchestration items render when data is available
- Test clicking a sidebar item updates the URL (`?orch=<id>`) and loads the OrchestrationPage content
- Test that the orchestration page shows the feature name and branch in the header area
- Test deep-link restoration: navigate directly to `/?orch=<id>` and verify page renders

**Note:** These e2e tests require a running Convex backend with data. If no orchestrations exist, the sidebar shows "No orchestrations found" -- test that empty state. For populated state, the tests depend on whatever data exists in the connected Convex deployment. The tests should be written defensively (check for existence of elements before interacting).

**Tests (Playwright):**
- `navigation.spec.ts`: sidebar renders, click selects orchestration, URL updates

**Acceptance:** Navigation e2e test passes

---

### Step 3: E2E test for keyboard navigation

**Files created:**
- `tina-web/e2e/keyboard.spec.ts`

**What:**
- Test Tab cycles focus between sections (sidebar -> main content)
- Test arrow keys navigate within the sidebar list
- Test Space opens quicklook modal
- Test Escape dismisses quicklook modal
- Test Enter selects an item

**Tests (Playwright):**
- `keyboard.spec.ts`: Tab focus cycling, arrow key navigation, Space/Escape quicklook, Enter selection

**Acceptance:** Keyboard e2e test passes

---

### Step 4: Loading state refinement

**Files modified:**
- `tina-web/src/components/OrchestrationPage.tsx`
- `tina-web/src/components/Sidebar.tsx`
- `tina-web/src/components/ReviewSection.tsx`
- `tina-web/src/components/OrchestrationPage.module.scss`
- `tina-web/src/components/Sidebar.module.scss`

**What:**
- Replace bare "Loading..." text strings with styled loading indicators:
  - Use a pulsing/skeleton approach consistent with the design tokens
  - Add a `.loading` class in SCSS modules with subtle pulse animation
  - Loading text should use `text-muted-foreground` color and be visually centered
- OrchestrationPage loading state: show a skeleton placeholder for the three-column layout
- Sidebar loading state: show pulse bars for the sidebar list items
- ReviewSection already has a styled loading state ("Loading review events...") -- keep as-is
- GitOpsSection loading state: currently falls through to showing empty state during load -- add explicit loading state

**Tests (Vitest):**
- Add test for GitOpsSection loading state renders loading indicator
- Verify OrchestrationPage loading state has appropriate ARIA attributes (`aria-busy="true"`)

**Acceptance:** All loading states are visually styled, tests pass

---

### Step 5: Error state refinement

**Files modified:**
- `tina-web/src/components/DataErrorBoundary.tsx`

**What:**
- Refine the DataErrorBoundary default fallback rendering:
  - Add SCSS module styles for error states (currently uses inline/unstyled divs)
  - NotFoundError: show clear "not found" message with the resource type
  - QueryValidationError: show "Data error" with retry button, include the query key for debugging
  - TransientDataError: show retry button with a brief delay before allowing re-click
  - PermissionError: show blocked state
  - All error states should have visible focus ring on the retry button
- Add a `DataErrorBoundary.module.scss` file for error state styling

**Files created:**
- `tina-web/src/components/DataErrorBoundary.module.scss`

**Tests (Vitest):**
- Existing DataErrorBoundary tests already cover all error types (8 tests) -- verify they still pass
- Add test that retry button in QueryValidationError resets the boundary

**Acceptance:** Error states are visually polished, tests pass

---

### Step 6: Responsive panel sizing

**Files modified:**
- `tina-web/src/components/OrchestrationPage.module.scss`
- `tina-web/src/components/AppShell.module.scss`

**What:**
- Add responsive breakpoints for the layout:
  - Below 1200px: right panel collapses to an overlay/drawer or stacks below
  - Below 900px: timeline column narrows to 200px minimum
  - Below 768px: single-column layout (timeline, tasks, and right panel stack vertically)
- Use CSS `@media` queries in the SCSS modules
- Sidebar collapse should trigger at narrower viewports automatically
- Add `min-width: 0` on grid children to prevent overflow
- Right panel width: use `clamp(200px, 20vw, 256px)` instead of fixed 256px

**Tests (Vitest):**
- Component tests don't test media queries -- verify in Playwright
- Add Playwright viewport test

**Files created/modified:**
- `tina-web/e2e/responsive.spec.ts` -- test narrow viewport renders without overflow

**Acceptance:** Layout adapts at breakpoints, no horizontal scroll at narrow widths

---

### Step 7: Accessibility pass

**Files modified:**
- `tina-web/src/components/AppShell.tsx` -- replace `role="main"` with semantic `<main>` tag (it's already a `<main>` element, so `role="main"` is redundant; keep aria-label)
- `tina-web/src/components/RightPanel.tsx` -- add `role="complementary"` and `aria-label="Orchestration details"`
- `tina-web/src/components/StatusSection.tsx` -- add `aria-label` to action buttons ("Open design plan", "Open phase plan")
- `tina-web/src/components/ReviewSection.tsx` -- add `aria-label` to review action button
- `tina-web/src/components/TaskListPanel.tsx` -- add `aria-label="Tasks"` to the list container
- `tina-web/src/components/PhaseTimelinePanel.tsx` -- verify `aria-current` is set correctly on selected phase
- `tina-web/src/components/OrchestrationPage.tsx` -- add `aria-live="polite"` region for status changes

**What:**
- Audit all interactive elements for accessible names
- Ensure all buttons have accessible labels (not just icon content)
- Verify focus ring visibility on all focusable elements
- Sidebar collapse button: improve label to reflect state ("Collapse sidebar" / "Expand sidebar")
- Verify list roles: sidebar uses `role="list"`, task list uses `role="list"`, phase timeline should use `role="listbox"` (since items are selectable)

**Tests (Vitest):**
- Add test for RightPanel landmark role
- Add test for button aria-labels in StatusSection
- Add test for aria-live region in OrchestrationPage
- Update AppShell test for semantic main element

**Acceptance:** Accessibility audit passes, screen reader landmarks are correct

---

### Step 8: Performance budget verification

**Files created:**
- `tina-web/e2e/performance.spec.ts`

**What:**
- Playwright test that measures:
  - First meaningful paint < 1.5s (using `page.evaluate` with Performance API)
  - Page load without console errors
  - No layout thrashing (no forced reflows during initial render)
- Verify bundle size hasn't regressed: add a script or Playwright check that `npm run build` output stays under a reasonable threshold
- This is a lightweight check, not a full Lighthouse audit

**Tests (Playwright):**
- `performance.spec.ts`: load time budget, no console errors

**Acceptance:** Performance test passes within budget

---

### Step 9: Verify no feature gate + final quality gates

**Files modified (potentially):**
- None if feature gate was never added

**What:**
- Verify App.tsx has no conditional routing or feature flags -- confirmed in current code (App.tsx routes directly)
- Run all quality gates:
  - `npm run typecheck`
  - `npm run test` (all 332+ Vitest tests pass)
  - `npm run build` (production build succeeds)
  - `npm run test:e2e` (all Playwright tests pass)
- Document the final test count

**Acceptance:** All quality gates pass, feature gate confirmed absent

## File Inventory

### New files
| File | Purpose |
|------|---------|
| `tina-web/e2e/smoke.spec.ts` | Smoke e2e test (page loads, landmarks present) |
| `tina-web/e2e/navigation.spec.ts` | Sidebar navigation + URL sync e2e test |
| `tina-web/e2e/keyboard.spec.ts` | Keyboard navigation e2e test |
| `tina-web/e2e/responsive.spec.ts` | Responsive layout e2e test |
| `tina-web/e2e/performance.spec.ts` | Performance budget e2e test |
| `tina-web/src/components/DataErrorBoundary.module.scss` | Error state styles |

### Modified files
| File | Changes |
|------|---------|
| `tina-web/src/components/OrchestrationPage.tsx` | Loading skeleton, aria-live region |
| `tina-web/src/components/OrchestrationPage.module.scss` | Loading skeleton styles, responsive breakpoints |
| `tina-web/src/components/Sidebar.tsx` | Loading skeleton |
| `tina-web/src/components/Sidebar.module.scss` | Loading skeleton styles |
| `tina-web/src/components/AppShell.tsx` | Semantic main tag, dynamic collapse label |
| `tina-web/src/components/AppShell.module.scss` | Responsive breakpoints |
| `tina-web/src/components/DataErrorBoundary.tsx` | Styled error fallbacks |
| `tina-web/src/components/RightPanel.tsx` | ARIA landmark role |
| `tina-web/src/components/StatusSection.tsx` | Button aria-labels |
| `tina-web/src/components/ReviewSection.tsx` | Button aria-label |
| `tina-web/src/components/TaskListPanel.tsx` | List aria-label |
| `tina-web/src/components/PhaseTimelinePanel.tsx` | Role verification |
| `tina-web/src/components/GitOpsSection.tsx` | Explicit loading state |

### Test files (new or modified)
| File | New tests |
|------|-----------|
| `tina-web/e2e/smoke.spec.ts` | ~3 tests |
| `tina-web/e2e/navigation.spec.ts` | ~4 tests |
| `tina-web/e2e/keyboard.spec.ts` | ~5 tests |
| `tina-web/e2e/responsive.spec.ts` | ~2 tests |
| `tina-web/e2e/performance.spec.ts` | ~2 tests |
| `tina-web/src/components/__tests__/GitOpsSection.test.tsx` | +1 test (loading state) |
| `tina-web/src/components/__tests__/RightPanel.test.tsx` | +1 test (ARIA role) |
| `tina-web/src/components/__tests__/StatusSection.test.tsx` | +1 test (button labels) |
| `tina-web/src/components/__tests__/OrchestrationPage.test.tsx` | +1 test (aria-live) |
| `tina-web/src/components/__tests__/AppShell.test.tsx` | +1 test (collapse label) |

## Risks

1. **Playwright requires live Convex**: E2e tests hit the real dev Convex deployment. If no data exists, tests must handle empty states gracefully. Tests should be written defensively with conditional assertions.
2. **Responsive SCSS may break existing layout**: Breakpoints must be tested at current viewport first to ensure no regression, then at smaller sizes.
3. **Performance budget on CI**: First meaningful paint target (1.5s) may vary between local and CI environments. Use generous thresholds and skip or warn on CI rather than hard-failing initially.

## Dependencies

- Playwright browsers must be installed (`npx playwright install chromium`)
- Dev server must be running for e2e tests (handled by playwright.config.ts webServer)
- Convex backend must be accessible (prod or dev profile per TINA_ENV)

## Deliverable

Production-ready main page with:
- 5 Playwright e2e test files covering navigation, keyboard, responsive, and performance
- ~16 new Playwright tests + ~5 new Vitest tests
- Refined loading/error states with consistent styling
- Responsive layout that adapts to viewport sizes
- Complete ARIA landmark and label coverage
- All quality gates passing (typecheck, test, build, test:e2e)
