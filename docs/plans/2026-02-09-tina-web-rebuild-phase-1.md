# Phase 1: Cleanup & Build Infrastructure

## Goal

Clean the project of spike app code, set up SCSS modules, define Effect Schemas to replace hand-written types, wire component testing and e2e infrastructure, and add quality-gate scripts. At the end of this phase the dev server and Storybook run on the cleaned codebase, all existing UI primitive stories render, the token bridge works, schemas compile, and the quality scripts (`typecheck`, `test`, `test:e2e`, `build`) pass.

## Deliverables

1. Spike app code removed (components, hooks, types)
2. SCSS modules working with a global `_tokens.scss` bridge
3. Effect Schema definitions for every Convex-consumed domain type
4. Component test infrastructure (Vitest + jsdom + Testing Library)
5. Playwright e2e scaffold (config + smoke test)
6. Quality gate scripts wired in `package.json`
7. Minimal `App.tsx` + `main.tsx` rewritten with provider ordering
8. Dev server + Storybook both start successfully

## Sequencing

Steps are ordered so that each builds on the previous and can be verified independently.

---

### Step 1: Remove spike app code

**Files to delete:**
- `src/components/Dashboard.tsx`
- `src/components/EventTimeline.tsx`
- `src/components/OrchestrationControls.tsx`
- `src/components/OrchestrationDetail.tsx`
- `src/components/OrchestrationList.tsx`
- `src/components/ProjectDetail.tsx`
- `src/components/StatusBar.tsx`
- `src/components/TaskDetail.tsx`
- `src/components/TaskList.tsx`
- `src/components/TeamPanel.tsx`
- `src/hooks/useOrchestrations.ts`
- `src/hooks/useOrchestrationDetail.ts`
- `src/hooks/useProjectOrchestrations.ts`
- `src/hooks/useProjects.ts`
- `src/types.ts`

**Files to keep (no changes):**
- `src/components/ui/*` (all 18 primitives + stories)
- `src/docs/*` (Storybook documentation)
- `src/lib/utils.ts` (`cn()` utility)
- `src/convex.ts` (Convex client singleton)
- `src/index.css` (design tokens)
- `src/vite-env.d.ts`
- `.storybook/*` (Storybook config)
- `tailwind.config.ts`
- `postcss.config.js`

**Files to rewrite (in later steps):**
- `src/App.tsx`
- `src/main.tsx`

**Verification:** `tsc -b` should fail only on missing App/main exports (fixed in step 6).

---

### Step 2: Install new dependencies

**Production dependencies:**
- `effect` — Effect-TS core (services, layers, schema, typed errors)

**Dev dependencies:**
- `sass` — SCSS compilation (Vite handles `.module.scss` natively)
- `vitest` — test runner for component tests
- `@testing-library/react` — React component test utilities
- `@testing-library/jest-dom` — DOM matchers for assertions
- `@testing-library/user-event` — user interaction simulation
- `jsdom` — DOM environment for Vitest
- `@playwright/test` — e2e test runner

Note: `vitest` is already a transitive dependency via `@storybook/addon-vitest` but must be an explicit direct devDependency with the component test config.

**Verification:** `npm ls effect sass vitest @playwright/test` shows installed versions.

---

### Step 3: Set up SCSS modules + token bridge

**Create `src/styles/_tokens.scss`:**
```scss
// Bridge to CSS custom properties defined in index.css
// App components @use 'tokens' for shared SCSS variables

$bg-primary: var(--background);
$bg-card: var(--card);
$bg-sidebar: var(--sidebar);
$text-primary: var(--foreground);
$text-card: var(--card-foreground);
$text-sidebar: var(--sidebar-foreground);
$text-muted: var(--muted-foreground);
$accent: var(--primary);
$accent-foreground: var(--primary-foreground);
$border-color: var(--border);
$ring-color: var(--ring);

$font-display: 'Inter', sans-serif;
$font-mono: 'JetBrains Mono', monospace;

$sidebar-width: 208px;
$sidebar-collapsed-width: 48px;
$header-height: 44px;
$footer-height: 44px;
$right-panel-width: 256px;

$radius: var(--radius);
```

**Update `vite.config.ts`** to add SCSS `additionalData` for automatic token imports:
```typescript
css: {
  preprocessorOptions: {
    scss: {
      additionalData: `@use "@/styles/tokens" as tokens;\n`,
    },
  },
},
```

