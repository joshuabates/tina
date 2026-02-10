# tina-web Phase 2: Git, Teams, Tasks & Plans

## Overview

This phase adds four interconnected features to tina-web, enhancing visibility into orchestration execution:

1. **Team member lifecycle tracking** - Show when agents shut down, distinguish from active/idle
2. **Git commit tracking** - Display commits in real-time as they happen during execution
3. **Plan viewing** - Open plan files in markdown modal from the UI
4. **Task description markdown** - Render task descriptions with GFM and syntax highlighting

All features follow the existing Convex-based real-time architecture with tina-daemon handling filesystem watching and sync.

## Goals

- Real-time visibility into agent lifecycle (active → shutdown)
- Git commit history viewable per-phase and orchestration-wide
- Plan content accessible from UI without leaving the browser
- Richer task descriptions with formatted markdown
- No breaking changes to existing orchestration workflows

## Architecture Overview

### 1. Team Member Lifecycle Tracking

- New event type: `agent_shutdown` in `orchestrationEvents` table
- tina-daemon detects member removal from team config, records shutdown event
- UI displays member status: active, idle, or shutdown (visually distinct)
- Shutdown members remain visible but grayed out with "SHUTDOWN" badge

### 2. Git Commit Tracking

- New `commits` table in Convex schema
- tina-daemon watches `.git/refs/heads/{branch}` in each active worktree
- On ref change, parses new commits via `git log`, records to Convex immediately
- tina-daemon discovers active worktrees via orchestration state (worktree_path + branch)
- UI shows commits in real-time, grouped by phase with orchestration rollup view
- Commits are clickable - opens modal with full commit details and diff (syntax highlighted)

### 3. Plan Viewing

- New `plans` table in Convex
- tina-daemon watches `{worktree}/docs/plans/` directories, syncs plan content to Convex on file changes
- Bidirectional sync (future): changes in Convex propagate back to filesystem
- UI renders plan links as clickable, opens modal with markdown (react-markdown + remark-gfm + syntax highlighting)
- Transparent sync layer: agents write to filesystem as usual, daemon keeps Convex in sync

### 4. Task Description Markdown

- No schema changes (description field already exists)
- UI update: replace plain text rendering with react-markdown + syntax highlighting
- Minimal change, big UX improvement

**Data Flow:**
```
Team configs → tina-daemon (detects removals) → Convex (shutdown events) → tina-web
Git commits → tina-daemon (watches refs) → Convex (commits) → tina-web
Plan files → tina-daemon (watches docs/plans) → Convex (plans) → tina-web
Task descriptions → Convex → tina-web (markdown rendering)
```

## Convex Schema Changes

### New Tables

**commits**
```typescript
commits: defineTable({
  orchestrationId: v.id("orchestrations"),
  phaseNumber: v.string(),                    // "1", "2", etc.
  sha: v.string(),                            // full SHA
  shortSha: v.string(),                       // 7-char SHA
  subject: v.string(),                        // commit message first line
  author: v.string(),                         // "Jane Doe <jane@example.com>"
  timestamp: v.string(),                      // ISO 8601
  insertions: v.number(),                     // lines added
  deletions: v.number(),                      // lines removed
  recordedAt: v.string(),                     // when synced to Convex
})
  .index("by_orchestration", ["orchestrationId"])
  .index("by_phase", ["orchestrationId", "phaseNumber"])
  .index("by_sha", ["sha"]);                  // prevent duplicates
```

**plans**
```typescript
plans: defineTable({
  orchestrationId: v.id("orchestrations"),
  phaseNumber: v.string(),
  planPath: v.string(),                       // "docs/plans/2026-02-10-feature-phase-1.md"
  content: v.string(),                        // full markdown content
  lastSynced: v.string(),                     // ISO 8601 timestamp
})
  .index("by_orchestration", ["orchestrationId"])
  .index("by_phase", ["orchestrationId", "phaseNumber"])
  .index("by_path", ["planPath"]);            // lookup by path
```

### Updated Tables

**orchestrationEvents** (existing, new event types)
- Add event type: `"agent_shutdown"`
- Schema unchanged (uses existing `eventType`, `summary`, `detail` fields)
- Example:
  ```json
  {
    "eventType": "agent_shutdown",
    "summary": "executor-3 shutdown",
    "detail": "{\"agent_name\":\"executor-3\",\"agent_type\":\"tina:phase-executor\",\"shutdown_detected_at\":\"2026-02-10T20:30:00Z\"}"
  }
  ```

