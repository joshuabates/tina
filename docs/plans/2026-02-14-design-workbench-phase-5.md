# Design Workbench Phase 5: Design Implementation Skill

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 75b1b56d5ba287252ce68e7feaed5973cf027b1d

**Goal:** Create a self-correcting design implementation skill that uses locked design screenshots as visual reference. Integrates pixel diff (quantitative) and LLM vision (qualitative) comparison in an automated implement → capture → compare → fix loop, producing convergence evidence.

**Architecture:** Extends the Phase 4 compare/screenshot infrastructure with:
- LLM vision comparison module using Anthropic SDK (`scripts/lib/vision.ts`)
- Vision comparison CLI script (`scripts/vision-compare.ts`)
- Iteration tracker for convergence evidence (`scripts/lib/iteration-tracker.ts`)
- Design implementation skill (`skills/design-implementation/SKILL.md`)

**Phase context:** Phase 4 established screenshot capture (`capture-design.ts`, `capture-storybook.ts`), pixel diff comparison (`diff.ts`), compare orchestration (`compare.ts`), and compare page UI. Phase 5 adds the LLM vision layer and wraps everything in a self-correcting skill loop.

**Key patterns:**
- Scripts follow the existing `scripts/lib/` pattern with a thin CLI wrapper in `scripts/`
- Types extend `src/compare/types.ts`
- Skill follows the `skills/*/SKILL.md` frontmatter + markdown pattern
- Tests use vitest, same as existing `diff.test.ts`

---

## Tasks

### Task 1: Add Anthropic SDK dependency

**Files:**
- `ui/designs/runtime/package.json`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Add the Anthropic SDK for LLM vision comparison.

**Steps:**

1. Add `@anthropic-ai/sdk` to devDependencies in `ui/designs/runtime/package.json`:

```json
"@anthropic-ai/sdk": "^0.52.0"
```

2. Add npm scripts for the new CLI tools:

```json
"vision-compare": "tsx scripts/vision-compare.ts"
```

3. Run: `cd ui/designs/runtime && npm install`
   Expected: Clean install with no errors

---

### Task 2: Extend types for vision comparison and iteration tracking

**Files:**
- `ui/designs/runtime/src/compare/types.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Add type definitions for vision comparison results and iteration tracking.

**Steps:**

1. Append the following types to `ui/designs/runtime/src/compare/types.ts`:

```typescript
export type VisionIssueCategory =
  | "layout"
  | "spacing"
  | "typography"
  | "color"
  | "states"
  | "other";

export type VisionIssueSeverity = "minor" | "major" | "critical";

export interface VisionIssue {
  category: VisionIssueCategory;
  severity: VisionIssueSeverity;
  description: string;
  region?: string;
}

export interface VisionResult {
  pass: boolean;
  confidence: number;
  issues: VisionIssue[];
  summary: string;
}

export interface IterationRecord {
  iteration: number;
  timestamp: string;
  pixelDiff: {
    diffPercentage: number;
    diffPixels: number;
    totalPixels: number;
  };
  visionResult: {
    pass: boolean;
    confidence: number;
    issueCount: number;
  } | null;
}

export interface ConvergenceReport {
  designSlug: string;
  variationSlug: string;
  storyId: string;
  iterations: IterationRecord[];
  converged: boolean;
  totalIterations: number;
  finalDiffPercentage: number;
  startedAt: string;
  completedAt: string;
}
```

2. Run: `cd ui/designs/runtime && npx tsc --noEmit`
   Expected: No type errors

---

### Task 3: Create vision comparison module and test

**Files:**
- `ui/designs/runtime/scripts/lib/vision.ts` (new)
- `ui/designs/runtime/scripts/lib/vision.test.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 1, 2

Create the LLM vision comparison module that sends design and Storybook screenshots to Claude for qualitative visual assessment.

**Steps:**

1. Create `ui/designs/runtime/scripts/lib/vision.test.ts` first (TDD):

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VisionResult } from "../../src/compare/types.ts";

// Mock the Anthropic SDK before importing vision module
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

// Mock fs for image reading
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue(Buffer.from("fake-png-data")),
  };
});

