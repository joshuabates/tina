---
name: design-implementation
description: Self-correcting design implementation loop. Takes a locked design and drives Storybook implementation to visual parity using pixel diff + LLM vision comparison.
---

# Design Implementation

## Overview

Implement a UI component to match a locked design screenshot. Uses a self-correcting loop:
capture screenshots, compare via pixel diff and LLM vision, fix differences, repeat until converged.

## Prerequisites

Before starting, verify:
- Locked design screenshots exist in `ui/designs/.artifacts/screenshots/<design>/<variation>/`
- Workbench dev server is running: `cd ui/designs/runtime && npm run dev`
- Storybook is running: `cd tina-web && npm run storybook`
- `ANTHROPIC_API_KEY` is set (for vision comparison)

If design screenshots don't exist yet, capture them first:
```bash
cd ui/designs/runtime && npm run capture:design -- --design <slug> --variation <slug>
```

## Inputs

You need three things to start:
1. **Design slug and variation slug** — identifies the locked design
2. **Storybook story ID** — the story to implement (create one if it doesn't exist)
3. **Handoff notes** — check `ui/designs/sets/<design>/<variation>/HANDOFF.md` and `DECISIONS.md` if they exist

## The Loop

### Step 0: Setup

1. Read the design variation metadata:
   ```
   ui/designs/sets/<design>/<variation>/meta.ts
   ```

2. Read handoff notes if they exist:
   ```
   ui/designs/sets/<design>/<variation>/HANDOFF.md
   ui/designs/sets/<design>/<variation>/DECISIONS.md
   ```

3. Read the design variation component to understand the visual target:
   ```
   ui/designs/sets/<design>/<variation>/index.tsx
   ```

4. Verify design screenshots exist:
   ```
   ui/designs/.artifacts/screenshots/<design>/<variation>/desktop/design.png
   ```

5. If no Storybook story exists for the target component, create one first.

### Step 1: Implement or Update Component

Based on the design reference:
- Create or update the component source code
- Create or update the Storybook story
- Focus on structural layout first, then styling details

### Step 2: Capture Storybook Screenshot

```bash
cd ui/designs/runtime && npm run capture:storybook -- \
  --story <story-id> --design <design> --variation <variation>
```

### Step 3: Run Pixel Diff Comparison

```bash
cd ui/designs/runtime && npm run compare -- \
  --design <design> --variation <variation> --story <story-id>
```

Read the gap report:
```
ui/designs/.artifacts/screenshots/<design>/<variation>/<preset>/report.json
```

Key metrics to check:
- `diffPercentage` — overall pixel difference (target: < 1%)
- `grid` — 3x3 spatial analysis showing where differences are concentrated
- `channels` — RGB channel breakdown

### Step 4: Run LLM Vision Comparison

```bash
cd ui/designs/runtime && npm run vision-compare -- \
  --design <design> --variation <variation>
```

Read the vision report:
```
ui/designs/.artifacts/screenshots/<design>/<variation>/<preset>/vision-report.json
```

Key fields:
- `pass` — overall assessment (true/false)
- `issues` — specific differences found, categorized by type and severity
- `summary` — one-sentence assessment

### Step 5: Analyze and Decide

**Convergence criteria (BOTH must be met):**
- Pixel diff: `diffPercentage < 1%`
- Vision: `pass === true`

**If converged:** Go to Step 6 (done).

**If NOT converged:** Analyze the gap reports:
1. Read the pixel diff report — check `grid` for spatial concentration
2. Read the vision report — check `issues` for specific differences
3. Prioritize fixes: critical > major > minor
4. Focus on one category at a time (layout → spacing → typography → color)
5. Go back to Step 1

**Max iterations:** If after 5 iterations you haven't converged, stop and report the remaining gaps. Some differences may be intentional or unfixable in Storybook.

### Step 6: Finalize

1. Run one final comparison to confirm convergence
2. Read the design screenshot and Storybook screenshot to visually verify they match
3. Commit the component and story changes

## Convergence Tracking

After each iteration, the gap metrics should decrease. If metrics are NOT decreasing:
- You may be fixing one thing and breaking another
- Step back and look at the component holistically
- Consider whether the Storybook story setup (decorators, viewport, theme) matches the design environment

## Skill Type

**Rigid** — Follow this process exactly. Don't skip the compare steps. Don't claim convergence without running both pixel diff AND vision comparison.