Wait — this auto-imports into every SCSS file which can be heavy. Instead, leave manual `@use` and update the alias so `@use '@/styles/tokens'` resolves. Vite already resolves `@/` via the alias config; SCSS imports through Vite handle this natively when `sass` is installed.

**Create a test SCSS module `src/styles/_tokens.test.scss`** (temporary, removed after verification):
Verify manually that a `.module.scss` file importing `_tokens.scss` compiles during `vite build`.

**Verification:** `npm run build` succeeds with SCSS compilation.

---

### Step 4: Effect Schema definitions

**Create `src/schemas/` directory** with domain schemas derived from the Convex schema (`convex/schema.ts`) and query return shapes.

**Create `src/schemas/common.ts`:**
```typescript
import { Schema } from "effect"

// Convex document base fields
export const ConvexId = Schema.String.pipe(Schema.brand("ConvexId"))
export type ConvexId = typeof ConvexId.Type

export const ConvexDocument = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
})
```

**Create `src/schemas/orchestration.ts`:**
```typescript
import { Schema } from "effect"

export const OrchestrationSummary = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  nodeId: Schema.String,
  projectId: Schema.optionalWith(Schema.String, { as: "Option" }),
  featureName: Schema.String,
  designDocPath: Schema.String,
  branch: Schema.String,
  worktreePath: Schema.optionalWith(Schema.String, { as: "Option" }),
  totalPhases: Schema.Number,
  currentPhase: Schema.Number,
  status: Schema.String,
  startedAt: Schema.String,
  completedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  totalElapsedMins: Schema.optionalWith(Schema.Number, { as: "Option" }),
  nodeName: Schema.String,
})

export type OrchestrationSummary = typeof OrchestrationSummary.Type
```

**Create `src/schemas/phase.ts`:**
```typescript
import { Schema } from "effect"

export const Phase = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  orchestrationId: Schema.String,
  phaseNumber: Schema.String,
  status: Schema.String,
  planPath: Schema.optionalWith(Schema.String, { as: "Option" }),
  gitRange: Schema.optionalWith(Schema.String, { as: "Option" }),
  planningMins: Schema.optionalWith(Schema.Number, { as: "Option" }),
  executionMins: Schema.optionalWith(Schema.Number, { as: "Option" }),
  reviewMins: Schema.optionalWith(Schema.Number, { as: "Option" }),
  startedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  completedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
})

export type Phase = typeof Phase.Type
```

**Create `src/schemas/task.ts`:**
```typescript
import { Schema } from "effect"

export const TaskEvent = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  orchestrationId: Schema.String,
  phaseNumber: Schema.optionalWith(Schema.String, { as: "Option" }),
  taskId: Schema.String,
  subject: Schema.String,
  description: Schema.optionalWith(Schema.String, { as: "Option" }),
  status: Schema.String,
  owner: Schema.optionalWith(Schema.String, { as: "Option" }),
  blockedBy: Schema.optionalWith(Schema.String, { as: "Option" }),
  metadata: Schema.optionalWith(Schema.String, { as: "Option" }),
  recordedAt: Schema.String,
})

export type TaskEvent = typeof TaskEvent.Type
```

**Create `src/schemas/team.ts`:**
```typescript
import { Schema } from "effect"

export const TeamMember = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  orchestrationId: Schema.String,
  phaseNumber: Schema.String,
  agentName: Schema.String,
  agentType: Schema.optionalWith(Schema.String, { as: "Option" }),
  model: Schema.optionalWith(Schema.String, { as: "Option" }),
  joinedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  recordedAt: Schema.String,
})

export type TeamMember = typeof TeamMember.Type
```

**Create `src/schemas/project.ts`:**
```typescript
import { Schema } from "effect"

export const ProjectSummary = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  name: Schema.String,
  repoPath: Schema.String,
  createdAt: Schema.String,
  orchestrationCount: Schema.Number,
  latestFeature: Schema.NullOr(Schema.String),
  latestStatus: Schema.NullOr(Schema.String),
})

export type ProjectSummary = typeof ProjectSummary.Type
```

