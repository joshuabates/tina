# Phase 3: UI Components for Git, Teams, Tasks & Plans

## Context

**Completed foundations:**
- Phase 1 (Foundation): Convex schema (`commits`, `plans` tables) + functions implemented and tested
- Phase 1.5 (Validation): Schema deployed, all tests passing (21/21)
- Phase 2.5.5 (Data Collection): tina-daemon watchers for git refs and plan files completed, worktree discovery implemented, event handlers wired

**Current state:**
- Commits syncing to Convex in real-time from git refs (`commits` table populated)
- Plans syncing to Convex on file changes (`plans` table populated)
- Shutdown events recording when agents removed from teams (`orchestrationEvents` table)
- tina-web exists with Convex integration, Radix UI components, and established patterns

**This phase:**
Implement UI components to display git commits, plan content, task markdown, and team member lifecycle. All data flows through Convex queries — no REST API.

## Summary

Add four UI features to tina-web:
1. **Team member shutdown status** - Show when agents shut down with visual distinction
2. **Git commit display** - Real-time commit list with quicklook modal for details
3. **Plan viewer modal** - Open and view plan markdown from UI
4. **Task description markdown** - Render task descriptions with GFM and syntax highlighting

All components follow existing tina-web patterns (Convex queries, Radix UI, shadcn/ui components).

## Goals

- Real-time visibility into agent lifecycle (active → shutdown)
- Git commit history viewable per-phase and orchestration-wide
- Plan content accessible from UI without leaving browser
- Richer task descriptions with formatted markdown and code highlighting
- No breaking changes to existing orchestration workflows
- Consistent with existing tina-web design system and component patterns

## Architecture

### Data Flow

```
Convex (commits, plans, orchestrationEvents) → tina-web queries → React components
```

- No new backend services — pure frontend implementation
- All data available via existing Convex functions from Phase 1
- Real-time updates via Convex subscriptions (`useTypedQuery`)

### Component Structure

```
tina-web/src/components/
├── team-member.tsx                 # Update: add shutdown status
├── TeamSection.tsx                 # Update: query shutdown events
├── CommitListPanel.tsx             # New: display commit list
├── CommitQuicklook.tsx             # New: commit detail modal
├── PlanQuicklook.tsx               # New: plan markdown viewer
└── TaskQuicklook.tsx               # Update: markdown rendering
```

### Dependencies

**New packages to install:**
- `react-markdown` - Markdown parser and renderer
- `remark-gfm` - GitHub Flavored Markdown plugin (tables, task lists, strikethrough)
- `react-syntax-highlighter` - Code syntax highlighting
- `@types/react-syntax-highlighter` - TypeScript types

All use existing design tokens from tina-web (CSS variables, Tailwind classes, Radix UI components).

## Implementation Tasks

### Task 3.1: Update TeamSection for shutdown status

**Files:**
- `/Users/joshua/Projects/tina/tina-web/src/components/TeamSection.tsx`
- `/Users/joshua/Projects/tina/tina-web/src/components/team-member.tsx`

**Changes:**

1. **TeamSection.tsx** - Query shutdown events and build shutdown map:

```tsx
// Add query for shutdown events
const shutdownEvents = useTypedQuery(
  api.events.listEvents,
  orchestrationId
    ? { orchestrationId, eventType: "agent_shutdown" }
    : "skip"
);

// Build shutdown map
const shutdownMap = React.useMemo(() => {
  if (!shutdownEvents) return new Map<string, string>();

  const map = new Map<string, string>();
  for (const event of shutdownEvents) {
    try {
      const detail = JSON.parse(event.detail || "{}");
      if (detail.agent_name && detail.shutdown_detected_at) {
        map.set(detail.agent_name, detail.shutdown_detected_at);
      }
    } catch {
      // Ignore parse errors
    }
  }
  return map;
}, [shutdownEvents]);

// Update member status logic
const memberStatus: MemberStatus = shutdownMap.has(member.agentName)
  ? "shutdown"
  : memberPhaseNum === activePhase
    ? "active"
    : "idle";
```

2. **team-member.tsx** - Add shutdown status rendering:

```tsx
// Add to MemberStatus type
export type MemberStatus = "active" | "idle" | "shutdown";

// Update status rendering
function getStatusDot(status: MemberStatus) {
  switch (status) {
    case "active":
      return <span className="text-green-400">●</span>;
    case "idle":
      return <span className="text-yellow-400">●</span>;
    case "shutdown":
      return <span className="text-gray-600 opacity-20">●</span>;
  }
}

function getStatusLabel(status: MemberStatus) {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "idle":
      return "IDLE";
    case "shutdown":
      return "SHUTDOWN";
  }
}

// Apply gray styling to shutdown members
const memberClass = status === "shutdown"
  ? "text-gray-600"
  : "";
```

**Testing:**
- Unit test: Verify shutdown status computed correctly from events
- Visual test: Shutdown members appear grayed out with "SHUTDOWN" badge
- Integration: Create orchestration, remove agent, verify shutdown status appears

**Dependencies:** None (uses Phase 1 Convex functions)

**Estimated time:** 45 minutes

---

### Task 3.2: Implement git commit display components

**Files:**
- `/Users/joshua/Projects/tina/tina-web/src/components/CommitListPanel.tsx` (new)
- `/Users/joshua/Projects/tina/tina-web/src/components/CommitQuicklook.tsx` (new)
- `/Users/joshua/Projects/tina/tina-web/src/components/PhaseQuicklook.tsx` (update)
- `/Users/joshua/Projects/tina/tina-web/src/components/OrchestrationPage.tsx` (update)
- `/Users/joshua/Projects/tina/tina-web/package.json` (update)

**Changes:**

1. **Install dependencies:**

```bash
cd tina-web && npm install react-syntax-highlighter @types/react-syntax-highlighter
```

2. **CommitListPanel.tsx** - Display commit list:

```tsx
import { useTypedQuery } from "@/hooks/useTypedQuery";
import { api } from "@/convex";

interface Props {
  orchestrationId: string;
  phaseNumber?: string;  // Optional - shows all if omitted
}

export function CommitListPanel({ orchestrationId, phaseNumber }: Props) {
  const commits = useTypedQuery(
    api.commits.listCommits,
    { orchestrationId, phaseNumber }
  );

  if (!commits || commits.length === 0) {
    return <div className="text-muted-foreground text-sm">No commits yet</div>;
  }

  // Group by phase if showing all commits
  const groupedCommits = phaseNumber
    ? { [phaseNumber]: commits }
    : commits.reduce((acc, commit) => {
        const phase = commit.phaseNumber;
        if (!acc[phase]) acc[phase] = [];
        acc[phase].push(commit);
        return acc;
      }, {} as Record<string, typeof commits>);

  return (
    <div className="space-y-4">
      {Object.entries(groupedCommits).map(([phase, phaseCommits]) => (
        <div key={phase}>
          {!phaseNumber && (
            <h4 className="text-sm font-semibold mb-2">Phase {phase}</h4>
          )}
          <div className="space-y-1">
            {phaseCommits.map((commit) => (
              <button
                key={commit._id}
                onClick={() => setSelectedCommit(commit)}
                className="w-full text-left text-sm hover:bg-muted p-2 rounded"
              >
                <div className="flex items-start gap-2">
                  <code className="text-primary">{commit.shortSha}</code>
                  <span className="flex-1">{commit.subject}</span>
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  {commit.author} · {formatRelativeTime(commit.timestamp)} ·{" "}
                  <span className="text-green-400">+{commit.insertions}</span>{" "}
                  <span className="text-red-400">-{commit.deletions}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

3. **CommitQuicklook.tsx** - Commit detail modal:

```tsx
import { QuicklookDialog } from "./QuicklookDialog";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Props {
  commit: Commit;
  onClose: () => void;
}