describe("compareWithVision", () => {
  let compareWithVision: typeof import("./vision.ts").compareWithVision;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./vision.ts");
    compareWithVision = mod.compareWithVision;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns passing result when images match", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            pass: true,
            confidence: 0.95,
            issues: [],
            summary: "The implementation closely matches the design.",
          }),
        },
      ],
    });

    const result = await compareWithVision("/path/design.png", "/path/storybook.png");

    expect(result.pass).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.issues).toHaveLength(0);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("returns failing result with issues when images differ", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            pass: false,
            confidence: 0.85,
            issues: [
              {
                category: "spacing",
                severity: "major",
                description: "Button padding is 8px in design but 16px in implementation",
                region: "center",
              },
            ],
            summary: "Spacing differences detected in button area.",
          }),
        },
      ],
    });

    const result = await compareWithVision("/path/design.png", "/path/storybook.png");

    expect(result.pass).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].category).toBe("spacing");
  });

  it("handles API errors gracefully", async () => {
    mockCreate.mockRejectedValue(new Error("API key invalid"));

    const result = await compareWithVision("/path/design.png", "/path/storybook.png");

    expect(result.pass).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.summary).toContain("Vision comparison failed");
  });

  it("handles malformed API response", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "not valid json" }],
    });

    const result = await compareWithVision("/path/design.png", "/path/storybook.png");

    expect(result.pass).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.summary).toContain("Failed to parse");
  });
});
```

2. Create `ui/designs/runtime/scripts/lib/vision.ts`:

```typescript
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { VisionResult } from "../../src/compare/types.ts";

const VISION_PROMPT = `You are comparing a design mockup against a Storybook implementation screenshot.

Analyze both images and provide a structured JSON assessment. Compare:
- **Layout**: Element positioning, alignment, flow direction
- **Spacing**: Padding, margins, gaps between elements
- **Typography**: Font size, weight, line height, letter spacing
- **Color**: Background colors, text colors, border colors, shadows
- **States**: Interactive states, hover effects, focus indicators (if visible)

Respond with ONLY a JSON object (no markdown, no code fences):

{
  "pass": boolean (true if implementation is visually acceptable match),
  "confidence": number (0-1, how confident you are in your assessment),
  "issues": [
    {
      "category": "layout" | "spacing" | "typography" | "color" | "states" | "other",
      "severity": "minor" | "major" | "critical",
      "description": "specific description of the difference",
      "region": "where in the image (e.g. 'top-left', 'header', 'button area')"
    }
  ],
  "summary": "one-sentence overall assessment"
}

Rules:
- "pass" should be true only if there are no major or critical issues
- Minor issues (e.g. 1px alignment, slight color shade) can still pass
- Be specific about pixel values, colors, and measurements when possible
- "confidence" reflects how clearly you can assess the comparison`;

export async function compareWithVision(
  designPath: string,
  storybookPath: string,
  model: string = "claude-sonnet-4-5-20250929",
): Promise<VisionResult> {
  try {
    const designData = fs.readFileSync(designPath);
    const storybookData = fs.readFileSync(storybookPath);

    const client = new Anthropic();
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Design mockup (reference):" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: designData.toString("base64"),
              },
            },
            { type: "text", text: "Storybook implementation (actual):" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: storybookData.toString("base64"),
              },
            },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return errorResult("No text response from vision model");
    }

    const parsed = JSON.parse(textBlock.text) as VisionResult;
    return {
      pass: Boolean(parsed.pass),
      confidence: Number(parsed.confidence) || 0,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      summary: String(parsed.summary || ""),
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return errorResult("Failed to parse vision model response as JSON");
    }
    return errorResult(
      `Vision comparison failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function errorResult(message: string): VisionResult {
  return { pass: false, confidence: 0, issues: [], summary: message };
}
```

3. Run: `cd ui/designs/runtime && npx vitest run scripts/lib/vision.test.ts`
   Expected: All 4 tests pass

---

### Task 4: Create iteration tracker module and test

**Files:**
- `ui/designs/runtime/scripts/lib/iteration-tracker.ts` (new)
- `ui/designs/runtime/scripts/lib/iteration-tracker.test.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 2

Create the iteration tracker that accumulates metrics across loop iterations and produces convergence evidence.

**Steps:**

1. Create `ui/designs/runtime/scripts/lib/iteration-tracker.test.ts` first (TDD):

```typescript
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IterationTracker } from "./iteration-tracker.ts";

