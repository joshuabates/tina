# Design Workbench & Vendored Runtime

## Overview

This design introduces a visual design system for Tina projects with two main parts:

1. **A vendored workbench runtime** — copied into each project as source code, runs its own Vite dev server, and renders wireframes using the project's actual components and tokens.
2. **A central design console in tina-web** — shows design metadata, status, screenshot galleries, spec linkage, and comparison results via Convex subscriptions.

The workbench supports two workflow phases:
1. **Wireframing** — visual exploration before implementation, no Storybook required.
2. **Implementation matching** — self-correcting loop comparing locked design screenshots against Storybook renders using pixel diff + LLM vision.

## Naming Clarification

This design also renames existing concepts to eliminate confusion:

| Old Name | New Name | What It Is |
|----------|----------|------------|
| `designs` (Convex table) | **specs** | Architecture/requirement documents that define what to build |
| "design plans" (in `docs/plans/`) | **specs** (`-design.md` files) and **implementation plans** (`-phase-N.md` files) | |
| (new) | **designs** | Visual explorations of how something looks |
| (new) | **variations** | Individual approaches tried within a design |

## Why Vendored Runtime

Project stability and autonomy:
- No surprise breakage from upstream package updates.
- Projects can customize locally.
- Runtime changes are pulled in only when we choose to refresh manually.

Tradeoff: runtime refreshes are manual and rely on code review rather than automated merge tooling. This is acceptable and preferred for long-lived product repos.

## Goals

- Extract generic runtime from current `designs/` shell/routing/registry.
- Keep project-specific content outside runtime core.
- Support direct source imports for UI components during wireframing.
- Defer Storybook dependency until implementation phase.
- Provide self-correcting design implementation via pixel diff + LLM vision.
- Surface design metadata and screenshots centrally in tina-web.

## Non-Goals

- Centralized runtime package with automatic updates.
- Enforcing one global design style across projects.
- Replacing Storybook.
- Interactive wireframing in tina-web (that stays in the local workbench).

## Data Model

### Hierarchy

```
project
  ├── specs (what to build — architecture/requirement docs)
  └── designs (how it looks — visual explorations)
       └── variations (individual approaches tried)

specDesigns (many-to-many join)
  ├── specId
  └── designId
```

Designs and specs are both top-level entities under a project. They are connected via a many-to-many join table: multiple specs can reference the same design, and a spec can reference multiple designs. Designs can also exist independently for exploratory work with no spec linkage.

### Convex Schema Changes

**Rename existing tables:**
- `designs` → `specs` (fields: `designKey` → `specKey`, etc.)
- `orchestrations.designId` → `orchestrations.specId`
- `tickets.designId` → `tickets.specId`
- `workComments.targetType: "design"` → `"spec"`
- `projectCounters.counterType: "design"` → `"spec"`

**New tables:**

```
designs:
  projectId, designKey, title, prompt (the question being explored),
  status (exploring | locked | archived), timestamps

designVariations:
  designId, slug, title,
  status (exploring | selected | rejected),
  screenshotStorageIds (Convex file storage),
  timestamps

specDesigns:
  specId, designId
```

### Orchestration Linkage

Orchestrations can reference both a spec and optionally a design:

```
orchestrations:
  specId (optional — which spec is being built)
  designId (optional — which visual design to target)
```

## Architecture

### Hosting Split

- **Vendored runtime** (per-project): Lives in `ui/designs/runtime/` with its own Vite dev server and `package.json`. Imports the project's components and tokens via aliases defined in `project.config.ts`. Handles wireframing, rendering, and screenshot capture.
- **tina-web** (central): Reads design metadata, status, and screenshots from Convex. Shows galleries, spec linkage, and comparison results. Links out to the local workbench for interactive editing.

### Layers

1. **Runtime** (generic, vendored into `ui/designs/runtime/`)
   - Own Vite dev server, `package.json`, `tsconfig.json`
   - Routing, design/variation discovery, prompt panel shell, screenshot hooks, compare mode
   - Never hardcodes project paths or domains
   - Port: auto-detect next available starting from 5200 (broader port strategy across worktrees TBD)