export function CommitQuicklook({ commit, onClose }: Props) {
  return (
    <QuicklookDialog
      title="Commit Details"
      open={true}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <div className="text-sm text-muted-foreground">SHA</div>
          <code className="text-primary">{commit.sha}</code>
          <button
            onClick={() => navigator.clipboard.writeText(commit.sha)}
            className="ml-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Copy
          </button>
        </div>

        <div>
          <div className="text-sm text-muted-foreground">Message</div>
          <div className="font-semibold">{commit.subject}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Author</div>
            <div>{commit.author}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Time</div>
            <div>{new Date(commit.timestamp).toLocaleString()}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Insertions</div>
            <div className="text-green-400">+{commit.insertions}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Deletions</div>
            <div className="text-red-400">-{commit.deletions}</div>
          </div>
        </div>

        {/* Note: Diff content storage is future work */}
        <div className="text-sm text-muted-foreground italic">
          Full diff view coming in future update
        </div>
      </div>
    </QuicklookDialog>
  );
}
```

4. **PhaseQuicklook.tsx** - Add commits tab/section:

```tsx
// Add commits panel
<div className="mt-4">
  <h3 className="text-sm font-semibold mb-2">Commits</h3>
  <CommitListPanel
    orchestrationId={orchestrationId}
    phaseNumber={phase.phaseNumber}
  />
</div>
```

5. **OrchestrationPage.tsx** - Add git section to sidebar:

```tsx
// Add to sidebar
<div className="mb-6">
  <h3 className="text-sm font-semibold mb-2">Git History</h3>
  <CommitListPanel orchestrationId={orchestrationId} />
</div>
```

**Testing:**
- Unit test: Verify commit list renders with correct grouping
- Unit test: Verify commit click opens quicklook modal
- Integration: Make commit in worktree, verify appears in UI within 5 seconds

**Dependencies:** Task 3.1 (uses same Convex query patterns)

**Estimated time:** 120 minutes

---

### Task 3.3: Implement plan viewer modal

**Files:**
- `/Users/joshua/Projects/tina/tina-web/src/components/PlanQuicklook.tsx` (new)
- `/Users/joshua/Projects/tina/tina-web/src/components/PlanQuicklook.module.scss` (new)
- `/Users/joshua/Projects/tina/tina-web/src/components/PhaseQuicklook.tsx` (update)
- `/Users/joshua/Projects/tina/tina-web/package.json` (update)

**Changes:**

1. **Install dependencies:**

```bash
cd tina-web && npm install react-markdown remark-gfm
```

2. **PlanQuicklook.tsx** - Markdown viewer modal:

```tsx
import { QuicklookDialog } from "./QuicklookDialog";
import { useTypedQuery } from "@/hooks/useTypedQuery";
import { api } from "@/convex";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import styles from "./PlanQuicklook.module.scss";

interface Props {
  orchestrationId: string;
  phaseNumber: string;
  onClose: () => void;
}

export function PlanQuicklook({ orchestrationId, phaseNumber, onClose }: Props) {
  const plan = useTypedQuery(
    api.plans.getPlan,
    { orchestrationId, phaseNumber }
  );

  return (
    <QuicklookDialog
      title={`Phase ${phaseNumber} Plan`}
      open={true}
      onClose={onClose}
    >
      {!plan ? (
        <div className="text-muted-foreground">Loading plan...</div>
      ) : (
        <div className={styles.content}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {plan.content}
          </ReactMarkdown>
        </div>
      )}
    </QuicklookDialog>
  );
}
```

3. **PlanQuicklook.module.scss** - Markdown styling:

```scss
.content {
  font-size: 0.875rem;
  line-height: 1.6;

  h1, h2, h3, h4, h5, h6 {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
    line-height: 1.25;
  }

  h1 { font-size: 1.5em; }
  h2 { font-size: 1.25em; }
  h3 { font-size: 1.1em; }

  p {
    margin-bottom: 1em;
  }

  code {
    background: hsl(var(--muted));
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: ui-monospace, monospace;
  }

  pre {
    background: hsl(var(--muted));
    padding: 1em;
    border-radius: 6px;
    overflow-x: auto;
    margin-bottom: 1em;

    code {
      background: none;
      padding: 0;
    }
  }

  ul, ol {
    margin-bottom: 1em;
    padding-left: 1.5em;
  }

  li {
    margin-bottom: 0.25em;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 1em;

    th, td {
      border: 1px solid hsl(var(--border));
      padding: 0.5em;
      text-align: left;
    }

    th {
      background: hsl(var(--muted));
      font-weight: 600;
    }
  }

  blockquote {
    border-left: 3px solid hsl(var(--border));
    padding-left: 1em;
    margin-left: 0;
    color: hsl(var(--muted-foreground));
  }

  a {
    color: hsl(var(--primary));
    text-decoration: underline;

    &:hover {
      opacity: 0.8;
    }
  }
}
```

4. **PhaseQuicklook.tsx** - Make plan link clickable:

```tsx
const [showPlanQuicklook, setShowPlanQuicklook] = useState(false);