**Create `src/schemas/event.ts`:**
```typescript
import { Schema } from "effect"

export const OrchestrationEvent = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  orchestrationId: Schema.String,
  phaseNumber: Schema.optionalWith(Schema.String, { as: "Option" }),
  eventType: Schema.String,
  source: Schema.String,
  summary: Schema.String,
  detail: Schema.optionalWith(Schema.String, { as: "Option" }),
  recordedAt: Schema.String,
})

export type OrchestrationEvent = typeof OrchestrationEvent.Type
```

**Create `src/schemas/detail.ts`:**
```typescript
import { Schema } from "effect"
import { Phase } from "./phase"
import { TaskEvent } from "./task"
import { TeamMember } from "./team"

export const OrchestrationDetail = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  nodeId: Schema.String,
  featureName: Schema.String,
  designDocPath: Schema.String,
  branch: Schema.String,
  worktreePath: Schema.optionalWith(Schema.String, { as: "Option" }),
  totalPhases: Schema.Number,
  currentPhase: Schema.Number,
  status: Schema.String,
  startedAt: Schema.String,
  completedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  totalElapsedMins: Schema.optionalWith(Schema.Number, { as: "Option" }),
  nodeName: Schema.String,
  phases: Schema.Array(Phase),
  tasks: Schema.Array(TaskEvent),
  orchestratorTasks: Schema.Array(TaskEvent),
  phaseTasks: Schema.Record({ key: Schema.String, value: Schema.Array(TaskEvent) }),
  teamMembers: Schema.Array(TeamMember),
})

export type OrchestrationDetail = typeof OrchestrationDetail.Type
```

**Create `src/schemas/index.ts`** (barrel export):
```typescript
export { OrchestrationSummary } from "./orchestration"
export { Phase } from "./phase"
export { TaskEvent } from "./task"
export { TeamMember } from "./team"
export { ProjectSummary } from "./project"
export { OrchestrationEvent } from "./event"
export { OrchestrationDetail } from "./detail"
```

**Verification:** `tsc --noEmit` passes on the schemas directory. Write a schema decode test in step 5.

**Implementation notes on Effect Schema API:**
- The exact API shape for optional fields depends on the Effect version installed. If `Schema.optionalWith(X, { as: "Option" })` doesn't exist in the installed version, use `Schema.optional(X)` or the appropriate API for the installed version. The implementer should check `node_modules/effect/dist/dts/Schema.d.ts` after install.
- Convex optional fields come as `undefined` (property absent), not `null`. The schema must handle this correctly. Using Effect's `Schema.optional()` (without `exact`) handles `undefined | T` by default.
- For `null` union fields (like `latestFeature` in ProjectSummary), use `Schema.NullOr(Schema.String)` or `Schema.Union(Schema.String, Schema.Null)` depending on the installed API.

---

### Step 5: Component test infrastructure (Vitest + jsdom)

**Create `tina-web/vitest.config.ts`:**
```typescript
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@convex/_generated": path.resolve(__dirname, "../convex/_generated"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
})
```

**Create `src/test/setup.ts`:**
```typescript
import "@testing-library/jest-dom/vitest"
```

**Create `src/schemas/__tests__/schemas.test.ts`** — first test validating schema decode:
```typescript
import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import { OrchestrationSummary } from "../orchestration"

describe("OrchestrationSummary schema", () => {
  it("decodes a valid orchestration payload", () => {
    const raw = {
      _id: "abc123",
      _creationTime: 1700000000000,
      nodeId: "node1",
      featureName: "test-feature",
      designDocPath: "/path/to/design.md",
      branch: "tina/test-feature",
      totalPhases: 3,
      currentPhase: 1,
      status: "executing",
      startedAt: "2026-02-09T00:00:00Z",
      nodeName: "dev-machine",
    }

    const result = Schema.decodeUnknownSync(OrchestrationSummary)(raw)
    expect(result.featureName).toBe("test-feature")
    expect(result.nodeName).toBe("dev-machine")
  })

  it("rejects a payload missing required fields", () => {
    const raw = { _id: "abc123" }
    expect(() => Schema.decodeUnknownSync(OrchestrationSummary)(raw)).toThrow()
  })

  it("accepts optional fields as undefined", () => {
    const raw = {
      _id: "abc123",
      _creationTime: 1700000000000,
      nodeId: "node1",
      featureName: "test-feature",
      designDocPath: "/path/to/design.md",
      branch: "tina/test-feature",
      totalPhases: 3,
      currentPhase: 1,
      status: "executing",
      startedAt: "2026-02-09T00:00:00Z",
      nodeName: "dev-machine",
      // projectId, worktreePath, completedAt, totalElapsedMins all absent
    }

    const result = Schema.decodeUnknownSync(OrchestrationSummary)(raw)
    expect(result.featureName).toBe("test-feature")
  })
})
```