let tmpDir = "";

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

describe("IterationTracker", () => {
  it("creates a new report on first record", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    tracker.record({
      diffPercentage: 25.5,
      diffPixels: 2550,
      totalPixels: 10000,
    }, null);

    const report = tracker.getReport();
    expect(report.iterations).toHaveLength(1);
    expect(report.iterations[0].iteration).toBe(1);
    expect(report.iterations[0].pixelDiff.diffPercentage).toBe(25.5);
    expect(report.converged).toBe(false);
  });

  it("tracks multiple iterations and detects convergence", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    tracker.record(
      { diffPercentage: 15, diffPixels: 1500, totalPixels: 10000 },
      { pass: false, confidence: 0.8, issueCount: 3 },
    );
    tracker.record(
      { diffPercentage: 5, diffPixels: 500, totalPixels: 10000 },
      { pass: false, confidence: 0.85, issueCount: 1 },
    );
    tracker.record(
      { diffPercentage: 0.5, diffPixels: 50, totalPixels: 10000 },
      { pass: true, confidence: 0.95, issueCount: 0 },
    );

    const report = tracker.getReport();
    expect(report.iterations).toHaveLength(3);
    expect(report.converged).toBe(true);
    expect(report.totalIterations).toBe(3);
    expect(report.finalDiffPercentage).toBe(0.5);
  });

  it("persists report to disk", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    tracker.record(
      { diffPercentage: 10, diffPixels: 1000, totalPixels: 10000 },
      null,
    );

    expect(fs.existsSync(reportPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    expect(saved.designSlug).toBe("my-design");
    expect(saved.iterations).toHaveLength(1);
  });

  it("resumes from existing report file", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");

    // First session
    const tracker1 = new IterationTracker(reportPath, "my-design", "v1", "story--default");
    tracker1.record(
      { diffPercentage: 20, diffPixels: 2000, totalPixels: 10000 },
      null,
    );

    // Second session resumes
    const tracker2 = new IterationTracker(reportPath, "my-design", "v1", "story--default");
    tracker2.record(
      { diffPercentage: 5, diffPixels: 500, totalPixels: 10000 },
      { pass: true, confidence: 0.9, issueCount: 0 },
    );

    const report = tracker2.getReport();
    expect(report.iterations).toHaveLength(2);
    expect(report.iterations[0].pixelDiff.diffPercentage).toBe(20);
    expect(report.iterations[1].pixelDiff.diffPercentage).toBe(5);
  });

  it("reports non-convergence when pixel diff stays high", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    tracker.record(
      { diffPercentage: 20, diffPixels: 2000, totalPixels: 10000 },
      { pass: false, confidence: 0.7, issueCount: 5 },
    );

    const report = tracker.getReport();
    expect(report.converged).toBe(false);
  });
});
```

2. Create `ui/designs/runtime/scripts/lib/iteration-tracker.ts`:

```typescript
import fs from "node:fs";
import { dirname } from "node:path";
import type {
  ConvergenceReport,
  IterationRecord,
} from "../../src/compare/types.ts";

const CONVERGENCE_THRESHOLD = 1.0; // diffPercentage below this = pixel match

export class IterationTracker {
  private report: ConvergenceReport;
  private reportPath: string;

  constructor(
    reportPath: string,
    designSlug: string,
    variationSlug: string,
    storyId: string,
  ) {
    this.reportPath = reportPath;

    if (fs.existsSync(reportPath)) {
      this.report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    } else {
      this.report = {
        designSlug,
        variationSlug,
        storyId,
        iterations: [],
        converged: false,
        totalIterations: 0,
        finalDiffPercentage: 100,
        startedAt: new Date().toISOString(),
        completedAt: "",
      };
    }
  }

