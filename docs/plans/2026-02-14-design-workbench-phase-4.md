# Design Workbench Phase 4: Compare Mode & Screenshot Capture

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 552ed6c597cff49ce398f9ac506f39dcaec8d5d0

**Goal:** Enable screenshot capture of design variations and Storybook stories, pixel diff comparison with quantitative gap metrics, and a side-by-side compare UI in the workbench.

**Architecture:** Extends the vendored workbench runtime (Phase 3) with:
- Playwright-based screenshot capture scripts (Node.js CLI tools)
- pixelmatch-based pixel diff comparison module
- Vite middleware plugin to serve screenshot artifacts
- React compare page with side-by-side view, diff overlay, and gap report

**Phase context:** Phase 3 established the vendored workbench runtime at `ui/designs/runtime/` with Vite dev server, registry, and design/variation browsing. Phase 4 adds the compare/screenshot layer on top.

**Key patterns:**
- Runtime scripts live in `runtime/scripts/` (Node.js, run via `tsx`)
- Compare UI components live in `runtime/src/compare/` (React, bundled by Vite)
- Artifacts stored at `ui/designs/.artifacts/screenshots/` (configured in `project.config.ts`)
- Vite plugin serves artifacts at `/screenshots/` URL path during dev

---

## Tasks

### Task 1: Add screenshot and comparison dependencies

**Files:**
- `ui/designs/runtime/package.json`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Add development dependencies for screenshot capture, pixel diffing, and script execution.

**Steps:**

1. Add the following devDependencies to `ui/designs/runtime/package.json`:

```json
"pixelmatch": "^6.0.0",
"pngjs": "^7.0.0",
"@types/pngjs": "^7.0.0",
"playwright": "^1.50.0",
"tsx": "^4.19.0",
"vitest": "^4.0.0"
```

2. Add npm scripts:

```json
"test": "vitest run",
"capture:design": "tsx scripts/capture-design.ts",
"capture:storybook": "tsx scripts/capture-storybook.ts",
"compare": "tsx scripts/compare.ts",
"playwright:install": "playwright install chromium"
```

3. Run: `cd ui/designs/runtime && npm install`
   Expected: Clean install with no errors

4. Run: `cd ui/designs/runtime && npx playwright install chromium`
   Expected: Chromium browser downloaded successfully

---

### Task 2: Define compare types and create render page

**Files:**
- `ui/designs/runtime/src/compare/types.ts` (new)
- `ui/designs/runtime/src/pages/RenderPage.tsx` (new)
- `ui/designs/runtime/src/App.tsx`

**Model:** haiku

**review:** spec-only

**Depends on:** 1

**Steps:**

1. Create `ui/designs/runtime/src/compare/types.ts` with shared type definitions used by both scripts and UI:

```typescript
export interface CaptureOptions {
  url: string;
  outputPath: string;
  width: number;
  height: number;
  waitForSelector?: string;
  delay?: number;
}

export interface ComparisonReport {
  designSlug: string;
  variationSlug: string;
  preset: string;
  timestamp: string;
  metrics: DiffMetrics;
}

export interface DiffMetrics {
  totalPixels: number;
  diffPixels: number;
  diffPercentage: number;
  grid: GridCell[];
  channels: ChannelDiff;
}

export interface GridCell {
  row: number;
  col: number;
  totalPixels: number;
  diffPixels: number;
  diffPercentage: number;
}

export interface ChannelDiff {
  r: number;
  g: number;
  b: number;
}

export interface ComparisonManifest {
  designSlug: string;
  variationSlug: string;
  storyId: string;
  presets: PresetResult[];
  capturedAt: string;
}

export interface PresetResult {
  name: string;
  width: number;
  height: number;
  hasDesign: boolean;
  hasStorybook: boolean;
  hasDiff: boolean;
  hasReport: boolean;
}
```

2. Create `ui/designs/runtime/src/pages/RenderPage.tsx` — a chrome-free render of a variation for clean screenshot capture:

