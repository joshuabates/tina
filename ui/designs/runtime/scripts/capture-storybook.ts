import path from "node:path";
import { parseArgs } from "node:util";
import * as configModule from "../../project.config.ts";
import { captureScreenshot, closeBrowser } from "./lib/capture.ts";

// Handle tsx's double-wrapping of default exports
const config = ((configModule as any).default?.default || (configModule as any).default) as typeof import("../../project.config.ts").default;

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
  "../../../..",
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