**taskEvents** (existing, no schema changes)
- Description field already supports markdown - only rendering changes in UI

## tina-daemon Implementation

### Team Member Change Detection

**Enhance existing team sync** (`sync.rs::sync_team_members`):

```rust
// Add cache to track previous state
struct TeamCache {
    members: HashMap<String, Agent>,  // agent_name -> Agent
    last_synced: SystemTime,
}

// On team config change:
fn sync_team_members(&mut self, team_config: &Team) -> Result<()> {
    let team_name = &team_config.name;
    let current_members: HashMap<_, _> = team_config.members
        .iter()
        .map(|m| (m.name.clone(), m.clone()))
        .collect();

    // Get previous state from cache
    let previous_members = self.team_cache
        .get(team_name)
        .map(|c| &c.members)
        .cloned()
        .unwrap_or_default();

    // Detect removals
    for (name, agent) in &previous_members {
        if !current_members.contains_key(name) {
            // Member was removed - record shutdown event
            self.record_shutdown_event(team_name, agent)?;
        }
    }

    // Sync current members to Convex (existing logic)
    for member in &team_config.members {
        self.upsert_team_member(member)?;
    }

    // Update cache
    self.team_cache.insert(team_name.clone(), TeamCache {
        members: current_members,
        last_synced: SystemTime::now(),
    });

    Ok(())
}

fn record_shutdown_event(&self, team_name: &str, agent: &Agent) -> Result<()> {
    let orchestration_id = self.get_orchestration_id(team_name)?;
    let phase = self.extract_phase_from_team_name(team_name);

    let event = OrchestrationEventRecord {
        orchestration_id,
        phase_number: phase,
        event_type: "agent_shutdown".to_string(),
        source: "tina-daemon".to_string(),
        summary: format!("{} shutdown", agent.name),
        detail: Some(serde_json::json!({
            "agent_name": agent.name,
            "agent_type": agent.agent_type,
            "shutdown_detected_at": chrono::Utc::now().to_rfc3339(),
        }).to_string()),
        recorded_at: chrono::Utc::now().to_rfc3339(),
    };

    self.convex_writer.record_event(&event)?;
    Ok(())
}
```

### Git Commit Watcher

**Discovery:**
- Query Convex for active orchestrations (status != Complete)
- Extract `worktree_path` and `branch` from supervisor state
- Build watch list: `{worktree_path}/.git/refs/heads/{branch}`

**Watching:**
- Use existing FSEvents/inotify mechanism (same as teams/tasks)
- Watch `.git/refs/heads/{branch}` file for each active orchestration
- On change, run `git log {last_known_sha}..HEAD --numstat --format=%H|%h|%s|%an <%ae>|%aI`
- Parse output, create commit record for each new commit
- Call Convex mutation `commits:recordCommit` for each

**Deduplication:**
- Check `by_sha` index before inserting
- Skip if commit already recorded (handles rebase/force-push edge cases)

**Phase Attribution:**
- Commits belong to current phase at time of commit
- Query supervisor state to get `current_phase` for orchestration
- Store as `phaseNumber` in commit record

### Plan File Watcher

**Discovery:**
- Same orchestration query as git watcher
- Build watch list: `{worktree_path}/docs/plans/*.md` for each orchestration

**Watching:**
- Watch all `.md` files in `docs/plans/` directory
- On file change (create/modify), read full content
- Extract phase number from filename pattern: `YYYY-MM-DD-{feature}-phase-{N}.md`
- Call Convex mutation `plans:upsertPlan` with content