```tsx
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadVariationComponent } from "../registry/index.ts";

export function RenderPage() {
  const { designSlug = "", variationSlug = "" } = useParams();
  const [Component, setComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    loadVariationComponent(designSlug, variationSlug).then((comp) => {
      if (active && comp) setComponent(() => comp);
    });
    return () => {
      active = false;
    };
  }, [designSlug, variationSlug]);

  if (!Component) return null;
  return <Component />;
}
```

3. Add the render route and compare route placeholder to `ui/designs/runtime/src/App.tsx`. Import `RenderPage` and add:

```tsx
<Route path="/render/:designSlug/:variationSlug" element={<RenderPage />} />
```

4. Run: `cd ui/designs/runtime && npx tsc --noEmit`
   Expected: No type errors

---

### Task 3: Create screenshot capture utility

**Files:**
- `ui/designs/runtime/scripts/lib/capture.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 1

Create shared Playwright-based capture logic used by both design and Storybook capture scripts.

**Steps:**

1. Create `ui/designs/runtime/scripts/lib/capture.ts`:

```typescript
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type Browser } from "playwright";

export interface CaptureOptions {
  url: string;
  outputPath: string;
  width: number;
  height: number;
  waitForSelector?: string;
  delay?: number;
}

let browser: Browser | null = null;

export async function ensureBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch();
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function captureScreenshot(options: CaptureOptions): Promise<void> {
  const { url, outputPath, width, height, waitForSelector, delay } = options;
  const b = await ensureBrowser();
  const page = await b.newPage({ viewport: { width, height } });

  try {
    await page.goto(url, { waitUntil: "networkidle" });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10_000 });
    }

    if (delay) {
      await page.waitForTimeout(delay);
    }

    mkdirSync(dirname(outputPath), { recursive: true });
    await page.screenshot({ path: outputPath, fullPage: false });
  } finally {
    await page.close();
  }
}
```

2. Run: `cd ui/designs/runtime && npx tsx --eval "import './scripts/lib/capture.ts'; console.log('capture module loads OK')"`
   Expected: "capture module loads OK" printed without errors

---

### Task 4: Create design variation capture script

**Files:**
- `ui/designs/runtime/scripts/capture-design.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 3

CLI script to capture screenshots of a design variation from the running workbench dev server.

**Steps:**

1. Create `ui/designs/runtime/scripts/capture-design.ts`:

```typescript
import path from "node:path";
import { parseArgs } from "node:util";
import config from "../../project.config.ts";
import { captureScreenshot, closeBrowser } from "./lib/capture.ts";

const { values } = parseArgs({
  options: {
    design: { type: "string", short: "d" },
    variation: { type: "string", short: "v" },
    port: { type: "string", short: "p", default: "5200" },
  },
});

if (!values.design || !values.variation) {
  console.error(
    "Usage: npm run capture:design -- --design <slug> --variation <slug> [--port <port>]",
  );
  process.exit(1);
}

const { design, variation, port } = values;
const baseUrl = `http://localhost:${port}`;
const screenshotDir = path.resolve(
  import.meta.dirname,
  "../../..",
  config.screenshotDir,
);

