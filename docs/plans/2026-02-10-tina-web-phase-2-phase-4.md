# Phase 4: Testing & Documentation

## Context

**Completed phases:**
- Phase 1: Foundation - Convex schema (commits, plans tables) + functions + tests (100% passing)
- Phase 1.5: Validation - Schema deployed, 21/21 tests passing
- Phase 2: Data Collection Foundation - Team member removal detection implemented
- Phase 2.5: Git & Plan Watchers - Git commit watcher and plan file watcher discovery logic
- Phase 2.5.5: Integration - All tina-daemon watchers fully integrated and event handlers wired
- Phase 3: UI Components - All four features implemented (team shutdown status, git commits, plan viewer, task markdown)

**Current state:**
- All features implemented and functional
- Unit tests partially complete (Convex functions tested)
- Integration tests missing (E2E harness scenario needed)
- Documentation incomplete (feature usage, patterns, examples)

**This phase:**
Complete testing coverage and documentation for the git/teams/tasks/plans tracking features. Ensure quality, maintainability, and usability.

## Summary

Add comprehensive testing and documentation:
1. **UI Component Tests** - Unit tests for all new React components
2. **E2E Harness Scenario** - Full orchestration test validating all features
3. **Documentation Updates** - CLAUDE.md, tina-web README, feature guide

All tests follow existing patterns (vitest for frontend, Convex test for backend, tina-harness for E2E).

## Goals

- 100% test coverage for new UI components
- E2E validation of all four features via tina-harness
- Clear documentation of feature behavior and usage
- Maintainable test suite following project conventions
- No regressions in existing functionality

## Testing Strategy

### 1. UI Component Tests (vitest + testing-library)

**Test files to create:**
- `tina-web/src/components/__tests__/TeamSection.test.tsx` (update existing)
- `tina-web/src/components/__tests__/team-member.test.tsx` (new)
- `tina-web/src/components/__tests__/CommitListPanel.test.tsx` (new)
- `tina-web/src/components/__tests__/CommitQuicklook.test.tsx` (new)
- `tina-web/src/components/__tests__/PlanQuicklook.test.tsx` (new)
- `tina-web/src/components/__tests__/TaskQuicklook.test.tsx` (update existing)

**Coverage targets:**
- Team member shutdown status rendering: 100%
- Commit list display and grouping: 100%
- Plan markdown rendering: 100%
- Task description markdown: 100%

### 2. E2E Harness Scenario

**New scenario:** `07-tina-web-phase-2-integration`

**Design doc structure:**
- 2-phase feature
- Phase 1: Make initial commits, create tasks with markdown descriptions
- Phase 2: Add more commits, update plans, remove team members

**Expected validation:**
```json
{
  "convex": {
    "has_orchestration": true,
    "min_phases": 2,
    "min_commits": 3,
    "min_plans": 2,
    "min_shutdown_events": 1,
    "has_markdown_task": true
  }
}
```

**Validates:**
- Commits recorded to Convex during execution
- Plans synced on file changes
- Shutdown events recorded when agents removed
- Task descriptions support markdown

### 3. Documentation Updates

**Files to update:**
- `CLAUDE.md` - Add features to architecture overview
- `tina-web/README.md` - Document new UI components and data flow
- Create `docs/features/git-teams-tasks-plans-tracking.md` - Feature guide

## Implementation Tasks

### Task 4.1: UI Component Unit Tests

**Files:**
- `/Users/joshua/Projects/tina/tina-web/src/components/__tests__/TeamSection.test.tsx` (update)
- `/Users/joshua/Projects/tina/tina-web/src/components/__tests__/team-member.test.tsx` (new)
- `/Users/joshua/Projects/tina/tina-web/src/components/__tests__/CommitListPanel.test.tsx` (new)
- `/Users/joshua/Projects/tina/tina-web/src/components/__tests__/CommitQuicklook.test.tsx` (new)
- `/Users/joshua/Projects/tina/tina-web/src/components/__tests__/PlanQuicklook.test.tsx` (new)
- `/Users/joshua/Projects/tina/tina-web/src/components/__tests__/TaskQuicklook.test.tsx` (update)

