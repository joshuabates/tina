# Phase 2: Axum Backend

## Context

Phase 1 extracted tina-data as a shared crate. The tina-data crate provides:
- `discovery::find_orchestrations()` -> `Vec<Orchestration>` (via team enumeration)
- `discovery::Orchestration` with full detail (team_name, tasks, members, status, phases)
- `discovery::OrchestrationStatus` (Executing/Blocked/Complete/Idle)
- `tasks::load_tasks()`, `tasks::TaskSummary`
- `teams::load_team()`, `teams::list_teams()`, `teams::find_teams_for_worktree()`
- `tina_state::load_supervisor_state()`, `tina_state::load_context_metrics()`
- `watcher::FileWatcher` with `WatchEvent::Refresh` / `WatchEvent::Error`
- `DataSource` for session-based loading with fixture support

All types from tina-session (SupervisorState, Task, Agent, Team, PhaseState, etc.) already derive Serialize.

## Goal

Create the `tina-web` crate: an Axum HTTP server on port 3100 that wraps tina-data functions as REST endpoints and provides a WebSocket for real-time updates. This phase is backend only -- no frontend.

## Implementation Steps

### Step 1: Create tina-web crate scaffold

Create `tina-web/Cargo.toml`:

```toml
[package]
name = "tina-web"
version = "0.1.0"
edition = "2021"
description = "Web dashboard backend for Tina orchestration monitoring"

[dependencies]
tina-data = { path = "../tina-data" }
tina-session = { path = "../tina-session" }

# Web framework
axum = { version = "0.7", features = ["ws"] }
tokio = { version = "1", features = ["full"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "fs"] }

# Data
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Utilities
anyhow = "1"

[dev-dependencies]
reqwest = { version = "0.12", features = ["json"] }
tokio-tungstenite = "0.24"
```

Create `tina-web/src/` with modules: `main.rs`, `api.rs`, `ws.rs`, `state.rs`.

### Step 2: Shared app state (`state.rs`)

The app state holds cached orchestration data and a broadcast channel for WebSocket updates.

```rust
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tina_data::discovery::Orchestration;

pub struct AppState {
    pub orchestrations: RwLock<Vec<Orchestration>>,
    pub tx: broadcast::Sender<String>,
}

impl AppState {
    pub fn new() -> Arc<Self> {
        let (tx, _) = broadcast::channel(64);
        Arc::new(Self {
            orchestrations: RwLock::new(vec![]),
            tx,
        })
    }

    pub async fn refresh(&self) -> anyhow::Result<()> {
        let orchestrations = tokio::task::spawn_blocking(|| {
            tina_data::discovery::find_orchestrations()
        }).await??;
        *self.orchestrations.write().await = orchestrations;
        let data = serde_json::to_string(&*self.orchestrations.read().await)?;
        let msg = serde_json::json!({
            "type": "orchestrations_updated",
            "data": serde_json::from_str::<serde_json::Value>(&data)?
        }).to_string();
        let _ = self.tx.send(msg);
        Ok(())
    }
}
```

Key decisions:
- `spawn_blocking` for file I/O (tina-data does synchronous fs reads)
- `RwLock` for concurrent read access from multiple API handlers
- `broadcast::channel` for fan-out to all WebSocket clients
- Refresh loads all data fresh (no incremental diffing per design doc)

### Step 3: REST API endpoints (`api.rs`)

Endpoints per design doc:

```
GET /api/health                      -> { "status": "ok" }
GET /api/orchestrations              -> Vec<Orchestration>
GET /api/orchestrations/:id          -> Orchestration
GET /api/orchestrations/:id/tasks    -> Vec<Task>
GET /api/orchestrations/:id/team     -> Vec<Agent>
GET /api/orchestrations/:id/phases   -> HashMap<String, PhaseState>
```

The `:id` parameter is the team name. Lookup is a linear scan of the cached Vec<Orchestration> by team_name. This is fine -- there will never be more than a handful of active orchestrations.

For the phases endpoint, load supervisor state via `tina_state::load_supervisor_state()` using the orchestration's `cwd` field. Return the `phases` HashMap from SupervisorState directly.