async function main() {
  try {
    for (const preset of config.screenshotPresets) {
      const outputPath = path.join(
        screenshotDir,
        design!,
        variation!,
        preset.name,
        "design.png",
      );
      const url = `${baseUrl}/render/${design}/${variation}`;

      console.log(
        `Capturing ${preset.name} (${preset.width}x${preset.height}) → ${outputPath}`,
      );

      await captureScreenshot({
        url,
        outputPath,
        width: preset.width,
        height: preset.height,
        delay: 500,
      });
    }
    console.log("Design capture complete.");
  } finally {
    await closeBrowser();
  }
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
```

2. Run: `cd ui/designs/runtime && npx tsx scripts/capture-design.ts --help 2>&1 || true`
   Expected: Usage message printed (exits with code 1 since no args provided)

---

### Task 5: Create Storybook screenshot capture script

**Files:**
- `ui/designs/runtime/scripts/capture-storybook.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 3

CLI script to capture screenshots of a Storybook story from the running Storybook dev server.

**Steps:**

1. Create `ui/designs/runtime/scripts/capture-storybook.ts`:

```typescript
import path from "node:path";
import { parseArgs } from "node:util";
import config from "../../project.config.ts";
import { captureScreenshot, closeBrowser } from "./lib/capture.ts";

const { values } = parseArgs({
  options: {
    story: { type: "string", short: "s" },
    design: { type: "string", short: "d" },
    variation: { type: "string", short: "v" },
    port: { type: "string", short: "p", default: "6006" },
  },
});

if (!values.story || !values.design || !values.variation) {
  console.error(
    "Usage: npm run capture:storybook -- --story <story-id> --design <slug> --variation <slug> [--port <port>]",
  );
  process.exit(1);
}

const { story, design, variation, port } = values;
const baseUrl = config.storybook.url.replace(/:\d+/, `:${port}`);
const screenshotDir = path.resolve(
  import.meta.dirname,
  "../../..",
  config.screenshotDir,
);

async function main() {
  try {
    for (const preset of config.screenshotPresets) {
      const outputPath = path.join(
        screenshotDir,
        design!,
        variation!,
        preset.name,
        "storybook.png",
      );
      const url = `${baseUrl}/iframe.html?id=${story}&viewMode=story`;

      console.log(
        `Capturing ${preset.name} (${preset.width}x${preset.height}) → ${outputPath}`,
      );

      await captureScreenshot({
        url,
        outputPath,
        width: preset.width,
        height: preset.height,
        waitForSelector: "#storybook-root > *",
        delay: 500,
      });
    }
    console.log("Storybook capture complete.");
  } finally {
    await closeBrowser();
  }
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
```

2. Run: `cd ui/designs/runtime && npx tsx scripts/capture-storybook.ts 2>&1 || true`
   Expected: Usage message printed (exits with code 1 since no args provided)

---

### Task 6: Create pixel diff comparison module with test

**Files:**
- `ui/designs/runtime/scripts/lib/diff.ts` (new)
- `ui/designs/runtime/scripts/lib/diff.test.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 1

Core comparison engine: loads two PNG images, runs pixelmatch, computes gap metrics (overall diff, 3x3 grid spatial analysis, color channel breakdown), writes diff image and report.

**Steps:**

1. Create `ui/designs/runtime/scripts/lib/diff.ts`:

```typescript
import fs from "node:fs";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import type {
  ComparisonReport,
  DiffMetrics,
  GridCell,
  ChannelDiff,
} from "../../src/compare/types.ts";

export async function compareImages(
  designPath: string,
  storybookPath: string,
  diffOutputPath: string,
): Promise<DiffMetrics> {
  const designImg = readPNG(designPath);
  const storybookImg = readPNG(storybookPath);

  const width = Math.max(designImg.width, storybookImg.width);
  const height = Math.max(designImg.height, storybookImg.height);

  const designData = normalizeImage(designImg, width, height);
  const storybookData = normalizeImage(storybookImg, width, height);

  const diffPNG = new PNG({ width, height });
  const diffPixels = pixelmatch(
    designData,
    storybookData,
    diffPNG.data,
    width,
    height,
    { threshold: 0.1, includeAA: false },
  );

  const totalPixels = width * height;

  fs.mkdirSync(dirname(diffOutputPath), { recursive: true });
  fs.writeFileSync(diffOutputPath, PNG.sync.write(diffPNG));

  const grid = computeGrid(designData, storybookData, width, height, 3, 3);
  const channels = computeChannelDiff(designData, storybookData, width, height);

  return {
    totalPixels,
    diffPixels,
    diffPercentage: totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0,
    grid,
    channels,
  };
}

function readPNG(filePath: string): PNG {
  const data = fs.readFileSync(filePath);
  return PNG.sync.read(data);
}

function normalizeImage(
  img: PNG,
  targetWidth: number,
  targetHeight: number,
): Uint8Array {
  if (img.width === targetWidth && img.height === targetHeight) {
    return new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length);
  }
  const normalized = new PNG({
    width: targetWidth,
    height: targetHeight,
    fill: true,
  });
  for (let i = 0; i < normalized.data.length; i += 4) {
    normalized.data[i] = 255;
    normalized.data[i + 1] = 255;
    normalized.data[i + 2] = 255;
    normalized.data[i + 3] = 255;
  }
  PNG.bitblt(img, normalized, 0, 0, img.width, img.height, 0, 0);
  return new Uint8Array(
    normalized.data.buffer,
    normalized.data.byteOffset,
    normalized.data.length,
  );
}

