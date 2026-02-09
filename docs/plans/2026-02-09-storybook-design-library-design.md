# Storybook + Design Library for tina-web

## Overview

Add Storybook and a component design library to tina-web, extracting the design language from `designs/mockups/base-design/` into reusable, themed components built on shadcn/ui. This establishes the visual foundation before rebuilding tina-web's screens to match the mockup.

## Goals

- Extract the mockup's design tokens (colors, typography, spacing) into Tailwind's theme config via CSS variables (shadcn's approach)
- Install and configure shadcn/ui as the component primitive layer
- Build domain-specific components (StatusBadge, TaskCard, PhaseCard, etc.) on top of shadcn primitives
- Set up Storybook 8 with Vite builder for isolated component development, themed to match the dark UI
- Every design library component gets a story with variants

## Non-Goals

- Rebuilding existing tina-web screens (separate future effort)
- Pixel-perfect reproduction of the mockup -- it's a design reference, not a spec
- Mobile responsiveness (desktop monitoring tool)

## Success Metrics

- All design tokens from the mockup are captured in Tailwind config / CSS variables
- At least 10 reusable components in Storybook with stories covering all variants
- `npm run storybook` launches and renders all stories without errors
- Existing tina-web app continues to build and run (`npm run dev`)

## Design Tokens

Extracted from the mockup's HTML/CSS (`designs/mockups/base-design/code.html`), mapped to shadcn/ui's CSS variable convention.

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#020617` | Main background (slate-950) |
| `--foreground` | `#f8fafc` | Primary text (slate-50) |
| `--card` | `#0b1222` | Panel/card backgrounds |
| `--card-foreground` | `#e2e8f0` | Card text |
| `--sidebar` | `#060914` | Sidebar background (deepest dark) |
| `--sidebar-foreground` | `#94a3b8` | Sidebar text |
| `--primary` | `#0ea5e9` | Sky blue -- links, headings, active states |
| `--primary-foreground` | `#f0f9ff` | Text on primary backgrounds |
| `--muted` | `#1e293b` | Muted backgrounds (slate-800) |
| `--muted-foreground` | `#64748b` | Muted text (slate-500) |
| `--border` | `#1e293b` | Border color |
| `--ring` | `#0ea5e9` | Focus ring (matches primary) |

### Status Colors (Semantic Tokens)

| Token | Value | Usage |
|-------|-------|-------|
| `--status-complete` | `#10b981` | Emerald green -- done/complete |
| `--status-executing` | `#0ea5e9` | Sky blue -- in progress |
| `--status-active` | `#0ea5e9` | Sky blue -- active items |
| `--status-planning` | `#6b7280` | Gray -- planned/pending |
| `--status-blocked` | `#ef4444` | Red -- blocked/error |
| `--status-warning` | `#f59e0b` | Amber -- warnings |

### Typography

- **Display/UI font:** Inter (variable weight, loaded via Google Fonts or `@fontsource/inter`)
- **Monospace font:** JetBrains Mono (loaded via Google Fonts or `@fontsource/jetbrains-mono`)
- **Size scale (compact):**
  - `xs`: 9px (metadata, timestamps)
  - `sm`: 11px (secondary text, labels)
  - `base`: 13px (body text)
  - `lg`: 15px (headings)
  - `xl`: 17px (page titles)

### Effects

- **Phase glow:** `box-shadow: 0 0 12px color-mix(in srgb, var(--primary) 40%, transparent)` for active phase indication
- **Custom scrollbars:** thin (6px), dark track (`--background`), subtle thumb (`--muted`)
- **Text hierarchy via opacity:** 40% (tertiary), 60% (secondary), 80% (supporting), 100% (primary)

All tokens go into `src/index.css` as CSS custom properties in a `:root` / `.dark` block (shadcn's standard pattern) and are referenced in `tailwind.config.ts` via `theme.extend`.

## Component Library

### Layer 1 -- shadcn Primitives

Installed via `npx shadcn@latest add`:

| Component | Usage |
|-----------|-------|
| `Badge` | Base for status indicators |
| `Button` | Actions (Review and Approve, Config, etc.) |
| `Card` | Container for task cards, panels |
| `ScrollArea` | Custom scrollbar styling |
| `Separator` | Dividers |
| `Tooltip` | Hover info on truncated text, icons |

### Layer 2 -- Domain Components

Custom components built on Layer 1 primitives, in `src/components/ui/`.

| Component | Description | Key Variants |
|-----------|-------------|--------------|
| `StatusBadge` | Colored badge for orchestration/phase/task status | complete, executing, active, blocked, planning, done |
| `TaskCard` | Task with colored left border, assignee, duration, status | done, active, blocked |
| `PhaseCard` | Phase summary with task counts, status badge, expandable | complete, executing, planning |
| `PhaseTimeline` | Vertical timeline connecting phases, glow on active | with/without active glow |
| `SidebarNav` | Collapsible project tree with nested items | expanded, collapsed, with status indicators |
| `SidebarItem` | Individual nav item with active/hover states | active, idle, with badge |
| `TeamMember` | Member row with name and status indicator | active, idle, busy |
| `TeamPanel` | List of team members grouped by role | with/without phase grouping |
| `StatPanel` | Right-sidebar info panel (git ops, review, orchestration status) | various content types |
| `MonoText` | Inline JetBrains Mono span for IDs, hashes, file counts | -- |
| `AppHeader` | Top bar with logo, version, search, user avatar | -- |
| `StatusBar` | Bottom bar with session info | connected, disconnected |

## Storybook Setup

Storybook 8 with Vite builder, configured inside `tina-web/`.

### Configuration Files

- `.storybook/main.ts` -- Vite builder, TypeScript, autodocs
- `.storybook/preview.ts` -- dark theme as default, loads `index.css` for design tokens, wraps stories in app-like container with correct background
- `.storybook/theme.ts` -- custom Storybook UI theme matching the dark aesthetic (dark sidebar, sky-blue accents)

### Story Organization

Stories live next to their components:

```
src/components/ui/
├── badge.tsx
├── badge.stories.tsx
├── button.tsx
├── button.stories.tsx
├── status-badge.tsx
├── status-badge.stories.tsx
├── task-card.tsx
├── task-card.stories.tsx
├── phase-card.tsx
├── phase-card.stories.tsx
└── ...
```

Each story file includes:
- Default story showing the component in its most common state
- Variant stories for each meaningful state (e.g., StatusBadge has one story per status)
- Composition stories where applicable (e.g., PhaseTimeline with multiple PhaseCards)

### Scripts

Added to `tina-web/package.json`:
- `storybook` -- launch dev server (port 6006)
- `build-storybook` -- static build for CI/sharing

Added to mise tasks:
- `mise run dev:storybook` -- convenience wrapper

## Implementation Order

### Phase 1 -- Tooling Setup

1. Install Storybook 8 (Vite builder) in tina-web
2. Install shadcn/ui (CLI init, configure paths, dark mode)
3. Add Inter + JetBrains Mono fonts (`@fontsource/inter`, `@fontsource-variable/jetbrains-mono`)
4. Set up design tokens in `src/index.css` + `tailwind.config.ts`
5. Configure Storybook theme and preview to use design tokens
6. Verify: `npm run storybook` launches with themed shell

### Phase 2 -- shadcn Primitives

1. Install Badge, Button, Card, ScrollArea, Separator, Tooltip via shadcn CLI
2. Write stories for each primitive showing themed variants
3. Verify all primitives render correctly with design tokens

### Phase 3 -- Domain Components

1. StatusBadge, MonoText (smallest, most reused)
2. TaskCard, PhaseCard (mid-complexity, compose primitives)
3. PhaseTimeline, SidebarNav, SidebarItem (layout-oriented)
4. TeamMember, TeamPanel, StatPanel (right sidebar pieces)
5. AppHeader, StatusBar (app shell)
6. Stories for every component covering all variants

### What Stays Untouched

- Existing tina-web components in `src/components/` continue working as-is
- No existing component is modified or deleted during this work
- The existing app builds and runs throughout

## Architectural Context

**Patterns to follow:**
- shadcn/ui CSS variable convention: tokens in `:root`/`.dark` blocks in `index.css`, referenced via `hsl(var(--token))` in `tailwind.config.ts`
- Existing component prop pattern: typed `interface Props` with domain types from `src/types.ts:1-107`
- Status mapping pattern: switch on string status returning style classes -- currently duplicated in `Dashboard.tsx:5-13`, `OrchestrationList.tsx:15-26`, `TaskList.tsx:17-28`, `OrchestrationDetail.tsx:12-22`. The new `StatusBadge` component consolidates this.

**Code to reuse:**
- `src/types.ts` -- domain types (Orchestration, Phase, TaskEvent, TeamMember) that domain components should accept as props
- `src/hooks/` -- Convex hooks remain unchanged; domain components are presentational (props only, no data fetching)
- `designs/mockups/base-design/code.html:11-33` -- exact Tailwind config with color values and font families to extract
- `designs/mockups/base-design/code.html:35-60` -- CSS classes (`.task-card`, `.phase-glow`, `.sidebar-item-active`) to port into component styles

**Anti-patterns:**
- Don't duplicate status-color logic -- the existing pattern of per-file `statusColor()` switch statements is exactly what `StatusBadge` eliminates
- Don't use `@fontsource` packages for fonts -- the mockup loads Inter and JetBrains Mono via Google Fonts CDN, which is simpler and matches existing `code.html` approach. Use CDN links in `index.html` instead.
- Don't add shadcn's `cn()` utility with `clsx` + `tailwind-merge` unless actually needed for conditional class merging. Start without it; add when a component genuinely needs it.

**Integration:**
- Entry: `tina-web/src/index.css` (tokens) + `tina-web/tailwind.config.ts` (theme extension)
- shadcn config: `tina-web/components.json` (created by `npx shadcn@latest init`)
- Storybook config: `tina-web/.storybook/` (new directory)
- Components: `tina-web/src/components/ui/` (shadcn convention, new directory alongside existing `src/components/`)
- Vite alias: `tsconfig.json` needs `"@/*": ["./src/*"]` path alias for shadcn imports; `vite.config.ts` needs matching `resolve.alias`
- mise: add `dev:storybook` task to `mise.toml`

**Notes:**
- The `tsconfig.json` currently only has a `@convex/_generated/*` path alias. shadcn requires a `@/*` alias pointing to `src/`. This requires adding the alias to both `tsconfig.json` and `vite.config.ts`.
- Existing components in `src/components/` are untouched. New components go in `src/components/ui/`. The future redesign phase will replace `src/components/` screens with compositions of `src/components/ui/` primitives.
- Storybook stories should use static mock data, not Convex hooks. Components in `ui/` are pure presentational.

## Design Reference

- Mockup screenshot: `designs/mockups/base-design/screen.png`
- Mockup HTML: `designs/mockups/base-design/code.html`
