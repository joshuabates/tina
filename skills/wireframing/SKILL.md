---
name: wireframing
description: Create and explore design variations using the vendored workbench runtime. Uses project.config.ts for component imports, token resolution, and screenshot capture.
---

# Wireframing

## Overview

Explore visual designs by creating variations under `ui/designs/sets/`. Reuse project UI components and tokens directly via source imports configured in `project.config.ts`. No Storybook required.

## Prerequisites

Before starting, verify:
- `ui/designs/project.config.ts` exists and has valid config
- Run config validation: `cd ui/designs/runtime && npm run validate-config`
- Workbench dev server is running: `cd ui/designs/runtime && npm run dev`

If the dev server won't start, check that dependencies are installed:
```bash
cd ui/designs/runtime && npm install
```

## Inputs

You need:
1. **Design question** — what visual problem are you exploring?
2. **Project config** — read `ui/designs/project.config.ts` to understand available components and tokens

## Creating a New Design

### Step 1: Create design directory structure

```
ui/designs/sets/<design-slug>/
  meta.ts              ← design-level metadata
  <variation-slug>/
    meta.ts            ← variation metadata
    index.tsx          ← React component
    data.ts            ← mock data (optional)
```

### Step 2: Write design-level meta.ts

```typescript
export default {
  slug: "<design-slug>",
  title: "<Human-readable title>",
  prompt: "<The visual question being explored>",
  tags: ["wireframe", "<relevant-tags>"],
};
```

### Step 3: Write variation meta.ts

```typescript
export default {
  slug: "<variation-slug>",
  title: "<Variation title>",
  phase: "wireframe",
  status: "exploring",
  tags: ["wireframe"],
};
```

### Step 4: Write the variation component

In `index.tsx`, import project components using the aliases from `project.config.ts`:

```typescript
// Example: if viteAliases has "@": "tina-web/src"
import { Button } from "@/components/ui/button";
```

Available component globs are listed in `project.config.ts` under `uiComponentGlobs`.
Available token files are listed under `tokenFiles`.

The component renders the wireframe variation. Export it as default:

```typescript
export default function VariationName() {
  return (
    <div>
      {/* Wireframe content using project components */}
    </div>
  );
}
```

### Step 5: Verify in browser

Open the workbench dev server (default: `http://localhost:5200`). Your new design should appear on the home page automatically — the registry discovers designs via glob patterns.

### Step 6: Capture screenshots

```bash
cd ui/designs/runtime && npm run capture:design -- --design <slug> --variation <slug>
```

Screenshots are saved to the path configured in `project.config.ts` (`screenshotDir`).

## Creating Additional Variations

Add new subdirectories under the same design directory. Each variation has its own `meta.ts`, `index.tsx`, and optional `data.ts`.

## Selecting a Variation

When a variation is chosen:
1. Update its `meta.ts`: set `status: "selected"`
2. Update rejected variations: set `status: "rejected"`
3. Optionally write `HANDOFF.md` with implementation notes
4. Optionally write `DECISIONS.md` with rationale

## Locking a Design

When the design is finalized:
1. Capture final screenshots for the selected variation
2. The design is now ready for the `design-implementation` skill

## Handoff Documents

### HANDOFF.md

Include:
- Purpose and primary user
- Scope boundaries (in/out of scope)
- Key behavioral contracts
- Data states to handle

### DECISIONS.md

Include:
- Locked decisions with rationale
- Active assumptions
- Open decisions for future iterations
- Guardrails for new agents

## Skill Type

**Flexible** — Adapt the exploration process to the design question. The directory structure and metadata format are fixed; the creative process is yours.
