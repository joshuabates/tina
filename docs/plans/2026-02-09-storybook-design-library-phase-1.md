# Phase 1 -- Tooling Setup

## Scope

Install and configure Storybook 8, shadcn/ui, fonts, and design tokens in `tina-web/`. At the end of this phase, `npm run storybook` launches a themed Storybook shell with the dark design tokens applied and no stories yet. The existing app (`npm run dev`) continues to work unchanged.

## Tasks

### Task 1: Add `@/*` path alias to tsconfig.json and vite.config.ts

shadcn/ui requires a `@/*` path alias pointing to `src/`. The current config only has `@convex/_generated/*`.

**Files:**
- `tina-web/tsconfig.json` -- add `"@/*": ["./src/*"]` to `compilerOptions.paths`
- `tina-web/vite.config.ts` -- add `"@": path.resolve(__dirname, "src")` to `resolve.alias`

**Verification:** `npx tsc --noEmit` passes. Existing app builds.

### Task 2: Install and configure shadcn/ui

Run `npx shadcn@latest init` in `tina-web/`. This creates `components.json` and sets up the project for shadcn component installation.

**Configuration choices:**
- Style: `default`
- Base color: use the custom palette (not a built-in shadcn theme)
- CSS variables: `yes`
- Path alias: `@/components` and `@/lib`
- Tailwind config: `tailwind.config.ts`
- Global CSS: `src/index.css`

If the CLI modifies `index.css` or `tailwind.config.ts`, review and adjust to match the design tokens in Task 3 (the CLI scaffolds boilerplate we will overwrite).

**Files created:**
- `tina-web/components.json`
- `tina-web/src/lib/utils.ts` (shadcn's `cn()` utility -- keep if created, but don't add manually per design doc anti-pattern guidance; the init command creates it automatically)

**Verification:** `components.json` exists with correct paths.

### Task 3: Set up design tokens in index.css

Replace the minimal `src/index.css` with CSS custom properties matching the design document's color palette, status colors, and effects. Follow shadcn's `:root`/`.dark` convention.

**File:** `tina-web/src/index.css`

