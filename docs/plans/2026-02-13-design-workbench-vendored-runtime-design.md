# Vendored Design Workbench Runtime (Generic Across React Projects)

## Overview

This design defines a generic UI design workbench that is copied into each project as source code (vendored), not consumed as a live shared package. The workbench supports two phases:

1. Wireframe/design exploration before Storybook parity exists.
2. Storybook-driven implementation matching after design lock.

The host in this repository is `tina-web`, but the runtime is structured to be portable to any React project that has:
- design tokens
- UI primitives/components
- Storybook (used during implementation phase)

## Why Vendored Runtime

We want project stability and autonomy:
- No surprise breakage from upstream package updates.
- Projects can customize locally.
- Runtime changes are pulled in only when we choose to refresh manually.

Tradeoff:
- Runtime refreshes are manual and rely on code review rather than automated merge tooling.

This is acceptable and preferred for long-lived product repos.

## Goals

- Extract the generic runtime from current `designs/` shell/routing/registry.
- Keep project-specific design sets and UI assumptions outside runtime core.
- Support direct source imports for UI components during wireframing.
- Defer Storybook dependency until implementation phase.
- Provide a simple bootstrap flow with project config only.

## Non-Goals

- Centralized runtime package with automatic updates.
- Enforcing one global design style across projects.
- Replacing Storybook.

## Architecture

### Layers

1. Runtime (generic, vendored)
- Routing, design set discovery, prompt panel shell, screenshot hooks, compare mode shell.

2. Project Adapter (project-owned)
- File paths, aliases, component locations, token locations, Storybook settings.

3. Project Content (project-owned)
- Wireframe/design sets, mock data, design notes, selected variants.

### Host Pattern

- `tina-web` hosts the workbench route and embeds/mounts the vendored workbench.
- Workbench reads only adapter config and project content.
- Runtime never hardcodes Tina paths or domains.

## File Layout (Per Project)

```text
<repo>/ui/designs/
  runtime/
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
    <set-slug>/
      meta.ts
      data.ts
      index.tsx
      HANDOFF.md (optional)
      DECISIONS.md (optional)
  project.config.ts
```

Notes:
- `runtime/` is copied from template and can be refreshed manually.
- `sets/` is owned by the project and is never overwritten by runtime refresh.
- `project.config.ts` is owned by the project and is never overwritten by runtime refresh.

## Extraction Boundary From Current `designs/`

Current files that become runtime base:
- `designs/src/App.tsx`
- `designs/src/pages/HomePage.tsx`
- `designs/src/pages/DesignSetPage.tsx`
- `designs/src/designSets/registry.ts`
- `designs/src/components/PageFrame.tsx`

Current files that remain project content examples only:
- `designs/src/designSets/*`

Result:
- Existing Tina design sets move under `ui/designs/sets/*`.
- Runtime consumes them via configurable set root.

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

  // Used only in implementation phase
  storybook: StorybookConfig

  // Capture presets used by both wireframe and comparison workflows
  screenshotPresets: ScreenshotPreset[]
}

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

## Bootstrap and Manual Refresh

### `designs init`

Purpose:
- Copy runtime snapshot into `ui/designs/runtime`.
- Create `ui/designs/project.config.ts` (from template).
- Optionally migrate existing `designs/src/designSets/*` into `ui/designs/sets/*`.

Behavior:
- Never overwrites existing `project.config.ts` unless `--force`.
- Never deletes existing sets.

### Manual Runtime Refresh

Purpose:
- Pull runtime improvements without automated version/merge infrastructure.

Procedure:
1. Copy updated runtime files into `ui/designs/runtime/*`.
2. Do not modify `ui/designs/sets/*` or `ui/designs/project.config.ts` during refresh.
3. Run a quick sanity pass:
   - `uiComponentGlobs` resolve to at least one file.
   - `tokenFiles` exist.
   - Vite aliases point to real directories.
   - Storybook settings are valid when `storybook.enabled=true`.
4. Open a PR with runtime-only diffs and validate workbench behavior in dev.

## Skill Contracts

### Wireframing/Design Skill

Inputs:
- `ui/designs/project.config.ts`
- `ui/designs/sets/*`
- app UI source files via direct imports

Outputs:
- new/updated set under `ui/designs/sets/<slug>`
- optional handoff docs (`HANDOFF.md`, `DECISIONS.md`)
- captured screenshots in configured artifact dir

Constraints:
- Must not require Storybook to operate.
- Should prefer reusing app UI components and tokens where possible.

### Frontend Design Implementer Skill

Inputs:
- locked wireframe/design screenshots
- selected set metadata/handoff notes
- Storybook stories (implementation phase)