**Update `tsconfig.json`** to include test files (or ensure `src` glob already covers them).

**Verification:** `npx vitest run --config vitest.config.ts` passes the schema test.

---

### Step 6: Rewrite App.tsx and main.tsx

**Rewrite `src/main.tsx`:**
```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { ConvexProvider } from "convex/react"
import { convex } from "./convex"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConvexProvider>
  </StrictMode>,
)
```

Provider order: `ConvexProvider` > `BrowserRouter` > `App`. `RuntimeProvider` (Effect services) will be added in Phase 2 between `BrowserRouter` and `App`.

**Rewrite `src/App.tsx`:**
```tsx
import { Route, Routes } from "react-router-dom"

function PlaceholderPage() {
  return (
    <div className="flex items-center justify-center h-screen text-muted-foreground">
      tina-web rebuild — phase 1 infrastructure
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<PlaceholderPage />} />
    </Routes>
  )
}
```

**Verification:** `npm run build` and `npm run dev` both succeed. Browser shows placeholder.

---

### Step 7: Playwright e2e scaffold

**Create `playwright.config.ts` at `tina-web/` root:**
```typescript
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
})
```

**Create `e2e/smoke.test.ts`:**
```typescript
import { test, expect } from "@playwright/test"

test("app loads without crashing", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("body")).toBeVisible()
  // Placeholder text from the cleaned App.tsx
  await expect(page.getByText("tina-web rebuild")).toBeVisible()
})
```

**Verification:** `npx playwright test` passes (requires dev server or uses webServer config).

---

### Step 8: Quality gate scripts