**Bidirectional Sync (future):**
- Subscribe to Convex changes on `plans` table
- If `content` updated in Convex, write back to filesystem
- Conflict resolution: Convex wins (it's the source of truth)

## UI Components

### 1. Team Member Status (Updated)

**TeamSection.tsx changes:**
- Query `orchestrationEvents` filtered by `eventType: "agent_shutdown"`
- Build shutdown map: `{ [agentName]: timestamp }`
- Update `mapTeamMember` status logic:
  ```typescript
  const shutdownTime = shutdownMap[member.agentName]
  const memberStatus: MemberStatus = shutdownTime
    ? "shutdown"              // new status
    : memberPhaseNum === activePhase
      ? "active"
      : "idle"
  ```

**team-member.tsx changes:**
- Add `"shutdown"` to `MemberStatus` type
- Render: Gray dot (opacity 20%), "SHUTDOWN" label, gray text
- Show tooltip with shutdown timestamp on hover

### 2. Git Commit Display (New)

**CommitListPanel.tsx** (new component)
- Props: `orchestrationId`, `phaseNumber?: string` (optional - if omitted, shows all commits)
- Query: `useTypedQuery(api.commits.listCommits, { orchestrationId, phaseNumber })`
- Renders commit list grouped by phase (if orchestration view)
- Each commit: `[shortSha] subject - author (relative time) +ins -dels`
- Click opens `CommitQuicklook` modal

**CommitQuicklook.tsx** (new component)
- Extends `QuicklookDialog` pattern
- Shows: full SHA, subject, author, timestamp, stats
- Fetches diff via new query: `useTypedQuery(api.commits.getCommitDiff, { orchestrationId, sha })`
- Renders diff with syntax highlighting (react-syntax-highlighter + diff language)
- Copy SHA button

**Integration:**
- Add "Commits" tab to `PhaseQuicklook` (shows phase commits)
- Add "Git" section to `OrchestrationPage` sidebar (shows all commits, click filters to phase)

### 3. Plan Viewer Modal (New)

**PlanQuicklook.tsx** (new component)
- Extends `QuicklookDialog` pattern
- Props: `orchestrationId`, `phaseNumber`
- Query: `useTypedQuery(api.plans.getPlan, { orchestrationId, phaseNumber })`
- Renders markdown content with:
  - `react-markdown` for parsing
  - `remark-gfm` plugin for GitHub Flavored Markdown (tables, strikethrough, task lists)
  - `react-syntax-highlighter` for code blocks (language-specific highlighting)
  - Custom styles for markdown elements (headings, lists, code blocks)

**PlanQuicklook.module.scss:**
```scss
.content {
  h1, h2, h3 { margin-top: 1.5em; }
  code { background: hsl(var(--muted)); padding: 0.2em 0.4em; }
  pre { background: hsl(var(--muted)); padding: 1em; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid hsl(var(--border)); padding: 0.5em; }
}
```

**Integration:**
- Update `PhaseQuicklook.tsx` plan section:
  ```tsx
  <button onClick={() => setShowPlan(true)}>
    {planFileName}
  </button>
  {showPlan && <PlanQuicklook orchestrationId={...} phaseNumber={...} onClose={...} />}
  ```

### 4. Task Description Markdown (Updated)

**TaskQuicklook.tsx changes:**
- Install: `npm install react-markdown remark-gfm react-syntax-highlighter @types/react-syntax-highlighter`
- Replace plain text rendering:
  ```tsx
  import ReactMarkdown from 'react-markdown'
  import remarkGfm from 'remark-gfm'
  import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
  import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      code({ node, inline, className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '')
        return !inline && match ? (
          <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div">
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        ) : (
          <code className={className} {...props}>{children}</code>
        )
      }
    }}
  >
    {task.description}
  </ReactMarkdown>
  ```

**Styling:**
- Reuse `.content` styles from PlanQuicklook for consistency

## Convex Functions

### commits.ts (new file)

**Mutations:**
```typescript
export const recordCommit = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    sha: v.string(),
    shortSha: v.string(),
    subject: v.string(),
    author: v.string(),
    timestamp: v.string(),
    insertions: v.number(),
    deletions: v.number(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate by SHA
    const existing = await ctx.db
      .query("commits")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("commits", {
      ...args,
      recordedAt: new Date().toISOString(),
    });
  },
});
```

**Queries:**
```typescript
export const listCommits = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("commits")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      );

    const commits = await q.collect();

    return args.phaseNumber
      ? commits.filter(c => c.phaseNumber === args.phaseNumber)
      : commits;
  },
});

export const getCommitDiff = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    sha: v.string(),
  },
  handler: async (ctx, args) => {
    const commit = await ctx.db
      .query("commits")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();

    if (!commit) return null;

    // Note: Diff content needs to be stored separately or fetched via tina-daemon
    // For now, return commit metadata - diff fetching is a follow-up enhancement
    return commit;
  },
});
```

### plans.ts (new file)

**Mutations:**
```typescript
export const upsertPlan = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    planPath: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_phase", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
         .eq("phaseNumber", args.phaseNumber)
      )
      .first();

    const lastSynced = new Date().toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        planPath: args.planPath,
        lastSynced,
      });
      return existing._id;
    }

    return await ctx.db.insert("plans", { ...args, lastSynced });
  },
});
```

**Queries:**
```typescript
export const getPlan = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plans")
      .withIndex("by_phase", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
         .eq("phaseNumber", args.phaseNumber)
      )
      .first();
  },
});
```

### events.ts (existing, no changes)

- `recordEvent` mutation already supports arbitrary event types
- Shutdown events use existing infrastructure

## Testing Strategy

### 1. Convex Function Tests

**convex/commits.test.ts:**
- Test `recordCommit` deduplication (same SHA twice)
- Test `listCommits` filtering by phase
- Test `listCommits` without phase filter (all commits)

**convex/plans.test.ts:**
- Test `upsertPlan` creates new plan
- Test `upsertPlan` updates existing plan (same orchestration + phase)
- Test `getPlan` returns correct plan for phase

**convex/events.test.ts** (existing file, add):
- Test recording `agent_shutdown` event type
- Test filtering events by `eventType: "agent_shutdown"`

### 2. tina-daemon Tests

**tina-daemon/src/sync.rs tests:**
- Test member removal detection (mock team config change)
- Test shutdown event recording when member removed
- Test cache initialization (no false positives on first sync)
- Test git ref watcher discovers worktrees from Convex
- Test git commit parsing and recording
- Test plan file watcher syncs content on change

**Mock fixtures:**
- Create test team configs with member arrays
- Simulate file changes (team config, git refs, plan files)
- Verify Convex mutations called with correct data

### 3. UI Component Tests

**tina-web/src/components/__tests__/TeamSection.test.tsx** (existing, update):
- Test shutdown status rendering (gray badge)
- Test shutdown member appears in list but visually distinct
- Test hover shows shutdown timestamp

**tina-web/src/components/__tests__/CommitListPanel.test.tsx** (new):
- Test commit list renders with phase grouping
- Test commit click opens CommitQuicklook modal
- Test phase filter shows only relevant commits

**tina-web/src/components/__tests__/PlanQuicklook.test.tsx** (new):
- Test markdown rendering (headings, code blocks, tables)
- Test syntax highlighting in code blocks
- Test plan loading state and error handling

**tina-web/src/components/__tests__/TaskQuicklook.test.tsx** (existing, update):
- Test markdown rendering in description field
- Test code block syntax highlighting
- Test GFM features (tables, task lists, strikethrough)

### 4. E2E Scenario Tests (tina-harness)

**New scenario: `06-git-plans-teams-tracking`**
- Design doc with 2 phases
- Expected results:
  ```json
  {
    "convex": {
      "min_commits": 2,
      "min_plans": 2,
      "min_shutdown_events": 2,
      "has_markdown_task": true
    }
  }
  ```
- Validates:
  - Commits appear in Convex during execution (not just after)
  - Plans synced and readable via query
  - Shutdown events recorded when agents removed from team
  - Task descriptions render as markdown in UI

## Implementation Plan

### Phase 1: Foundation (Schema + Convex)

**Task 1.1: Add Convex schema tables** (30 min)
- Add `commits` table with indexes
- Add `plans` table with indexes
- Run `npx convex dev` to apply schema changes
- **Dependencies:** None
- **Blocker for:** All other tasks

**Task 1.2: Implement commits.ts functions** (45 min)
- Write `recordCommit` mutation with deduplication
- Write `listCommits` query with phase filtering
- Write `getCommitDiff` query (metadata only for now)
- Add tests in `convex/commits.test.ts`
- **Dependencies:** Task 1.1
- **Blocker for:** Task 2.2, Task 3.2

**Task 1.3: Implement plans.ts functions** (30 min)
- Write `upsertPlan` mutation
- Write `getPlan` query
- Add tests in `convex/plans.test.ts`
- **Dependencies:** Task 1.1
- **Blocker for:** Task 2.3, Task 3.3

**Task 1.4: Test shutdown events in events.ts** (15 min)
- Add tests for `agent_shutdown` event type (no code changes needed)
- Verify existing `recordEvent` handles it correctly
- **Dependencies:** Task 1.1
- **Blocker for:** Task 2.1

### Phase 2: Data Collection (tina-daemon)

**Task 2.1: Team member removal detection** (60 min)
- Add `TeamCache` struct to track previous member state
- Update `sync_team_members` to detect removals
- Implement `record_shutdown_event` function
- Add unit tests for member removal detection
- **Dependencies:** Task 1.4
- **Blocker for:** Task 3.1

**Task 2.2: Git commit watcher** (90 min)
- Add worktree discovery from Convex orchestration state
- Implement git ref file watcher (`.git/refs/heads/{branch}`)
- Parse `git log` output on ref change
- Call `recordCommit` mutation for each new commit
- Add unit tests with mock git repos
- **Dependencies:** Task 1.2
- **Blocker for:** Task 3.2

**Task 2.3: Plan file watcher** (60 min)
- Add plan directory watcher (`{worktree}/docs/plans/*.md`)
- Read file content on change
- Extract phase number from filename
- Call `upsertPlan` mutation
- Add unit tests with mock plan files
- **Dependencies:** Task 1.3
- **Blocker for:** Task 3.3

### Phase 3: UI Components

**Task 3.1: Update TeamSection for shutdown status** (45 min)
- Query shutdown events from Convex
- Build shutdown map in component state
- Update `mapTeamMember` status logic
- Add "shutdown" status to `team-member.tsx`
- Style shutdown members (gray, low opacity)
- Add tests in `TeamSection.test.tsx`
- **Dependencies:** Task 2.1

**Task 3.2: Implement commit display components** (120 min)
- Install react-syntax-highlighter dependencies
- Create `CommitListPanel.tsx` component
- Create `CommitQuicklook.tsx` modal
- Add commit list to `PhaseQuicklook` (tab or section)
- Add git section to `OrchestrationPage`
- Style commit list and modal
- Add tests in `CommitListPanel.test.tsx`
- **Dependencies:** Task 2.2

**Task 3.3: Implement plan viewer modal** (90 min)
- Install react-markdown, remark-gfm dependencies
- Create `PlanQuicklook.tsx` component
- Configure markdown rendering with syntax highlighting
- Add styles in `PlanQuicklook.module.scss`
- Update `PhaseQuicklook` to make plan link clickable
- Add tests in `PlanQuicklook.test.tsx`
- **Dependencies:** Task 2.3

**Task 3.4: Add markdown to task descriptions** (30 min)
- Update `TaskQuicklook.tsx` to use ReactMarkdown
- Configure syntax highlighting for code blocks
- Reuse styles from PlanQuicklook
- Update tests in `TaskQuicklook.test.tsx`
- **Dependencies:** Task 3.3 (shares markdown config)

### Phase 4: Testing & Documentation

**Task 4.1: E2E harness scenario** (60 min)
- Create `06-git-plans-teams-tracking` scenario
- Write design doc with 2 phases
- Add expected.json with Convex validation
- Run scenario in `--full` mode
- Verify all features work end-to-end
- **Dependencies:** All Phase 3 tasks

**Task 4.2: Update documentation** (30 min)
- Update CLAUDE.md with new features
- Document plan sync behavior
- Document shutdown tracking mechanism
- Add examples to tina-web README
- **Dependencies:** Task 4.1

## Success Metrics

**Quantifiable goals:**

1. **Real-time commit tracking:** Commits appear in tina-web UI within 5 seconds of git commit in worktree
2. **Plan sync latency:** Plan content updates in Convex within 3 seconds of file save
3. **Shutdown event accuracy:** 100% of agent shutdowns recorded as events (validated via team config comparison)
4. **Test coverage:** All new Convex functions have 100% test coverage
5. **E2E validation:** Harness scenario passes with all Convex validations (min_commits, min_plans, min_shutdown_events)
6. **UI responsiveness:** Plan modal opens in < 500ms, commit quicklook in < 300ms

**Measurement approach:**
- Baseline: No commit/plan/shutdown tracking exists today
- Validation: Run `06-git-plans-teams-tracking` scenario, measure timing with instrumentation
- Acceptance: All metrics met in `--full` harness run

## Summary

**Total estimated time:** ~12 hours

**Critical path:**
1. Schema (Task 1.1) → Convex functions (Tasks 1.2-1.4)
2. tina-daemon watchers (Tasks 2.1-2.3)
3. UI components (Tasks 3.1-3.4)
4. E2E validation (Task 4.1)

**Parallelization opportunities:**
- After Task 1.1, Tasks 1.2-1.4 can run in parallel
- After Phase 1, Tasks 2.1-2.3 can run in parallel
- After Phase 2, Tasks 3.1-3.4 can run partially in parallel (3.4 depends on 3.3)

**Key design decisions:**
- Transparent plan sync via tina-daemon (agents unaware of Convex)
- Passive shutdown tracking (daemon detects removals, no explicit calls)
- Real-time git commit tracking (watch refs, not batch at phase end)
- Markdown rendering with syntax highlighting for plans and tasks