function computeGrid(
  dataA: Uint8Array,
  dataB: Uint8Array,
  width: number,
  height: number,
  rows: number,
  cols: number,
): GridCell[] {
  const cells: GridCell[] = [];
  const cellWidth = Math.ceil(width / cols);
  const cellHeight = Math.ceil(height / rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cellWidth;
      const y0 = row * cellHeight;
      const x1 = Math.min(x0 + cellWidth, width);
      const y1 = Math.min(y0 + cellHeight, height);

      let cellTotal = 0;
      let cellDiff = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * 4;
          cellTotal++;
          if (
            dataA[idx] !== dataB[idx] ||
            dataA[idx + 1] !== dataB[idx + 1] ||
            dataA[idx + 2] !== dataB[idx + 2] ||
            dataA[idx + 3] !== dataB[idx + 3]
          ) {
            cellDiff++;
          }
        }
      }

      cells.push({
        row,
        col,
        totalPixels: cellTotal,
        diffPixels: cellDiff,
        diffPercentage: cellTotal > 0 ? (cellDiff / cellTotal) * 100 : 0,
      });
    }
  }

  return cells;
}

function computeChannelDiff(
  dataA: Uint8Array,
  dataB: Uint8Array,
  width: number,
  height: number,
): ChannelDiff {
  let rDiff = 0;
  let gDiff = 0;
  let bDiff = 0;
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    rDiff += Math.abs(dataA[idx] - dataB[idx]);
    gDiff += Math.abs(dataA[idx + 1] - dataB[idx + 1]);
    bDiff += Math.abs(dataA[idx + 2] - dataB[idx + 2]);
  }

  const maxChannelDiff = totalPixels * 255;
  return {
    r: maxChannelDiff > 0 ? (rDiff / maxChannelDiff) * 100 : 0,
    g: maxChannelDiff > 0 ? (gDiff / maxChannelDiff) * 100 : 0,
    b: maxChannelDiff > 0 ? (bDiff / maxChannelDiff) * 100 : 0,
  };
}

export function writeReport(
  reportPath: string,
  designSlug: string,
  variationSlug: string,
  preset: string,
  metrics: DiffMetrics,
): void {
  const report: ComparisonReport = {
    designSlug,
    variationSlug,
    preset,
    timestamp: new Date().toISOString(),
    metrics,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
```

2. Create `ui/designs/runtime/scripts/lib/diff.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { compareImages } from "./diff.ts";

function createSolidPNG(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0];
    png.data[i + 1] = rgba[1];
    png.data[i + 2] = rgba[2];
    png.data[i + 3] = rgba[3];
  }
  return png;
}

function writePNG(filePath: string, png: PNG): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

let tmpDir = "";

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

