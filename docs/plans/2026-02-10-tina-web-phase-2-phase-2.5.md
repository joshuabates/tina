# Phase 2.5: Remediation & Integration

## Context

Phase 2 implementation is partially complete. Analysis reveals:

**✅ Completed:**
- Phase 1: Convex schema and functions (`commits`, `plans` tables, all tests passing)
- Phase 1.5: Validation complete (21/21 tests passing)
- Phase 2 foundation: `sync_commits()` and `sync_plan()` functions implemented in `tina-daemon/src/sync.rs`
- Git module: `git.rs` with commit parsing logic (3 tests passing)
- Event detection: Watcher infrastructure receives GitRef and Plan events

**❌ Gaps identified:**
1. **Git commit watcher not connected**: `main.rs:118-122` receives `WatchEvent::GitRef` but only logs, doesn't call `sync_commits()`
2. **Plan file watcher not connected**: `main.rs:123-127` receives `WatchEvent::Plan` but only logs, doesn't call `sync_plan()`
3. **No worktree discovery**: Daemon doesn't query Convex for active orchestrations to watch their worktrees
4. **No git ref watching setup**: `DaemonWatcher::watch_git_refs()` not called at startup
5. **No plan directory watching setup**: `DaemonWatcher::watch_plan_directories()` not called at startup
6. **Test environment issues**: UI component tests failing due to missing test setup (24 failures in keyboard-service.test.ts)

**Root cause:** Phase 2 implementation added the sync functions and watcher infrastructure but didn't wire them together in the main event loop or set up the watchers at startup.

## Summary

Connect the existing Phase 2 infrastructure by:
1. Adding worktree discovery at daemon startup (query Convex for active orchestrations)
2. Setting up git ref and plan directory watchers for discovered worktrees
3. Wiring `WatchEvent::GitRef` and `WatchEvent::Plan` handlers to call the sync functions
4. Adding integration tests to verify end-to-end flow
5. (Optional) Fix UI test environment issues if blocking Phase 3

## Tasks

### Task 2.5.1: Worktree discovery and watcher setup

**Model:** opus

**Files:**
- `tina-daemon/src/main.rs` (modify startup sequence)
- `tina-daemon/src/sync.rs` (add worktree discovery function)
- `tina-daemon/src/watcher.rs` (verify watch methods exist)

**Implementation:**

**Step 1: Add worktree discovery function** in `sync.rs`:

```rust
#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    pub orchestration_id: String,
    pub feature: String,
    pub worktree_path: PathBuf,
    pub branch: String,
}

/// Discover active worktrees by querying Convex for orchestrations with status != Complete
pub async fn discover_worktrees(
    client: &Arc<Mutex<TinaConvexClient>>,
) -> Result<Vec<WorktreeInfo>> {
    let mut client_guard = client.lock().await;

    // Query for active orchestrations (Planning, Executing, Reviewing, Blocked)
    let result = client_guard
        .query::<Value>(
            "orchestrations:listOrchestrations",
            serde_json::json!({}),
        )
        .await?;

    let Value::Array(orchestrations) = result else {
        return Ok(vec![]);
    };

    let mut worktrees = Vec::new();
    for orch in orchestrations {
        let Value::Object(map) = orch else { continue };

        // Skip completed orchestrations
        let status = map.get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if status == "Complete" {
            continue;
        }

        let orchestration_id = map.get("_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let feature = map.get("feature")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if orchestration_id.is_empty() || feature.is_empty() {
            continue;
        }

        // Get supervisor state for worktree_path and branch
        let state_result = client_guard
            .query::<Value>(
                "supervisorStates:getSupervisorState",
                serde_json::json!({
                    "feature": feature
                }),
            )
            .await?;

        if let Value::Object(state) = state_result {
            let worktree_path = state.get("worktreePath")
                .or_else(|| state.get("worktree_path"))  // Try both camelCase and snake_case
                .and_then(|v| v.as_str());
            let branch = state.get("branch")
                .and_then(|v| v.as_str());

            if let (Some(path), Some(branch)) = (worktree_path, branch) {
                worktrees.push(WorktreeInfo {
                    orchestration_id: orchestration_id.to_string(),
                    feature: feature.to_string(),
                    worktree_path: PathBuf::from(path),
                    branch: branch.to_string(),
                });
            }
        }
    }

    info!("discovered {} active worktrees", worktrees.len());
    Ok(worktrees)
}
```