Outputs:
- story updates + component updates in app source
- visual gap report (layout, spacing, typography, color, state coverage)
- refreshed screenshot pairs for before/after comparison

Constraints:
- Storybook is preferred implementation target.
- If no story exists, skill creates one before screen-level edits.

## Delivery Phases

### Phase 1: Workbench Foundation (2-3 days)

Scope:
- Introduce `ui/designs/` structure with `runtime/`, `sets/`, and `project.config.ts`.
- Extract/copy generic runtime from existing `designs/src` shell/routing files.
- Move existing Tina design sets into `ui/designs/sets/*`.
- Add `tina-web` host route: `/pm/designs/:designId/workbench`.
- Validate direct source imports from `tina-web/src/components/ui/*` and token files.

Exit criteria:
- Workbench route loads in `tina-web`.
- At least one migrated set renders from `ui/designs/sets/*`.
- Wireframing works without Storybook dependency.

### Phase 2: Visual Compare + Implementation Loop (3-4 days)

Scope:
- Add screenshot capture flow for locked design sets.
- Add Storybook screenshot capture flow for implementation target stories.
- Add side-by-side compare surface in workbench with visual gap report.
- Enforce story-first implementation behavior:
  - create/update stories before screen-level component composition changes.

Exit criteria:
- Given a locked set, workbench can compare design screenshots to Storybook screenshots.
- Gap report is generated for layout, spacing, typography, color, and state coverage.
- At least one real UI component flow is matched through this loop end-to-end.

### Phase 3: Skillization + Portability Hardening (2-3 days)

Scope:
- Update wireframing/design skill to consume `ui/designs/project.config.ts`.
- Update frontend design implementer skill to consume compare artifacts and Storybook targets.
- Add bootstrap/manual-refresh docs and operator checklist.
- Add smoke checks for config paths, aliases, token files, and Storybook wiring.
- Complete cleanup/migration of legacy `designs/` references.

Exit criteria:
- Skills can run the full flow with minimal project-specific prompts.
- A second React project can copy `ui/designs`, edit only `project.config.ts`, and run.
- Legacy path dependency on old `designs/` structure is removed from active flow.

## Workflow Stages (Within Any Phase)

1. Wireframe
- Create/edit in `ui/designs/sets`.
- Reuse app UI components directly.
- Capture screenshots and choose a direction.

2. Design Lock
- Record selected variant + rationale + constraints in set docs.

3. Implementation
- Ensure Storybook stories exist for target components.
- Compare Storybook renders to locked design screenshots.
- Patch components/stories until visual gaps are within acceptance.

4. Verification
- Regenerate screenshots and attach diff summary.

## Integration Into `tina-web`

Add PM route:
- `/pm/designs/:designId/workbench`

Route behavior:
- Load project config.
- Show design set browser/editor panel (from vendored runtime).
- Show screenshot artifacts and comparison entry points.
- During implementation mode, expose Storybook compare actions.

## Migration Plan For This Repository

### Phase 1 mapping
1. Introduce `ui/designs/` structure.
2. Move existing `designs/src/designSets/*` to `ui/designs/sets/*`.
3. Copy extracted generic runtime into `ui/designs/runtime`.
4. Add `ui/designs/project.config.ts` for tina paths.
5. Add `tina-web` PM workbench route and navigation action.
6. Validate wireframe flow without Storybook.

### Phase 2 mapping
1. Add screenshot capture for sets and Storybook stories.
2. Add compare UI and gap reporting in workbench.
3. Run one end-to-end design-to-story implementation pass.

### Phase 3 mapping
1. Finalize skill prompts/contracts against config + compare artifacts.
2. Add portability smoke checks and runbook docs.
3. Remove old-path references and mark migration complete.

## Risks and Mitigations

Risk: Runtime drift due to local modifications.
- Mitigation: manual runtime-refresh checklist and runtime-only PR review scope.

Risk: Alias/import breakage across projects.
- Mitigation: required `viteAliases` in config and refresh sanity checks before merge.

Risk: Over-coupling to one app's component style.
- Mitigation: keep runtime generic and move assumptions into adapter config + sets.

Risk: Storybook mismatch with app reality.
- Mitigation: implementation skill updates stories first and validates state coverage before screen edits.

## Success Criteria

- New project can bootstrap workbench by copying `ui/designs` and only editing `project.config.ts`.
- Wireframing works with direct app component imports and no Storybook dependency.
- Implementation matcher can compare locked design screenshots against Storybook renders.
- Runtime refresh is manual, non-destructive to project content, and reviewable in normal PR flow.
