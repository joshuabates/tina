# Phase 4: tina-session Convex Integration & SQLite Removal

## Goal

Replace all SQLite writes in tina-session with Convex writes via tina-data's `TinaConvexClient`. Remove the entire `db/` module, `daemon/sync.rs`, and the `rusqlite` dependency. The daemon module's file-watching/syncing responsibilities have moved to `tina-daemon` (Phase 3); tina-session only needs to write orchestration records on `init` and state transitions.

## Prerequisites

- Phase 2 complete: `tina-data` provides `TinaConvexClient` with `upsert_orchestration`, `upsert_phase`, `record_event`, and shared types (`OrchestrationRecord`, `PhaseRecord`, `OrchestrationEventRecord`)
- Phase 3 complete: `tina-daemon` handles file watching, team/task syncing to Convex, and inbound action dispatch. The tina-session embedded daemon is no longer needed for syncing.

## Scope

**In scope:**
- Replace `write_to_sqlite` in `commands/init.rs` with Convex write via tina-data
- Replace `sync_to_sqlite` in `commands/orchestrate.rs` with Convex write via tina-data
- Replace `upsert_phase_to_sqlite` and `update_orchestration_status_in_sqlite` in `commands/state.rs` with Convex writes
- Delete entire `src/db/` module (mod.rs, migrations.rs, orchestrations.rs, phases.rs, task_events.rs, orchestration_events.rs, team_members.rs, queries.rs, projects.rs)
- Delete `src/daemon/sync.rs` (syncing moved to tina-daemon)
- Remove `daemon/mod.rs` `run_foreground` function's SQLite usage (the embedded daemon becomes a no-op or is removed entirely since tina-daemon replaces it)
- Remove `rusqlite` from `Cargo.toml` dependencies
- Add `tina-data` and `tokio` dependencies to support async Convex calls
- All existing state machine tests (`state/orchestrate.rs`, `state/transitions.rs`) continue to pass unchanged
- `cargo build` and `cargo test` pass for tina-session

**Out of scope:**
- tina-web changes (Phase 5)
- tina-monitor changes (Phase 6)
- Changes to the state machine logic itself (stays pure, operates on SupervisorState)
- Changes to supervisor-state.json format or write path

## Architecture Decisions

### Async strategy

`TinaConvexClient` methods are async. tina-session commands are synchronous CLI entry points. We use `tokio::runtime::Runtime::new().block_on()` at the callsite (inside each command function) to run the async Convex calls. This is the simplest approach - no need to convert the entire CLI to async. The pattern:

```rust
fn write_to_convex(...) -> anyhow::Result<()> {
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        let mut client = tina_data::TinaConvexClient::new(&deployment_url).await?;
        client.upsert_orchestration(&record).await?;
        Ok(())
    })
}
```

### Convex deployment URL

Read from `~/.config/tina/config.toml` (same file tina-daemon uses). The config module in tina-daemon already defines this format. For tina-session, add a minimal config reader that extracts the `deployment_url` field. If config is missing, Convex writes are skipped with a warning (matches current SQLite error-handling pattern where failures are non-fatal).

### Node ID

tina-session doesn't manage node identity -- that's tina-daemon's responsibility. For `upsert_orchestration`, the `node_id` field is required by the Convex schema. Strategy: read the node ID from the config file (tina-daemon writes it there after registration). If missing, skip the Convex write with a warning.

### Non-fatal Convex writes

Match the existing pattern: all SQLite writes are wrapped in `if let Err(e) = ... { eprintln!("Warning: ...") }`. Convex writes follow the same pattern. The authoritative state is always `supervisor-state.json`; Convex is the reporting layer.

### Daemon module changes

The embedded daemon (`daemon/mod.rs` `run_foreground`) syncs teams/tasks to SQLite. With SQLite removed and tina-daemon handling sync, this function is no longer useful. Remove `run_foreground` and `daemon/sync.rs`. Keep the PID management functions (`start`, `stop`, `status`, `pid_path`) for backward compatibility -- they'll do nothing useful but won't break. The `daemon` CLI subcommands stay but `daemon run` prints a deprecation message pointing to tina-daemon.

## Implementation Steps

### Step 1: Add config reader for Convex deployment URL

Add a new module `src/config.rs` to tina-session that reads `~/.config/tina/config.toml`:

```rust
use std::path::PathBuf;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TinaConfig {
    pub deployment_url: String,
    pub node_id: Option<String>,
}

pub fn load_config() -> anyhow::Result<TinaConfig> {
    let path = config_path();
    let content = std::fs::read_to_string(&path)?;
    let config: TinaConfig = toml::from_str(&content)?;
    Ok(config)
}

pub fn config_path() -> PathBuf {
    dirs::config_dir()
        .expect("Could not determine config directory")
        .join("tina")
        .join("config.toml")
}
```

Add `toml = "0.8"` to dependencies.

### Step 2: Replace `write_to_sqlite` in `commands/init.rs`

Replace the `write_to_sqlite` function with `write_to_convex`:

```rust
fn write_to_convex(
    feature: &str,
    worktree_path: &Path,
    design_doc: &Path,
    branch: &str,
    total_phases: u32,
) -> anyhow::Result<()> {
    let config = tina_session::config::load_config()?;
    let node_id = config.node_id
        .ok_or_else(|| anyhow::anyhow!("node_id not set in config"))?;

    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        let mut client = tina_data::TinaConvexClient::new(&config.deployment_url).await?;
        let now = chrono::Utc::now().to_rfc3339();
        let record = tina_data::OrchestrationRecord {
            node_id,
            feature_name: feature.to_string(),
            design_doc_path: design_doc.to_string_lossy().to_string(),
            branch: branch.to_string(),
            worktree_path: Some(worktree_path.to_string_lossy().to_string()),
            total_phases: total_phases as i64,
            current_phase: 1,
            status: "planning".to_string(),
            started_at: now,
            completed_at: None,
            total_elapsed_mins: None,
        };
        client.upsert_orchestration(&record).await?;
        Ok(())
    })
}
```

Update the call in `run()`: change `write_to_sqlite(...)` to `write_to_convex(...)`.

Remove `use tina_session::db;` and the `find_repo_root` function (only used by SQLite for project lookups).

### Step 3: Replace `sync_to_sqlite` in `commands/orchestrate.rs`

Replace the `sync_to_sqlite` function with `sync_to_convex`:

```rust
fn sync_to_convex(
    feature: &str,
    state: &tina_session::state::schema::SupervisorState,
    phase: &str,
    action: &Action,
    event: Option<&AdvanceEvent>,
) -> anyhow::Result<()> {
    let config = tina_session::config::load_config()?;
    let node_id = config.node_id
        .ok_or_else(|| anyhow::anyhow!("node_id not set in config"))?;

    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        let mut client = tina_data::TinaConvexClient::new(&config.deployment_url).await?;

        // Upsert orchestration status
        let orch_record = build_orchestration_record(&node_id, state);
        client.upsert_orchestration(&orch_record).await?;

        // Upsert all phase records
        // (Need orchestration_id from Convex -- use feature_name as lookup key
        //  since upsertOrchestration returns the doc ID)
        // For phases, we pass the orchestration's Convex doc ID.
        // The upsert_orchestration call returns the ID.
        let orch_id = client.upsert_orchestration(&orch_record).await?;
        for (phase_key, phase_state) in &state.phases {
            let phase_record = build_phase_record(&orch_id, phase_key, phase_state);
            client.upsert_phase(&phase_record).await?;
        }

        // Record orchestration event
        let (event_type, summary, detail) = event_from_action(phase, action, event);
        let event_record = tina_data::OrchestrationEventRecord {
            orchestration_id: orch_id,
            phase_number: if phase == "validation" { None } else { Some(phase.to_string()) },
            event_type,
            source: "tina-session orchestrate".to_string(),
            summary,
            detail,
            recorded_at: chrono::Utc::now().to_rfc3339(),
        };
        client.record_event(&event_record).await?;
        Ok(())
    })
}
```

Add helper functions `build_orchestration_record` and `build_phase_record` that convert `SupervisorState` / `PhaseState` into tina-data record types.

Remove the `use tina_session::db::orchestration_events::OrchestrationEvent;` import.

### Step 4: Replace SQLite helpers in `commands/state.rs`

Replace `upsert_phase_to_sqlite` with `upsert_phase_to_convex` and `update_orchestration_status_in_sqlite` with `update_orchestration_status_in_convex`.

These follow the same pattern: load config, create tokio runtime, connect to Convex, call the appropriate tina-data method.

Remove `use tina_session::db;`.

### Step 5: Remove daemon sync module

Delete `src/daemon/sync.rs`.

Update `src/daemon/mod.rs`:
- Remove `pub mod sync;`
- Replace `run_foreground` body with a deprecation message:
  ```rust
  pub fn run_foreground() -> anyhow::Result<()> {
      eprintln!("Warning: The embedded daemon is deprecated. Use tina-daemon instead.");
      eprintln!("Install: cargo install --path tina-daemon");
      anyhow::bail!("Embedded daemon removed. Use tina-daemon for file sync.")
  }
  ```
