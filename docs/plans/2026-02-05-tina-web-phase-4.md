# Phase 4: End-to-End Validation

> **For Claude:** Use tina:executing-plans to implement this plan.

## Context

Phases 1-3 created the full tina-web stack:
- **tina-data**: Shared data layer extracted from tina-monitor. `DataSource` for fixture-based loading, `discovery::find_orchestrations()` for live discovery via `~/.claude/teams/`.
- **tina-web backend**: Axum on port 3100 with REST API (`/api/orchestrations`, `/api/health`, etc.) and WebSocket (`/ws`) with file-watcher-driven updates.
- **tina-web frontend**: React + TypeScript + Tailwind with `OrchestrationList`, `OrchestrationDetail`, `TaskList`, `TeamPanel`, `StatusBar` components. WebSocket hook with reconnection.

None of this has been validated end-to-end. The frontend has no `data-testid` attributes for Playwright selection. The backend's `AppState::reload()` calls `find_orchestrations()` which reads from `~/.claude/teams/` (hardcoded `dirs::home_dir()`), making it impossible to test with fixture data. There is no integration test that writes known state to disk, starts the server, and verifies the UI matches.

## Goal

Create an end-to-end validation pipeline:
1. Write known orchestration state to a temp directory
2. Start tina-web backend reading from that directory
3. Hit the REST API and verify responses match expected data
4. Add `data-testid` attributes to frontend components for Playwright selectability
5. Build the frontend so the backend can serve it

This phase does NOT require running Playwright -- that's a manual validation step. The automated tests validate the data pipeline (fixture -> tina-data -> REST API -> correct JSON).

## Architecture

```
Integration test flow:
  TempDir with fixture data
    -> AppState with configurable base path
    -> Axum test server (tower::ServiceExt::oneshot)
    -> Assert JSON response matches expected
```

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 500 |

### Phase Estimates

| Task | Est. Lines | Model |
|------|-----------|-------|
| Task 1: Configurable base paths in AppState | ~60 | haiku |
| Task 2: Fixture writer utility | ~120 | haiku |
| Task 3: Integration tests for REST API | ~150 | haiku |
| Task 4: Add data-testid attributes to frontend | ~80 | haiku |
| Task 5: Build frontend and verify full stack | ~10 | haiku |
| **Total** | **~420** | |

ROI: Mostly test infrastructure and minor attribute additions. Mechanical work -- haiku for all.

---

## Tasks

### Task 1: Make AppState accept configurable base paths

Currently `AppState::reload()` calls `find_orchestrations()` which reads from `dirs::home_dir()`. This must be configurable for tests.

**Files:**
- `tina-web/src/state.rs`
- `tina-data/src/discovery.rs`

**Model:** haiku

**Steps:**

1. Add a `find_orchestrations_in(base_dir: &Path)` function to `tina-data/src/discovery.rs` that takes a base directory instead of using `dirs::home_dir()`. The existing `find_orchestrations()` calls this with the default home dir. The new function:
   - Lists teams from `{base_dir}/.claude/teams/`
   - Loads each team config from that directory
   - For each team, checks for supervisor state at the cwd found in team config
   - Returns `Vec<Orchestration>`

Update `tina-data/src/teams.rs` to add `list_teams_in(base: &Path)` and `load_team_in(base: &Path, name: &str)` that take an explicit base path. The existing `list_teams()` / `load_team()` become thin wrappers.

Similarly update `tina-data/src/tasks.rs` to add `load_tasks_in(base: &Path, session_id: &str)`.

2. Update `tina-web/src/state.rs`:

Add a `base_dir: Option<PathBuf>` field to `AppState`. Add `AppState::with_base_dir(base_dir: PathBuf) -> Arc<Self>` constructor. Update `reload()` to use `find_orchestrations_in()` when `base_dir` is set, otherwise `find_orchestrations()`.

3. Run:

```bash
cargo test -p tina-data && cargo test -p tina-web
```

Expected: All existing tests pass. No behavior change for default paths.

---

### Task 2: Fixture writer utility for integration tests

Create a test utility that writes realistic orchestration state to a temp directory. This creates the file structure that `find_orchestrations_in()` expects.

**Files:**
- `tina-web/tests/fixture.rs` (test helper module)

**Model:** haiku

**Steps:**

1. Create `tina-web/tests/fixture.rs` with:

