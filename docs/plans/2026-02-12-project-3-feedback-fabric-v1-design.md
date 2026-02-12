# Project 3 Design: Feedback Fabric v1 (Orchestration-First)

## Status

Drafted on 2026-02-12.
Current state on 2026-02-12: Project 2 complete; Project 3 not started.

## Context

Project 1 established canonical PM entities and comments for design/ticket workflows. Project 2 completed launch/control-plane foundations for orchestration operations. Project 3 introduces first-class feedback for running orchestration artifacts without coupling to mid-flight remediation insertion logic.

The roadmap now treats feedback as one project with internal phases:
- Phase 1 (this document): feedback capture, traceability, and realtime visibility
- Phase 2: triage/remediation wiring from blocking feedback to follow-up task execution

## Locked Scope Decisions

- Target strategy: orchestration-first
- v1 targets: `task` and `commit`
- Feedback types: `comment`, `suggestion`, `ask_for_change`
- Creators: humans (Tina UI) and agents (API/CLI)
- Data model: new table (`feedbackEntries`), no overloading `workComments`
- Status model: `open` / `resolved` with `resolvedBy`, `resolvedAt`
- Blocking behavior: visibility-only for open `ask_for_change`
- Activity stream: single orchestration-scoped realtime stream with filters
- Reference model: strict typed refs validated against orchestration data

## Goals

1. Make feedback on runtime work first-class and queryable.
2. Keep feedback traceable to concrete orchestration artifacts.
3. Let humans and agents collaborate on feedback in the same canonical store.
4. Provide clear unresolved/resolved blocking visibility before Phase 2 remediation wiring.

## Non-Goals (Project 3)

- Automatic remediation task generation from feedback.
- Automatic control-plane actions (pause/enqueue) on feedback creation.
- Global inbox workflow as a required v1 surface.
- Expanding target coverage beyond `task` and `commit`.

## Data Model

Add `feedbackEntries` to `convex/schema.ts`:

- `orchestrationId: Id<"orchestrations">`
- `targetType: "task" | "commit"`
- `targetTaskId?: string`
- `targetCommitSha?: string`
- `entryType: "comment" | "suggestion" | "ask_for_change"`
- `body: string`
- `authorType: "human" | "agent"`
- `authorName: string`
- `status: "open" | "resolved"`
- `resolvedBy?: string`
- `resolvedAt?: string`
- `createdAt: string`
- `updatedAt: string`

Validation invariants:
- Exactly one target field must be set based on `targetType`.
- Target must exist under the same `orchestrationId`.
- `ask_for_change` is blocking only while `status = "open"`.

Recommended indexes:
- `by_orchestration_created` -> `["orchestrationId", "createdAt"]`
- `by_orchestration_status_created` -> `["orchestrationId", "status", "createdAt"]`
- `by_orchestration_target_created` -> `["orchestrationId", "targetType", "createdAt"]`
- `by_orchestration_type_status` -> `["orchestrationId", "entryType", "status"]`
- `by_target_status_created` -> `["targetType", "targetTaskId", "status", "createdAt"]` (task path)
- `by_target_commit_status_created` -> `["targetType", "targetCommitSha", "status", "createdAt"]` (commit path)

## API Contract (Convex)

Create `convex/feedbackEntries.ts`:

- `createFeedbackEntry` (mutation)
- `resolveFeedbackEntry` (mutation)
- `reopenFeedbackEntry` (mutation)
- `listFeedbackEntriesByOrchestration` (query, filterable)
- `listFeedbackEntriesByTarget` (query)
- `getBlockingFeedbackSummary` (query)

Behavior:
- `createFeedbackEntry` performs strict target validation:
  - `task`: validate target task is present for orchestration.
  - `commit`: validate SHA exists under orchestration commits.
- `resolveFeedbackEntry` sets `status=resolved`, `resolvedBy`, `resolvedAt`, updates `updatedAt`.
- `reopenFeedbackEntry` clears resolution metadata and sets `status=open`.
- Listing endpoints support filters:
  - `targetType`
  - `targetRef` (`taskId` or `commitSha`)
  - `entryType`
  - `status`
  - `authorType`

