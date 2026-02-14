import { readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Resolve project config path (one level up from runtime/)
const projectRoot = path.resolve(__dirname, "..");
const setsDir = path.resolve(projectRoot, "sets");
const repoRoot = path.resolve(projectRoot, "../..");

// Dynamically load project config aliases if available
function loadProjectAliases(): Record<string, string> {
  try {
    // Read project.config.ts and extract viteAliases via simple parse
    // At runtime, Vite handles the TS import; this is just for alias setup
    const configPath = path.resolve(projectRoot, "project.config.ts");
    const content = readFileSync(configPath, "utf-8");
    const aliasMatch = content.match(/viteAliases:\s*\{([^}]+)\}/);
    if (!aliasMatch) return {};

    const aliases: Record<string, string> = {};
    const entries = aliasMatch[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g);
    for (const [, key, value] of entries) {
      aliases[key] = path.resolve(repoRoot, value);
    }
    return aliases;
  } catch {
    return {};
  }
}

const projectAliases = loadProjectAliases();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@sets": setsDir,
      ...projectAliases,
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
});