```rust
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

/// Creates a complete orchestration fixture in a temp directory.
/// Returns the TempDir (which must be kept alive) and the base dir path.
pub struct FixtureBuilder {
    dir: TempDir,
}

impl FixtureBuilder {
    pub fn new() -> Self {
        Self {
            dir: TempDir::new().unwrap(),
        }
    }

    /// Get the base directory path (equivalent to home dir)
    pub fn base_dir(&self) -> PathBuf {
        self.dir.path().to_path_buf()
    }

    /// Create a team with config.json
    /// team members will have cwd set to worktree_path
    pub fn add_team(
        &self,
        team_name: &str,
        worktree_path: &Path,
        members: &[(&str, &str)], // (name, agent_type)
    ) -> &Self {
        // creates ~/.claude/teams/{team_name}/config.json
        // with proper Team JSON matching tina-session schema
        ...
    }

    /// Create a supervisor-state.json in a worktree
    pub fn add_supervisor_state(
        &self,
        worktree_path: &Path,
        feature: &str,
        total_phases: u32,
        current_phase: u32,
        status: &str, // "executing", "complete", etc.
    ) -> &Self {
        // creates {worktree_path}/.claude/tina/supervisor-state.json
        ...
    }

    /// Create a session lookup in ~/.claude/tina-sessions/
    pub fn add_session_lookup(
        &self,
        feature: &str,
        worktree_path: &Path,
    ) -> &Self {
        // creates ~/.claude/tina-sessions/{feature}.json
        ...
    }

    /// Create task files for a team
    pub fn add_tasks(
        &self,
        session_id: &str,
        tasks: &[(&str, &str, &str)], // (id, subject, status)
    ) -> &Self {
        // creates ~/.claude/tasks/{session_id}/{id}.json
        ...
    }
}
```

Fill in the method bodies with JSON that matches the exact serde format used by `tina-session/src/state/schema.rs` types. Use the test fixtures from `tina-data/src/teams.rs` and `tina-data/src/tina_state.rs` as reference for the exact JSON shape.

Key details:
- Team config must use `camelCase` field names (`createdAt`, `leadAgentId`, `leadSessionId`, `agentId`, `agentType`, `joinedAt`, `tmuxPaneId`)
- Task files must use `camelCase` (`activeForm`, `blockedBy`)
- SupervisorState uses `snake_case` (`design_doc`, `worktree_path`, `total_phases`, `current_phase`, `orchestration_started_at`)
- OrchestrationStatus in supervisor state is simple: `"executing"`, `"complete"`, etc.

2. Write a simple test in the same file that creates a fixture and verifies the files exist:

```rust
#[test]
fn test_fixture_creates_files() {
    let fixture = FixtureBuilder::new();
    let worktree = fixture.base_dir().join("worktrees").join("test-project");
    fixture.add_team("test-orchestration", &worktree, &[("leader", "team-lead")]);
    fixture.add_supervisor_state(&worktree, "test-feature", 3, 2, "executing");

    assert!(fixture.base_dir().join(".claude/teams/test-orchestration/config.json").exists());
    assert!(worktree.join(".claude/tina/supervisor-state.json").exists());
}
```

3. Run:

```bash
cargo test -p tina-web test_fixture_creates_files
```

Expected: Test passes.

---

### Task 3: Integration tests for REST API with fixture data

Use the fixture builder and configurable AppState to test the full data pipeline.

**Files:**
- `tina-web/tests/api_integration.rs`

**Model:** haiku

**Steps:**

1. Create `tina-web/tests/api_integration.rs`:

```rust
mod fixture;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

use tina_web::state::AppState;

/// Helper: build app with fixture data and make a request
async fn get_json(fixture: &fixture::FixtureBuilder, path: &str) -> (StatusCode, serde_json::Value) {
    let state = AppState::with_base_dir(fixture.base_dir());
    state.reload().await;
    let app = tina_web::build_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri(path)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
    (status, json)
}
```

2. Add tests:

**test_list_orchestrations_with_fixture**: Create a fixture with one orchestration team. Hit `GET /api/orchestrations`. Assert response is a JSON array with one element. Assert `team_name`, `feature_name`, `current_phase`, `total_phases` match fixture values.

**test_get_single_orchestration**: Create fixture, hit `GET /api/orchestrations/{team_name}`. Assert 200 and correct fields.

**test_get_nonexistent_returns_404**: Hit `GET /api/orchestrations/nonexistent` with fixture data. Assert 404.

**test_orchestration_tasks**: Create fixture with tasks. Hit `GET /api/orchestrations/{id}/tasks`. Assert task count and statuses match.

**test_orchestration_team_members**: Create fixture with team members. Hit `GET /api/orchestrations/{id}/team`. Assert member names match.

**test_empty_base_dir**: Create empty fixture. Hit `GET /api/orchestrations`. Assert empty array.

**test_multiple_orchestrations**: Create fixture with two orchestration teams. Assert both appear in list.

3. Run:

```bash
cargo test -p tina-web --test api_integration
```

Expected: All integration tests pass.

---

### Task 4: Add data-testid attributes to frontend components

Add `data-testid` attributes to key elements so Playwright can select them reliably. This is strictly additive -- no behavior changes.

**Files:**
- `tina-web/frontend/src/components/OrchestrationList.tsx`
- `tina-web/frontend/src/components/OrchestrationDetail.tsx`
- `tina-web/frontend/src/components/TaskList.tsx`
- `tina-web/frontend/src/components/TeamPanel.tsx`
- `tina-web/frontend/src/components/StatusBar.tsx`