describe("compareImages", () => {
  it("reports zero diff for identical images", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-test-"));
    const img = createSolidPNG(10, 10, [255, 0, 0, 255]);
    writePNG(path.join(tmpDir, "a.png"), img);
    writePNG(path.join(tmpDir, "b.png"), img);

    const result = await compareImages(
      path.join(tmpDir, "a.png"),
      path.join(tmpDir, "b.png"),
      path.join(tmpDir, "diff.png"),
    );

    expect(result.diffPixels).toBe(0);
    expect(result.diffPercentage).toBe(0);
    expect(result.totalPixels).toBe(100);
    expect(fs.existsSync(path.join(tmpDir, "diff.png"))).toBe(true);
  });

  it("reports full diff for completely different images", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-test-"));
    writePNG(path.join(tmpDir, "a.png"), createSolidPNG(10, 10, [255, 0, 0, 255]));
    writePNG(path.join(tmpDir, "b.png"), createSolidPNG(10, 10, [0, 0, 255, 255]));

    const result = await compareImages(
      path.join(tmpDir, "a.png"),
      path.join(tmpDir, "b.png"),
      path.join(tmpDir, "diff.png"),
    );

    expect(result.diffPixels).toBe(100);
    expect(result.diffPercentage).toBe(100);
  });

  it("computes grid analysis with localized diffs", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-test-"));
    const img1 = createSolidPNG(9, 9, [255, 255, 255, 255]);
    const img2 = createSolidPNG(9, 9, [255, 255, 255, 255]);

    // Make top-left 3x3 region different
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const idx = (y * 9 + x) * 4;
        img2.data[idx] = 0;
      }
    }

    writePNG(path.join(tmpDir, "a.png"), img1);
    writePNG(path.join(tmpDir, "b.png"), img2);

    const result = await compareImages(
      path.join(tmpDir, "a.png"),
      path.join(tmpDir, "b.png"),
      path.join(tmpDir, "diff.png"),
    );

    expect(result.grid).toHaveLength(9);
    const topLeft = result.grid.find((c) => c.row === 0 && c.col === 0);
    expect(topLeft!.diffPixels).toBeGreaterThan(0);
    const bottomRight = result.grid.find((c) => c.row === 2 && c.col === 2);
    expect(bottomRight!.diffPixels).toBe(0);
  });

  it("computes channel diffs correctly", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-test-"));
    writePNG(path.join(tmpDir, "a.png"), createSolidPNG(5, 5, [255, 0, 0, 255]));
    writePNG(path.join(tmpDir, "b.png"), createSolidPNG(5, 5, [0, 0, 0, 255]));

    const result = await compareImages(
      path.join(tmpDir, "a.png"),
      path.join(tmpDir, "b.png"),
      path.join(tmpDir, "diff.png"),
    );

    expect(result.channels.r).toBe(100);
    expect(result.channels.g).toBe(0);
    expect(result.channels.b).toBe(0);
  });
});
```

3. Run: `cd ui/designs/runtime && npx vitest run scripts/lib/diff.test.ts`
   Expected: All 4 tests pass

---

### Task 7: Create compare orchestration script

**Files:**
- `ui/designs/runtime/scripts/compare.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 4, 5, 6

CLI script that orchestrates the full comparison flow: captures both design and Storybook screenshots, runs pixel diff, writes reports and manifest.

**Steps:**