  record(
    pixelDiff: { diffPercentage: number; diffPixels: number; totalPixels: number },
    visionResult: { pass: boolean; confidence: number; issueCount: number } | null,
  ): void {
    const iteration: IterationRecord = {
      iteration: this.report.iterations.length + 1,
      timestamp: new Date().toISOString(),
      pixelDiff,
      visionResult,
    };

    this.report.iterations.push(iteration);
    this.report.totalIterations = this.report.iterations.length;
    this.report.finalDiffPercentage = pixelDiff.diffPercentage;

    const pixelPass = pixelDiff.diffPercentage < CONVERGENCE_THRESHOLD;
    const visionPass = visionResult === null || visionResult.pass;
    this.report.converged = pixelPass && visionPass;

    if (this.report.converged) {
      this.report.completedAt = new Date().toISOString();
    }

    this.persist();
  }

  getReport(): ConvergenceReport {
    return { ...this.report };
  }

  private persist(): void {
    fs.mkdirSync(dirname(this.reportPath), { recursive: true });
    fs.writeFileSync(this.reportPath, JSON.stringify(this.report, null, 2));
  }
}
```

3. Run: `cd ui/designs/runtime && npx vitest run scripts/lib/iteration-tracker.test.ts`
   Expected: All 5 tests pass

---

### Task 5: Create vision comparison CLI script

**Files:**
- `ui/designs/runtime/scripts/vision-compare.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 3

CLI entry point for standalone vision comparison. Reads two screenshots and produces a structured JSON assessment.

**Steps:**

1. Create `ui/designs/runtime/scripts/vision-compare.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import config from "../../project.config.ts";
import { compareWithVision } from "./lib/vision.ts";

const { values } = parseArgs({
  options: {
    design: { type: "string", short: "d" },
    variation: { type: "string", short: "v" },
    preset: { type: "string", short: "p", default: "desktop" },
    "design-path": { type: "string" },
    "storybook-path": { type: "string" },
    model: { type: "string", default: "claude-sonnet-4-5-20250929" },
  },
});

const screenshotDir = path.resolve(
  import.meta.dirname,
  "../../../..",
  config.screenshotDir,
);

function resolvePaths(): { designPath: string; storybookPath: string } {
  if (values["design-path"] && values["storybook-path"]) {
    return {
      designPath: values["design-path"],
      storybookPath: values["storybook-path"],
    };
  }

  if (!values.design || !values.variation) {
    console.error(
      "Usage: npm run vision-compare -- --design <slug> --variation <slug> [--preset <preset>]",
    );
    console.error(
      "   or: npm run vision-compare -- --design-path <path> --storybook-path <path>",
    );
    process.exit(1);
  }

  const presetDir = path.join(
    screenshotDir,
    values.design,
    values.variation,
    values.preset!,
  );
  return {
    designPath: path.join(presetDir, "design.png"),
    storybookPath: path.join(presetDir, "storybook.png"),
  };
}

async function main() {
  const { designPath, storybookPath } = resolvePaths();

  if (!fs.existsSync(designPath)) {
    console.error(`Design screenshot not found: ${designPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(storybookPath)) {
    console.error(`Storybook screenshot not found: ${storybookPath}`);
    process.exit(1);
  }

  console.log("Running vision comparison...");
  console.log(`  Design:    ${designPath}`);
  console.log(`  Storybook: ${storybookPath}`);
  console.log(`  Model:     ${values.model}`);

  const result = await compareWithVision(designPath, storybookPath, values.model);

  // Write result to report directory alongside the screenshots
  const reportDir = path.dirname(designPath);
  const reportPath = path.join(reportDir, "vision-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

  console.log(`\nResult: ${result.pass ? "PASS" : "FAIL"}`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`Summary: ${result.summary}`);

  if (result.issues.length > 0) {
    console.log(`\nIssues (${result.issues.length}):`);
    for (const issue of result.issues) {
      console.log(
        `  [${issue.severity}] ${issue.category}: ${issue.description}${issue.region ? ` (${issue.region})` : ""}`,
      );
    }
  }

  console.log(`\nReport written to ${reportPath}`);
}