**Test cases:**

#### TeamSection.test.tsx (update)
```typescript
describe("TeamSection shutdown tracking", () => {
  it("marks agents as shutdown when shutdown event exists", () => {
    const shutdownEvents = [{
      eventType: "agent_shutdown",
      detail: JSON.stringify({
        agent_name: "executor-1",
        shutdown_detected_at: "2026-02-10T10:00:00Z",
      }),
    }];

    // Mock useTypedQuery to return shutdown events
    // Render TeamSection with team members
    // Assert executor-1 has shutdown status
  });

  it("does not mark active agents as shutdown", () => {
    const shutdownEvents = [];
    // Render TeamSection with active members
    // Assert all members have active/idle status (not shutdown)
  });

  it("handles invalid shutdown event JSON gracefully", () => {
    const shutdownEvents = [{
      eventType: "agent_shutdown",
      detail: "invalid json",
    }];
    // Render TeamSection
    // Assert no errors thrown, members shown as active/idle
  });
});
```

#### team-member.test.tsx (new)
```typescript
describe("TeamMember", () => {
  it("renders active status with green dot", () => {
    const member = { agentName: "executor-1", status: "active" };
    // Render TeamMember
    // Assert green dot visible
    // Assert "ACTIVE" label visible
  });

  it("renders idle status with yellow dot", () => {
    const member = { agentName: "executor-1", status: "idle" };
    // Render TeamMember
    // Assert yellow dot visible
    // Assert "IDLE" label visible
  });

  it("renders shutdown status with gray dot and low opacity", () => {
    const member = { agentName: "executor-1", status: "shutdown" };
    // Render TeamMember
    // Assert gray dot with opacity-20
    // Assert "SHUTDOWN" label visible
    // Assert text is grayed out
  });
});
```

#### CommitListPanel.test.tsx (new)
```typescript
describe("CommitListPanel", () => {
  it("groups commits by phase when phaseNumber not provided", () => {
    const commits = [
      { _id: "1", phaseNumber: "1", shortSha: "abc123", subject: "commit 1", author: "Alice", timestamp: "2026-02-10T10:00:00Z", insertions: 5, deletions: 2 },
      { _id: "2", phaseNumber: "2", shortSha: "def456", subject: "commit 2", author: "Bob", timestamp: "2026-02-10T11:00:00Z", insertions: 10, deletions: 3 },
    ];

    // Mock useTypedQuery to return commits
    // Render CommitListPanel without phaseNumber
    // Assert "Phase 1" heading present
    // Assert "Phase 2" heading present
    // Assert commits grouped correctly
  });

  it("shows only phase commits when phaseNumber provided", () => {
    const commits = [
      { _id: "1", phaseNumber: "1", shortSha: "abc123", subject: "commit 1", author: "Alice", timestamp: "2026-02-10T10:00:00Z", insertions: 5, deletions: 2 },
    ];

    // Mock useTypedQuery to return filtered commits
    // Render CommitListPanel with phaseNumber="1"
    // Assert no phase headings (single phase)
    // Assert only phase 1 commits shown
  });

  it("shows 'No commits yet' when empty", () => {
    // Mock useTypedQuery to return empty array
    // Render CommitListPanel
    // Assert "No commits yet" text visible
  });

  it("displays commit metadata correctly", () => {
    const commit = {
      _id: "1",
      phaseNumber: "1",
      shortSha: "abc123",
      subject: "Add feature X",
      author: "Alice <alice@example.com>",
      timestamp: "2026-02-10T10:00:00Z",
      insertions: 15,
      deletions: 5,
    };

    // Render CommitListPanel with single commit
    // Assert shortSha displayed: "abc123"
    // Assert subject displayed: "Add feature X"
    // Assert author displayed
    // Assert +insertions in green
    // Assert -deletions in red
  });

  it("opens CommitQuicklook on commit click", async () => {
    const commit = {
      _id: "1",
      phaseNumber: "1",
      shortSha: "abc123",
      subject: "commit 1",
      author: "Alice",
      timestamp: "2026-02-10T10:00:00Z",
      insertions: 5,
      deletions: 2,
    };

    // Render CommitListPanel
    // Click commit button
    // Assert CommitQuicklook rendered
    // Assert commit details passed to modal
  });
});
```

