import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DesignsProjectConfig } from "../../../project.config.ts";
import { validateConfig, type ValidationResult } from "./validate-config.ts";

let tmpDir = "";

function makeTmpDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-config-test-"));
  return tmpDir;
}

function makeValidConfig(root: string): DesignsProjectConfig {
  // Create the filesystem structure that the config references
  fs.mkdirSync(path.join(root, "sets"), { recursive: true });
  fs.mkdirSync(path.join(root, "screenshots"), { recursive: true });
  fs.mkdirSync(path.join(root, "src/components"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/components/Button.tsx"), "");
  fs.writeFileSync(path.join(root, "tokens.css"), "");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "styles.css"), "");
  fs.mkdirSync(path.join(root, "storybook-cwd"), { recursive: true });

  return {
    projectName: "test-project",
    setsRoot: "sets",
    screenshotDir: "screenshots",
    uiComponentGlobs: ["src/components/**/*.tsx"],
    tokenFiles: ["tokens.css"],
    viteAliases: { "@": "src" },
    styleEntrypoints: ["styles.css"],
    storybook: {
      enabled: true,
      cwd: "storybook-cwd",
      devCommand: "npm run storybook",
      url: "http://localhost:6006",
      storyGlobs: ["src/**/*.stories.tsx"],
    },
    screenshotPresets: [
      { name: "desktop", width: 1440, height: 960 },
    ],
  };
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
  tmpDir = "";
});

describe("validateConfig", () => {
  it("reports no errors for a valid config", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);

    const result = await validateConfig(config, root);

    expect(result.errors).toBe(0);
  });

  it("reports error when setsRoot does not exist", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    fs.rmSync(path.join(root, "sets"), { recursive: true });

    const result = await validateConfig(config, root);

    expect(result.errors).toBeGreaterThan(0);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        label: expect.stringContaining("setsRoot"),
        ok: false,
        level: "error",
      }),
    );
  });

  it("reports error when screenshotDir parent does not exist", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    config.screenshotDir = "nonexistent/parent/screenshots";

    const result = await validateConfig(config, root);

    expect(result.errors).toBeGreaterThan(0);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        label: expect.stringContaining("screenshotDir"),
        ok: false,
        level: "error",
      }),
    );
  });

  it("reports error when uiComponentGlobs match no files", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    config.uiComponentGlobs = ["src/nonexistent/**/*.tsx"];

    const result = await validateConfig(config, root);

    expect(result.errors).toBeGreaterThan(0);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        label: expect.stringContaining("uiComponentGlobs"),
        ok: false,
        level: "error",
      }),
    );
  });

  it("reports error when tokenFiles do not exist", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    config.tokenFiles = ["missing-tokens.css"];

    const result = await validateConfig(config, root);

    expect(result.errors).toBeGreaterThan(0);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        label: expect.stringContaining("tokenFile"),
        ok: false,
        level: "error",
      }),
    );
  });

  it("reports error when viteAliases target does not exist", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    config.viteAliases = { "@missing": "nonexistent-dir" };

    const result = await validateConfig(config, root);

    expect(result.errors).toBeGreaterThan(0);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        label: expect.stringContaining("@missing"),
        ok: false,
        level: "error",
      }),
    );
  });

  it("reports error when styleEntrypoints do not exist", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    config.styleEntrypoints = ["nonexistent-style.css"];

    const result = await validateConfig(config, root);

    expect(result.errors).toBeGreaterThan(0);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        label: expect.stringContaining("styleEntrypoint"),
        ok: false,
        level: "error",
      }),
    );
  });

  it("reports error when storybook cwd does not exist", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    config.storybook.cwd = "nonexistent-sb";

    const result = await validateConfig(config, root);

    expect(result.errors).toBeGreaterThan(0);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        label: expect.stringContaining("storybook.cwd"),
        ok: false,
        level: "error",
      }),
    );
  });

  it("reports warning (not error) when storyGlobs match nothing", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    config.storybook.storyGlobs = ["src/**/*.stories.tsx"];
    // No story files exist in our temp setup

    const result = await validateConfig(config, root);

    expect(result.warnings).toBeGreaterThan(0);
    expect(result.errors).toBe(0);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        label: expect.stringContaining("storyGlobs"),
        ok: false,
        level: "warning",
      }),
    );
  });

  it("reports error for invalid screenshot preset dimensions", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    config.screenshotPresets = [{ name: "bad", width: 0, height: 100 }];

    const result = await validateConfig(config, root);

    expect(result.errors).toBeGreaterThan(0);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        label: expect.stringContaining("bad"),
        ok: false,
        level: "error",
      }),
    );
  });

  it("skips storybook checks when storybook is disabled", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    config.storybook.enabled = false;
    config.storybook.cwd = "nonexistent";

    const result = await validateConfig(config, root);

    expect(result.errors).toBe(0);
    const storybookResults = result.results.filter(
      (r) => r.label.includes("storybook"),
    );
    expect(storybookResults).toHaveLength(0);
  });

  it("skips styleEntrypoints when not defined", async () => {
    const root = makeTmpDir();
    const config = makeValidConfig(root);
    delete (config as any).styleEntrypoints;

    const result = await validateConfig(config, root);

    expect(result.errors).toBe(0);
    const styleResults = result.results.filter(
      (r) => r.label.includes("styleEntrypoint"),
    );
    expect(styleResults).toHaveLength(0);
  });
});