## UI Surface (v1)

Primary UI integrates into existing quicklook dialogs and RightPanel:

- Add `FeedbackSection` inside `TaskQuicklook` and `CommitQuicklook` dialogs (context-scoped).
- Each section shows feedback entries filtered to the selected target, with a composer for all three entry types.
- Realtime feed shows newest-first entries in a right-rail companion stream.
- Entry actions include resolve/reopen.
- Add `FeedbackSummarySection` to `RightPanel` showing blocking badge/counter for open `ask_for_change` across the orchestration.

Project 3 does not block user actions in the control plane. It only exposes blocking state and unresolved counts.

## Selected Wireframe Direction

Chosen direction: `Option D` from interactive mockups (hybrid of A + B).

Reference:
- Design set: `/Users/joshua/Projects/tina/designs/src/designSets/project3-feedback-fabric-v1/index.tsx`
- Route: `/sets/project3-feedback-fabric-v1` (select `Option D`)

Locked UX constraints from selected wireframe:
- Left rail target scope switcher (`task` / `commit` contexts)
- Center quicklook composer + target-scoped feedback feed
- Right rail realtime stream + selected event detail + blocking summary
- Defer global filter controls for initial implementation
- Defer top summary badges/chips for initial implementation

## Activity Stream

Activity stream is derived from `feedbackEntries` and scoped by orchestration.

Requirements:
- Realtime updates via Convex reactive queries.
- Filter by `targetType`, `targetRef`, `entryType`, `status`.
- Render attribution (`authorType`, `authorName`) and timestamps.
- Show status transitions in stream ordering.

## Agent and CLI Integration

Expose feedback APIs through `tina-data` wrappers so agent-side tools can create and resolve entries with the same semantics as UI users.

Initial wrappers:
- Create entry
- Resolve entry
- Reopen entry
- List/filter entries for orchestration and target
- Fetch blocking summary

## Error Handling

Use explicit structured errors for:
- Invalid target specification (missing/extra target fields).
- Unknown target (`taskId`/`commitSha` not found).
- Orchestration-target mismatch.
- Invalid state transitions (resolve resolved, reopen open).
- Invalid enum values.

Race handling:
- Use optimistic checks on `updatedAt` (or revision field) for resolve/reopen.
- Return conflict error when stale updates are attempted.

## Test Plan

Convex tests (`convex/feedbackEntries.test.ts`):
- create/list for each `entryType`
- target validation for both `task` and `commit`
- status transitions and conflict behavior
- filtering and ordering
- blocking summary correctness

Web tests (`tina-web`):
- panel render/loading/error states
- compose submit for each entry type
- filter and scoped target behavior
- resolve/reopen UI state transitions
- blocking badge/counter visibility

Integration tests:
- orchestration fixture with tasks + commits + mixed entries
- realtime query behavior for panel scopes
- consistent counts between stream and summary endpoints

## Delivery Phases (Project 3)

1. Schema + Convex APIs + tests
2. Web feedback panel + queries/mutations + tests
3. Agent/client wrappers + integration tests
4. Hardening: index tuning and query profile review

## Phase 2 Scope (Project 3, Next)

- Triage flow that decides informational vs blocking outcomes for newly created feedback.
- Follow-up generation workflow that creates remediation tasks from open blocking entries.
- Dependency wiring so follow-up tasks are inserted safely into active orchestration flow.
- Resolution coupling that links follow-up completion back to feedback closure state.

## Acceptance Criteria

- Users can add `comment`/`suggestion`/`ask_for_change` against task/commit targets from Tina UI.
- Agents can submit and resolve the same entries through API/CLI wrappers.
- Open/resolved status is persisted and auditable with actor metadata.
- Open `ask_for_change` entries are visible as blocking indicators.
- Feedback stream updates in realtime and remains filterable by orchestration context.

## Architectural Context