#### CommitQuicklook.test.tsx (new)
```typescript
describe("CommitQuicklook", () => {
  it("displays full commit details", () => {
    const commit = {
      sha: "abc123def456",
      shortSha: "abc123",
      subject: "Add feature X",
      author: "Alice <alice@example.com>",
      timestamp: "2026-02-10T10:00:00Z",
      insertions: 15,
      deletions: 5,
    };

    // Render CommitQuicklook
    // Assert full SHA displayed
    // Assert subject displayed
    // Assert author displayed
    // Assert timestamp formatted correctly
    // Assert insertions/deletions displayed
  });

  it("copies SHA to clipboard on button click", async () => {
    const commit = { sha: "abc123def456" };

    // Mock navigator.clipboard.writeText
    // Render CommitQuicklook
    // Click copy button
    // Assert writeText called with full SHA
  });

  it("calls onClose when modal closed", () => {
    const onClose = vi.fn();
    const commit = { sha: "abc123" };

    // Render CommitQuicklook with onClose callback
    // Close modal
    // Assert onClose called
  });
});
```

#### PlanQuicklook.test.tsx (new)
```typescript
describe("PlanQuicklook", () => {
  it("renders markdown with headings", () => {
    const plan = {
      content: "# Title\n## Subtitle\nParagraph text",
    };

    // Mock useTypedQuery to return plan
    // Render PlanQuicklook
    // Assert h1 rendered with "Title"
    // Assert h2 rendered with "Subtitle"
    // Assert paragraph rendered
  });

  it("renders code blocks with syntax highlighting", () => {
    const plan = {
      content: "```typescript\nconst x = 1;\n```",
    };

    // Render PlanQuicklook
    // Assert SyntaxHighlighter component rendered
    // Assert language set to "typescript"
    // Assert code content rendered
  });

  it("renders inline code with background", () => {
    const plan = {
      content: "Use `const` for variables",
    };

    // Render PlanQuicklook
    // Assert <code> tag rendered
    // Assert background style applied
  });

  it("renders GFM tables", () => {
    const plan = {
      content: "| Col1 | Col2 |\n|------|------|\n| A | B |",
    };

    // Render PlanQuicklook
    // Assert table rendered
    // Assert th cells for headers
    // Assert td cells for data
  });

  it("renders GFM task lists", () => {
    const plan = {
      content: "- [x] Done\n- [ ] Todo",
    };

    // Render PlanQuicklook
    // Assert checkboxes rendered
    // Assert "Done" item checked
    // Assert "Todo" item unchecked
  });

  it("shows loading state while plan loads", () => {
    // Mock useTypedQuery to return undefined (loading)
    // Render PlanQuicklook
    // Assert "Loading plan..." text visible
  });

  it("calls onClose when modal closed", () => {
    const onClose = vi.fn();

    // Render PlanQuicklook with onClose callback
    // Close modal
    // Assert onClose called
  });
});
```

#### TaskQuicklook.test.tsx (update)
```typescript
describe("TaskQuicklook markdown rendering", () => {
  it("renders task description as markdown", () => {
    const task = {
      description: "## Task\nImplement **feature**",
    };

    // Render TaskQuicklook
    // Assert h2 rendered with "Task"
    // Assert <strong> tag for "feature"
  });

  it("renders code blocks with syntax highlighting", () => {
    const task = {
      description: "```rust\nfn main() {}\n```",
    };

    // Render TaskQuicklook
    // Assert SyntaxHighlighter rendered
    // Assert language set to "rust"
  });

  it("renders GFM features (tables, task lists, strikethrough)", () => {
    const task = {
      description: "- [x] Done\n~~strikethrough~~\n| A | B |\n|---|---|\n| 1 | 2 |",
    };

    // Render TaskQuicklook
    // Assert checkbox rendered
    // Assert strikethrough applied
    // Assert table rendered
  });

  it("handles plain text descriptions gracefully", () => {
    const task = {
      description: "Plain text task description",
    };

    // Render TaskQuicklook
    // Assert text rendered correctly (no markdown formatting)
  });
});
```