// Update plan section
<div>
  <div className="text-sm text-muted-foreground">Plan</div>
  <button
    onClick={() => setShowPlanQuicklook(true)}
    className="text-primary hover:underline"
  >
    {phase.planPath || "No plan"}
  </button>
</div>

{showPlanQuicklook && (
  <PlanQuicklook
    orchestrationId={orchestrationId}
    phaseNumber={phase.phaseNumber}
    onClose={() => setShowPlanQuicklook(false)}
  />
)}
```

**Testing:**
- Unit test: Verify markdown renders correctly (headings, code blocks, tables)
- Unit test: Verify syntax highlighting works for code blocks
- Visual test: Open plan modal, verify styling matches design system
- Integration: Edit plan file, verify changes appear in modal

**Dependencies:** Task 3.2 (shares syntax highlighting setup)

**Estimated time:** 90 minutes

---

### Task 3.4: Add markdown rendering to task descriptions

**Files:**
- `/Users/joshua/Projects/tina/tina-web/src/components/TaskQuicklook.tsx` (update)

**Changes:**

1. **TaskQuicklook.tsx** - Replace plain text with markdown:

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// In task description section
<div>
  <div className="text-sm text-muted-foreground mb-2">Description</div>
  <div className="prose prose-sm dark:prose-invert max-w-none">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          return !inline && match ? (
            <SyntaxHighlighter
              style={oneDark}
              language={match[1]}
              PreTag="div"
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {task.description}
    </ReactMarkdown>
  </div>
</div>
```

2. **Reuse styles** - Apply same markdown styles as PlanQuicklook:

```tsx
// Import styles
import styles from "./PlanQuicklook.module.scss";

// Apply to description wrapper
<div className={styles.content}>
  <ReactMarkdown ...>
    {task.description}
  </ReactMarkdown>
</div>
```

**Testing:**
- Unit test: Verify markdown renders in task descriptions
- Unit test: Verify GFM features work (tables, task lists, strikethrough)
- Visual test: Create task with markdown description, verify rendering
- Integration: Task with code blocks renders with syntax highlighting

**Dependencies:** Task 3.3 (reuses markdown config and styles)

**Estimated time:** 30 minutes

---

## Testing Strategy

### Unit Tests

**Component tests** (`vitest` + `@testing-library/react`):

```typescript
// TeamSection.test.tsx
describe("TeamSection", () => {
  it("marks agents as shutdown when shutdown event exists", () => {
    const events = [
      {
        eventType: "agent_shutdown",
        detail: JSON.stringify({
          agent_name: "executor-1",
          shutdown_detected_at: "2026-02-10T10:00:00Z",
        }),
      },
    ];
    // Mock useTypedQuery to return events
    // Render TeamSection
    // Assert executor-1 has "SHUTDOWN" badge and gray styling
  });
});

// CommitListPanel.test.tsx
describe("CommitListPanel", () => {
  it("groups commits by phase when phaseNumber not provided", () => {
    const commits = [
      { phaseNumber: "1", shortSha: "abc123", subject: "commit 1" },
      { phaseNumber: "2", shortSha: "def456", subject: "commit 2" },
    ];
    // Render with grouped commits
    // Assert phase headings present
  });

  it("opens quicklook modal on commit click", () => {
    // Render commit list
    // Click commit
    // Assert CommitQuicklook rendered
  });
});

// PlanQuicklook.test.tsx
describe("PlanQuicklook", () => {
  it("renders markdown with syntax highlighting", () => {
    const plan = {
      content: "# Plan\n```typescript\nconst x = 1;\n```",
    };
    // Render PlanQuicklook
    // Assert h1 rendered
    // Assert code block highlighted
  });

  it("handles GFM tables", () => {
    const plan = {
      content: "| Col1 | Col2 |\n|------|------|\n| A | B |",
    };
    // Render PlanQuicklook
    // Assert table rendered with borders
  });
});

// TaskQuicklook.test.tsx
describe("TaskQuicklook", () => {
  it("renders task description as markdown", () => {
    const task = {
      description: "## Task\nImplement **feature**\n```rust\nfn main() {}\n```",
    };
    // Render TaskQuicklook
    // Assert h2 rendered
    // Assert bold text rendered
    // Assert code block highlighted
  });
});
```