Error handling:
- 404 with `{"error": "Orchestration not found"}` when team_name doesn't match
- 500 with `{"error": "..."}` for internal errors

### Step 4: WebSocket handler (`ws.rs`)

Single endpoint: `GET /ws`

On connect:
1. Send current orchestration state immediately
2. Subscribe to the broadcast channel
3. Forward all broadcast messages to the WebSocket client

On disconnect: drop the subscription (automatic via broadcast receiver drop).

No client-to-server messages in v1 (read-only monitoring).

Use `axum::extract::ws::WebSocket` for upgrade handling.

### Step 5: File watcher integration (in `main.rs`)

Spawn a background task that:
1. Creates `tina_data::watcher::FileWatcher`
2. Polls `try_recv()` on a 500ms interval
3. On `WatchEvent::Refresh`, calls `state.refresh()`
4. Debounce: skip refresh if last refresh was < 1 second ago

The existing `FileWatcher` uses `std::sync::mpsc` (not async), so wrap it in a `spawn_blocking` or poll from a tokio task with `tokio::time::interval`.

### Step 6: Server startup (`main.rs`)

```rust
#[tokio::main]
async fn main() {
    let state = AppState::new();

    // Initial data load
    state.refresh().await.ok();

    // Spawn file watcher
    spawn_watcher(state.clone());

    // Build router
    let app = Router::new()
        .route("/api/health", get(api::health))
        .route("/api/orchestrations", get(api::list_orchestrations))
        .route("/api/orchestrations/:id", get(api::get_orchestration))
        .route("/api/orchestrations/:id/tasks", get(api::get_tasks))
        .route("/api/orchestrations/:id/team", get(api::get_team))
        .route("/api/orchestrations/:id/phases", get(api::get_phases))
        .route("/ws", get(ws::ws_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3100").await.unwrap();
    println!("tina-web listening on http://localhost:3100");
    axum::serve(listener, app).await.unwrap();
}
```

### Step 7: Tests

**Unit tests** (in each module):
- `api.rs`: Test JSON serialization of responses using mock state
- `state.rs`: Test refresh logic with spawn_blocking (needs temp fixture data)
- `ws.rs`: Test WebSocket upgrade and message format

**Integration test** (`tests/api_test.rs`):
- Start server on a random port
- Hit `/api/health` and assert 200 + body
- Hit `/api/orchestrations` and assert 200 + empty array (no live orchestrations in test)
- Hit `/api/orchestrations/nonexistent` and assert 404

## Files to Create

```
tina-web/
├── Cargo.toml
├── Cargo.lock              (generated)
├── src/
│   ├── main.rs
│   ├── api.rs
│   ├── ws.rs
│   └── state.rs
└── tests/
    └── api_test.rs
```

## Dependencies

- `axum 0.7` with `ws` feature for WebSocket
- `tokio 1` with `full` features
- `tower-http 0.6` with `cors` and `fs` features (cors for dev, fs for future static serving)
- `serde`, `serde_json` for JSON serialization
- `anyhow` for error handling
- Dev: `reqwest` for integration tests, `tokio-tungstenite` for WS tests

## Verification

1. `cargo build -p tina-web` compiles
2. `cargo test -p tina-web` passes all tests
3. `cargo run -p tina-web` starts and responds to `curl http://localhost:3100/api/health`
4. `curl http://localhost:3100/api/orchestrations` returns JSON array
5. WebSocket connects at `ws://localhost:3100/ws` and receives initial state

## Risks

- **tokio-tungstenite version**: Must match axum's tungstenite version. Check axum 0.7's dependency tree. If mismatch, use `reqwest` with websocket feature instead for tests.
- **FileWatcher polling**: The existing watcher uses `std::sync::mpsc`. Need to bridge sync/async carefully. The `tokio::time::interval` + `try_recv` approach avoids blocking the async runtime.
- **Serialization gaps**: `discovery::Orchestration` derives `Serialize` but some nested types (like `PathBuf`) serialize as strings. Verify the JSON output is reasonable for frontend consumption.