**Testing approach:**
- Use vitest + @testing-library/react
- Mock Convex queries with `vi.mock("@/hooks/useTypedQuery")`
- Test rendering logic, not implementation details
- Verify accessibility (ARIA labels, keyboard navigation)

**Success criteria:**
- All tests pass: `npm test` in tina-web directory
- Coverage > 80% for new components
- No regressions in existing tests

**Dependencies:** None (Phase 3 components already implemented)

**Estimated time:** 180 minutes (3 hours)

---

### Task 4.2: E2E Harness Scenario

**Files:**
- `/Users/joshua/Projects/tina/tina-harness/scenarios/07-tina-web-phase-2-integration/design.md` (new)
- `/Users/joshua/Projects/tina/tina-harness/scenarios/07-tina-web-phase-2-integration/expected.json` (new)

**Scenario design:**

#### design.md
```markdown
# Git, Teams, Tasks & Plans Integration Test

## Overview

Test all four features from tina-web phase 2:
1. Git commit tracking
2. Plan file syncing
3. Team member shutdown events
4. Task description markdown

## Feature: Multi-Phase Commit Tracking

Implement a simple calculator library with two phases:
- Phase 1: Basic arithmetic operations (add, subtract)
- Phase 2: Advanced operations (multiply, divide)

Each phase will make git commits that should appear in Convex.

## Implementation Plan

### Phase 1: Basic Arithmetic

**Tasks:**
1. Create `calculator.ts` with `add()` and `subtract()` functions
2. Add tests for basic operations
3. Commit changes: "feat: add basic arithmetic operations"

**Task descriptions:**
Use markdown formatting:
```markdown
## Task: Implement Basic Arithmetic

Create the following functions in `calculator.ts`:
- `add(a: number, b: number): number`
- `subtract(a: number, b: number): number`

**Acceptance criteria:**
- [ ] Functions implemented
- [ ] Tests passing
- [ ] Types exported
```

**Plan file:** `docs/plans/2026-02-10-calculator-phase-1.md`

### Phase 2: Advanced Operations

**Tasks:**
1. Add `multiply()` and `divide()` functions to `calculator.ts`
2. Add division by zero handling
3. Update tests
4. Commit changes: "feat: add advanced arithmetic operations"

**Task descriptions:**
```markdown
## Task: Implement Advanced Arithmetic

Extend `calculator.ts` with:
- `multiply(a: number, b: number): number`
- `divide(a: number, b: number): number` (throws on zero divisor)

**Example:**
```typescript
divide(10, 2) // Returns 5
divide(10, 0) // Throws Error("Division by zero")
```

**Plan file:** `docs/plans/2026-02-10-calculator-phase-2.md`

**Team member shutdown:**
- Phase 1 executor agent completes and shuts down after phase 1
- Shutdown event should be recorded in Convex

## Success Criteria

**Convex validation:**
- Orchestration exists with feature "calculator"
- At least 2 phases recorded
- At least 3 commits recorded (1 in phase 1, 2 in phase 2)
- At least 2 plans synced (phase-1.md, phase-2.md)
- At least 1 shutdown event (phase 1 executor)
- At least 1 task with markdown description (code block, heading, task list)