**Expected results:**
- All unit tests pass
- Coverage > 80% for new components
- Mock Convex queries correctly
- Visual regression tests pass (Storybook + Chromatic)

### Integration Tests

**E2E scenarios** (`playwright`):

```typescript
// test/e2e/git-commits.spec.ts
test("commits appear in UI after git commit", async ({ page }) => {
  // 1. Navigate to orchestration detail page
  // 2. Note current commit count
  // 3. Make git commit in worktree via CLI
  // 4. Wait for tina-daemon to sync (max 10s)
  // 5. Refresh page
  // 6. Assert commit count increased
  // 7. Assert new commit visible with correct SHA and subject
});

// test/e2e/plan-viewer.spec.ts
test("plan modal displays markdown correctly", async ({ page }) => {
  // 1. Navigate to phase quicklook
  // 2. Click plan link
  // 3. Assert modal opens
  // 4. Assert markdown headings rendered
  // 5. Assert code blocks have syntax highlighting
  // 6. Close modal
  // 7. Assert modal closed
});

// test/e2e/team-shutdown.spec.ts
test("shutdown members appear grayed out", async ({ page }) => {
  // 1. Navigate to orchestration with team
  // 2. Note active members
  // 3. Remove member from team config via CLI
  // 4. Wait for tina-daemon to sync (max 10s)
  // 5. Refresh page
  // 6. Assert removed member shows "SHUTDOWN" badge
  // 7. Assert member text is gray
});
```

**Expected results:**
- All E2E tests pass
- Commits appear within 10s of git commit
- Plans update within 10s of file save
- Shutdown status appears within 10s of team config change

### Manual Testing Checklist

```markdown
## Phase 3 Manual Testing

### Team Member Shutdown
- [ ] Active member shows green dot and "ACTIVE" label
- [ ] Idle member shows yellow dot and "IDLE" label
- [ ] Shutdown member shows gray dot (low opacity) and "SHUTDOWN" label
- [ ] Shutdown member text is grayed out
- [ ] Hover tooltip shows shutdown timestamp

### Git Commits
- [ ] Commit list shows commits grouped by phase
- [ ] Commit entry shows: shortSha, subject, author, relative time, +insertions, -deletions
- [ ] Click commit opens CommitQuicklook modal
- [ ] Modal shows full SHA with copy button
- [ ] Modal shows commit details (message, author, timestamp, stats)
- [ ] Making new commit appears in list within 5 seconds

### Plan Viewer
- [ ] Plan link in PhaseQuicklook is clickable
- [ ] Click opens PlanQuicklook modal
- [ ] Markdown renders correctly: headings, paragraphs, lists
- [ ] Code blocks have syntax highlighting (language-specific colors)
- [ ] Tables render with borders
- [ ] GFM features work: strikethrough, task lists
- [ ] Modal scrolls when content is long
- [ ] Editing plan file updates modal content within 3 seconds

### Task Description Markdown
- [ ] Task description renders as markdown (not plain text)
- [ ] Headings render with correct sizes
- [ ] Code blocks have syntax highlighting
- [ ] Inline code has background color
- [ ] Bold, italic, links render correctly
- [ ] Lists render with proper indentation
- [ ] Tables render if present in description
```

## Integration Points

### Modified Files

**Updated components:**
- `tina-web/src/components/TeamSection.tsx` - Add shutdown event query and mapping
- `tina-web/src/components/team-member.tsx` - Add shutdown status rendering
- `tina-web/src/components/PhaseQuicklook.tsx` - Add commits section and plan clickable link
- `tina-web/src/components/OrchestrationPage.tsx` - Add git history section to sidebar
- `tina-web/src/components/TaskQuicklook.tsx` - Replace plain text with markdown rendering