**Content (design tokens from design doc + mockup):**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 222.2 84% 4.9%;       /* #020617 slate-950 */
    --foreground: 210 40% 98%;            /* #f8fafc slate-50 */
    --card: 217 55% 8%;                   /* #0b1222 panel dark */
    --card-foreground: 214.3 31.8% 91.4%; /* #e2e8f0 */
    --sidebar: 228 60% 5%;               /* #060914 deepest dark */
    --sidebar-foreground: 215 20.2% 65.1%; /* #94a3b8 */
    --primary: 199 89% 48%;              /* #0ea5e9 sky blue */
    --primary-foreground: 201 100% 97%;  /* #f0f9ff */
    --muted: 217.2 32.6% 17.5%;          /* #1e293b slate-800 */
    --muted-foreground: 215 16.3% 46.9%; /* #64748b slate-500 */
    --border: 217.2 32.6% 17.5%;          /* #1e293b */
    --ring: 199 89% 48%;                 /* #0ea5e9 matches primary */
    --radius: 0.5rem;

    /* Status semantic tokens */
    --status-complete: 160 84% 39%;      /* #10b981 emerald */
    --status-executing: 199 89% 48%;     /* #0ea5e9 sky blue */
    --status-active: 199 89% 48%;        /* #0ea5e9 sky blue */
    --status-planning: 220 9% 46%;       /* #6b7280 gray */
    --status-blocked: 0 84% 60%;         /* #ef4444 red */
    --status-warning: 38 92% 50%;        /* #f59e0b amber */
  }

  .dark {
    /* Same values -- this is a dark-only app */
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 217 55% 8%;
    --card-foreground: 214.3 31.8% 91.4%;
    --sidebar: 228 60% 5%;
    --sidebar-foreground: 215 20.2% 65.1%;
    --primary: 199 89% 48%;
    --primary-foreground: 201 100% 97%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 16.3% 46.9%;
    --border: 217.2 32.6% 17.5%;
    --ring: 199 89% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: 'Inter', sans-serif;
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--muted)) hsl(var(--background));
  }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: hsl(var(--background)); }
  ::-webkit-scrollbar-thumb { background: hsl(var(--muted)); border-radius: 10px; }
}
```

Note: HSL values are used without the `hsl()` wrapper, per shadcn convention. Components reference them as `hsl(var(--token))` via Tailwind config.

### Task 4: Extend tailwind.config.ts with design tokens and fonts

Wire the CSS variables into Tailwind's theme system so utility classes like `bg-background`, `text-primary`, `border-border` work. Add font families.

**File:** `tina-web/tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        status: {
          complete: "hsl(var(--status-complete))",
          executing: "hsl(var(--status-executing))",
          active: "hsl(var(--status-active))",
          planning: "hsl(var(--status-planning))",
          blocked: "hsl(var(--status-blocked))",
          warning: "hsl(var(--status-warning))",
        },
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["9px", { lineHeight: "12px" }],
        xs: ["11px", { lineHeight: "14px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["13px", { lineHeight: "20px" }],
        lg: ["15px", { lineHeight: "22px" }],
        xl: ["17px", { lineHeight: "24px" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

**Verification:** Existing app still builds with `npm run build`. Tailwind classes like `bg-background`, `text-primary`, `text-status-complete` resolve correctly.

### Task 5: Add fonts to index.html via Google Fonts CDN

Per the design doc's anti-pattern guidance, use CDN links (not `@fontsource` packages) matching the mockup's approach.

**File:** `tina-web/index.html`

Add to `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
```

Also add `class="dark"` to the `<html>` tag (this is a dark-only app, matching the mockup).

Update `<body>` to use design token classes instead of hardcoded Tailwind colors:
```html
<body class="bg-background text-foreground min-h-screen">
```

### Task 6: Install Storybook 8 with Vite builder

Run the Storybook initializer inside `tina-web/`:
```bash
cd tina-web && npx storybook@latest init --builder @storybook/builder-vite --type react
```

This creates:
- `.storybook/main.ts`
- `.storybook/preview.ts`
- Example stories (delete these)
- Adds `storybook` and `build-storybook` scripts to `package.json`

After init, remove any auto-generated example stories (typically in `src/stories/`).

### Task 7: Configure Storybook theme and preview

Create a custom dark Storybook theme and configure the preview to load design tokens.

**File:** `tina-web/.storybook/theme.ts`
```ts
import { create } from "@storybook/theming/create";

export default create({
  base: "dark",
  brandTitle: "Tina Design Library",
  brandTarget: "_self",

  // UI colors
  appBg: "#020617",
  appContentBg: "#0b1222",
  appBorderColor: "#1e293b",
  appBorderRadius: 8,

  // Text
  textColor: "#e2e8f0",
  textMutedColor: "#64748b",

  // Toolbar
  barBg: "#060914",
  barTextColor: "#94a3b8",
  barSelectedColor: "#0ea5e9",

  // Colors
  colorPrimary: "#0ea5e9",
  colorSecondary: "#0ea5e9",
});
```

**File:** `tina-web/.storybook/preview.ts`
```ts
import type { Preview } from "@storybook/react";
import "../src/index.css";
import theme from "./theme";

const preview: Preview = {
  parameters: {
    docs: { theme },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#020617" },
        { name: "card", value: "#0b1222" },
      ],
    },
    layout: "centered",
  },
};

export default preview;
```

**File:** `tina-web/.storybook/main.ts` -- adjust the auto-generated config to:
```ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
};

export default config;
```

### Task 8: Add mise task for Storybook

**File:** `mise.toml` -- add after `dev:web:dev`:

```toml
[tasks."dev:storybook"]
description = "Start Storybook dev server"
run = "cd tina-web && npm run storybook"
```

### Task 9: Verify everything works

1. `cd tina-web && npm run build` -- existing app still builds
2. `cd tina-web && npm run storybook` -- Storybook launches on port 6006 with dark theme
3. `npx tsc --noEmit` (in tina-web) -- no TypeScript errors

## Execution Order

Tasks 1-5 can be done sequentially (each builds on the prior). Task 6 (Storybook install) depends on Task 1 (path alias) being done first. Task 7 depends on Task 6. Task 8 is independent. Task 9 is final verification.

```
Task 1 (path alias) → Task 2 (shadcn init) → Task 3 (tokens CSS) → Task 4 (tailwind config) → Task 5 (fonts/html)
                    ↘ Task 6 (storybook install) → Task 7 (storybook config)
Task 8 (mise task) -- independent
Task 9 (verify) -- last
```

## Files Modified

| File | Change |
|------|--------|
| `tina-web/tsconfig.json` | Add `@/*` path alias |
| `tina-web/vite.config.ts` | Add `@` resolve alias |
| `tina-web/src/index.css` | Design tokens as CSS variables |
| `tina-web/tailwind.config.ts` | Theme extension with token references, fonts, dark mode |
| `tina-web/index.html` | Google Fonts CDN, dark class, token-based body classes |
| `tina-web/package.json` | New devDependencies (storybook, shadcn packages), new scripts |
| `mise.toml` | Add `dev:storybook` task |

## Files Created

| File | Purpose |
|------|---------|
| `tina-web/components.json` | shadcn/ui configuration |
| `tina-web/src/lib/utils.ts` | shadcn `cn()` utility (auto-created by init) |
| `tina-web/.storybook/main.ts` | Storybook config |
| `tina-web/.storybook/preview.ts` | Storybook preview with design tokens |
| `tina-web/.storybook/theme.ts` | Custom dark Storybook theme |

## What NOT To Do

- Do NOT install `@fontsource` packages -- use Google Fonts CDN
- Do NOT add `cn()` manually -- only keep if `shadcn init` creates it
- Do NOT modify any existing components in `src/components/`
- Do NOT create any domain components or stories (that is Phase 2 and Phase 3)
- Do NOT change the existing Convex hooks or data layer
