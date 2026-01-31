# Phase 2.5: Schema Alignment Fixes - Implementation Plan

## Overview

This phase addresses specific schema alignment gaps discovered during Phase 2 implementation. The issues prevent tina-monitor from correctly reading data written by tina-session.

**Scope**: Fix 4 specific schema mismatches between tina-monitor and tina-session.
**Line Budget**: ~40 lines changed (mostly type definitions and path logic)

---

## Issues to Address

| # | Issue | Location | Root Cause |
|---|-------|----------|------------|
| 1 | SessionLookup schema mismatch | `src/types.rs` | Missing `cwd` and `created_at` fields |
| 2 | DataSource ignores SessionLookup.cwd | `src/data.rs` | Uses hardcoded path function instead of cwd field |
| 3 | Supervisor state filename wrong | `src/data.rs` | Reads `status.json` but should be `supervisor-state.json` |
| 4 | Team file path structure wrong | `src/data.rs` | Uses `{name}.json` but should be `{name}/config.json` |

---

## Task 1: Fix SessionLookup Schema

**File**: `src/types.rs`

**Problem**: Phase 2 plan shows SessionLookup with correct fields, but the struct may be missing required fields to match tina-session's `session/lookup.rs:14-18`:

```rust
// tina-session's SessionLookup (authoritative)
pub struct SessionLookup {
    pub feature: String,
    pub cwd: PathBuf,
    pub created_at: DateTime<Utc>,
}
```

**Verification**: Ensure `src/types.rs` SessionLookup matches exactly:
- `feature: String`
- `cwd: PathBuf`
- `created_at: DateTime<Utc>`

**Test**: Round-trip deserialization test with fixture file.

---

## Task 2: Fix DataSource to Use SessionLookup.cwd

**File**: `src/data.rs`

**Problem**: The `load_orchestration` method should use `lookup.cwd` directly instead of calling a hardcoded path function.

**Current (incorrect)**:
```rust
fn load_orchestration(&mut self, feature: &str) -> Result<&Orchestration> {
    let lookup = self.load_session_lookup(feature)?;
    // BUG: ignores lookup.cwd, uses some other path derivation
    let state = self.load_supervisor_state(&lookup_to_worktree_path())?;
    ...
}
```

**Correct**:
```rust
fn load_orchestration(&mut self, feature: &str) -> Result<&Orchestration> {
    let lookup = self.load_session_lookup(feature)?;
    // Use lookup.cwd directly - it's the worktree path
    let state = self.load_supervisor_state(&lookup.cwd)?;
    ...
}
```

**Fixture handling**: When running with `--fixture`, the `cwd` in session lookup may be relative. The DataSource should resolve it relative to the fixture path:
```rust
fn resolve_worktree_path(&self, cwd: &Path) -> PathBuf {
    match &self.fixture_path {
        Some(base) if cwd.is_relative() => base.join(cwd),
        _ => cwd.to_path_buf(),
    }
}
```

---

## Task 3: Fix Supervisor State Filename

**File**: `src/data.rs`

**Problem**: The `load_supervisor_state` method uses wrong filename.

**Current (incorrect)**:
```rust
fn load_supervisor_state(&self, worktree: &Path) -> Result<SupervisorState> {
    let path = worktree.join(".claude/tina/status.json"); // WRONG
    ...
}
```

**Correct** (matches tina-session's `state/schema.rs:207-210`):
```rust
fn load_supervisor_state(&self, worktree: &Path) -> Result<SupervisorState> {
    let path = worktree.join(".claude/tina/supervisor-state.json"); // CORRECT
    ...
}
```

---

## Task 4: Fix Team File Path Structure

**File**: `src/data.rs`

**Problem**: Teams are stored as directories with config files, not as individual JSON files.

**Current (incorrect)**:
```rust
fn load_team(&self, name: &str) -> Result<Team> {
    let path = self.teams_dir().join(format!("{}.json", name)); // WRONG
    ...
}
```

**Correct** (matches claude-code structure and existing `src/data/teams.rs:14-18`):
```rust
fn load_team(&self, name: &str) -> Result<Team> {
    let path = self.teams_dir().join(name).join("config.json"); // CORRECT
    ...
}
```

---

## Task 5: Update Fixture Files

**Directory**: `tests/fixtures/sample-orchestration/`

Ensure fixture files match the corrected paths:

1. **Session lookup** at `tina-sessions/test-feature.json`:
   - Must have `cwd` field pointing to worktree
   - Must have `created_at` field

2. **Supervisor state** at `worktree/.claude/tina/supervisor-state.json`:
   - Filename is already correct in Phase 2 plan

3. **Team config** at `teams/test-feature/config.json`:
   - Must be in subdirectory, not flat file

---

## Task 6: Add Missing Chrono Dependency

**File**: `Cargo.toml`

Ensure chrono is enabled with serde feature for DateTime deserialization:
```toml
chrono = { version = "0.4", features = ["serde"] }
```

---

## Verification

After implementing these fixes:

```bash
# Build should succeed
cargo build -p tina-monitor

# Unit tests should pass
cargo test -p tina-monitor

# Integration test with fixture should load data correctly
cargo run -p tina-monitor -- --fixture tests/fixtures/sample-orchestration/
```

---

## Code Locations Reference

**tina-session (authoritative)**:
- SessionLookup: `tina-session/src/session/lookup.rs:14-18`
- SupervisorState: `tina-session/src/state/schema.rs:148-164`
- State path: `tina-session/src/state/schema.rs:207-210`

**tina-monitor (existing, correct)**:
- Team loading: `tina-monitor/src/data/teams.rs:14-18` (uses `{name}/config.json`)
- Supervisor state: `tina-monitor/src/data/tina_state.rs:12-14` (uses `supervisor-state.json`)

The existing code in `src/data/` has correct paths. The Phase 2 rebuild code needs to match these patterns.

---

## Success Criteria

1. SessionLookup in `types.rs` has `cwd: PathBuf` and `created_at: DateTime<Utc>`
2. `load_orchestration` uses `lookup.cwd` directly
3. Supervisor state loads from `supervisor-state.json`
4. Team config loads from `{name}/config.json`
5. Fixture tests pass with correct directory structure
6. No breaking changes to existing Phase 1/2 functionality
