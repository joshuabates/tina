# Design Workbench Phase 6: Skill Integration & Portability

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** a0792c932b2ae03a944b2ee6adad7b07a33ad5ae

**Goal:** Make the design workbench fully operational end-to-end — wireframing skill consumes `project.config.ts`, config is validated with smoke checks, legacy `designs/` references are cleaned up, and the runtime is portable to any React project.

**Architecture:** No new architecture. This phase connects existing pieces (runtime, config, skills, scripts) and removes legacy coupling. The wireframing skill is the only new file.

**Phase context:** Phases 1-5 built the foundation — Convex schema rename, data model, vendored runtime, compare mode, and design-implementation skill. Phase 6 completes the end-to-end flow and ensures portability.

---

## Task 1: Create wireframing skill

**Files:**
- `skills/wireframing/SKILL.md` (new)

**Model:** opus

**review:** full

**Depends on:** none

Create the wireframing skill that guides design exploration using the vendored workbench runtime and `project.config.ts`.

### Step 1: Create skill directory and file

Write `skills/wireframing/SKILL.md`:

```markdown
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
```

### Step 2: Verify skill file

Run: `wc -l skills/wireframing/SKILL.md`
Expected: Between 100-140 lines

---

## Task 2: Create config validation script

**Files:**
- `ui/designs/runtime/scripts/validate-config.ts` (new)
- `ui/designs/runtime/package.json`

**Model:** opus

**review:** full

**Depends on:** none

Create a smoke-check script that validates `project.config.ts` paths, aliases, token files, and Storybook wiring.

### Step 1: Write the validation script

Write `ui/designs/runtime/scripts/validate-config.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { glob } from "node:fs/promises";
import * as configModule from "../../project.config.ts";

// Handle tsx's double-wrapping of default exports
const config = ((configModule as any).default?.default ||
  (configModule as any).default) as typeof import("../../project.config.ts").default;

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
let errors = 0;
let warnings = 0;

function check(label: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}: ${detail}`);
    errors++;
  }
}

function warn(label: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.warn(`  ⚠ ${label}: ${detail}`);
    warnings++;
  }
}

console.log(`\nValidating project config: ${config.projectName}\n`);

// 1. setsRoot exists
console.log("[Paths]");
const setsPath = path.resolve(repoRoot, config.setsRoot);
check("setsRoot exists", fs.existsSync(setsPath), `${config.setsRoot} not found`);

// 2. screenshotDir parent exists (dir itself may not exist yet)
const screenshotParent = path.dirname(
  path.resolve(repoRoot, config.screenshotDir),
);
check(
  "screenshotDir parent exists",
  fs.existsSync(screenshotParent),
  `Parent of ${config.screenshotDir} not found`,
);

// 3. uiComponentGlobs resolve to at least one file
console.log("\n[Components]");
for (const pattern of config.uiComponentGlobs) {
  const fullPattern = path.resolve(repoRoot, pattern);
  const matches: string[] = [];
  for await (const entry of glob(fullPattern)) {
    matches.push(entry);
  }
  check(
    `uiComponentGlobs: ${pattern}`,
    matches.length > 0,
    "No files matched",
  );
}

// 4. tokenFiles exist
console.log("\n[Tokens]");
for (const tokenFile of config.tokenFiles) {
  const tokenPath = path.resolve(repoRoot, tokenFile);
  check(`tokenFile: ${tokenFile}`, fs.existsSync(tokenPath), "File not found");
}

// 5. viteAliases point to real directories
console.log("\n[Aliases]");
for (const [alias, target] of Object.entries(config.viteAliases)) {
  const aliasPath = path.resolve(repoRoot, target);
  check(
    `alias "${alias}" → ${target}`,
    fs.existsSync(aliasPath),
    "Directory not found",
  );
}

// 6. styleEntrypoints exist (optional field)
if (config.styleEntrypoints && config.styleEntrypoints.length > 0) {
  console.log("\n[Styles]");
  for (const entry of config.styleEntrypoints) {
    const stylePath = path.resolve(repoRoot, entry);
    check(`styleEntrypoint: ${entry}`, fs.existsSync(stylePath), "File not found");
  }
}

// 7. Storybook settings (when enabled)
if (config.storybook.enabled) {
  console.log("\n[Storybook]");
  const sbCwd = path.resolve(repoRoot, config.storybook.cwd);
  check(
    `storybook.cwd: ${config.storybook.cwd}`,
    fs.existsSync(sbCwd),
    "Directory not found",
  );

  for (const storyGlob of config.storybook.storyGlobs) {
    const fullPattern = path.resolve(repoRoot, storyGlob);
    const matches: string[] = [];
    for await (const entry of glob(fullPattern)) {
      matches.push(entry);
    }
    warn(
      `storyGlobs: ${storyGlob}`,
      matches.length > 0,
      "No stories found (ok if stories not yet created)",
    );
  }
}