- Remove `use crate::db;` from within `run_foreground`
- Keep `start`, `stop`, `status`, `pid_path` functions unchanged (PID management)
- Keep `watcher.rs` module (it's self-contained and not db-dependent; could be removed later but not breaking)

### Step 6: Delete `src/db/` module

Delete all files:
- `src/db/mod.rs`
- `src/db/migrations.rs`
- `src/db/orchestrations.rs`
- `src/db/phases.rs`
- `src/db/task_events.rs`
- `src/db/orchestration_events.rs`
- `src/db/team_members.rs`
- `src/db/queries.rs`
- `src/db/projects.rs`

Update `src/lib.rs`: remove `pub mod db;`

### Step 7: Update Cargo.toml dependencies

Remove:
- `rusqlite = { version = "0.31", features = ["bundled"] }`

Add:
- `tina-data = { path = "../tina-data" }`
- `tokio = { version = "1", features = ["rt-multi-thread"] }` (for `Runtime::new()`)
- `toml = "0.8"` (for config parsing)

Note: `tokio = { version = "1", features = ["full"] }` is already present. Keep it.

### Step 8: Build and test verification

- `cargo build -p tina-session` must succeed with zero SQLite references
- `cargo test -p tina-session` must pass -- all state machine tests in `state/orchestrate.rs` and `state/transitions.rs` are db-independent and must not be affected
- Tests in deleted modules (`db/`, `daemon/sync.rs`) are removed with the modules
- The `commands/init.rs` tests that call `run()` will trigger Convex writes; since config won't exist in test environments, the non-fatal error handling will print warnings but tests still pass
- Verify no remaining `rusqlite` or `crate::db` references with `grep -r "rusqlite\|crate::db\|use.*db::" src/`

## Files Changed

**New files:**
- `src/config.rs` -- Convex deployment URL and node ID config reader

**Modified files:**
- `Cargo.toml` -- remove rusqlite, add tina-data + toml
- `src/lib.rs` -- remove `pub mod db;`, add `pub mod config;`
- `src/commands/init.rs` -- replace `write_to_sqlite` with `write_to_convex`
- `src/commands/orchestrate.rs` -- replace `sync_to_sqlite` with `sync_to_convex`
- `src/commands/state.rs` -- replace SQLite helpers with Convex helpers
- `src/daemon/mod.rs` -- remove `pub mod sync;`, deprecate `run_foreground`

**Deleted files:**
- `src/db/mod.rs`
- `src/db/migrations.rs`
- `src/db/orchestrations.rs`
- `src/db/phases.rs`
- `src/db/task_events.rs`
- `src/db/orchestration_events.rs`
- `src/db/team_members.rs`
- `src/db/queries.rs`
- `src/db/projects.rs`
- `src/daemon/sync.rs`

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Convex client connection fails in CLI | All Convex writes are non-fatal (warning only). supervisor-state.json remains source of truth. |
| Config file missing (no tina-daemon installed yet) | Skip Convex writes with warning -- same pattern as current SQLite failures. |
| Node ID not set in config | Skip Convex write with warning. Node ID gets set when tina-daemon first runs. |
| tina-data circular dependency | tina-data already depends on tina-session (for re-exports). Adding tina-data as a dependency of tina-session would create a cycle. **Must resolve by extracting shared types into tina-session (already the case) and only using tina-data in the binary crate (src/commands/), not in src/lib.rs.** |
| Existing init tests break due to Convex | Tests don't have config file, so `write_to_convex` fails non-fatally. Tests verify worktree/state creation, not db writes. |

## Dependency Cycle Resolution

**Critical issue:** tina-data depends on tina-session (`tina-session = { path = "../tina-session" }`). If we add tina-data as a dependency of tina-session's library crate, we create a circular dependency.

**Solution:** Only use tina-data in the **binary** (`src/main.rs` and `src/commands/`), not in the library (`src/lib.rs`). The commands are compiled into the binary, not the library. In `Cargo.toml`, add tina-data as a regular dependency -- this works because the binary depends on both tina-session (as a library) and tina-data. The lib crate itself has no tina-data dependency.

Alternative: Move `config.rs` into the binary-side `src/commands/` module rather than `src/lib.rs`, since it's only used by commands.

**Verification:** `cargo build -p tina-session` succeeds without cycle errors.