**Model:** haiku

**Steps:**

1. `OrchestrationList.tsx`:
   - Add `data-testid="orchestration-list"` to the outer `<div>`
   - Add `data-testid="empty-state"` to the "No orchestrations found" div
   - Add `data-testid={`orchestration-row-${orch.team_name}`}` to each `<tr>`
   - Add `data-testid="orchestration-team-name"` to the team name `<td>`
   - Add `data-testid="orchestration-feature"` to the feature `<td>`
   - Add `data-testid="orchestration-phase"` to the phase `<td>`
   - Add `data-testid="orchestration-tasks"` to the tasks `<td>`
   - Add `data-testid="orchestration-status"` to the status `<td>`

2. `OrchestrationDetail.tsx`:
   - Add `data-testid="orchestration-detail"` to the outer `<div>`
   - Add `data-testid="detail-feature-name"` to the `<h1>` feature name
   - Add `data-testid="detail-status-badge"` to the status badge `<span>`
   - Add `data-testid="detail-team-name"` to the team name `<span>`
   - Add `data-testid="detail-phase"` to the phase `<span>`

3. `TaskList.tsx`:
   - Add `data-testid={`task-list-${title.toLowerCase().replace(/\s+/g, '-')}`}` to outer `<div>`
   - Add `data-testid={`task-${task.id}`}` to each `<li>`
   - Add `data-testid="task-status"` to the status icon `<span>`
   - Add `data-testid="task-subject"` to the subject `<span>`

4. `TeamPanel.tsx`:
   - Add `data-testid="team-panel"` to outer `<div>`
   - Add `data-testid={`member-${member.name}`}` to each `<li>`

5. `StatusBar.tsx`:
   - Add `data-testid="status-bar"` to the outer `<div>`
   - Add `data-testid="ws-status"` to the connection indicator `<span>`
   - Add `data-testid="orchestration-count"` to the count `<span>`

6. Run:

```bash
cd tina-web/frontend && npm run build
```

Expected: Clean build, no TypeScript errors. `dist/` directory updated.

---

### Task 5: Verify full stack compiles and all tests pass

**Files:** none (verification only)

**Model:** haiku

**review:** spec-only

**Steps:**

1. Build everything:

```bash
cargo build -p tina-data -p tina-web
```

Expected: Clean build.

2. Run all Rust tests:

```bash
cargo test -p tina-data && cargo test -p tina-web
```

Expected: All unit tests and integration tests pass.

3. Build frontend:

```bash
cd tina-web/frontend && npm run build
```

Expected: Clean build, `dist/` created.

4. Verify line count stays within budget:

```bash
wc -l tina-web/tests/fixture.rs tina-web/tests/api_integration.rs
```

Expected: Under 500 total new lines.

---

## Success Criteria

1. `AppState::with_base_dir()` allows configuring data source directory
2. `find_orchestrations_in(base)` reads from configurable paths instead of hardcoded `~/.claude/`
3. `FixtureBuilder` can create realistic orchestration state in temp directories
4. Integration tests verify: list orchestrations, get single orchestration, get tasks, get team, 404 for missing, empty state, multiple orchestrations
5. All frontend components have `data-testid` attributes on key elements
6. `cargo test -p tina-data && cargo test -p tina-web` passes with zero failures
7. `npm run build` in `tina-web/frontend/` succeeds
8. Total new code < 500 lines

## Not in This Phase

- Running Playwright tests (manual validation step, uses Playwright MCP tools)
- tina-harness integration (harness scenarios test orchestration outcomes, not monitoring)
- WebSocket integration tests (complex setup with async channels; REST coverage is sufficient for data validation)
- Frontend unit tests with testing-library (data-testid attributes enable Playwright, which is the validation path)
- Three-way comparison automation (future work after manual Playwright validation proves the pipeline)

## Verification Commands

```bash
# Run all tests
cargo test -p tina-data && cargo test -p tina-web

# Run only integration tests
cargo test -p tina-web --test api_integration

# Build frontend
cd tina-web/frontend && npm run build

# Manual: start server and verify in browser
cd tina-web && cargo run
# Then open http://localhost:3100
```

## Risks

- **find_orchestrations_in path threading**: The current `try_load_orchestration` calls `teams::load_team()` and `tasks::load_tasks()` which use hardcoded `dirs::home_dir()`. All of these need to accept a base path. This is the most invasive change but it's mechanical -- adding a `_in` variant of each function.
- **Fixture JSON shape drift**: If the tina-session schema types change, fixture JSON must be updated. Mitigated by using the same serde format strings that the production code uses.
- **discovery.rs worktree resolution**: `find_worktree_for_orchestration` calls `load_session_lookup` which reads from `~/.claude/tina-sessions/`. The fixture needs to create session lookups in the right location relative to base_dir.