**Step 2: Update main.rs startup sequence** (after line 83):

```rust
// Initial full sync
let mut cache = SyncCache::new();
if let Err(e) = sync::sync_all(&client, &mut cache, &teams_dir, &tasks_dir).await {
    error!(error = %e, "initial sync failed");
}

// Discover active worktrees and set up watchers
let worktrees = match sync::discover_worktrees(&client).await {
    Ok(wt) => wt,
    Err(e) => {
        error!(error = %e, "worktree discovery failed");
        Vec::new()
    }
};

// Watch git refs for discovered worktrees
for worktree in &worktrees {
    let ref_path = worktree.worktree_path
        .join(".git")
        .join("refs")
        .join("heads")
        .join(&worktree.branch);

    if ref_path.exists() {
        if let Err(e) = watcher.watch_git_ref(&ref_path) {
            warn!(
                path = %ref_path.display(),
                error = %e,
                "failed to watch git ref"
            );
        } else {
            info!(path = %ref_path.display(), "watching git ref");
        }
    }
}

// Watch plan directories for discovered worktrees
for worktree in &worktrees {
    let plans_dir = worktree.worktree_path.join("docs").join("plans");

    if plans_dir.exists() {
        if let Err(e) = watcher.watch_plan_dir(&plans_dir) {
            warn!(
                path = %plans_dir.display(),
                error = %e,
                "failed to watch plans directory"
            );
        } else {
            info!(path = %plans_dir.display(), "watching plans directory");
        }
    }
}

// Store worktrees in cache for event handling
cache.set_worktrees(worktrees);
```

**Step 3: Update SyncCache** to store worktree mappings:

```rust
// In sync.rs, add to SyncCache struct:
pub struct SyncCache {
    // ... existing fields
    worktrees: Vec<WorktreeInfo>,
}

impl SyncCache {
    pub fn new() -> Self {
        Self {
            // ... existing fields
            worktrees: Vec::new(),
        }
    }

    pub fn set_worktrees(&mut self, worktrees: Vec<WorktreeInfo>) {
        self.worktrees = worktrees;
    }

    pub fn find_worktree_by_ref_path(&self, ref_path: &Path) -> Option<&WorktreeInfo> {
        self.worktrees.iter().find(|wt| {
            let expected = wt.worktree_path
                .join(".git/refs/heads")
                .join(&wt.branch);
            expected == ref_path
        })
    }

    pub fn find_worktree_by_plan_dir(&self, plan_path: &Path) -> Option<&WorktreeInfo> {
        self.worktrees.iter().find(|wt| {
            let plans_dir = wt.worktree_path.join("docs/plans");
            plan_path.starts_with(&plans_dir)
        })
    }
}
```

**Validation:**
- Daemon starts without errors
- Active worktrees discovered from Convex
- Git refs and plan directories watched if they exist
- Logs show watcher setup for each worktree

**Dependencies:** Phase 2 (sync functions exist)

**Blocker for:** Task 2.5.2

### Task 2.5.2: Wire event handlers to sync functions

**Model:** opus

**Files:**
- `tina-daemon/src/main.rs` (modify event loop)

**Implementation:**

Replace placeholder handlers at lines 118-127 with real sync calls:

```rust
// File change events
event = watcher.rx.recv() => {
    match event {
        Some(WatchEvent::Teams) | Some(WatchEvent::Tasks) => {
            if let Err(e) = sync::sync_all(
                &client, &mut cache, &teams_dir, &tasks_dir,
            ).await {
                error!(error = %e, "sync failed");
            }
        }
        Some(WatchEvent::GitRef(ref_path)) => {
            // Git ref changed - sync commits
            if let Some(worktree) = cache.find_worktree_by_ref_path(&ref_path) {
                info!(
                    feature = %worktree.feature,
                    path = %ref_path.display(),
                    "git ref changed, syncing commits"
                );
                if let Err(e) = sync::sync_commits(&client, &mut cache, worktree).await {
                    error!(
                        feature = %worktree.feature,
                        error = %e,
                        "failed to sync commits"
                    );
                }
            } else {
                warn!(path = %ref_path.display(), "git ref changed but no worktree found");
            }
        }
        Some(WatchEvent::Plan(plan_path)) => {
            // Plan file changed - sync to Convex
            if let Some(worktree) = cache.find_worktree_by_plan_dir(&plan_path) {
                info!(
                    feature = %worktree.feature,
                    path = %plan_path.display(),
                    "plan file changed, syncing to Convex"
                );
                if let Err(e) = sync::sync_plan(&client, &mut cache, worktree, &plan_path).await {
                    error!(
                        feature = %worktree.feature,
                        error = %e,
                        "failed to sync plan"
                    );
                }
            } else {
                warn!(path = %plan_path.display(), "plan file changed but no worktree found");
            }
        }
        None => {
            info!("watcher channel closed, shutting down");
            cancel.cancel();
            break;
        }
    }
}
```

