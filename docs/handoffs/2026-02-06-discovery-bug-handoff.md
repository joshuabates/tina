# Handoff: Discovery Bug — Wrong Orchestration Data

## Problem

The tina-web dashboard shows all orchestrations with identical data (same feature name, phase, status). The API at `GET /api/orchestrations` returns 4 orchestrations that all have `feature_name: "gray-box-303"` despite being different teams.

## Root Cause

`tina-data/src/discovery.rs:165-181` — `find_worktree_for_orchestration_in()`:

1. Strips `-orchestration` from team name to derive feature name
2. Looks up `~/.claude/tina-sessions/{feature}.json` for the worktree path
3. Only ONE session lookup file exists (`gray-box-303.json`)
4. For teams without a matching session file (e.g. `layout-engine-orchestration` → looks for `layout-engine.json` → not found), it falls back to `member_cwd` (line 180)
5. `member_cwd` comes from `team.members.first().cwd` (line 189-193)
6. Multiple teams share the same `member_cwd` (e.g. `/Users/joshua/Projects/max4live`)
7. `load_supervisor_state()` then searches for `supervisor-state.json` starting from that path and finds the `gray-box-303` state in a `.worktrees/` subdirectory
8. Result: all teams resolve to the same supervisor state → same data displayed

## Where the Bug Lives

- **File**: `tina-data/src/discovery.rs`
- **Function**: `try_load_orchestration_in()` (line 184-236)
- **Helper**: `find_worktree_for_orchestration_in()` (line 165-181)
- **Also relevant**: `tina_state::load_supervisor_state()` in `tina-data/src/tina_state.rs` — check if it searches subdirectories (which would explain finding gray-box-303 state from a parent dir)

## Suggested Fix

For orchestration teams (those ending in `-orchestration`), if there's no session lookup file, return `None` instead of falling back to `member_cwd`. The fallback is the wrong behavior — it causes cross-contamination between orchestrations.

```rust
// In find_worktree_for_orchestration_in, around line 165-181
fn find_worktree_for_orchestration_in(...) -> Option<PathBuf> {
    if team_name.ends_with("-orchestration") {
        let feature = team_name.trim_end_matches("-orchestration");
        let lookup_result = match base_dir {
            Some(base) => load_session_lookup_in(base, feature),
            None => {
                let home = dirs::home_dir().expect("...");
                load_session_lookup_in(&home, feature)
            }
        };
        // Return None instead of falling back to member_cwd
        return lookup_result.ok().map(|l| l.cwd);
    }
    // Non-orchestration teams still use member_cwd
    Some(member_cwd.clone())
}
```

Then update `try_load_orchestration_in` to handle the `None`:

```rust
let worktree_path = match find_worktree_for_orchestration_in(...) {
    Some(path) => path,
    None => return Ok(None), // No session lookup → skip this orchestration
};
```

## Verification

1. `cargo test -p tina-data` — existing tests must pass
2. `cargo test -p tina-web` — existing tests must pass
3. Manual: `curl http://localhost:3100/api/orchestrations` should show only `gray-box-303-orchestration` (the one with a valid session lookup), not the other 4 teams that lack session files
4. Add a test for the "no session lookup → return None" case

## Files to Change

- `tina-data/src/discovery.rs` — fix `find_worktree_for_orchestration_in` return type and `try_load_orchestration_in` handling
- Possibly `tina-data/src/tina_state.rs` — check if `load_supervisor_state` searches subdirectories (if so, that's a secondary issue)

## Context

- Server runs from `tina-web/`: `cd tina-web && cargo run`
- Frontend at `tina-web/frontend/`: `npm run build` then served by the Rust server
- Real team data lives in `~/.claude/teams/` and `~/.claude/tasks/`
- Session lookups in `~/.claude/tina-sessions/`
- The only session lookup file is `gray-box-303.json`