**Timing:**
- Commits appear in Convex within 10 seconds of git commit
- Plans synced within 5 seconds of file write
- Shutdown events recorded within 5 seconds of team config change
```

#### expected.json
```json
{
  "feature": "calculator",
  "phases": 2,
  "convex": {
    "has_orchestration": true,
    "min_phases": 2,
    "min_commits": 3,
    "min_plans": 2,
    "min_shutdown_events": 1,
    "has_markdown_task": true
  },
  "files": [
    "calculator.ts",
    "calculator.test.ts",
    "docs/plans/2026-02-10-calculator-phase-1.md",
    "docs/plans/2026-02-10-calculator-phase-2.md"
  ]
}
```

**Harness implementation:**

Add Convex validation helpers to `tina-harness/src/verify.rs`:

```rust
pub struct ConvexValidation {
    pub has_orchestration: bool,
    pub min_phases: Option<usize>,
    pub min_commits: Option<usize>,
    pub min_plans: Option<usize>,
    pub min_shutdown_events: Option<usize>,
    pub has_markdown_task: bool,
}

pub async fn verify_convex(
    feature: &str,
    validation: &ConvexValidation,
) -> Result<()> {
    // Query Convex for orchestration by feature name
    // Verify orchestration exists if has_orchestration = true
    // Count phases via phases table
    // Count commits via commits table
    // Count plans via plans table
    // Count shutdown events via orchestrationEvents (eventType = "agent_shutdown")
    // Check for tasks with markdown (description contains "##" or "```")

    // Assert all min_* thresholds met
    // Return detailed error if validation fails
}
```

**Run command:**
```bash
mise run harness:run 07-tina-web-phase-2-integration -- --full --verify
```

**Expected runtime:** ~20-30 minutes (2 phases, full orchestration)

**Testing approach:**
1. Clean environment (remove stale teams/tasks/sessions)
2. Rebuild binaries: `cargo build -p tina-session -p tina-daemon`
3. Restart daemon: `tina-session daemon stop && tina-session daemon start`
4. Run harness with `--full` and `--verify` flags
5. Check Convex queries for expected data
6. Validate timing (commits/plans/shutdowns within SLA)

**Success criteria:**
- Scenario completes without errors
- All Convex validations pass (orchestration, phases, commits, plans, events)
- Timing requirements met (< 10s for commits, < 5s for plans/shutdowns)

**Dependencies:** Task 4.1 (UI tests ensure components work before E2E)

**Estimated time:** 120 minutes (2 hours)

---

### Task 4.3: Documentation Updates

**Files:**
- `/Users/joshua/Projects/tina/CLAUDE.md` (update)
- `/Users/joshua/Projects/tina/tina-web/README.md` (update)
- `/Users/joshua/Projects/tina/docs/features/git-teams-tasks-plans-tracking.md` (new)

**Changes:**

#### CLAUDE.md (update Architecture section)

Add to "Key File Locations" table:
```markdown
| Git commits (Convex) | `convex/commits.ts` (commits table) |
| Plans (Convex) | `convex/plans.ts` (plans table) |
| Shutdown events | `orchestrationEvents` table (eventType: "agent_shutdown") |
```

Add to "Convex (Serverless Backend)" section:
```markdown
**Real-time features:**
- Git commits synced from worktree `.git/refs/heads/{branch}` via tina-daemon
- Plan files synced from `{worktree}/docs/plans/*.md` via tina-daemon
- Team member shutdowns detected via team config diffs, recorded as events
- All data flows through Convex subscriptions (no polling)
```

#### tina-web/README.md (update)

Add "Features" section:
```markdown
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
```

Add "Architecture" section:
```markdown
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
```

#### docs/features/git-teams-tasks-plans-tracking.md (new)

```markdown
# Git, Teams, Tasks & Plans Tracking

## Overview

tina-web provides real-time visibility into orchestration execution:
- Git commits appear as they happen
- Plan files sync automatically
- Team member lifecycle tracked (active → idle → shutdown)
- Task descriptions rendered with markdown and syntax highlighting

All features powered by tina-daemon filesystem watching + Convex cloud DB.

## Git Commit Tracking

### How It Works

1. **tina-daemon watches** `.git/refs/heads/{branch}` for each active worktree
2. **On ref change**, parses new commits via `git log`
3. **Records to Convex** via `commits:recordCommit` mutation
4. **tina-web displays** commits in real-time (< 5s latency)

### Data Model

**Convex table:** `commits`

