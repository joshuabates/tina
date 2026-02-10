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
4. **tina-web displays** commits in real-time (< 10s latency)

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
5. **tina-web displays** plan content in modal (< 5s latency)

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
