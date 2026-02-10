//! Integration tests for git commit and plan sync.
//!
//! These tests require:
//! - Convex dev environment running
//! - Test worktree with git repo
//! - Orchestration fixture in Convex
//!
//! Run with: cargo test --test integration_test -- --ignored

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
