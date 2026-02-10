# Phase 2.5.5: Git & Plan Sync Completion

## Context

Phase 2.5 (remediation) was partially implemented. Review revealed remaining gaps:

**✅ Completed (Phase 2.5):**
- `sync_commits()` function implemented in `tina-daemon/src/sync.rs:359-416`
- `sync_plan()` function implemented in `tina-daemon/src/sync.rs:421-462`
- Git module with commit parsing (`git.rs`) implemented and tested (3 tests passing)
- Watcher infrastructure receives `WatchEvent::GitRef` and `WatchEvent::Plan` events
- Shutdown event detection working (Phase 1.5)

**❌ Remaining Gaps:**
1. **No worktree discovery**: Daemon doesn't query Convex to find active orchestrations and their worktrees
2. **Git ref watchers not set up**: `DaemonWatcher::watch_git_ref()` not called at daemon startup
3. **Plan directory watchers not set up**: `DaemonWatcher::watch_plan_dir()` not called at daemon startup
4. **Event handlers not wired**: `main.rs:118-127` logs events but doesn't call sync functions
5. **No worktree→orchestration mapping**: Event handlers can't look up which orchestration owns a changed file
6. **No integration tests**: End-to-end flow not verified

**Root cause:** Phase 2 added sync functions, Phase 2.5 plan described wiring, but implementation stopped short of completing the integration.

## Summary

Complete the git commit and plan sync integration by:
1. Implementing worktree discovery from Convex orchestration state
2. Setting up git ref and plan directory watchers at daemon startup
3. Wiring event handlers to call sync functions with correct orchestration context
4. Adding integration tests to verify end-to-end flow

This phase completes the data collection layer required for Phase 3 UI components.

## Goals

- Real-time git commit sync: commits appear in Convex within 5 seconds
- Real-time plan sync: plan changes appear in Convex within 3 seconds
- Automatic worktree discovery from Convex (no manual configuration)
- Robust event handling with orchestration context lookup
- Integration tests verify end-to-end flow

## Architecture

### Worktree Discovery Flow

```
Daemon startup:
1. Query Convex: orchestrations:listOrchestrations (filter status != Complete)
2. For each orchestration: Query supervisorStates:getSupervisorState by feature
3. Extract worktree_path and branch from supervisor state
4. Build WorktreeInfo cache: orchestration_id → (worktree_path, branch, feature)
5. Setup watchers:
   - Git ref: {worktree_path}/.git/refs/heads/{branch}
   - Plans dir: {worktree_path}/docs/plans
```

### Event Handling Flow

```
Git ref change event:
1. Receive WatchEvent::GitRef(ref_path) from watcher
2. Lookup WorktreeInfo by ref_path in cache
3. Call sync_commits(orchestration_id, phase_number, worktree_path, branch)
4. sync_commits queries git log, records commits to Convex

Plan file change event:
1. Receive WatchEvent::Plan(plan_path) from watcher
2. Lookup WorktreeInfo by plan_path in cache
3. Call sync_plan(orchestration_id, plan_path)
4. sync_plan reads file, extracts phase, upserts to Convex
```

### Data Structures

**WorktreeInfo** (new struct in `sync.rs`):
```rust
#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    pub orchestration_id: String,
    pub feature: String,
    pub worktree_path: PathBuf,
    pub branch: String,
    pub current_phase: String,  // for phase attribution in commits
}
```

**SyncCache** (extend existing struct):
```rust
pub struct SyncCache {
    // ... existing fields
    pub worktrees: Vec<WorktreeInfo>,  // discovered at startup
}

impl SyncCache {
    pub fn find_worktree_by_ref_path(&self, ref_path: &Path) -> Option<&WorktreeInfo> {
        // Match {worktree}/.git/refs/heads/{branch}
    }

    pub fn find_worktree_by_plan_path(&self, plan_path: &Path) -> Option<&WorktreeInfo> {
        // Match paths under {worktree}/docs/plans/
    }
}
```

## Implementation Tasks

### Task 1: Implement worktree discovery

**Files:**
- `tina-daemon/src/sync.rs` (add `discover_worktrees` function and WorktreeInfo struct)
- `tina-daemon/src/sync.rs` (extend SyncCache with worktree tracking)