1. Create `ui/designs/runtime/scripts/compare.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import config from "../../project.config.ts";
import { captureScreenshot, closeBrowser } from "./lib/capture.ts";
import { compareImages, writeReport } from "./lib/diff.ts";
import type {
  ComparisonManifest,
  PresetResult,
} from "../src/compare/types.ts";

const { values } = parseArgs({
  options: {
    design: { type: "string", short: "d" },
    variation: { type: "string", short: "v" },
    story: { type: "string", short: "s" },
    "workbench-port": { type: "string", default: "5200" },
    "storybook-port": { type: "string", default: "6006" },
  },
});

if (!values.design || !values.variation || !values.story) {
  console.error(
    "Usage: npm run compare -- --design <slug> --variation <slug> --story <story-id> [--workbench-port <port>] [--storybook-port <port>]",
  );
  process.exit(1);
}

const { design, variation, story } = values;
const workbenchPort = values["workbench-port"]!;
const storybookPort = values["storybook-port"]!;
const screenshotDir = path.resolve(
  import.meta.dirname,
  "../..",
  config.screenshotDir,
);

async function main() {
  const presets: PresetResult[] = [];

  try {
    for (const preset of config.screenshotPresets) {
      const presetDir = path.join(
        screenshotDir,
        design!,
        variation!,
        preset.name,
      );
      fs.mkdirSync(presetDir, { recursive: true });

      const designPath = path.join(presetDir, "design.png");
      const storybookPath = path.join(presetDir, "storybook.png");
      const diffPath = path.join(presetDir, "diff.png");
      const reportPath = path.join(presetDir, "report.json");

      console.log(`\n[${preset.name}] Capturing design...`);
      await captureScreenshot({
        url: `http://localhost:${workbenchPort}/render/${design}/${variation}`,
        outputPath: designPath,
        width: preset.width,
        height: preset.height,
        delay: 500,
      });

      console.log(`[${preset.name}] Capturing storybook...`);
      const storybookBaseUrl = config.storybook.url.replace(
        /:\d+/,
        `:${storybookPort}`,
      );
      await captureScreenshot({
        url: `${storybookBaseUrl}/iframe.html?id=${story}&viewMode=story`,
        outputPath: storybookPath,
        width: preset.width,
        height: preset.height,
        waitForSelector: "#storybook-root > *",
        delay: 500,
      });

      console.log(`[${preset.name}] Computing diff...`);
      const metrics = await compareImages(designPath, storybookPath, diffPath);
      writeReport(reportPath, design!, variation!, preset.name, metrics);

      console.log(
        `[${preset.name}] Diff: ${metrics.diffPercentage.toFixed(2)}% (${metrics.diffPixels}/${metrics.totalPixels} pixels)`,
      );

      presets.push({
        name: preset.name,
        width: preset.width,
        height: preset.height,
        hasDesign: true,
        hasStorybook: true,
        hasDiff: true,
        hasReport: true,
      });
    }

    const manifest: ComparisonManifest = {
      designSlug: design!,
      variationSlug: variation!,
      storyId: story!,
      presets,
      capturedAt: new Date().toISOString(),
    };
    const manifestPath = path.join(
      screenshotDir,
      design!,
      variation!,
      "manifest.json",
    );
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\nManifest written to ${manifestPath}`);
    console.log("Compare complete.");
  } finally {
    await closeBrowser();
  }
}

main().catch((err) => {
  console.error("Compare failed:", err);
  process.exit(1);
});
```

2. Run: `cd ui/designs/runtime && npx tsx scripts/compare.ts 2>&1 || true`
   Expected: Usage message printed (exits with code 1 since no args provided)

---

### Task 8: Configure Vite to serve screenshot artifacts

**Files:**
- `ui/designs/runtime/vite.config.ts`

**Model:** opus

**review:** full

**Depends on:** 2

Add a Vite plugin that serves screenshot artifacts from `ui/designs/.artifacts/screenshots/` at the `/screenshots/` URL path during dev mode.

**Steps:**

1. Add a `serveScreenshots` plugin function to `ui/designs/runtime/vite.config.ts`. Import `createReadStream`, `existsSync`, `mkdirSync`, `statSync` from `node:fs`. The plugin:

```typescript
function serveScreenshots(): import("vite").Plugin {
  const screenshotsDir = path.resolve(__dirname, "../.artifacts/screenshots");
  return {
    name: "serve-screenshots",
    configureServer(server) {
      mkdirSync(screenshotsDir, { recursive: true });
      server.middlewares.use("/screenshots", (req, res, next) => {
        if (!req.url) return next();
        const filePath = path.join(
          screenshotsDir,
          decodeURIComponent(req.url),
        );
        const normalizedPath = path.normalize(filePath);
        if (!normalizedPath.startsWith(screenshotsDir)) return next();
        if (!existsSync(normalizedPath) || !statSync(normalizedPath).isFile())
          return next();
        const ext = path.extname(normalizedPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".json": "application/json",
        };
        res.setHeader(
          "Content-Type",
          mimeTypes[ext] ?? "application/octet-stream",
        );
        createReadStream(normalizedPath).pipe(res);
      });
    },
  };
}
```

2. Add `serveScreenshots()` to the `plugins` array in the default export:

```typescript
plugins: [react(), serveScreenshots()],
```

3. Run: `cd ui/designs/runtime && npx tsc --noEmit -p tsconfig.node.json`
   Expected: No type errors

---

### Task 9: Create compare page UI components

