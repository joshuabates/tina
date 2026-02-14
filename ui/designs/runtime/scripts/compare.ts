import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import * as configModule from "../../project.config.ts";
import { captureScreenshot, closeBrowser } from "./lib/capture.ts";
import { compareImages, writeReport } from "./lib/diff.ts";
import type {
  ComparisonManifest,
  PresetResult,
} from "../src/compare/types.ts";

// Handle tsx's double-wrapping of default exports
const config = ((configModule as any).default?.default || (configModule as any).default) as typeof import("../../project.config.ts").default;

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
  "../../../..",
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
