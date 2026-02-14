# Design Workbench Phase 3: Vendored Workbench Runtime

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 7a972ee969cfa7cc343258909a194ed8be0d1cc7

**Goal:** Extract a generic runtime from the current `designs/` app, set up `ui/designs/runtime/` with its own Vite server and `package.json`, implement the `project.config.ts` adapter, and migrate existing design sets into the nested `ui/designs/sets/<design>/<variation>/` structure. After this phase, the workbench dev server starts and renders migrated designs without any Storybook dependency, and the runtime contains no hardcoded tina-web paths.

**Architecture:** The vendored runtime lives in `ui/designs/runtime/` with its own Vite dev server, React Router, and TailwindCSS. Project-specific configuration goes in `ui/designs/project.config.ts`, which provides Vite aliases to resolve project component/token imports. Design content lives in `ui/designs/sets/` with a two-level directory structure: first-level directories are designs (explorations), second-level directories are variations (individual approaches). The runtime discovers designs/variations at build time using `import.meta.glob` with a `@sets` Vite alias pointing to the sets directory.

**IMPORTANT — Scope boundaries:**
- Phase 3 creates the runtime and migrates content. It does NOT implement screenshot capture (Phase 4) or the design implementation skill (Phase 5).
- The runtime is standalone — it does not depend on Convex, tina-data, or any backend services.
- Existing design set components (index.tsx, data.ts) are moved as-is with only import path adjustments for meta.ts type references.
- The old `designs/` directory is NOT deleted in this phase — it remains as reference until Phase 6 cleanup.

---

### Task 1: Create runtime package.json and project boilerplate files

**Files:**
- `ui/designs/runtime/package.json`
- `ui/designs/runtime/.gitignore`
- `ui/designs/runtime/index.html`

**Model:** opus

**review:** spec-only

**Depends on:** none

Create the runtime package directory and essential boilerplate files.

**Steps:**

1. Create directory structure:
```bash
mkdir -p ui/designs/runtime/src/{pages,components,registry}
mkdir -p ui/designs/sets
```

2. Create `ui/designs/runtime/package.json`:
```json
{
  "name": "design-workbench-runtime",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^6.30.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.48.0",
    "vite": "^7.3.1"
  }
}
```

3. Create `ui/designs/runtime/.gitignore`:
```
# Logs
logs
*.log
npm-debug.log*

node_modules
dist
dist-ssr
*.local

.DS_Store
*.sw?
```

4. Create `ui/designs/runtime/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Design Workbench</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Run: `ls -la ui/designs/runtime/package.json ui/designs/runtime/.gitignore ui/designs/runtime/index.html`
Expected: All three files exist

---

### Task 2: Create Vite and TypeScript configuration

**Files:**
- `ui/designs/runtime/vite.config.ts`
- `ui/designs/runtime/tsconfig.json`
- `ui/designs/runtime/tsconfig.app.json`
- `ui/designs/runtime/tsconfig.node.json`

**Model:** opus

**review:** full

**Depends on:** 1

Create the Vite config that reads `project.config.ts` for alias resolution, and TypeScript configurations.

**Steps:**

1. Create `ui/designs/runtime/vite.config.ts`:
```typescript
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
```

2. Create `ui/designs/runtime/tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

3. Create `ui/designs/runtime/tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "paths": {
      "@sets/*": ["../sets/*"]
    }
  },
  "include": ["src", "../sets"]
}
```