**Changes:**

1. Add WorktreeInfo struct and discovery function:

```rust
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    pub orchestration_id: String,
    pub feature: String,
    pub worktree_path: PathBuf,
    pub branch: String,
    pub current_phase: String,
}

/// Discover active worktrees from Convex orchestration state.
///
/// Queries for non-Complete orchestrations and extracts worktree paths
/// from supervisor state.
pub async fn discover_worktrees(
    client: &Arc<Mutex<TinaConvexClient>>,
) -> Result<Vec<WorktreeInfo>> {
    let mut client_guard = client.lock().await;

    // Query for active orchestrations
    let result = client_guard
        .query::<Value>(
            "orchestrations:listOrchestrations",
            serde_json::json!({}),
        )
        .await
        .context("Failed to query orchestrations")?;

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
        if status == "complete" || status == "Complete" {
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
            .await;

        if let Ok(Value::Object(state)) = state_result {
            let worktree_path = state.get("worktreePath")
                .or_else(|| state.get("worktree_path"))  // Support both camelCase and snake_case
                .and_then(|v| v.as_str());
            let branch = state.get("branch")
                .and_then(|v| v.as_str());
            let current_phase = state.get("currentPhase")
                .or_else(|| state.get("current_phase"))
                .and_then(|v| v.as_number())
                .and_then(|n| n.as_u64())
                .map(|n| n.to_string())
                .unwrap_or_else(|| "0".to_string());

            if let (Some(path), Some(branch)) = (worktree_path, branch) {
                let path_buf = PathBuf::from(path);
                if path_buf.exists() {
                    worktrees.push(WorktreeInfo {
                        orchestration_id: orchestration_id.to_string(),
                        feature: feature.to_string(),
                        worktree_path: path_buf,
                        branch: branch.to_string(),
                        current_phase,
                    });
                } else {
                    warn!(
                        feature = %feature,
                        path = %path,
                        "worktree path does not exist"
                    );
                }
            }
        }
    }

    info!(count = worktrees.len(), "discovered active worktrees");
    Ok(worktrees)
}
```

2. Extend SyncCache with worktree tracking:

```rust
pub struct SyncCache {
    // ... existing fields
    pub worktrees: Vec<WorktreeInfo>,
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
                .join(".git")
                .join("refs")
                .join("heads")
                .join(&wt.branch);
            expected == ref_path
        })
    }

    pub fn find_worktree_by_plan_path(&self, plan_path: &Path) -> Option<&WorktreeInfo> {
        self.worktrees.iter().find(|wt| {
            let plans_dir = wt.worktree_path.join("docs").join("plans");
            plan_path.starts_with(&plans_dir)
        })
    }
}
```

**Tests:**

Add unit tests in `tina-daemon/src/sync.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_worktree_by_ref_path() {
        let mut cache = SyncCache::new();
        cache.set_worktrees(vec![WorktreeInfo {
            orchestration_id: "orch1".to_string(),
            feature: "test-feature".to_string(),
            worktree_path: PathBuf::from("/project/.worktrees/test"),
            branch: "tina/test-feature".to_string(),
            current_phase: "1".to_string(),
        }]);

        let ref_path = PathBuf::from("/project/.worktrees/test/.git/refs/heads/tina/test-feature");
        let found = cache.find_worktree_by_ref_path(&ref_path);
        assert!(found.is_some());
        assert_eq!(found.unwrap().feature, "test-feature");
    }

    #[test]
    fn test_find_worktree_by_plan_path() {
        let mut cache = SyncCache::new();
        cache.set_worktrees(vec![WorktreeInfo {
            orchestration_id: "orch1".to_string(),
            feature: "test-feature".to_string(),
            worktree_path: PathBuf::from("/project/.worktrees/test"),
            branch: "tina/test-feature".to_string(),
            current_phase: "1".to_string(),
        }]);

        let plan_path = PathBuf::from("/project/.worktrees/test/docs/plans/2026-02-10-test-phase-1.md");
        let found = cache.find_worktree_by_plan_path(&plan_path);
        assert!(found.is_some());
        assert_eq!(found.unwrap().feature, "test-feature");
    }

    #[test]
    fn test_find_worktree_not_found() {
        let cache = SyncCache::new();
        let ref_path = PathBuf::from("/nonexistent/path");
        assert!(cache.find_worktree_by_ref_path(&ref_path).is_none());
    }
}
```