**Files:**
- `ui/designs/runtime/src/compare/ComparePage.tsx` (new)
- `ui/designs/runtime/src/compare/GapReport.tsx` (new)
- `ui/designs/runtime/src/App.tsx`
- `ui/designs/runtime/src/pages/DesignPage.tsx`

**Model:** opus

**review:** full

**Depends on:** 8

Create the compare page with side-by-side view, diff overlay toggle, and gap metrics display. Wire up routing and add "Compare" link from design page.

**Steps:**

1. Create `ui/designs/runtime/src/compare/GapReport.tsx`:

```tsx
import type { ComparisonReport } from "./types.ts";

interface GapReportProps {
  report: ComparisonReport;
}

export function GapReport({ report }: GapReportProps) {
  const { metrics } = report;
  const severity =
    metrics.diffPercentage < 1
      ? "match"
      : metrics.diffPercentage < 5
        ? "close"
        : "divergent";
  const severityColor = {
    match: "text-emerald-700",
    close: "text-amber-700",
    divergent: "text-rose-700",
  }[severity];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-900">Gap Report</h3>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Diff Pixels
          </p>
          <p className={`mt-1 text-2xl font-bold ${severityColor}`}>
            {metrics.diffPercentage.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {metrics.diffPixels.toLocaleString()} /{" "}
            {metrics.totalPixels.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Color Channels
          </p>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-red-600">R</span>
              <span>{metrics.channels.r.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-600">G</span>
              <span>{metrics.channels.g.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-600">B</span>
              <span>{metrics.channels.b.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Status
          </p>
          <p className={`mt-1 text-lg font-semibold ${severityColor}`}>
            {severity === "match"
              ? "Match"
              : severity === "close"
                ? "Close"
                : "Divergent"}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-medium text-slate-700">
          Spatial Analysis (3x3 Grid)
        </h4>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {metrics.grid.map((cell) => {
            const isClean = cell.diffPercentage === 0;
            return (
              <div
                key={`${cell.row}-${cell.col}`}
                className={`rounded p-2 text-center text-xs ${
                  isClean
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {cell.diffPercentage.toFixed(1)}%
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Grid shows diff concentration by region — highlights layout and
          spacing differences.
        </p>
      </div>
    </section>
  );
}
```

2. Create `ui/designs/runtime/src/compare/ComparePage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PageFrame } from "../components/PageFrame.tsx";
import { GapReport } from "./GapReport.tsx";
import type { ComparisonManifest, ComparisonReport } from "./types.ts";

type ViewMode = "side-by-side" | "diff" | "overlay";