2. **Project adapter** (`ui/designs/project.config.ts`, project-owned)
   - `viteAliases` to resolve project component/token imports
   - Component globs, token file paths, style entrypoints
   - Optional `prebuild` command for projects with generated artifacts (tokens, types, etc.)
   - Storybook settings (used only in implementation phase)
   - Screenshot presets (viewport dimensions)

3. **Project content** (`ui/designs/sets/`, project-owned)
   - Designs and variations organized as nested directories
   - Never touched by runtime refresh

### File Layout (Per Project)

```text
<repo>/ui/designs/
  runtime/                          (vendored, generic)
    src/
      app/
      pages/
      registry/
      compare/
      screenshots/
    package.json
    vite.config.ts
    tsconfig.json
  sets/
    <design-slug>/                  ← design (an exploration)
      <variation-slug>/             ← variation (one approach)
        meta.ts
        data.ts
        index.tsx
        HANDOFF.md (optional)
        DECISIONS.md (optional)
      <variation-slug>/
        ...
  project.config.ts                 (project-owned adapter)
```

Notes:
- `runtime/` is copied from template and can be refreshed manually.
- `sets/` is owned by the project and is never overwritten by runtime refresh.
- `project.config.ts` is owned by the project and is never overwritten by runtime refresh.
- First-level directories under `sets/` are designs; second-level are variations.

## Dev Server

The runtime always uses its own Vite instance. Projects do not need to be Vite-based — the adapter config bridges into the project's source code.

- `project.config.ts` provides `viteAliases` to resolve project imports
- Optional `prebuild` command runs before the dev server starts (for generated CSS vars, codegen, etc.)
- Default to raw source imports (`.tsx`/`.ts` files via aliases)
- Start with: `cd ui/designs/runtime && npm run dev`
- Port: auto-detect next available from base 5200

## Project Adapter Schema (`project.config.ts`)

```ts
export interface StorybookConfig {
  enabled: boolean
  cwd: string
  devCommand: string
  url: string
  storyGlobs: string[]
}

export interface ScreenshotPreset {
  name: string
  width: number
  height: number
}

export interface DesignsProjectConfig {
  projectName: string

  // Root-relative paths
  setsRoot: string
  screenshotDir: string

  // Direct source imports for wireframing
  uiComponentGlobs: string[]
  tokenFiles: string[]

  // Alias resolution for imported app code
  viteAliases: Record<string, string>

  // Optional: source app entry styles to align visual baseline
  styleEntrypoints?: string[]

  // Optional: command to run before starting the design dev server
  prebuild?: string

  // Used only in implementation phase
  storybook: StorybookConfig

  // Capture presets used by both wireframe and comparison workflows
  screenshotPresets: ScreenshotPreset[]
}
```

Example for this repository:

```ts
const config: DesignsProjectConfig = {
  projectName: "tina",
  setsRoot: "ui/designs/sets",
  screenshotDir: "ui/designs/.artifacts/screenshots",
  uiComponentGlobs: ["tina-web/src/components/ui/**/*.tsx"],
  tokenFiles: ["tina-web/src/styles/_tokens.scss", "tina-web/src/index.css"],
  viteAliases: {
    "@": "tina-web/src",
    "@convex": "convex/_generated",
  },
  styleEntrypoints: ["tina-web/src/index.css"],
  storybook: {
    enabled: true,
    cwd: "tina-web",
    devCommand: "npm run storybook -- --port 6006",
    url: "http://localhost:6006",
    storyGlobs: ["tina-web/src/**/*.stories.tsx", "tina-web/src/**/*.mdx"],
  },
  screenshotPresets: [
    { name: "desktop", width: 1440, height: 960 },
    { name: "laptop", width: 1280, height: 800 },
  ],
}

export default config
```

## Sync & Storage

### tina-daemon

tina-daemon already watches filesystem paths and syncs to Convex. It will be extended to watch `ui/designs/sets/` in worktrees:

- Infers design/variation structure from nested directory layout
- Syncs metadata (titles, status from `meta.ts`) to Convex `designs` and `designVariations` tables
- Uploads screenshots to Convex file storage, stores file IDs on variation records
- Learns worktree path from orchestration state (same pattern as commit/plan syncing)

### tina-web

- `/pm/designs/` — design listing, filterable by status
- `/pm/designs/:designKey` — variations, linked specs, screenshot gallery, comparison results
- Spec detail pages get a "Linked Designs" section
- No interactive wireframing — that happens in the local vendored workbench

