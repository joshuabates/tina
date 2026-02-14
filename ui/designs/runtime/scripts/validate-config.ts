import path from "node:path";
import * as configModule from "../../project.config.ts";
import { validateConfig } from "./lib/validate-config.ts";

// Handle tsx's double-wrapping of default exports
const config = ((configModule as any).default?.default ||
  (configModule as any).default) as typeof import("../../project.config.ts").default;

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

async function main() {
  console.log(`\nValidating project config: ${config.projectName}\n`);

  const { errors, warnings, results } = await validateConfig(config, repoRoot);

  // Group results by section
  const sections = new Map<string, typeof results>();
  for (const r of results) {
    let section = "Other";
    if (r.label.includes("setsRoot") || r.label.includes("screenshotDir")) {
      section = "Paths";
    } else if (r.label.includes("uiComponentGlobs")) {
      section = "Components";
    } else if (r.label.includes("tokenFile")) {
      section = "Tokens";
    } else if (r.label.includes("alias")) {
      section = "Aliases";
    } else if (r.label.includes("styleEntrypoint")) {
      section = "Styles";
    } else if (r.label.includes("storybook") || r.label.includes("storyGlobs")) {
      section = "Storybook";
    } else if (r.label.includes("preset")) {
      section = "Presets";
    }
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(r);
  }

  for (const [section, sectionResults] of sections) {
    console.log(`[${section}]`);
    for (const r of sectionResults) {
      if (r.ok) {
        console.log(`  \u2713 ${r.label}`);
      } else if (r.level === "warning") {
        console.warn(`  \u26A0 ${r.label}: ${r.detail}`);
      } else {
        console.error(`  \u2717 ${r.label}: ${r.detail}`);
      }
    }
    console.log();
  }

  console.log("\u2500".repeat(40));
  if (errors > 0) {
    console.error(`\n\u2717 ${errors} error(s), ${warnings} warning(s)`);
    process.exit(1);
  } else if (warnings > 0) {
    console.log(`\n\u2713 Config valid (${warnings} warning(s))`);
  } else {
    console.log("\n\u2713 Config valid");
  }
}

main();