```typescript
{
  orchestrationId: Id<"orchestrations">,
  phaseNumber: string,            // "1", "2", etc.
  sha: string,                    // full SHA
  shortSha: string,               // 7-char SHA
  subject: string,                // commit message first line
  author: string,                 // "Name <email>"
  timestamp: string,              // ISO 8601
  insertions: number,             // lines added
  deletions: number,              // lines removed
  recordedAt: string,             // when synced to Convex
}
```

### UI Components

**CommitListPanel** - Display commit list (grouped by phase if orchestration view)
- Props: `orchestrationId`, `phaseNumber?` (optional)
- Query: `api.commits.listCommits`
- Renders: `[shortSha] subject - author (relative time) +ins -dels`

**CommitQuicklook** - Commit detail modal
- Extends `QuicklookDialog` pattern
- Shows full SHA (copyable), message, author, timestamp, stats
- Future: Full diff view

### Usage

**View commits for a phase:**
```tsx
<CommitListPanel orchestrationId={id} phaseNumber="1" />
```

**View all commits for orchestration:**
```tsx
<CommitListPanel orchestrationId={id} />
```

## Plan File Syncing

### How It Works

1. **tina-daemon watches** `{worktree}/docs/plans/*.md` for each active orchestration
2. **On file change**, reads full content
3. **Extracts phase number** from filename: `YYYY-MM-DD-{feature}-phase-{N}.md`
4. **Syncs to Convex** via `plans:upsertPlan` mutation
5. **tina-web displays** plan content in modal (< 3s latency)

### Data Model

**Convex table:** `plans`

```typescript
{
  orchestrationId: Id<"orchestrations">,
  phaseNumber: string,
  planPath: string,               // "docs/plans/2026-02-10-feature-phase-1.md"
  content: string,                // full markdown content
  lastSynced: string,             // ISO 8601 timestamp
}
```

### UI Components

**PlanQuicklook** - Plan markdown viewer modal
- Props: `orchestrationId`, `phaseNumber`, `onClose`
- Query: `api.plans.getPlan`
- Renders markdown with:
  - GitHub Flavored Markdown (tables, task lists, strikethrough)
  - Syntax highlighting for code blocks (language-specific)
  - Custom styles for headings, lists, blockquotes

### Usage

**Open plan modal from PhaseQuicklook:**
```tsx
const [showPlan, setShowPlan] = useState(false);

<button onClick={() => setShowPlan(true)}>
  {planFileName}
</button>

{showPlan && (
  <PlanQuicklook
    orchestrationId={id}
    phaseNumber="1"
    onClose={() => setShowPlan(false)}
  />
)}
```

## Team Member Shutdown Tracking

### How It Works

1. **tina-daemon caches** previous team member state (HashMap keyed by agent_name)
2. **On team config change**, compares current vs previous members
3. **Detects removals** (members in previous but not current)
4. **Records event** to Convex via `events:recordEvent` mutation (eventType: "agent_shutdown")
5. **tina-web displays** shutdown status (< 5s latency)

### Data Model

**Convex table:** `orchestrationEvents` (existing, new event type)

```typescript
{
  eventType: "agent_shutdown",
  summary: "executor-3 shutdown",
  detail: JSON.stringify({
    agent_name: "executor-3",
    agent_type: "tina:phase-executor",
    shutdown_detected_at: "2026-02-10T20:30:00Z",
  }),
}
```

### UI Components

**TeamSection** - Team member list with status
- Queries shutdown events: `api.events.listEvents` (filtered by eventType)
- Builds shutdown map: `{ [agentName]: timestamp }`
- Updates member status: active, idle, or shutdown

**team-member.tsx** - Individual member display
- Status rendering:
  - **Active:** Green dot, "ACTIVE" label
  - **Idle:** Yellow dot, "IDLE" label
  - **Shutdown:** Gray dot (opacity 20%), "SHUTDOWN" label, gray text

### Usage

Shutdown status updates automatically — no manual integration needed. When an agent is removed from the team config, tina-daemon detects it and records the event.

## Task Description Markdown