4. Create `ui/designs/runtime/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "types": ["node"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

Run: `cat ui/designs/runtime/vite.config.ts | head -5`
Expected: `import { readFileSync } from "node:fs";`

---

### Task 3: Create styling configuration

**Files:**
- `ui/designs/runtime/tailwind.config.js`
- `ui/designs/runtime/postcss.config.js`
- `ui/designs/runtime/eslint.config.js`
- `ui/designs/runtime/src/index.css`

**Model:** haiku

**review:** spec-only

**Depends on:** 1

Create TailwindCSS, PostCSS, ESLint configs, and base styles.

**Steps:**

1. Create `ui/designs/runtime/tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../sets/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f8fafc",
        ink: "#0f172a",
      },
      boxShadow: {
        panel: "0 16px 32px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
```

2. Create `ui/designs/runtime/postcss.config.js`:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

3. Create `ui/designs/runtime/eslint.config.js`:
```javascript
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
```

4. Create `ui/designs/runtime/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color: #0f172a;
  background: #f8fafc;
  font-family: "Satoshi", "Manrope", "Avenir Next", "Segoe UI", sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(circle at 10% 0%, #e2e8f0 0%, #f8fafc 50%, #f1f5f9 100%);
}

* {
  box-sizing: border-box;
}

#root {
  min-height: 100vh;
}
```

Run: `ls ui/designs/runtime/tailwind.config.js ui/designs/runtime/postcss.config.js ui/designs/runtime/eslint.config.js ui/designs/runtime/src/index.css`
Expected: All four files exist

---

### Task 4: Create project adapter config

**Files:**
- `ui/designs/project.config.ts`

**Model:** opus

**review:** full

**Depends on:** none

Create the project-specific adapter config for the tina repository. This file is project-owned and never overwritten by runtime refresh.

**Steps:**

1. Create `ui/designs/project.config.ts`:
```typescript
export interface StorybookConfig {
  enabled: boolean;
  cwd: string;
  devCommand: string;
  url: string;
  storyGlobs: string[];
}

export interface ScreenshotPreset {
  name: string;
  width: number;
  height: number;
}

export interface DesignsProjectConfig {
  projectName: string;
  setsRoot: string;
  screenshotDir: string;
  uiComponentGlobs: string[];
  tokenFiles: string[];
  viteAliases: Record<string, string>;
  styleEntrypoints?: string[];
  prebuild?: string;
  storybook: StorybookConfig;
  screenshotPresets: ScreenshotPreset[];
}

const config: DesignsProjectConfig = {
  projectName: "tina",
  setsRoot: "ui/designs/sets",
  screenshotDir: "ui/designs/.artifacts/screenshots",
  uiComponentGlobs: ["tina-web/src/components/ui/**/*.tsx"],
  tokenFiles: ["tina-web/src/styles/_tokens.scss", "tina-web/src/index.css"],
  viteAliases: {
    "@": "tina-web/src",
    "@convex": "convex/_generated",
  },
  styleEntrypoints: ["tina-web/src/index.css"],
  storybook: {
    enabled: true,
    cwd: "tina-web",
    devCommand: "npm run storybook -- --port 6006",
    url: "http://localhost:6006",
    storyGlobs: ["tina-web/src/**/*.stories.tsx", "tina-web/src/**/*.mdx"],
  },
  screenshotPresets: [
    { name: "desktop", width: 1440, height: 960 },
    { name: "laptop", width: 1280, height: 800 },
  ],
};

