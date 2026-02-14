import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import * as configModule from "../../project.config.ts";
import { compareWithVision } from "./lib/vision.ts";

// Handle tsx's double-wrapping of default exports
const config = ((configModule as any).default?.default || (configModule as any).default) as typeof import("../../project.config.ts").default;

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
