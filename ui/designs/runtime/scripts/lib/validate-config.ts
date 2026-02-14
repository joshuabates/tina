import fs from "node:fs";
import path from "node:path";
import { glob } from "node:fs/promises";
import type { DesignsProjectConfig } from "../../../project.config.ts";

export interface ValidationResult {
  label: string;
  ok: boolean;
  level: "error" | "warning";
  detail?: string;
}

export interface ValidationReport {
  errors: number;
  warnings: number;
  results: ValidationResult[];
}

export async function validateConfig(
  config: DesignsProjectConfig,
  repoRoot: string,
): Promise<ValidationReport> {
  const results: ValidationResult[] = [];

  // 1. setsRoot exists
  const setsPath = path.resolve(repoRoot, config.setsRoot);
  results.push({
    label: "setsRoot exists",
    ok: fs.existsSync(setsPath),
    level: "error",
    detail: `${config.setsRoot} not found`,
  });

  // 2. screenshotDir parent exists (dir itself may not exist yet)
  const screenshotParent = path.dirname(
    path.resolve(repoRoot, config.screenshotDir),
  );
  results.push({
    label: "screenshotDir parent exists",
    ok: fs.existsSync(screenshotParent),
    level: "error",
    detail: `Parent of ${config.screenshotDir} not found`,
  });

  // 3. uiComponentGlobs resolve to at least one file
  for (const pattern of config.uiComponentGlobs) {
    const fullPattern = path.resolve(repoRoot, pattern);
    const matches: string[] = [];
    for await (const entry of glob(fullPattern)) {
      matches.push(entry);
    }
    results.push({
      label: `uiComponentGlobs: ${pattern}`,
      ok: matches.length > 0,
      level: "error",
      detail: "No files matched",
    });
  }

  // 4. tokenFiles exist
  for (const tokenFile of config.tokenFiles) {
    const tokenPath = path.resolve(repoRoot, tokenFile);
    results.push({
      label: `tokenFile: ${tokenFile}`,
      ok: fs.existsSync(tokenPath),
      level: "error",
      detail: "File not found",
    });
  }

  // 5. viteAliases point to real directories
  for (const [alias, target] of Object.entries(config.viteAliases)) {
    const aliasPath = path.resolve(repoRoot, target);
    results.push({
      label: `alias "${alias}" → ${target}`,
      ok: fs.existsSync(aliasPath),
      level: "error",
      detail: "Directory not found",
    });
  }

  // 6. styleEntrypoints exist (optional field)
  if (config.styleEntrypoints && config.styleEntrypoints.length > 0) {
    for (const entry of config.styleEntrypoints) {
      const stylePath = path.resolve(repoRoot, entry);
      results.push({
        label: `styleEntrypoint: ${entry}`,
        ok: fs.existsSync(stylePath),
        level: "error",
        detail: "File not found",
      });
    }
  }

  // 7. Storybook settings (when enabled)
  if (config.storybook.enabled) {
    const sbCwd = path.resolve(repoRoot, config.storybook.cwd);
    results.push({
      label: `storybook.cwd: ${config.storybook.cwd}`,
      ok: fs.existsSync(sbCwd),
      level: "error",
      detail: "Directory not found",
    });

    for (const storyGlob of config.storybook.storyGlobs) {
      const fullPattern = path.resolve(repoRoot, storyGlob);
      const matches: string[] = [];
      for await (const entry of glob(fullPattern)) {
        matches.push(entry);
      }
      results.push({
        label: `storyGlobs: ${storyGlob}`,
        ok: matches.length > 0,
        level: "warning",
        detail: "No stories found (ok if stories not yet created)",
      });
    }
  }

  // 8. screenshotPresets have valid dimensions
  for (const preset of config.screenshotPresets) {
    results.push({
      label: `preset "${preset.name}"`,
      ok: preset.width > 0 && preset.height > 0,
      level: "error",
      detail: `Invalid dimensions: ${preset.width}x${preset.height}`,
    });
  }

  const errors = results.filter((r) => !r.ok && r.level === "error").length;
  const warnings = results.filter((r) => !r.ok && r.level === "warning").length;

  return { errors, warnings, results };
}