**New components:**
- `tina-web/src/components/CommitListPanel.tsx` - Commit list component
- `tina-web/src/components/CommitQuicklook.tsx` - Commit detail modal
- `tina-web/src/components/PlanQuicklook.tsx` - Plan markdown viewer modal
- `tina-web/src/components/PlanQuicklook.module.scss` - Markdown styling

**Package updates:**
- `tina-web/package.json` - Add react-markdown, remark-gfm, react-syntax-highlighter

### No Changes To

- Convex schema or functions (Phase 1 implementations used as-is)
- tina-daemon (Phase 2.5.5 implementations complete)
- tina-session (orchestration flow unchanged)
- Rust code (pure frontend implementation)

## Success Criteria

1. ✅ Team member shutdown status displays correctly (gray badge, low opacity)
2. ✅ Commit list shows all commits grouped by phase
3. ✅ Commit quicklook modal shows full commit details
4. ✅ Plan quicklook modal renders markdown with syntax highlighting
5. ✅ Task descriptions render as markdown (not plain text)
6. ✅ GFM features work: tables, task lists, strikethrough
7. ✅ Code blocks have language-specific syntax highlighting
8. ✅ All unit tests pass (new + existing)
9. ✅ E2E tests pass: git commits, plan viewer, team shutdown
10. ✅ Manual testing checklist complete (all items checked)

## Estimated Time

- Task 3.1: Team shutdown status - 45 min
- Task 3.2: Git commit display - 120 min
- Task 3.3: Plan viewer modal - 90 min
- Task 3.4: Task description markdown - 30 min

**Total: ~285 minutes (~4.75 hours)**

## Dependencies

**Requires (completed):**
- ✅ Phase 1: Convex schema + functions
- ✅ Phase 1.5: Schema validation
- ✅ Phase 2.5.5: tina-daemon watchers

**Enables (future):**
- Phase 4: Additional UI polish and features
- Bidirectional plan sync (Convex → filesystem)
- Commit diff viewing (requires storing diff content)

## Rollback Plan

All changes are UI-only and non-breaking:

**Scenario 1: Markdown rendering breaks layout**
- Revert to plain text rendering
- Fix CSS issues offline
- Re-enable after fix

**Scenario 2: Commit list performance issues**
- Add pagination/virtualization
- Limit initial query to last N commits
- Load more on demand

**Scenario 3: Dependencies cause build errors**
- Pin exact versions in package.json
- Use alternative markdown library if needed
- Consider server-side rendering for markdown

**Scenario 4: Shutdown detection inaccurate**
- Add debug logging to TeamSection
- Verify event detail JSON structure
- Fix parsing logic

No data loss risk — all changes are read-only UI components.

## Follow-Up Work (Not in This Phase)

1. **Commit diff viewing** - Store and display full diff content
2. **Plan editing in UI** - Bidirectional sync (Convex → filesystem)
3. **Commit filtering** - Filter by author, date range, file path
4. **Plan version history** - Track plan content changes over time
5. **Task description editor** - Edit markdown in UI with preview
6. **Performance optimization** - Virtualization for long lists, pagination

## Notes

**Key design decisions:**

- **Markdown libraries:** react-markdown is lightweight and well-maintained, remark-gfm adds GFM support
- **Syntax highlighting:** react-syntax-highlighter with oneDark theme matches existing dark mode design
- **Component pattern:** Extend QuicklookDialog for modals (consistent with existing patterns)
- **Styling approach:** SCSS modules for markdown-specific styles, Tailwind for layout
- **Real-time updates:** Convex subscriptions handle live data (no polling needed)

**Patterns followed:**

- Convex queries: `useTypedQuery(api.*.*, args)` for type-safe queries
- Radix UI: Consistent with existing modal/tooltip patterns
- Effect library: Option types for nullable values (`optionText()` helper)
- Tailwind classes: CSS variables for theme colors (`hsl(var(--primary))`)
- Component structure: Small, focused components with clear props

**Integration with existing code:**

- `QuicklookDialog` base component reused for all modals
- `useTypedQuery` hook used for all Convex queries
- CSS variables from `index.css` used in markdown styles
- Existing status badge patterns followed for shutdown status
- Team member status enum extended (not replaced)