export default config;
```

Run: `cat ui/designs/project.config.ts | head -3`
Expected: `export interface StorybookConfig {`

---

### Task 5: Create type definitions and registry module

**Files:**
- `ui/designs/runtime/src/types.ts`
- `ui/designs/runtime/src/registry/index.ts`

**Model:** opus

**review:** full

**Depends on:** 2

Create shared type definitions and the registry module that discovers designs and variations from the `sets/` directory using `import.meta.glob`.

**Steps:**

1. Create `ui/designs/runtime/src/types.ts`:
```typescript
import type { ComponentType } from "react";

export type DesignStatus = "exploring" | "locked" | "archived";
export type VariationStatus = "exploring" | "selected" | "rejected";

export interface DesignMeta {
  slug: string;
  title: string;
  prompt?: string;
  tags?: string[];
}

export interface VariationMeta {
  slug: string;
  title: string;
  description?: string;
  status?: VariationStatus;
  phase?: string;
  tags?: string[];
}

export interface DesignEntry {
  slug: string;
  title: string;
  prompt?: string;
  tags: string[];
  variations: VariationEntry[];
}

export interface VariationEntry {
  designSlug: string;
  slug: string;
  title: string;
  description?: string;
  status?: VariationStatus;
  phase?: string;
  tags?: string[];
}

export type MetaModule = { default: DesignMeta | VariationMeta };
export type ViewModule = { default: ComponentType };
```

2. Create `ui/designs/runtime/src/registry/index.ts`:
```typescript
import type { ComponentType } from "react";
import type {
  DesignEntry,
  DesignMeta,
  MetaModule,
  VariationEntry,
  VariationMeta,
  ViewModule,
} from "../types.ts";

// Eagerly load design-level meta (optional per design)
const designMetaModules = import.meta.glob<MetaModule>("@sets/*/meta.ts", {
  eager: true,
});

// Eagerly load variation-level meta
const variationMetaModules = import.meta.glob<MetaModule>(
  "@sets/*/*/meta.ts",
  { eager: true },
);

// Lazy-load variation components
const variationViewModules = import.meta.glob<ViewModule>(
  "@sets/*/*/index.tsx",
);

function slugFromDesignPath(path: string): string | null {
  // Matches: @sets/<design-slug>/meta.ts or ../../sets/<design-slug>/meta.ts
  const match = path.match(/\/([^/]+)\/meta\.ts$/);
  return match?.[1] ?? null;
}

function slugsFromVariationPath(
  path: string,
): { designSlug: string; variationSlug: string } | null {
  // Matches: @sets/<design>/<variation>/meta.ts
  const match = path.match(/\/([^/]+)\/([^/]+)\/meta\.ts$/);
  if (!match) return null;
  return { designSlug: match[1], variationSlug: match[2] };
}

function slugsFromViewPath(
  path: string,
): { designSlug: string; variationSlug: string } | null {
  const match = path.match(/\/([^/]+)\/([^/]+)\/index\.tsx$/);
  if (!match) return null;
  return { designSlug: match[1], variationSlug: match[2] };
}

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Build design entries from meta modules
const designMetaMap = new Map<string, DesignMeta>();
for (const [path, module] of Object.entries(designMetaModules)) {
  const slug = slugFromDesignPath(path);
  if (!slug) continue;
  designMetaMap.set(slug, { slug, ...module.default });
}

// Build variation entries
const variationsByDesign = new Map<string, VariationEntry[]>();
for (const [path, module] of Object.entries(variationMetaModules)) {
  const slugs = slugsFromVariationPath(path);
  if (!slugs) continue;
  const meta = module.default as VariationMeta;
  const entry: VariationEntry = {
    designSlug: slugs.designSlug,
    slug: meta.slug || slugs.variationSlug,
    title: meta.title || slugToTitle(slugs.variationSlug),
    description: meta.description,
    status: meta.status,
    phase: meta.phase,
    tags: meta.tags,
  };
  const existing = variationsByDesign.get(slugs.designSlug) ?? [];
  existing.push(entry);
  variationsByDesign.set(slugs.designSlug, existing);
}

// Also discover variations that have index.tsx but no meta.ts
for (const path of Object.keys(variationViewModules)) {
  const slugs = slugsFromViewPath(path);
  if (!slugs) continue;
  const existing = variationsByDesign.get(slugs.designSlug) ?? [];
  if (existing.some((v) => v.slug === slugs.variationSlug)) continue;
  existing.push({
    designSlug: slugs.designSlug,
    slug: slugs.variationSlug,
    title: slugToTitle(slugs.variationSlug),
  });
  variationsByDesign.set(slugs.designSlug, existing);
}

// Build final design entries
const designs: DesignEntry[] = [];

// Collect all design slugs from both sources
const allDesignSlugs = new Set<string>([
  ...designMetaMap.keys(),
  ...variationsByDesign.keys(),
]);

for (const slug of allDesignSlugs) {
  const meta = designMetaMap.get(slug);
  const variations = variationsByDesign.get(slug) ?? [];
  designs.push({
    slug,
    title: meta?.title ?? slugToTitle(slug),
    prompt: meta?.prompt,
    tags: meta?.tags ?? [],
    variations: variations.sort((a, b) => a.title.localeCompare(b.title)),
  });
}

designs.sort((a, b) => a.title.localeCompare(b.title));

export function listDesigns(): DesignEntry[] {
  return designs;
}

export function findDesign(slug: string): DesignEntry | undefined {
  return designs.find((d) => d.slug === slug);
}

export function findVariation(
  designSlug: string,
  variationSlug: string,
): VariationEntry | undefined {
  const design = findDesign(designSlug);
  return design?.variations.find((v) => v.slug === variationSlug);
}

export async function loadVariationComponent(
  designSlug: string,
  variationSlug: string,
): Promise<ComponentType | null> {
  // Try each possible resolved path pattern
  for (const [path, loader] of Object.entries(variationViewModules)) {
    const slugs = slugsFromViewPath(path);
    if (
      slugs &&
      slugs.designSlug === designSlug &&
      slugs.variationSlug === variationSlug
    ) {
      const module = await loader();
      return module.default;
    }
  }
  return null;
}
```

Run: `wc -l ui/designs/runtime/src/registry/index.ts`
Expected: ~130 lines

---

### Task 6: Create app shell and routing

**Files:**
- `ui/designs/runtime/src/main.tsx`
- `ui/designs/runtime/src/App.tsx`

**Model:** opus

**review:** spec-only

**Depends on:** 5

Create the application entry point and router configuration.

**Steps:**

1. Create `ui/designs/runtime/src/main.tsx`:
```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

2. Create `ui/designs/runtime/src/App.tsx`:
```typescript
import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage.tsx";
import { DesignPage } from "./pages/DesignPage.tsx";

export default function App() {
  return (
    <div className="min-h-screen text-slate-900">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/designs/:designSlug"
          element={<DesignPage />}
        />
        <Route
          path="/designs/:designSlug/:variationSlug"
          element={<DesignPage />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
```

Run: `cat ui/designs/runtime/src/App.tsx`
Expected: Routes for `/`, `/designs/:designSlug`, `/designs/:designSlug/:variationSlug`

---

### Task 7: Create page components and shell

**Files:**
- `ui/designs/runtime/src/components/PageFrame.tsx`
- `ui/designs/runtime/src/pages/HomePage.tsx`
- `ui/designs/runtime/src/pages/DesignPage.tsx`

**Model:** opus

**review:** full

**Depends on:** 5, 6

Create the PageFrame shell component, HomePage (design listing), and DesignPage (variation listing with lazy-loaded component rendering).

**Steps:**

1. Create `ui/designs/runtime/src/components/PageFrame.tsx`:
```typescript
import type { PropsWithChildren, ReactNode } from "react";

type PageFrameProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}>;

export function PageFrame({ title, subtitle, actions, children }: PageFrameProps) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Design Workbench
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
      </header>
      {children}
    </main>
  );
}
```

2. Create `ui/designs/runtime/src/pages/HomePage.tsx`:
```typescript
import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame.tsx";
import { listDesigns } from "../registry/index.ts";

export function HomePage() {
  const designs = listDesigns();

  return (
    <PageFrame
      title="Design Explorations"
      subtitle="Browse wireframes and design variations. Add more designs in sets/<design-slug>/<variation-slug>/."
    >
      {designs.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          No designs found. Create a design by adding a directory under{" "}
          <code>ui/designs/sets/&lt;design-slug&gt;/&lt;variation-slug&gt;/</code>{" "}
          with <code>meta.ts</code> and <code>index.tsx</code>.
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {designs.map((design) => (
          <article
            key={design.slug}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                {design.title}
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {design.variations.length}{" "}
                {design.variations.length === 1 ? "variation" : "variations"}
              </span>
            </div>
            {design.prompt ? (
              <p className="mt-2 text-sm text-slate-600">{design.prompt}</p>
            ) : null}
            {design.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {design.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <Link
              to={`/designs/${design.slug}`}
              className="mt-4 inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
            >
              Open design
            </Link>
          </article>
        ))}
      </section>
    </PageFrame>
  );
}
```

3. Create `ui/designs/runtime/src/pages/DesignPage.tsx`:
```typescript
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageFrame } from "../components/PageFrame.tsx";
import {
  findDesign,
  findVariation,
  loadVariationComponent,
} from "../registry/index.ts";

export function DesignPage() {
  const { designSlug = "", variationSlug } = useParams();
  const [LoadedComponent, setLoadedComponent] = useState<ComponentType | null>(
    null,
  );
  const [loadingSlug, setLoadingSlug] = useState("");
  const [errorSlug, setErrorSlug] = useState("");

  const design = findDesign(designSlug);
  const activeVariationSlug =
    variationSlug ?? design?.variations[0]?.slug ?? "";
  const activeVariation = findVariation(designSlug, activeVariationSlug);

  useEffect(() => {
    if (!designSlug || !activeVariationSlug) return;

    let active = true;
    setLoadingSlug(`${designSlug}/${activeVariationSlug}`);
    setErrorSlug("");
    setLoadedComponent(null);

    loadVariationComponent(designSlug, activeVariationSlug).then(
      (component) => {
        if (!active) return;
        setLoadingSlug("");
        if (component) {
          setLoadedComponent(() => component);
        } else {
          setErrorSlug(`${designSlug}/${activeVariationSlug}`);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [designSlug, activeVariationSlug]);

  if (!design) {
    return (
      <PageFrame
        title="Design not found"
        subtitle={`No design found with slug "${designSlug}".`}
        actions={
          <Link
            to="/"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
          >
            Back to index
          </Link>
        }
      >
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Create a design by adding directories under{" "}
          <code>
            ui/designs/sets/&lt;design-slug&gt;/&lt;variation-slug&gt;/
          </code>{" "}
          with <code>meta.ts</code> and <code>index.tsx</code>.
        </section>
      </PageFrame>
    );
  }

  const isLoading = loadingSlug === `${designSlug}/${activeVariationSlug}`;
  const hasError = errorSlug === `${designSlug}/${activeVariationSlug}`;

  return (
    <PageFrame
      title={design.title}
      subtitle={design.prompt}
      actions={
        <Link
          to="/"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
        >
          Back to index
        </Link>
      }
    >
      {design.variations.length > 1 ? (
        <nav className="flex flex-wrap gap-2">
          {design.variations.map((v) => (
            <Link
              key={v.slug}
              to={`/designs/${designSlug}/${v.slug}`}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                v.slug === activeVariationSlug
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-700 hover:border-slate-500"
              }`}
            >
              {v.title}
              {v.status ? (
                <span className="ml-1.5 text-xs opacity-60">{v.status}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : null}

      {activeVariation?.description ? (
        <p className="text-sm text-slate-600">{activeVariation.description}</p>
      ) : null}

      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading variation...
        </section>
      ) : null}

      {hasError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Could not load this variation component.
        </section>
      ) : null}

      {!isLoading && !hasError && LoadedComponent ? (
        <LoadedComponent />
      ) : null}
    </PageFrame>
  );
}
```

Run: `wc -l ui/designs/runtime/src/pages/HomePage.tsx ui/designs/runtime/src/pages/DesignPage.tsx ui/designs/runtime/src/components/PageFrame.tsx`
Expected: ~70 + ~120 + ~30 lines

---

### Task 8: Migrate existing design sets to nested structure

**Files:**
- `ui/designs/sets/tina-orchestration-console/meta.ts`
- `ui/designs/sets/tina-orchestration-console/default/meta.ts`
- `ui/designs/sets/tina-orchestration-console/default/data.ts`
- `ui/designs/sets/tina-orchestration-console/default/index.tsx`
- `ui/designs/sets/tina-orchestration-console/default/HANDOFF.md`
- `ui/designs/sets/tina-orchestration-console/default/DECISIONS.md`
- `ui/designs/sets/project-idea-to-orchestration/meta.ts`
- `ui/designs/sets/project-idea-to-orchestration/default/meta.ts`
- `ui/designs/sets/project-idea-to-orchestration/default/data.ts`
- `ui/designs/sets/project-idea-to-orchestration/default/index.tsx`
- `ui/designs/sets/project-idea-to-orchestration/default/HANDOFF.md`
- `ui/designs/sets/project1-pm-workgraph/meta.ts`
- `ui/designs/sets/project1-pm-workgraph/default/meta.ts`
- `ui/designs/sets/project1-pm-workgraph/default/data.ts`
- `ui/designs/sets/project1-pm-workgraph/default/index.tsx`
- `ui/designs/sets/project3-feedback-fabric-v1/meta.ts`
- `ui/designs/sets/project3-feedback-fabric-v1/default/meta.ts`
- `ui/designs/sets/project3-feedback-fabric-v1/default/data.ts`
- `ui/designs/sets/project3-feedback-fabric-v1/default/index.tsx`
- `ui/designs/sets/project4-mechanical-review-workbench/meta.ts`
- `ui/designs/sets/project4-mechanical-review-workbench/default/meta.ts`
- `ui/designs/sets/project4-mechanical-review-workbench/default/data.ts`
- `ui/designs/sets/project4-mechanical-review-workbench/default/index.tsx`

**Model:** opus

**review:** full

**Depends on:** 1

Migrate all 5 existing design sets from `designs/src/designSets/` into the new two-level `ui/designs/sets/<design>/<variation>/` structure. Each set becomes a design with a single "default" variation. The component files (index.tsx, data.ts) are copied as-is. Meta files are rewritten without the `../registry` import.

**Steps:**

1. For each of the 5 design sets, create directories and copy files:

```bash
# Create design-level directories
for design in tina-orchestration-console project-idea-to-orchestration project1-pm-workgraph project3-feedback-fabric-v1 project4-mechanical-review-workbench; do
  mkdir -p "ui/designs/sets/$design/default"