export function ComparePage() {
  const { designSlug = "", variationSlug = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [manifest, setManifest] = useState<ComparisonManifest | null>(null);
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [error, setError] = useState("");

  const activePreset =
    searchParams.get("preset") ?? manifest?.presets[0]?.name ?? "";

  useEffect(() => {
    fetch(`/screenshots/${designSlug}/${variationSlug}/manifest.json`)
      .then((res) =>
        res.ok
          ? res.json()
          : Promise.reject(new Error("No comparison data found")),
      )
      .then((data: ComparisonManifest) => setManifest(data))
      .catch((err: Error) => setError(err.message));
  }, [designSlug, variationSlug]);

  useEffect(() => {
    if (!activePreset) return;
    fetch(
      `/screenshots/${designSlug}/${variationSlug}/${activePreset}/report.json`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ComparisonReport | null) => setReport(data))
      .catch(() => setReport(null));
  }, [designSlug, variationSlug, activePreset]);

  const screenshotBase = `/screenshots/${designSlug}/${variationSlug}/${activePreset}`;

  if (error) {
    return (
      <PageFrame
        title="Compare"
        subtitle="No comparison data available"
        actions={
          <Link
            to={`/designs/${designSlug}/${variationSlug}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
          >
            Back to design
          </Link>
        }
      >
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {error}. Run{" "}
          <code>
            npm run compare -- --design {designSlug} --variation{" "}
            {variationSlug} --story &lt;story-id&gt;
          </code>{" "}
          to generate comparison data.
        </section>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Compare"
      subtitle={`${designSlug} / ${variationSlug}`}
      actions={
        <Link
          to={`/designs/${designSlug}/${variationSlug}`}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
        >
          Back to design
        </Link>
      }
    >
      {manifest && manifest.presets.length > 1 ? (
        <nav className="flex gap-2">
          {manifest.presets.map((p) => (
            <button
              key={p.name}
              onClick={() => setSearchParams({ preset: p.name })}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                p.name === activePreset
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-700 hover:border-slate-500"
              }`}
            >
              {p.name} ({p.width}x{p.height})
            </button>
          ))}
        </nav>
      ) : null}

      <nav className="flex gap-2">
        {(["side-by-side", "diff", "overlay"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              mode === viewMode
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-300 text-slate-700 hover:border-slate-500"
            }`}
          >
            {mode === "side-by-side"
              ? "Side by Side"
              : mode === "diff"
                ? "Diff"
                : "Overlay"}
          </button>
        ))}
      </nav>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        {viewMode === "side-by-side" ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-600">
                Design
              </h3>
              <img
                src={`${screenshotBase}/design.png`}
                alt="Design screenshot"
                className="w-full rounded border border-slate-200"
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-600">
                Storybook
              </h3>
              <img
                src={`${screenshotBase}/storybook.png`}
                alt="Storybook screenshot"
                className="w-full rounded border border-slate-200"
              />
            </div>
          </div>
        ) : viewMode === "diff" ? (
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-600">
              Pixel Diff
            </h3>
            <img
              src={`${screenshotBase}/diff.png`}
              alt="Diff overlay"
              className="w-full rounded border border-slate-200"
            />
          </div>
        ) : (
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-600">
              Overlay (Design + Diff)
            </h3>
            <div className="relative">
              <img
                src={`${screenshotBase}/design.png`}
                alt="Design screenshot"
                className="w-full rounded border border-slate-200"
              />
              <img
                src={`${screenshotBase}/diff.png`}
                alt="Diff overlay"
                className="absolute inset-0 w-full rounded opacity-50 mix-blend-multiply"
              />
            </div>
          </div>
        )}
      </section>

      {report ? <GapReport report={report} /> : null}
    </PageFrame>
  );
}
```

3. Add the compare route to `ui/designs/runtime/src/App.tsx`. Import `ComparePage` and add:

```tsx
<Route path="/compare/:designSlug/:variationSlug" element={<ComparePage />} />
```

4. Add a "Compare" link to `ui/designs/runtime/src/pages/DesignPage.tsx` in the actions area, linking to `/compare/${designSlug}/${activeVariationSlug}`:

```tsx
<Link
  to={`/compare/${designSlug}/${activeVariationSlug}`}
  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-500"
>
  Compare
</Link>
```

Add this link next to the existing "Back to index" link.

5. Run: `cd ui/designs/runtime && npx tsc --noEmit`
   Expected: No type errors

---

## Phase Estimates

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Add dependencies | 3 min |
| 2 | Define types + render page | 3 min |
| 3 | Capture utility | 4 min |
| 4 | Design capture script | 4 min |
| 5 | Storybook capture script | 4 min |
| 6 | Pixel diff module + test | 5 min |
| 7 | Compare orchestration script | 4 min |
| 8 | Vite artifact serving | 3 min |
| 9 | Compare page UI + routing | 5 min |
| **Total** | | **~35 min** |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 850 |

**Estimated breakdown:**
- Types (types.ts): ~55 lines
- RenderPage: ~20 lines
- Capture utility: ~50 lines
- Design capture script: ~45 lines
- Storybook capture script: ~45 lines
- Diff module: ~135 lines
- Diff tests: ~90 lines
- Compare script: ~95 lines
- Vite plugin addition: ~25 lines
- ComparePage: ~140 lines
- GapReport: ~85 lines
- Routing/navigation changes: ~10 lines
- **Total implementation: ~795 lines** (within 850 budget)
- **Test lines: ~90**

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
