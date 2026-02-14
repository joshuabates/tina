import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
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

export default defineConfig({
  plugins: [react(), serveScreenshots()],
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