**Update `package.json` scripts:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts",
    "test:watch": "vitest --config vitest.config.ts",
    "test:e2e": "playwright test --config playwright.config.ts",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```

**Verification:** All four gate commands pass:
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

---

### Step 9: Promote reference patterns

Move reviewed reference files to their permanent locations:

- `src/reference/utils/id.ts` → `src/lib/id.ts`
- `src/reference/utils/status.ts` → `src/lib/status.ts`
- `src/reference/components/panel.tsx` → `src/components/app/panel.tsx`
- `src/reference/services/action-registry.example.ts` → `src/services/action-registry.ts`
- `src/reference/hooks/useTypedQuery.example.tsx` → `src/hooks/useTypedQuery.tsx`
- Delete `src/reference/README.md`
- Delete `src/reference/` directory

Update imports in promoted files (change `@/lib/utils` paths if needed — currently only `panel.tsx` uses `cn()`).

**Verification:** `npm run typecheck` passes with promoted files.

---

### Step 10: Update Storybook config for new category

**Update `.storybook/preview.ts`** story sort order to include `App` category:
```typescript
storySort: {
  order: ["Foundations", "Primitives", "Domain", "App"],
},
```

**Verification:** `npm run storybook` starts, all 18 primitive stories render, no console errors.

---

## File Inventory

### New files created
| File | Purpose |
|------|---------|
| `src/styles/_tokens.scss` | SCSS token bridge to CSS custom properties |
| `src/schemas/common.ts` | Shared schema primitives (ConvexId, ConvexDocument) |
| `src/schemas/orchestration.ts` | OrchestrationSummary Effect Schema |
| `src/schemas/phase.ts` | Phase Effect Schema |
| `src/schemas/task.ts` | TaskEvent Effect Schema |
| `src/schemas/team.ts` | TeamMember Effect Schema |
| `src/schemas/project.ts` | ProjectSummary Effect Schema |
| `src/schemas/event.ts` | OrchestrationEvent Effect Schema |
| `src/schemas/detail.ts` | OrchestrationDetail (composite) Effect Schema |
| `src/schemas/index.ts` | Barrel export for all schemas |
| `src/schemas/__tests__/schemas.test.ts` | Schema decode validation tests |
| `src/test/setup.ts` | Vitest test setup (jest-dom matchers) |
| `vitest.config.ts` | Component test Vitest configuration (jsdom) |
| `playwright.config.ts` | Playwright e2e test configuration |
| `e2e/smoke.test.ts` | E2E smoke test — app loads |
| `src/lib/id.ts` | Route param ID validation (from reference) |
| `src/lib/status.ts` | Domain status normalization (from reference) |
| `src/components/app/panel.tsx` | Panel compound component (from reference) |
| `src/services/action-registry.ts` | Action registry (from reference) |
| `src/hooks/useTypedQuery.tsx` | Typed query hook (from reference) |

### Files modified
| File | Change |
|------|--------|
| `package.json` | Add dependencies, add quality gate scripts |
| `vite.config.ts` | No SCSS-specific changes needed (Vite auto-handles `.module.scss` with `sass` installed) |
| `src/App.tsx` | Rewrite to placeholder page |
| `src/main.tsx` | Rewrite with correct provider order |
| `.storybook/preview.ts` | Add `App` to story sort order |
| `tsconfig.json` | Potentially add `vitest.config.ts` to include (check if needed) |

### Files deleted
| File | Reason |
|------|--------|
| `src/components/Dashboard.tsx` | Spike app code |
| `src/components/EventTimeline.tsx` | Spike app code |
| `src/components/OrchestrationControls.tsx` | Spike app code |
| `src/components/OrchestrationDetail.tsx` | Spike app code |
| `src/components/OrchestrationList.tsx` | Spike app code |
| `src/components/ProjectDetail.tsx` | Spike app code |
| `src/components/StatusBar.tsx` | Spike app code |
| `src/components/TaskDetail.tsx` | Spike app code |
| `src/components/TaskList.tsx` | Spike app code |
| `src/components/TeamPanel.tsx` | Spike app code |
| `src/hooks/useOrchestrations.ts` | Spike hook (replaced by typed query) |
| `src/hooks/useOrchestrationDetail.ts` | Spike hook (replaced by typed query) |
| `src/hooks/useProjectOrchestrations.ts` | Spike hook (replaced by typed query) |
| `src/hooks/useProjects.ts` | Spike hook (replaced by typed query) |
| `src/types.ts` | Replaced by Effect Schemas |
| `src/reference/` | Entire directory (contents promoted) |

### Files unchanged
| File | Reason |
|------|--------|
| `src/components/ui/*` | 18 primitives + stories — compose, don't modify |
| `src/docs/*` | Storybook documentation components |
| `src/lib/utils.ts` | `cn()` utility still needed by primitives and Panel |
| `src/convex.ts` | Convex client singleton — reused as-is |
| `src/index.css` | Design tokens (CSS custom properties) — reused |
| `tailwind.config.ts` | Tailwind theme — reused |
| `postcss.config.js` | PostCSS config — reused |
| `.storybook/main.ts` | Storybook config — reused |
| `.storybook/theme.ts` | Storybook dark theme — reused |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Effect Schema API differs from design doc examples | Check installed `effect` package API after install; adjust `optionalWith`/`optional`/`NullOr` calls to match actual exports |
| Vitest conflicts with root `vitest.config.ts` (Convex tests) | tina-web uses its own `vitest.config.ts` in `tina-web/`; root config only matches `convex/` test files |
| SCSS module import resolution with `@/` alias | Vite resolves `@/` natively in SCSS when using `sass`; verify with a test import |
| Storybook compatibility with new deps | Storybook already depends on Vitest; test that `npm run storybook` still works after dependency additions |
| `tsconfig.json` `include: ["src"]` doesn't cover `vitest.config.ts` or `playwright.config.ts` | These config files are at root and use separate TS resolution; create `tsconfig.node.json` include if `tsc -b` complains |

## Acceptance Criteria

1. `npm run typecheck` — zero errors
2. `npm run test` — schema decode tests pass
3. `npm run build` — production build succeeds
4. `npm run test:e2e` — smoke test passes (app loads)
5. `npm run storybook` — all 18 primitive stories render
6. `npm run dev` — dev server starts, placeholder page visible
7. No `as Type` casts of Convex data anywhere in the codebase
8. No spike app components remain outside `src/components/ui/`
9. Effect Schema types replace all hand-written interfaces from `types.ts`
10. Reference patterns promoted to production locations