### How It Works

1. **No schema changes** - `taskEvents.description` field already exists
2. **tina-web renders** description with `react-markdown` instead of plain text
3. **Supports:**
   - Headings, paragraphs, lists
   - Code blocks with syntax highlighting
   - Inline code, bold, italic, links
   - Tables, task lists, strikethrough (GFM)

### UI Components

**TaskQuicklook** - Task detail modal with markdown rendering
- Uses `ReactMarkdown` with `remark-gfm` plugin
- Code blocks rendered via `react-syntax-highlighter` (oneDark theme)
- Styles shared with `PlanQuicklook` (consistent formatting)

### Usage

**Write tasks with markdown descriptions:**
```typescript
const task = {
  description: `## Task: Implement Feature X

Create the following components:
- \`FeatureX.tsx\` - Main component
- \`FeatureX.test.tsx\` - Unit tests

**Acceptance criteria:**
- [ ] Component renders correctly
- [ ] Tests pass

**Example:**
\`\`\`typescript
<FeatureX value={42} />
\`\`\`
`,
};
```

Task descriptions render automatically with markdown formatting in `TaskQuicklook`.

## Testing

### Unit Tests

**Component tests:**
- `TeamSection.test.tsx` - Shutdown status mapping
- `CommitListPanel.test.tsx` - Commit grouping and display
- `PlanQuicklook.test.tsx` - Markdown rendering
- `TaskQuicklook.test.tsx` - Task description markdown

**Run tests:**
```bash
cd tina-web && npm test
```

### E2E Tests

**Harness scenario:** `07-tina-web-phase-2-integration`
- Validates all four features end-to-end
- Checks Convex for commits, plans, shutdown events, markdown tasks
- Ensures timing requirements met (< 10s for commits, < 5s for plans/shutdowns)

**Run scenario:**
```bash
# Mock mode (fast)
mise run harness:run 07-tina-web-phase-2-integration

# Full orchestration (~25 min)
mise run harness:run 07-tina-web-phase-2-integration -- --full --verify
```

## Troubleshooting

**Commits not appearing in UI:**
1. Check tina-daemon is running: `tina-session daemon status`
2. Verify worktree path in supervisor state: `cat .claude/tina/supervisor-state.json`
3. Check daemon logs for git watcher errors
4. Ensure commits made on correct branch (matches orchestration branch)

**Plans not syncing:**
1. Verify plan files in `docs/plans/` directory
2. Check filename matches pattern: `YYYY-MM-DD-{feature}-phase-{N}.md`
3. Verify tina-daemon watching worktree (check logs)
4. Manually trigger sync by touching plan file: `touch docs/plans/plan.md`

**Shutdown events not recorded:**
1. Verify team config changes detected by daemon (check logs)
2. Ensure agent removed from `members` array in team JSON
3. Check orchestration ID cached by daemon (must exist before sync)
4. Query Convex directly: `npx convex query events:listEvents '{"eventType":"agent_shutdown"}'`

**Markdown not rendering:**
1. Check dependencies installed: `npm list react-markdown remark-gfm react-syntax-highlighter`
2. Verify markdown content valid (no broken syntax)
3. Check browser console for errors
4. Test with simple markdown: `"# Test"` should render as h1

## Future Enhancements

1. **Commit diff viewing** - Store and display full diff content
2. **Plan editing in UI** - Bidirectional sync (Convex → filesystem)
3. **Commit filtering** - Filter by author, date range, file path
4. **Plan version history** - Track content changes over time
5. **Task description editor** - Edit markdown in UI with live preview
6. **Performance optimization** - Virtualization for long commit lists
```

**Success criteria:**
- CLAUDE.md updated with new features
- tina-web README documents architecture and features
- Feature guide provides detailed usage instructions and troubleshooting
- All examples tested and verified correct

**Dependencies:** Task 4.2 (E2E scenario validates features work as documented)

**Estimated time:** 90 minutes (1.5 hours)

---

## Success Criteria

