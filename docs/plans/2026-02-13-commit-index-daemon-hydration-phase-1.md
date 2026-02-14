# Commit Index + Daemon Hydration Phase 1 Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** b6496a21b2d9f7cf9f8ee0e5a50a817f5836e86c

**Goal:** Reduce commit data stored in Convex to a lightweight orchestration index, and load rich commit metadata from `tina-daemon` on demand in `tina-web`.

**Architecture:** Convex remains the durable, orchestration-scoped commit index (`orchestrationId`, `phaseNumber`, `sha`, `recordedAt`, optional `shortSha`). `tina-daemon` becomes the source of truth for rich git metadata (`subject`, `author`, `timestamp`, `insertions`, `deletions`). `tina-web` performs a client-side join with graceful fallback when daemon data is unavailable.

**Phase context:** Current commit syncing in `tina-daemon` has ref-watching and attribution issues, and commit metadata is duplicated in Convex. This phase fixes sync reliability first, then introduces daemon-backed commit hydration, then slims Convex commit payload/schema.

**Key patterns to follow:**
- Daemon HTTP route style: `tina-daemon/src/http.rs`
- Daemon git parsing utilities: `tina-daemon/src/git.rs`
- Convex query/mutation style: `convex/commits.ts`, `convex/schema.ts`
- Web typed query and schema patterns: `tina-web/src/services/data/queryDefs.ts`, `tina-web/src/hooks/useDaemonQuery.ts`
- Commit UI components: `tina-web/src/components/CommitListPanel.tsx`, `tina-web/src/components/CommitQuicklook.tsx`

**Non-goals:**
- No removal of the `commits` table.
- No migration to daemon-only commit history.
- No broad timeline redesign outside commit hydration.

---

## Tasks

### Task 1: Fix commit sync reliability in daemon (prerequisite)

**Files:**
- `tina-daemon/src/main.rs`
- `tina-daemon/src/watcher.rs`
- `tina-daemon/src/sync.rs`
- `tina-daemon/src/git.rs`
- `tina-daemon/tests/integration_test.rs`

**Model:** opus

**review:** full

**Depends on:** none

**Steps:**
1. Fix git ref watch path resolution for true git worktrees (`.git` file + resolved git dir), not only `.git/refs/...` directory assumptions.
2. Fix ref-event classification so branch refs with `/` (for example `tina/<feature>`) are detected as commit-triggering events.
3. Ensure `last_commit_sha` is only advanced after all required writes in a batch succeed.
4. Add or update tests to cover:
   - Worktree `.git` file layout
   - Nested branch refs
   - Partial write failure behavior
5. Validate with targeted daemon tests for watcher/sync behavior.

---

### Task 2: Add daemon commit detail endpoints

**Files:**
- `tina-daemon/src/http.rs`
- `tina-daemon/src/git.rs`

**Model:** opus

**review:** full

**Depends on:** 1

**Steps:**
1. Add endpoint(s) to return commit metadata by SHA (prefer batch query to avoid N+1 fetches from web).
2. Reuse existing git parsing logic and ensure deterministic JSON schema.
3. Include robust error responses for missing SHAs, invalid refs, and non-git worktree paths.
4. Add endpoint tests in daemon HTTP test suite.

---

### Task 3: Add web-side daemon hydration and fallback

**Files:**
- `tina-web/src/hooks/useDaemonQuery.ts`
- `tina-web/src/services/data/queryDefs.ts`
- `tina-web/src/schemas/commit.ts`
- `tina-web/src/hooks/useOrchestrationEvents.ts`
- `tina-web/src/components/CommitListPanel.tsx`
- `tina-web/src/components/CommitQuicklook.tsx`
- `tina-web/src/components/__tests__/CommitListPanel.test.tsx`
- `tina-web/src/components/__tests__/CommitQuicklook.test.tsx`
- `tina-web/src/hooks/__tests__/useOrchestrationEvents.test.tsx`

**Model:** opus

**review:** full

**Depends on:** 2

**Steps:**
1. Keep Convex commit list as the base query for orchestration-scoped history.
2. Add daemon commit-detail fetch hook(s), ideally batch by SHA.
3. Join Convex index rows with daemon detail rows in web state layer.
4. Define fallback behavior when daemon is unavailable:
   - Commit list still renders with index fields only.
   - Quicklook degrades gracefully with clear missing-field placeholders.
5. Update tests for success, partial daemon data, and daemon failure modes.

---

### Task 4: Slim Convex commit schema and writer payload

**Files:**
- `convex/schema.ts`
- `convex/commits.ts`
- `convex/commits.test.ts`
- `tina-data/src/types.rs`
- `tina-data/src/convex_client.rs`
- `tina-daemon/src/sync.rs`

**Model:** opus

**review:** full

**Depends on:** 3

**Steps:**
1. Transition `commits` table to lightweight index fields:
   - Keep: `orchestrationId`, `phaseNumber`, `sha`, `recordedAt`, optional `shortSha`.
   - Remove: `subject`, `author`, `timestamp`, `insertions`, `deletions`.
2. Update Convex mutation/query argument contracts accordingly.
3. Update Rust shared types and client serialization/deserialization.
4. Update daemon commit writer to send minimal payload.
5. Update tests to validate minimal storage and expected query output.

---

### Task 5: Verify end-to-end behavior and docs

**Files:**
- `docs/architecture/orchestration-runtime-protocol.md` (if commit source notes are needed)
- `AGENTS.md` (only if command references need updates)

**Model:** sonnet

**review:** spec-only

**Depends on:** 4

**Steps:**
1. Run targeted tests:
   - `cargo test --manifest-path tina-daemon/Cargo.toml`
   - `npx vitest run convex/commits.test.ts`
   - `cd tina-web && npx vitest run src/components/__tests__/CommitListPanel.test.tsx src/components/__tests__/CommitQuicklook.test.tsx src/hooks/__tests__/useOrchestrationEvents.test.tsx`
2. Manual smoke check:
   - Create commit in active worktree
   - Confirm Convex index row appears
   - Confirm UI enriches row with daemon details
   - Stop daemon and confirm UI fallback still works
3. Document any changed runtime assumptions about commit metadata source.

---

## Acceptance Criteria

- Commit sync triggers reliably for real git worktrees and nested branch refs.
- Convex commit records are index-only (no rich metadata fields).
- UI commit surfaces are still functional and show daemon-enriched details when available.
- UI remains usable when daemon is unavailable (graceful degradation).
- All targeted tests above pass.

## Risks and Mitigations

- **Risk:** Daemon availability introduces transient enrichment gaps.
  - **Mitigation:** Strict fallback path from daemon-enriched view to Convex index-only rendering.
- **Risk:** Contract drift across Convex, Rust, and web commit types.
  - **Mitigation:** Land type/schema updates in one phase with coordinated tests before merge.
- **Risk:** Regression in commit sync due to watcher path handling.
  - **Mitigation:** Add explicit tests for true worktree layouts and branch names with `/`.