## Extraction Boundary From Current `designs/`

Current files that become runtime base:
- `designs/src/App.tsx`
- `designs/src/pages/HomePage.tsx`
- `designs/src/pages/DesignSetPage.tsx`
- `designs/src/designSets/registry.ts`
- `designs/src/components/PageFrame.tsx`

Current files that become project content:
- `designs/src/designSets/*` → migrate to `ui/designs/sets/<design>/<variation>/`

## Bootstrap and Manual Refresh

### `designs init`

Purpose:
- Copy runtime snapshot into `ui/designs/runtime`.
- Create `ui/designs/project.config.ts` (from template).
- Optionally migrate existing `designs/src/designSets/*` into nested `ui/designs/sets/` structure.

Behavior:
- Never overwrites existing `project.config.ts` unless `--force`.
- Never deletes existing sets.

### Manual Runtime Refresh

Procedure:
1. Copy updated runtime files into `ui/designs/runtime/*`.
2. Do not modify `ui/designs/sets/*` or `ui/designs/project.config.ts` during refresh.
3. Run a quick sanity pass:
   - `uiComponentGlobs` resolve to at least one file.
   - `tokenFiles` exist.
   - Vite aliases point to real directories.
   - Storybook settings are valid when `storybook.enabled=true`.
4. Open a PR with runtime-only diffs and validate workbench behavior in dev.

## Workflow Stages

### 1. Wireframe

- Create a design (an exploration answering a visual question).
- Skill generates variations as subdirectories under `sets/<design>/`.
- Reuse app UI components and tokens directly via source imports.
- Capture screenshots for each variation.

### 2. Select & Refine

- Pick a variation → status: `selected`, others → `rejected`.
- Refine the selected variation through iterations.
- Daemon keeps syncing updated screenshots to Convex.

### 3. Design Lock

- Lock the design → status: `locked`.
- Record rationale and constraints in `HANDOFF.md` / `DECISIONS.md`.

### 4. Implementation (Self-Correcting Loop)

- Ensure Storybook stories exist for target components.
- Capture Storybook screenshot of current implementation.
- Compare against locked design screenshot:
  - **Pixel diff**: quantitative gap report (layout, spacing, color values).
  - **LLM vision**: send both images to a vision-capable model for qualitative assessment (does it feel right, missing states, visual weight).
- If gaps found → fix components/stories and re-compare.
- Loop until both checks pass.

### 5. Verification

- Regenerate final screenshots and attach comparison summary.

## Skill Contracts

### Wireframing Skill

Inputs:
- `ui/designs/project.config.ts`
- `ui/designs/sets/*`
- App UI source files via direct imports

Outputs:
- New/updated design with variations under `ui/designs/sets/<design>/<variation>/`
- Optional handoff docs (`HANDOFF.md`, `DECISIONS.md`)
- Captured screenshots in configured artifact dir

Constraints:
- Must not require Storybook to operate.
- Should prefer reusing app UI components and tokens where possible.

### Design Implementation Skill

A self-correcting implementation skill that uses locked design screenshots as visual reference.

Inputs:
- Locked design screenshots (from Convex file storage or local artifacts)
- Selected variation metadata and handoff notes
- Storybook stories (creates them if missing)

Outputs:
- Story updates + component updates in app source
- Visual gap report (layout, spacing, typography, color, state coverage)
- Refreshed screenshot pairs for before/after comparison

Behavior:
1. Take locked design screenshot as reference.
2. Implement or update component.
3. Capture Storybook screenshot.
4. Run pixel diff → quantitative gap report.
5. Run LLM vision comparison → qualitative assessment.
6. If gaps found → fix and loop back to step 2.
7. When both checks pass → attach final comparison artifacts.

Constraints:
- Storybook is the implementation target.
- If no story exists, creates one before component edits.
- Must produce evidence of convergence (before/after screenshots + gap metrics).

## Delivery Phases

### Phase 1: Rename designs → specs

Scope:
- Rename Convex `designs` table to `specs` (all fields, indexes).
- Update `orchestrations.designId` → `specId`.
- Update `tickets.designId` → `specId`.
- Update `workComments` and `projectCounters` references.
- Rename `convex/designs.ts` → `convex/specs.ts`.
- Update tina-web routes (`/pm/designs/` → `/pm/specs/`) and components.
- Update daemon references.