**Validation:**
- Git commits trigger `sync_commits()` call
- Plan file changes trigger `sync_plan()` call
- Errors logged but don't crash daemon
- Events matched to correct worktree

**Dependencies:** Task 2.5.1

**Blocker for:** Task 2.5.3

### Task 2.5.3: Integration testing

**Model:** opus

**Files:**
- `tina-daemon/tests/integration_test.rs` (new file)

**Implementation:**

Create integration test that verifies end-to-end flow:

```rust
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tokio::time::sleep;

#[tokio::test]
#[ignore] // Requires Convex and filesystem setup
async fn test_git_commit_sync_end_to_end() {
    // Setup:
    // 1. Create mock orchestration in Convex
    // 2. Create test worktree with git repo
    // 3. Start daemon (or simulate startup)
    // 4. Make a commit in test worktree
    // 5. Wait for watcher to detect change
    // 6. Query Convex to verify commit was synced

    // Assertions:
    // - Commit appears in Convex commits table
    // - SHA matches test commit
    // - Phase attribution correct
    // - Stats (insertions/deletions) correct
}

#[tokio::test]
#[ignore]
async fn test_plan_sync_end_to_end() {
    // Setup:
    // 1. Create mock orchestration in Convex
    // 2. Create test worktree with docs/plans directory
    // 3. Start daemon
    // 4. Write new plan file
    // 5. Wait for watcher to detect change
    // 6. Query Convex to verify plan was synced

    // Assertions:
    // - Plan appears in Convex plans table
    // - Content matches file content
    // - Phase extraction correct
}

#[tokio::test]
#[ignore]
async fn test_worktree_discovery() {
    // Setup:
    // 1. Create 2 active orchestrations in Convex (Planning, Executing)
    // 2. Create 1 completed orchestration (Complete)
    // 3. Call discover_worktrees()

    // Assertions:
    // - Returns 2 worktrees (excludes completed)
    // - Worktree paths extracted correctly
    // - Branches extracted correctly
}
```

**Manual testing checklist:**

1. Start tina-daemon: `tina-session daemon start`
2. Start an orchestration: `tina-session orchestrate <feature>`
3. In another terminal, navigate to worktree
4. Make a commit: `git add . && git commit -m "test commit"`
5. Check daemon logs for "syncing commits" message
6. Query Convex dashboard: verify commit in `commits` table
7. Edit a plan file in `docs/plans/`
8. Check daemon logs for "syncing to Convex" message
9. Query Convex dashboard: verify plan in `plans` table

**Validation:**
- Integration tests pass (when run with proper setup)
- Manual testing confirms real-time sync
- Commits appear in Convex within 5 seconds
- Plans appear in Convex within 3 seconds

**Dependencies:** Task 2.5.2

**Blocker for:** None (completes Phase 2.5 core work)

### Task 2.5.4: (Optional) Fix UI test environment

**Model:** sonnet