**Validation:**
- Unit tests pass
- `discover_worktrees()` compiles and returns Vec<WorktreeInfo>
- Cache lookup methods work correctly

**Dependencies:** None (builds on existing Phase 2.5 code)

**Estimated time:** 60 minutes

---

### Task 2: Setup watchers at daemon startup

**Files:**
- `tina-daemon/src/main.rs` (modify startup sequence after initial sync)

**Changes:**

Insert after the initial sync (around line 88):

```rust
// Initial full sync
let mut cache = SyncCache::new();
if let Err(e) = sync::sync_all(&client, &mut cache, &teams_dir, &tasks_dir).await {
    error!(error = %e, "initial sync failed");
}

// ===== NEW CODE STARTS HERE =====

// Discover active worktrees and set up git/plan watchers
info!("discovering active worktrees");
let worktrees = match sync::discover_worktrees(&client).await {
    Ok(wt) => wt,
    Err(e) => {
        error!(error = %e, "worktree discovery failed, git and plan watching disabled");
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
                feature = %worktree.feature,
                path = %ref_path.display(),
                error = %e,
                "failed to watch git ref"
            );
        } else {
            info!(
                feature = %worktree.feature,
                branch = %worktree.branch,
                "watching git ref"
            );
        }
    } else {
        debug!(
            feature = %worktree.feature,
            path = %ref_path.display(),
            "git ref does not exist yet, skipping watch"
        );
    }
}

// Watch plan directories for discovered worktrees
for worktree in &worktrees {
    let plans_dir = worktree.worktree_path.join("docs").join("plans");

    if plans_dir.exists() {
        if let Err(e) = watcher.watch_plan_dir(&plans_dir) {
            warn!(
                feature = %worktree.feature,
                path = %plans_dir.display(),
                error = %e,
                "failed to watch plans directory"
            );
        } else {
            info!(
                feature = %worktree.feature,
                "watching plans directory"
            );
        }
    } else {
        debug!(
            feature = %worktree.feature,
            path = %plans_dir.display(),
            "plans directory does not exist yet, skipping watch"
        );
    }
}

// Store worktrees in cache for event handling
cache.set_worktrees(worktrees);

info!("daemon initialization complete");

// ===== NEW CODE ENDS HERE =====
```

**Validation:**
- Daemon starts without errors
- Logs show worktree discovery count
- Logs show git ref watch setup for each worktree (if ref exists)
- Logs show plan directory watch setup for each worktree (if dir exists)
- No crashes if worktrees list is empty

**Dependencies:** Task 1 (needs discover_worktrees and set_worktrees)

**Estimated time:** 30 minutes

---

### Task 3: Wire event handlers to sync functions

**Files:**
- `tina-daemon/src/main.rs` (replace placeholder event handlers at lines 118-127)
- `tina-daemon/src/sync.rs` (update sync_commits signature if needed)

**Changes:**