**Patterns to follow:**
- Convex module structure (mutation/query exports): `convex/workComments.ts` (closest analog — target validation, author types)
- Target validation via index lookup + parent-scoping: `convex/workComments.ts:14-32`
- Convex test harness with `convexTest(schema)` + fixture builders: `convex/test_helpers.ts`
- Effect `Schema` types for frontend: `tina-web/src/schemas/workComment.ts`
- Typed query definitions via `queryDef()`: `tina-web/src/services/data/queryDefs.ts:158-166`
- `useTypedQuery` hook + `matchQueryResult` for data fetching: `tina-web/src/components/pm/CommentTimeline.tsx:130-178`
- Rust arg builders as `BTreeMap<String, Value>`: `tina-data/src/convex_client.rs:17-60`

**Code to reuse:**
- `convex/test_helpers.ts` — `createFeatureFixture()` provides node + orchestration for tests
- `convex/commits.ts:52-62` — `getCommit` query (validate commit SHA exists)
- `convex/tasks.ts:36-48` — `loadTaskEventsForOrchestration` + `deduplicateTaskEvents` (validate task exists)
- `tina-web/src/components/QuicklookDialog.tsx` — dialog frame for quicklook panels
- `tina-web/src/components/pm/CommentTimeline.tsx` — composer + timeline pattern (adapt for feedback)

**Anti-patterns:**
- Don't use `Id<"taskEvents">` for task targets — tasks are string-keyed (`taskId: string`), not Convex doc IDs. Use the string task key.
- Don't add `feedbackEntries` to `orchestrationCoreTableFields` — feedback is a separate concern scoped by `orchestrationId` foreign key (like `commits`, `plans`).

**Integration points:**
- Schema: add `feedbackEntries` table to `convex/schema.ts:294` (before closing bracket)
- Convex API: new file `convex/feedbackEntries.ts` (follows `workComments.ts` pattern)
- Tests: new file `convex/feedbackEntries.test.ts` (follows `workComments.test.ts` pattern)
- Frontend schema: new file `tina-web/src/schemas/feedbackEntry.ts`, export from `tina-web/src/schemas/index.ts`
- Query defs: add `FeedbackEntryListQuery`, `BlockingFeedbackSummaryQuery` to `tina-web/src/services/data/queryDefs.ts`
- UI: add feedback section inside `tina-web/src/components/TaskQuicklook.tsx:88-96` (before closing `</QuicklookDialog>`) and `tina-web/src/components/CommitQuicklook.tsx:87-96` (before closing `</div>`)
- UI: add blocking feedback summary to `tina-web/src/components/RightPanel.tsx:28-33` (new section in stack)
- Rust wrappers: add methods to `tina-data/src/convex_client.rs` (create, resolve, reopen, list, blocking summary)

**Design clarifications needed (addressed below):**

1. **Task target validation**: Tasks are event-sourced in `taskEvents` — there's no stable doc ID. `targetTaskId` should be the `taskId` string key (e.g., `"1"`, `"2"`). Validation requires `loadTaskEventsForOrchestration` + `deduplicateTaskEvents` to confirm the task exists. This is heavier than commit validation (simple `by_sha` index lookup). Consider caching or accepting that task validation is best-effort on the latest event snapshot.

2. **Race handling**: Convex mutations are serializable transactions — concurrent resolve/reopen mutations won't corrupt state. The `updatedAt` optimistic check is only useful for detecting stale UI (user clicks resolve on an already-resolved entry). Clarify this is a staleness guard, not a concurrency primitive.

3. **Index with optional fields**: `by_target_status_created` uses `targetTaskId` (optional). Rows where `targetTaskId` is undefined will be indexed with `undefined` as key. This index only works for task-targeted queries — commit queries must use `by_target_commit_status_created`. This split is intentional and correct, just noting it.

## Phase 1 to Phase 2 Handoff Boundary

Phase 1 output:
- Canonical feedback records with blocking visibility and resolution workflow.

Phase 2 consumes that output to:
- decide triage outcomes,
- generate follow-up tasks/remediation wiring,
- connect feedback closure to orchestration execution controls.
