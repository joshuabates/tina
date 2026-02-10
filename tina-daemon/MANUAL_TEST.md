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