// 8. screenshotPresets are valid
console.log("\n[Presets]");
for (const preset of config.screenshotPresets) {
  check(
    `preset "${preset.name}"`,
    preset.width > 0 && preset.height > 0,
    `Invalid dimensions: ${preset.width}x${preset.height}`,
  );
}

// Summary
console.log(`\n${"─".repeat(40)}`);
if (errors > 0) {
  console.error(`\n✗ ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`\n✓ Config valid (${warnings} warning(s))`);
} else {
  console.log("\n✓ Config valid");
}
```

### Step 2: Add npm script

Add to `ui/designs/runtime/package.json` scripts:

```json
"validate-config": "tsx scripts/validate-config.ts"
```

### Step 3: Run the validator

Run: `cd ui/designs/runtime && npm run validate-config`
Expected: All checks pass with `✓ Config valid` (possibly with a warning for storyGlobs if no stories exist yet)

---

## Task 3: Write config validation test

**Files:**
- `ui/designs/runtime/scripts/lib/validate-config.test.ts` (new)

**Model:** opus

**review:** spec-only

**Depends on:** Task 2

Write a test that validates the config validation logic works correctly. Since the validation script is a CLI entrypoint, test the underlying checks by importing and testing the file-existence logic.

### Step 1: Write the test

Write `ui/designs/runtime/scripts/lib/validate-config.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Test that project.config.ts has the required shape and valid paths
describe("project.config.ts validation", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

  // Dynamic import to handle tsx's default export wrapping
  async function loadConfig() {
    const configModule = await import("../../../project.config.ts");
    return (configModule as any).default?.default || (configModule as any).default;
  }

  it("has required fields", async () => {
    const config = await loadConfig();
    expect(config.projectName).toBeTruthy();
    expect(config.setsRoot).toBeTruthy();
    expect(config.screenshotDir).toBeTruthy();
    expect(config.uiComponentGlobs).toBeInstanceOf(Array);
    expect(config.uiComponentGlobs.length).toBeGreaterThan(0);
    expect(config.tokenFiles).toBeInstanceOf(Array);
    expect(config.viteAliases).toBeTruthy();
    expect(config.screenshotPresets).toBeInstanceOf(Array);
    expect(config.screenshotPresets.length).toBeGreaterThan(0);
  });

  it("setsRoot directory exists", async () => {
    const config = await loadConfig();
    const setsPath = path.resolve(repoRoot, config.setsRoot);
    expect(fs.existsSync(setsPath)).toBe(true);
  });

  it("token files exist", async () => {
    const config = await loadConfig();
    for (const tokenFile of config.tokenFiles) {
      const tokenPath = path.resolve(repoRoot, tokenFile);
      expect(fs.existsSync(tokenPath), `Token file missing: ${tokenFile}`).toBe(true);
    }
  });

  it("vite alias targets exist", async () => {
    const config = await loadConfig();
    for (const [alias, target] of Object.entries(config.viteAliases)) {
      const aliasPath = path.resolve(repoRoot, target as string);
      expect(
        fs.existsSync(aliasPath),
        `Alias "${alias}" target missing: ${target}`,
      ).toBe(true);
    }
  });

  it("screenshot presets have valid dimensions", async () => {
    const config = await loadConfig();
    for (const preset of config.screenshotPresets) {
      expect(preset.name).toBeTruthy();
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
    }
  });

  it("storybook cwd exists when enabled", async () => {
    const config = await loadConfig();
    if (config.storybook.enabled) {
      const sbCwd = path.resolve(repoRoot, config.storybook.cwd);
      expect(fs.existsSync(sbCwd), `Storybook cwd missing: ${config.storybook.cwd}`).toBe(true);
    }
  });
});
```

### Step 2: Run the test

Run: `cd ui/designs/runtime && npx vitest run scripts/lib/validate-config.test.ts`
Expected: All 6 tests pass

---

## Task 4: Clean up legacy HANDOFF.md references

**Files:**
- `ui/designs/sets/project-idea-to-orchestration/default/HANDOFF.md`
- `ui/designs/sets/tina-orchestration-console/default/HANDOFF.md`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Update HANDOFF.md files to replace legacy `designs/src/designSets/` paths with current `ui/designs/sets/` paths and `ui/designs/runtime/` commands.

### Step 1: Update project-idea-to-orchestration HANDOFF.md

Replace the `## Files` and `## Run` sections in `ui/designs/sets/project-idea-to-orchestration/default/HANDOFF.md`:

Old:
```markdown
## Files
- `/Users/joshua/Projects/tina/designs/src/designSets/project-idea-to-orchestration/meta.ts`
- `/Users/joshua/Projects/tina/designs/src/designSets/project-idea-to-orchestration/data.ts`
- `/Users/joshua/Projects/tina/designs/src/designSets/project-idea-to-orchestration/index.tsx`

## Run
```bash
cd /Users/joshua/Projects/tina/designs
npm run dev
```

Build:
```bash
npm run build
```
```

New:
```markdown
## Files
- `ui/designs/sets/project-idea-to-orchestration/default/meta.ts`
- `ui/designs/sets/project-idea-to-orchestration/default/data.ts`
- `ui/designs/sets/project-idea-to-orchestration/default/index.tsx`

## Run
```bash
cd ui/designs/runtime
npm run dev
```
```

### Step 2: Update tina-orchestration-console HANDOFF.md

Replace the `## Files To Edit` and `## Run` sections in `ui/designs/sets/tina-orchestration-console/default/HANDOFF.md`:

Old:
```markdown
## Files To Edit
- `/Users/joshua/Projects/tina/designs/src/designSets/tina-orchestration-console/index.tsx`
- `/Users/joshua/Projects/tina/designs/src/designSets/tina-orchestration-console/data.ts`
- `/Users/joshua/Projects/tina/designs/src/designSets/tina-orchestration-console/meta.ts`

## Run
```bash
cd /Users/joshua/Projects/tina/designs
npm run dev
```

Build check:
```bash
npm run build
```
```

New:
```markdown
## Files To Edit
- `ui/designs/sets/tina-orchestration-console/default/index.tsx`
- `ui/designs/sets/tina-orchestration-console/default/data.ts`
- `ui/designs/sets/tina-orchestration-console/default/meta.ts`

## Run
```bash
cd ui/designs/runtime
npm run dev
```
```

### Step 3: Verify no legacy paths remain

Run: `grep -r "designs/src/designSets\|/Users/joshua/Projects/tina/designs" ui/designs/sets/`
Expected: No output (no legacy references remain)

---

## Task 5: Add .gitignore for legacy designs/ directory

**Files:**
- `designs/.gitignore` (new)

**Model:** haiku

**review:** spec-only

**Depends on:** none

Mark the legacy `designs/` directory as excluded from the active workflow by adding a `.gitignore` that ignores build artifacts, and adding a deprecation notice README.

### Step 1: Create deprecation README

Replace `designs/README.md` with:

```markdown
# Legacy Designs Directory (Deprecated)

This directory contains the original design system prototype. It has been superseded by the vendored workbench runtime at `ui/designs/`.

**Active location:** `ui/designs/runtime/` (workbench runtime) and `ui/designs/sets/` (design content)

Do not add new designs here. Use `ui/designs/sets/<design>/<variation>/` instead.

See `skills/wireframing/SKILL.md` for the wireframing workflow.
```

### Step 2: Verify legacy directory is documented

Run: `head -3 designs/README.md`
Expected: Shows deprecation notice

---

## Task 6: Run full test suite and TypeScript check

**Files:**
- (none — verification only)

**Model:** opus

**review:** spec-only

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5

Run the full test suite and TypeScript compilation to verify all changes integrate cleanly.

### Step 1: Run tests

Run: `cd ui/designs/runtime && npx vitest run`
Expected: All tests pass (existing tests + new validate-config tests)

### Step 2: Run TypeScript check

Run: `cd ui/designs/runtime && npx tsc --noEmit`
Expected: Clean compilation (exit 0)

### Step 3: Run config validation

Run: `cd ui/designs/runtime && npm run validate-config`
Expected: All checks pass, prints `✓ Config valid`

### Step 4: Verify no legacy references in active files

Run: `grep -r "designs/src/designSets" ui/designs/sets/ skills/`
Expected: No output

---

## Phase Estimates

| Task | Est. minutes | Risk |
|------|-------------|------|
| Task 1: Create wireframing skill | 5 | Low |
| Task 2: Create config validation script | 5 | Medium (glob API compatibility) |
| Task 3: Write config validation test | 3 | Low |
| Task 4: Clean up legacy HANDOFF.md references | 3 | Low |
| Task 5: Add deprecation notice for legacy designs/ | 2 | Low |
| Task 6: Run full test suite and verification | 3 | Low |
| **Total** | **21** | |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 400 |

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