done
```

2. For each design, create a design-level `meta.ts` from the old meta.ts (removing the import and extracting just title + prompt/description as tags):

Example `ui/designs/sets/tina-orchestration-console/meta.ts`:
```typescript
export default {
  slug: "tina-orchestration-console",
  title: "TINA Orchestration Console",
  prompt: "Option C baseline with sidebar-driven switching, task edit/feedback quicklook, orchestration config controls, full terminal mode, project view-all, and shared review artifacts.",
  tags: ["wireframe", "phase-tasks", "quicklook-modal", "terminal-mode", "review-artifacts"],
};
```

Create similar design-level meta.ts for all 5 sets, extracting title, description→prompt, and tags from the old meta.ts.

3. For each design, create a variation-level `meta.ts`:

Example `ui/designs/sets/tina-orchestration-console/default/meta.ts`:
```typescript
export default {
  slug: "default",
  title: "Default",
  phase: "wireframe",
};
```

Create similar variation-level meta.ts for all 5 sets.

4. Copy component files as-is (no modifications needed since they only import from `./data`):
```bash
SRC="designs/src/designSets"
DEST="ui/designs/sets"

for design in tina-orchestration-console project-idea-to-orchestration project1-pm-workgraph project3-feedback-fabric-v1 project4-mechanical-review-workbench; do
  cp "$SRC/$design/data.ts" "$DEST/$design/default/data.ts"
  cp "$SRC/$design/index.tsx" "$DEST/$design/default/index.tsx"
  # Copy optional docs if they exist
  [ -f "$SRC/$design/HANDOFF.md" ] && cp "$SRC/$design/HANDOFF.md" "$DEST/$design/default/HANDOFF.md"
  [ -f "$SRC/$design/DECISIONS.md" ] && cp "$SRC/$design/DECISIONS.md" "$DEST/$design/default/DECISIONS.md"
