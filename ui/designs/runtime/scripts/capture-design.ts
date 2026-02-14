import path from "node:path";
import { parseArgs } from "node:util";
import * as configModule from "../../project.config.ts";
import { captureScreenshot, closeBrowser } from "./lib/capture.ts";

// Handle tsx's double-wrapping of default exports
const config = ((configModule as any).default?.default || (configModule as any).default) as typeof import("../../project.config.ts").default;

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
