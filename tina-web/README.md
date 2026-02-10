# tina-web

Real-time monitoring frontend for TINA orchestrations.

## Overview

Pure React 19 + Vite client that connects to Convex for live orchestration state. No backend server — all data flows through Convex subscriptions.

## Features

### Real-Time Orchestration Monitoring

- **Orchestration list** - View all features with status, progress, phases
- **Orchestration detail** - Drill into specific feature, see timeline and team activity
- **Phase tracking** - Monitor phase transitions, plan execution, task completion

### Team & Task Visibility

- **Team member status** - Active, idle, or shutdown (with visual distinction)
- **Task tracking** - View task list with markdown-formatted descriptions
- **Task details** - See task status, blockers, dependencies, full description

### Git Integration

- **Commit tracking** - Real-time commit list, grouped by phase
- **Commit details** - View full SHA, message, author, timestamp, insertions/deletions
- **Phase attribution** - Commits attributed to phase at time of commit

### Plan & Documentation

- **Plan viewer** - Open plan markdown files in modal from UI
- **Markdown rendering** - GitHub Flavored Markdown with syntax highlighting
- **Code blocks** - Language-specific syntax highlighting (TypeScript, Rust, etc.)

All features update in real-time via Convex subscriptions (no manual refresh needed).

## Architecture

### Data Flow

```
tina-daemon → Convex (teams, tasks, commits, plans, events)
tina-session → Convex (orchestrations, phases, supervisor state)
tina-web ← Convex (real-time subscriptions via useQuery)
```

**Key components:**
- **Convex** - Cloud database and backend (schema in `convex/schema.ts`)
- **tina-daemon** - Filesystem watcher, syncs teams/tasks/commits/plans to Convex
- **tina-session** - CLI for orchestration lifecycle, writes state to Convex
- **tina-web** - React frontend, reads from Convex via real-time queries

**No REST API** - All data flows through Convex cloud DB.

### UI Patterns

**Convex queries:**
```typescript
const orchestrations = useTypedQuery(api.orchestrations.listOrchestrations);
```

**Quicklook modals:**
- Extend `QuicklookDialog` base component
- Use Radix UI primitives for accessibility
- Follow existing styling (Tailwind + CSS variables)

**Markdown rendering:**
- `react-markdown` with `remark-gfm` plugin
- `react-syntax-highlighter` for code blocks
- Consistent styles across components (PlanQuicklook, TaskQuicklook)

## Development

```bash
# Install dependencies
npm install

# Start dev server (uses prod Convex)
npm run dev

# Start dev server (uses dev Convex)
npm run dev:dev

# Run tests
npm test

# Build for production
npm run build
```

## Testing

- **Unit tests** - vitest + @testing-library/react
- **Convex function tests** - vitest + convex-test
- **Integration tests** - Full app rendering with mock runtime

Run tests:
```bash
npm test                           # all tests
npm test -- --run                  # no watch mode
npm test -- CommitListPanel        # specific file
```

## Project Structure

```
src/
├── components/          # React components
│   ├── ui/             # Reusable UI primitives
│   └── __tests__/      # Component tests
├── hooks/              # Custom React hooks
├── lib/                # Utilities and helpers
├── providers/          # React context providers
├── schemas/            # Effect Schema types (mirrors Convex schema)
├── services/           # Data access layer
│   └── data/          # Convex query definitions
└── test/               # Test harness and builders
```

## Key Technologies

- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **Convex** - Backend (queries, mutations, real-time subscriptions)
- **Effect** - Schema validation and type safety
- **Tailwind CSS** - Styling
- **Radix UI** - Accessible component primitives
- **react-markdown** - Markdown rendering
- **react-syntax-highlighter** - Code block syntax highlighting

## Configuration

Convex deployment URL configured in `.env.local`:
```bash
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

Two Convex environments:
- **prod** - Default, used by `npm run dev` and production builds
- **dev** - Development instance, used by `npm run dev:dev`

See root `README.md` for full setup instructions.