Exit criteria:
- All references to the old `designs` concept use `specs` naming.
- No regressions in existing spec CRUD flows.

### Phase 2: Design & variation data model

Scope:
- New Convex tables: `designs`, `designVariations`, `specDesigns`.
- Convex functions for design/variation CRUD.
- tina-daemon extended to watch `ui/designs/sets/` in worktrees.
- Screenshot upload to Convex file storage.
- tina-web pages: `/pm/designs/`, `/pm/designs/:designKey`.
- Spec detail page gets "Linked Designs" section.

Exit criteria:
- Designs and variations can be created, listed, and viewed in tina-web.
- Daemon syncs design metadata and screenshots from worktree to Convex.
- Specs can be linked to designs via the join table.

### Phase 3: Vendored workbench runtime

Scope:
- Extract generic runtime from current `designs/` app.
- Set up `ui/designs/runtime/` with own Vite server and `package.json`.
- Implement `project.config.ts` adapter with aliases and optional prebuild.
- Migrate existing wireframe sets into `ui/designs/sets/<design>/<variation>/` structure.
- Validate direct source imports from project components and tokens.

Exit criteria:
- Workbench dev server starts and renders at least one migrated design.
- Wireframing works without Storybook dependency.
- Runtime is generic — no hardcoded tina-web paths.

### Phase 4: Compare mode & screenshot capture

Scope:
- Screenshot capture flow for locked design variations.
- Storybook screenshot capture flow for implementation target stories.
- Pixel diff comparison with quantitative gap metrics.
- Side-by-side compare UI in workbench.

Exit criteria:
- Given a locked variation, workbench can capture and compare design vs Storybook screenshots.
- Pixel diff gap report covers layout, spacing, typography, and color.

### Phase 5: Design implementation skill

Scope:
- New skill: self-correcting design implementation loop.
- Integrates pixel diff (quantitative) and LLM vision (qualitative) comparison.
- Automated loop: implement → capture → compare → fix → repeat.
- Produces convergence evidence (before/after screenshots, gap metrics).

Exit criteria:
- Skill can take a locked design and drive an implementation to visual parity.
- At least one real UI component matched end-to-end through the loop.
- Gap metrics decrease across iterations (demonstrable convergence).

### Phase 6: Skill integration & portability

Scope:
- Update wireframing skill to consume `project.config.ts`.
- Bootstrap/refresh docs and operator checklist.
- Smoke checks for config paths, aliases, token files, Storybook wiring.
- Complete cleanup/migration of legacy `designs/` references.

Exit criteria:
- Skills can run the full wireframe → implement → verify flow.
- A second React project can copy `ui/designs`, edit only `project.config.ts`, and run.
- Legacy `designs/` directory dependency removed from active flow.

## Risks and Mitigations

**Runtime drift due to local modifications.**
Mitigation: manual runtime-refresh checklist and runtime-only PR review scope.

**Alias/import breakage across projects.**
Mitigation: required `viteAliases` in config and refresh sanity checks before merge.

**Over-coupling to one app's component style.**
Mitigation: keep runtime generic and move assumptions into adapter config + sets.

**Storybook mismatch with app reality.**
Mitigation: implementation skill updates stories first and validates state coverage before screen edits.

**LLM vision inconsistency in comparison.**
Mitigation: pixel diff provides objective baseline; LLM vision is additive judgment, not sole arbiter.

## Deferred Concerns

- **Port management across worktrees/dev servers** — needs a general solution, not design-specific. Auto-detect for now.
- **`designs init` CLI shape** — whether this is a tina-session subcommand, standalone script, or skill. Decide during phase 3.

## Success Criteria

- Existing architecture docs cleanly renamed to "specs" with no regression.
- Designs are top-level entities with many-to-many spec linkage.
- New project can bootstrap workbench by copying `ui/designs` and editing only `project.config.ts`.
- Wireframing works with direct app component imports and no Storybook dependency.
- Design implementation skill self-corrects using pixel diff + LLM vision comparison.
- Screenshots stored in Convex file storage and viewable in tina-web.
- Runtime refresh is manual, non-destructive to project content, and reviewable in normal PR flow.