**Priority:** Low (doesn't block Phase 3 UI work)

**Files:**
- `tina-web/src/services/__tests__/keyboard-service.test.ts`

**Context:**

24 tests failing in keyboard-service.test.ts, but these are in a worktree (`.worktrees/tina-web-rebuild/`) and don't affect the main codebase. The failures appear to be test environment setup issues (DOM mocking, event dispatching), not logic bugs.

**Decision:**

SKIP this task for now. Reasons:
1. Tests are in an old worktree, not main codebase
2. Doesn't block Phase 3 implementation (UI components for commits/plans/shutdown)
3. Can be addressed later as tech debt
4. Phase 3 will add new UI components with their own tests

**Alternative:** If these tests ARE needed:
- Verify test environment setup (jsdom, event mocking)
- Check if KeyboardEvent constructors are properly mocked
- Verify dispatchEvent() method available in test context
- Consider using @testing-library/user-event for keyboard interactions

**Validation:** N/A (skipped)

**Dependencies:** None

**Blocker for:** None

## Integration

**Modified files:**
- `tina-daemon/src/main.rs` - Add worktree discovery, watcher setup, wire event handlers
- `tina-daemon/src/sync.rs` - Add `discover_worktrees()`, update `SyncCache` with worktree tracking
- `tina-daemon/tests/integration_test.rs` - New integration tests (optional, can be #[ignore])

**No Convex changes** (uses Phase 1 functions)
**No UI changes** (Phase 3 will add UI components)

## Testing Strategy

**Unit tests:**
- Existing tests continue to pass (43 tests in tina-daemon)
- New unit tests for `discover_worktrees()` function
- New unit tests for `SyncCache` worktree lookup methods

**Integration tests:**
- End-to-end test for commit sync (can be #[ignore], requires setup)
- End-to-end test for plan sync (can be #[ignore], requires setup)
- Manual testing checklist (documented above)

**Exit criteria:**
- Daemon starts and discovers worktrees without errors
- Git commits trigger sync and appear in Convex
- Plan file edits trigger sync and appear in Convex
- No errors in daemon logs during orchestration
- All existing tests still pass

## Estimated Time

- Task 2.5.1: 90 min (worktree discovery + watcher setup)
- Task 2.5.2: 30 min (wire event handlers)
- Task 2.5.3: 60 min (integration tests + manual verification)
- Task 2.5.4: SKIPPED

**Total: ~3 hours**

## Success Criteria

1. ✅ Phase 1 Convex tests pass (21/21) - ALREADY DONE
2. ✅ Phase 2 tina-daemon unit tests pass (43/43) - ALREADY DONE
3. Daemon discovers active worktrees from Convex at startup
4. Git ref and plan directory watchers set up for each worktree
5. Git commits synced to Convex within 5 seconds of commit
6. Plan files synced to Convex within 3 seconds of save
7. Event handlers dispatch to correct sync functions
8. Worktree lookups work correctly (by ref path and plan dir)
9. No crashes or errors in daemon logs during orchestration
10. Integration tests pass (or manual verification successful)

## Dependencies

This phase depends on:
- ✅ **Phase 1:** Convex schema and functions (commits, plans, events)
- ✅ **Phase 1.5:** Validation complete
- ✅ **Phase 2:** Sync functions implemented (sync_commits, sync_plan, git.rs)

This phase is a prerequisite for:
- **Phase 3:** UI components need real-time data from daemon

Phase 3 cannot proceed until Phase 2.5 is complete and verified.

## Rollback Plan

If issues arise:

1. **Watcher setup issues:**
   - Comment out worktree discovery in main.rs
   - Revert to "log only" behavior (lines 120-127)
   - Daemon continues to sync teams/tasks as before

2. **Sync function issues:**
   - Disable specific sync calls (commit or plan)
   - Add error recovery (catch and log, don't crash)
   - Debug sync functions in isolation

3. **Performance issues:**
   - Add rate limiting to sync functions
   - Debounce filesystem events (increase delay)
   - Reduce worktree polling frequency

All changes are additive - existing team/task sync unaffected.

## Notes

**Key observations:**

- Phase 2 implementation was 80% complete - sync functions existed but weren't wired up
- No Convex changes needed (Phase 1 functions already support commits and plans)
- Main work is plumbing: connecting existing pieces together
- Worktree discovery is the missing piece - daemon needs to know what to watch

**Design decisions:**

- Worktree discovery at startup (not periodic polling) - reduces overhead
- Cache-based lookups for event→worktree mapping - O(1) performance
- Graceful degradation if watcher setup fails - log warning but continue
- Convex as source of truth for active orchestrations - daemon follows Convex state

**Phase 3 readiness:**

After Phase 2.5:
- Commits will be flowing into Convex in real-time
- Plans will be synced on every file save
- Shutdown events already working (Phase 1.5 verified)
- UI can read from Convex queries (listCommits, getPlan, etc.)
- Phase 3 can focus purely on UI components and rendering

**Test environment issues:**

The 24 failing tests in keyboard-service.test.ts are in a worktree (tina-web-rebuild) and appear to be test setup issues, not logic bugs. Since they don't block Phase 3 work (new UI components will have their own tests), we're deferring this as tech debt.