done
```

5. Verify all files are in place:
```bash
find ui/designs/sets -type f | sort
```

Run: `find ui/designs/sets -name "meta.ts" | wc -l`
Expected: 10 (5 design-level + 5 variation-level)

---

### Task 9: Copy Vite SVG asset

**Files:**
- `ui/designs/runtime/public/vite.svg`

**Model:** haiku

**review:** spec-only

**Depends on:** 1

Copy the Vite SVG favicon asset to the runtime public directory.

**Steps:**

1. Copy the SVG:
```bash
cp designs/public/vite.svg ui/designs/runtime/public/vite.svg
```

Run: `ls ui/designs/runtime/public/vite.svg`
Expected: File exists

---

### Task 10: Install dependencies and verify TypeScript compilation

**Files:** (none — npm install and type check)

**Model:** opus

**review:** spec-only

**Depends on:** 1, 2, 3, 4, 5, 6, 7, 8, 9

Install npm dependencies in the runtime directory and verify TypeScript compiles without errors.

**Steps:**

1. Install dependencies:
```bash
cd ui/designs/runtime && npm install
```

2. Run TypeScript type check:
```bash
cd ui/designs/runtime && npx tsc --noEmit
```

3. Fix any type errors found. Common issues to check:
   - `@sets/*` path alias resolves correctly via tsconfig paths
   - Import extensions (`.ts`, `.tsx`) are present where needed
   - `import.meta.glob` type arguments match module shape

Run: `cd ui/designs/runtime && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors or only warnings

---

### Task 11: Verify dev server starts and renders migrated designs

**Files:** (none — verification only)

**Model:** opus

**review:** full

**Depends on:** 10

Start the workbench dev server and verify it serves the application. Verify the runtime is generic (no hardcoded tina-web paths in runtime source).

**Steps:**

1. Start the dev server in background:
```bash
cd ui/designs/runtime && npx vite --port 5200 &
VITE_PID=$!
sleep 3
```

2. Verify the server responds:
```bash
curl -s http://localhost:5200/ | head -20
```

3. Verify runtime source has no hardcoded tina-web paths:
```bash
grep -r "tina-web" ui/designs/runtime/src/ || echo "No tina-web references found (correct)"
```

4. Stop the server:
```bash
kill $VITE_PID 2>/dev/null
```

5. Verify at least one design set exists and would be discoverable:
```bash
ls ui/designs/sets/*/default/index.tsx | head -3
```

Run: `grep -r "tina-web" ui/designs/runtime/src/ | wc -l`
Expected: 0

---

## Phase Estimates

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Runtime package.json, .gitignore, index.html | 3 min |
| 2 | Vite + TypeScript configuration | 5 min |
| 3 | Styling configuration (tailwind, postcss, eslint, CSS) | 3 min |
| 4 | Project adapter config (project.config.ts) | 3 min |
| 5 | Type definitions and registry module | 5 min |
| 6 | App shell and routing (main.tsx, App.tsx) | 3 min |
| 7 | Page components and shell (PageFrame, HomePage, DesignPage) | 5 min |
| 8 | Migrate 5 existing design sets to nested structure | 5 min |
| 9 | Copy Vite SVG asset | 1 min |
| 10 | Install dependencies + TypeScript verification | 5 min |
| 11 | Dev server verification + genericity check | 3 min |
| **Total** | | **~41 min** |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 800 |

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