**Testing:**
1. ✅ All UI component tests pass (100% of new tests)
2. ✅ Coverage > 80% for new components (TeamSection, CommitListPanel, PlanQuicklook, TaskQuicklook)
3. ✅ E2E harness scenario passes with all Convex validations
4. ✅ No regressions in existing tests (21/21 Convex tests still passing)

**Documentation:**
5. ✅ CLAUDE.md updated with new features in architecture section
6. ✅ tina-web README documents data flow, UI patterns, components
7. ✅ Feature guide created with usage examples and troubleshooting
8. ✅ All code examples in docs tested and verified correct

**Quality:**
9. ✅ Tests follow existing patterns (vitest, @testing-library/react)
10. ✅ Documentation clear, concise, accurate
11. ✅ No broken links or outdated references
12. ✅ Feature guide reviewed for completeness

## Estimated Time

- Task 4.1: UI Component Unit Tests - 180 min (3 hours)
- Task 4.2: E2E Harness Scenario - 120 min (2 hours)
- Task 4.3: Documentation Updates - 90 min (1.5 hours)

**Total: ~390 minutes (~6.5 hours)**

## Dependencies

**Requires (completed):**
- ✅ Phase 1: Convex schema + functions + tests
- ✅ Phase 1.5: Schema validation
- ✅ Phase 2: Team member removal detection
- ✅ Phase 2.5: Git & plan watchers
- ✅ Phase 2.5.5: Daemon integration complete
- ✅ Phase 3: All UI components implemented

**Enables (future):**
- Phase 5+ (future features, refinements)
- Production deployment (fully tested and documented)
- Developer onboarding (clear docs for new contributors)

## Rollback Plan

All changes are additive (tests + docs), minimal risk:

**Scenario 1: Tests fail unexpectedly**
- Review test logic for errors
- Fix implementation bugs if found
- Update tests if requirements changed
- Do NOT skip failing tests

**Scenario 2: E2E scenario times out**
- Increase timeout (may need 30+ min for full orchestration)
- Check daemon and Convex connectivity
- Verify tina-session/tina-daemon binaries rebuilt
- Review logs for bottlenecks

**Scenario 3: Documentation inaccuracies**
- Test all code examples manually
- Update docs to match actual behavior
- Add troubleshooting section for common issues
- Review with fresh eyes (pretend you're new to project)

No production impact — all changes are tests and docs only.

## Follow-Up Work (Not in This Phase)

1. **Visual regression tests** - Storybook + Chromatic for component snapshots
2. **Performance tests** - Measure commit list rendering with 1000+ commits
3. **Accessibility audit** - WCAG 2.1 AA compliance for new components
4. **User guide** - Step-by-step walkthrough for end users (non-developers)
5. **API documentation** - JSDoc comments for all exported functions/types

## Notes

**Key design decisions:**

- **Test organization:** Follow existing pattern (one test file per component in `__tests__/` directory)
- **Mock strategy:** Mock Convex hooks, not implementation details (test behavior, not internals)
- **E2E scope:** Validate data flow end-to-end (tina-daemon → Convex → tina-web), not UI interactions
- **Documentation style:** Clear, concise, example-driven (code snippets over prose)
- **Feature guide format:** Overview → How It Works → Data Model → UI Components → Usage → Troubleshooting

**Patterns followed:**

- vitest + @testing-library/react for UI tests (matches existing tests)
- tina-harness for E2E validation (matches orchestration testing pattern)
- Markdown format for documentation (matches existing docs)
- Code examples with syntax highlighting (helps readability)
- Troubleshooting sections (reduces support burden)

**Integration with existing code:**

- Tests use existing mocks and fixtures (`vi.mock()`, `render()`)
- Harness scenario follows `01-single-phase-feature` pattern
- Documentation updates extend existing CLAUDE.md structure
- Feature guide matches style of other `docs/` files

**Quality assurance:**

- All test assertions specific and meaningful (not just "renders without crashing")
- Documentation examples tested manually before committing
- E2E scenario validates real orchestration flow (not just mocks)
- No copy-paste errors (each test unique and purposeful)