main().catch((err) => {
  console.error("Vision compare failed:", err);
  process.exit(1);
});
```

2. Run: `cd ui/designs/runtime && npx tsx scripts/vision-compare.ts 2>&1 || true`
   Expected: Usage message printed (exits with code 1 since no args provided)

---

### Task 6: Create design-implementation skill

**Files:**
- `skills/design-implementation/SKILL.md` (new)

**Model:** opus

**review:** full

**Depends on:** 3, 4, 5

Create the self-correcting design implementation skill that orchestrates the full implement → capture → compare → fix loop.

**Steps:**

1. Create `skills/design-implementation/SKILL.md`:

```markdown
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
```

2. Run: `ls skills/design-implementation/SKILL.md`
   Expected: File exists

---

### Task 7: Create test for vision module integration with iteration tracker

**Files:**
- `ui/designs/runtime/scripts/lib/integration.test.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 3, 4

Integration test that verifies the vision comparison result feeds correctly into the iteration tracker to produce convergence evidence.

**Steps:**

1. Create `ui/designs/runtime/scripts/lib/integration.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { VisionResult } from "../../src/compare/types.ts";
import { IterationTracker } from "./iteration-tracker.ts";

let tmpDir = "";

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

describe("vision + iteration tracker integration", () => {
  it("tracks convergence across iterations with pixel diff and vision", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    // Iteration 1: far from target
    tracker.record(
      { diffPercentage: 35.2, diffPixels: 3520, totalPixels: 10000 },
      { pass: false, confidence: 0.7, issueCount: 5 },
    );

    let report = tracker.getReport();
    expect(report.converged).toBe(false);
    expect(report.totalIterations).toBe(1);

    // Iteration 2: getting closer
    tracker.record(
      { diffPercentage: 8.1, diffPixels: 810, totalPixels: 10000 },
      { pass: false, confidence: 0.8, issueCount: 2 },
    );

    report = tracker.getReport();
    expect(report.converged).toBe(false);
    expect(report.totalIterations).toBe(2);

    // Iteration 3: pixel passes but vision fails
    tracker.record(
      { diffPercentage: 0.8, diffPixels: 80, totalPixels: 10000 },
      { pass: false, confidence: 0.85, issueCount: 1 },
    );

    report = tracker.getReport();
    expect(report.converged).toBe(false);

    // Iteration 4: both pass
    tracker.record(
      { diffPercentage: 0.3, diffPixels: 30, totalPixels: 10000 },
      { pass: true, confidence: 0.95, issueCount: 0 },
    );

    report = tracker.getReport();
    expect(report.converged).toBe(true);
    expect(report.totalIterations).toBe(4);
    expect(report.finalDiffPercentage).toBe(0.3);
    expect(report.completedAt).not.toBe("");

    // Verify decreasing trend
    const diffs = report.iterations.map((i) => i.pixelDiff.diffPercentage);
    for (let i = 1; i < diffs.length; i++) {
      expect(diffs[i]).toBeLessThan(diffs[i - 1]);
    }
  });

  it("handles vision-only iterations (no vision result)", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    // No vision result (e.g. ANTHROPIC_API_KEY not set)
    tracker.record(
      { diffPercentage: 0.5, diffPixels: 50, totalPixels: 10000 },
      null,
    );

    const report = tracker.getReport();
    expect(report.converged).toBe(true);
    expect(report.iterations[0].visionResult).toBeNull();
  });
});
```

2. Run: `cd ui/designs/runtime && npx vitest run scripts/lib/integration.test.ts`
   Expected: All 2 tests pass

---

## Phase Estimates

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Add Anthropic SDK dependency | 2 min |
| 2 | Extend types for vision + iteration tracking | 3 min |
| 3 | Vision comparison module + test | 5 min |
| 4 | Iteration tracker module + test | 5 min |
| 5 | Vision comparison CLI script | 4 min |
| 6 | Design-implementation skill SKILL.md | 4 min |
| 7 | Integration test | 3 min |
| **Total** | | **~26 min** |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 600 |

**Estimated breakdown:**
- Types additions (types.ts): ~55 lines
- Vision module (vision.ts): ~80 lines
- Vision test (vision.test.ts): ~90 lines
- Iteration tracker (iteration-tracker.ts): ~65 lines
- Iteration tracker test (iteration-tracker.test.ts): ~90 lines
- Vision CLI script (vision-compare.ts): ~75 lines
- Skill SKILL.md: ~130 lines (markdown, not code)
- Integration test: ~70 lines
- **Total implementation: ~455 lines** (within 600 budget)
- **Total test lines: ~250**

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