Replace the placeholder GitRef and Plan event handlers:

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
            // Git ref changed - sync commits for this worktree
            if let Some(worktree) = cache.find_worktree_by_ref_path(&ref_path) {
                info!(
                    feature = %worktree.feature,
                    branch = %worktree.branch,
                    "git ref changed, syncing commits"
                );
                if let Err(e) = sync::sync_commits(
                    &client,
                    &mut cache,
                    &worktree.orchestration_id,
                    &worktree.current_phase,
                    &worktree.worktree_path,
                    &worktree.branch,
                ).await {
                    error!(
                        feature = %worktree.feature,
                        error = %e,
                        "failed to sync commits"
                    );
                }
            } else {
                warn!(
                    path = %ref_path.display(),
                    "git ref changed but no worktree found in cache"
                );
            }
        }
        Some(WatchEvent::Plan(plan_path)) => {
            // Plan file changed - sync to Convex
            if let Some(worktree) = cache.find_worktree_by_plan_path(&plan_path) {
                info!(
                    feature = %worktree.feature,
                    path = %plan_path.display(),
                    "plan file changed, syncing to Convex"
                );
                if let Err(e) = sync::sync_plan(
                    &client,
                    &worktree.orchestration_id,
                    &plan_path,
                ).await {
                    error!(
                        feature = %worktree.feature,
                        error = %e,
                        "failed to sync plan"
                    );
                }
            } else {
                warn!(
                    path = %plan_path.display(),
                    "plan file changed but no worktree found in cache"
                );
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
- Daemon compiles without errors
- Event handlers call sync functions with correct parameters
- Errors logged but don't crash daemon
- Unknown paths (not in cache) logged as warnings

**Dependencies:** Task 2 (needs cache populated with worktrees)

**Estimated time:** 30 minutes

---

### Task 4: Add integration tests

**Files:**
- `tina-daemon/tests/integration_test.rs` (new file)

**Implementation:**

Create basic integration test framework:

```rust
//! Integration tests for git commit and plan sync.
//!
//! These tests require:
//! - Convex dev environment running
//! - Test worktree with git repo
//! - Orchestration fixture in Convex
//!
//! Run with: cargo test --test integration_test -- --ignored

use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tokio::time::sleep;

#[tokio::test]
#[ignore] // Requires Convex and filesystem setup
async fn test_worktree_discovery() {
    // Manual test plan:
    // 1. Start tina-daemon with debug logging
    // 2. Create test orchestration in Convex (status: Planning)
    // 3. Verify daemon discovers worktree
    // 4. Check logs for "discovered active worktrees" with count > 0

    // Automated test (future work):
    // - Mock Convex client
    // - Return fixture orchestration + supervisor state
    // - Call discover_worktrees()
    // - Assert worktree list contains expected entries
}

#[tokio::test]
#[ignore]
async fn test_git_commit_sync_end_to_end() {
    // Manual test plan:
    // 1. Start tina-daemon
    // 2. Start test orchestration (tina-session orchestrate test-feature)
    // 3. In worktree, make a commit: git commit --allow-empty -m "test"
    // 4. Wait 10 seconds
    // 5. Query Convex commits table for the test orchestration
    // 6. Verify commit appears with correct SHA and phase attribution

    // Automated test (future work):
    // - Create temporary git repo
    // - Mock orchestration fixture
    // - Simulate git ref change event
    // - Verify sync_commits called with correct parameters
    // - Verify Convex mutation recorded commit
}

#[tokio::test]
#[ignore]
async fn test_plan_sync_end_to_end() {
    // Manual test plan:
    // 1. Start tina-daemon
    // 2. Start test orchestration
    // 3. In worktree, create/edit plan file: docs/plans/2026-02-10-test-phase-1.md
    // 4. Wait 5 seconds
    // 5. Query Convex plans table for the orchestration
    // 6. Verify plan content matches file content

    // Automated test (future work):
    // - Create temporary worktree with docs/plans directory
    // - Mock orchestration fixture
    // - Simulate plan file change event
    // - Verify sync_plan called with correct parameters
    // - Verify Convex mutation upserted plan
}
```

**Manual Testing Checklist:**

Create `tina-daemon/MANUAL_TEST.md`:

```markdown
# Manual Integration Testing for Phase 2.5.5

## Prerequisites

- Convex dev environment running: `npx convex dev`
- tina-daemon binary rebuilt: `cargo build -p tina-daemon`
- tina-daemon stopped: `tina-session daemon stop`
- Clean state: no stale worktrees or orchestrations

## Test 1: Worktree Discovery

1. Start daemon with debug logging:
   ```bash
   RUST_LOG=tina_daemon=debug tina-session daemon start
   ```

2. Check logs for worktree discovery:
   ```bash
   tail -f ~/.local/state/tina/daemon.log | grep "discovered"
   ```

3. Start test orchestration:
   ```bash
   tina-session orchestrate test-feature-$(date +%s)
   ```

4. Expected: Logs show "discovered N active worktrees" where N > 0
5. Expected: Logs show "watching git ref" and "watching plans directory"

## Test 2: Git Commit Sync

1. With daemon running, navigate to worktree:
   ```bash
   cd .worktrees/test-feature-*
   ```

2. Make a test commit:
   ```bash
   git commit --allow-empty -m "test: integration test commit"
   ```

3. Watch daemon logs:
   ```bash
   tail -f ~/.local/state/tina/daemon.log | grep "commit"
   ```

4. Expected: Within 5 seconds, see "git ref changed, syncing commits"
5. Expected: See "syncing new commits" with count = 1

6. Verify in Convex dashboard:
   - Open Convex dashboard → commits table
   - Filter by orchestration_id
   - Verify commit appears with correct SHA and subject

## Test 3: Plan File Sync

1. With daemon running, edit plan file:
   ```bash
   cd .worktrees/test-feature-*
   echo "# Test Plan Update" >> docs/plans/*-phase-1.md
   ```

2. Watch daemon logs:
   ```bash
   tail -f ~/.local/state/tina/daemon.log | grep "plan"
   ```

3. Expected: Within 3 seconds, see "plan file changed, syncing to Convex"
4. Expected: See "upserted plan" with phase number

5. Verify in Convex dashboard:
   - Open Convex dashboard → plans table
   - Filter by orchestration_id
   - Verify plan content matches file content

## Test 4: Error Handling

1. Stop Convex dev server (simulate network failure)
2. Make a commit in worktree
3. Expected: Daemon logs error but doesn't crash
4. Restart Convex dev server
5. Make another commit
6. Expected: New commit syncs successfully

## Success Criteria

- All 4 tests pass
- No daemon crashes during testing
- Commits appear in Convex within 5 seconds
- Plans appear in Convex within 3 seconds
- Errors handled gracefully (logged, no crash)
```

**Validation:**
- Integration test file compiles
- Manual test checklist is complete and documented
- Tests can be run with `cargo test --test integration_test -- --ignored`

**Dependencies:** Task 3 (needs event handlers wired up)

**Estimated time:** 60 minutes

---

## Integration Points

**Modified files:**
- `tina-daemon/src/sync.rs` - Add WorktreeInfo struct, discover_worktrees function, extend SyncCache
- `tina-daemon/src/main.rs` - Add worktree discovery at startup, setup watchers, wire event handlers
- `tina-daemon/tests/integration_test.rs` - New integration test file (with #[ignore] tests)
- `tina-daemon/MANUAL_TEST.md` - New manual testing documentation

**No changes to:**
- Convex schema or functions (uses Phase 1 implementations)
- UI components (Phase 3 will add those)
- tina-session (orchestration flow unchanged)

## Testing Strategy

### Unit Tests (cargo test)

**sync.rs tests:**
- `test_find_worktree_by_ref_path` - Verify ref path lookup works
- `test_find_worktree_by_plan_path` - Verify plan path lookup works
- `test_find_worktree_not_found` - Verify lookup returns None for unknown paths
- Existing tests continue to pass (43 tests in tina-daemon)

**Expected result:** All unit tests pass, coverage maintained

### Integration Tests (cargo test --ignored)

**integration_test.rs tests:**
- `test_worktree_discovery` - Verify discovery from Convex works
- `test_git_commit_sync_end_to_end` - Verify commit sync works
- `test_plan_sync_end_to_end` - Verify plan sync works

**Expected result:** Tests provide framework for future automation, document manual test procedure

### Manual Testing

Follow `MANUAL_TEST.md` checklist:
1. Worktree discovery works (logs show discovered worktrees)
2. Git commit sync works (commits appear in Convex within 5 seconds)
3. Plan sync works (plan content appears in Convex within 3 seconds)
4. Error handling works (daemon doesn't crash on Convex errors)

**Expected result:** All manual tests pass, no daemon crashes

## Exit Criteria

1. ✅ All existing unit tests pass (43 tests)
2. ✅ New unit tests pass (3 new tests for cache lookups)
3. ✅ Daemon starts and discovers worktrees without errors
4. ✅ Git ref watchers set up for each discovered worktree
5. ✅ Plan directory watchers set up for each discovered worktree
6. ✅ Git commits trigger sync_commits and appear in Convex
7. ✅ Plan edits trigger sync_plan and appear in Convex
8. ✅ Event handlers log errors but don't crash daemon
9. ✅ Manual testing checklist passes all 4 tests
10. ✅ Integration test framework documented for future work

## Estimated Time

- Task 1: Worktree discovery - 60 min
- Task 2: Watcher setup - 30 min
- Task 3: Wire event handlers - 30 min
- Task 4: Integration tests - 60 min

**Total: ~3 hours**

## Dependencies

**Requires (Phase 2.5):**
- ✅ `sync_commits()` function exists
- ✅ `sync_plan()` function exists
- ✅ Git module with commit parsing
- ✅ Watcher infrastructure (GitRef and Plan events)

**Enables (Phase 3):**
- UI components can read commits from Convex
- UI components can read plans from Convex
- Real-time data available for CommitListPanel, PlanQuicklook

## Rollback Plan

If issues arise during implementation:

**Scenario 1: Worktree discovery fails**
- Comment out discovery call in main.rs
- Daemon continues to sync teams/tasks as before
- Git and plan sync disabled until fixed
- No impact on existing functionality

**Scenario 2: Watcher setup crashes daemon**
- Wrap watcher setup in Result, log errors
- Continue even if some watchers fail
- Partial functionality better than crash

**Scenario 3: Event handlers cause sync errors**
- Revert to "log only" behavior (original lines 118-127)
- Investigate sync function issues separately
- Re-enable after fix

**Scenario 4: Performance issues (high CPU/memory)**
- Add rate limiting to sync functions
- Increase filesystem event debounce delay
- Limit worktree discovery frequency

All changes are additive - existing team/task sync functionality unaffected by rollback.

## Success Metrics

**Quantifiable goals:**

1. **Worktree discovery:** 100% of active orchestrations discovered at daemon startup
2. **Watcher setup success rate:** > 95% of git refs and plan directories watched successfully
3. **Commit sync latency:** < 5 seconds from git commit to Convex record
4. **Plan sync latency:** < 3 seconds from file save to Convex record
5. **Error recovery:** Daemon remains running through 10+ consecutive sync errors
6. **Test coverage:** 100% of new code covered by unit tests

**Measurement approach:**
- Baseline: No git/plan sync exists today (events logged but not processed)
- Validation: Manual testing checklist + unit tests
- Acceptance: All 6 metrics met in manual testing

## Notes

**Key design decisions:**

- **Worktree discovery at startup only**: Reduces overhead, assumes orchestrations are long-lived
  - Alternative considered: Periodic polling - rejected due to complexity
- **Cache-based event→worktree lookup**: O(n) search through small list (typically < 10 worktrees)
  - Alternative considered: HashMap by path - rejected due to complexity
- **Graceful degradation**: Log errors, continue running
  - Alternative considered: Crash on error - rejected for stability
- **Phase attribution from supervisor state**: Use current_phase at time of commit
  - Alternative considered: Parse from commit message - rejected as fragile

**Phase 3 readiness:**

After Phase 2.5.5 completes:
- Commits flowing into Convex in real-time ✅
- Plans synced on file changes ✅
- Shutdown events working (from Phase 1.5) ✅
- UI can query Convex for all data ✅
- Phase 3 focuses purely on UI components and rendering ✅

**Known limitations:**

1. Worktree discovery only at startup - new orchestrations not auto-discovered
   - Mitigation: Restart daemon (tina-session daemon restart) or implement periodic refresh
2. Phase attribution uses current_phase - may be incorrect if commit made during phase transition
   - Mitigation: Phase transitions are infrequent, minor issue
3. No bidirectional plan sync yet (Convex → filesystem)
   - Mitigation: Phase 3 can add if needed, not blocking for initial rollout

**Follow-up work (not in this phase):**

- Periodic worktree discovery refresh (every 5 minutes)
- Bidirectional plan sync (Convex edits → filesystem)
- Commit diff storage (currently only metadata)
- Performance optimization (memoization, debouncing)
- Automated integration tests (currently manual only)
