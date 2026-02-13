# Mechanical Review Workbench Design — Phase 3: Daemon HTTP Server

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 76d6a08d0c9220731eff203e4412c52cca2d2150

**Goal:** Add an HTTP server to tina-daemon that serves git diff and file content from worktrees over localhost. The web UI (Phase 6) will consume these endpoints to render the Changes tab.

**Architecture:** Add `axum` as a dependency to tina-daemon. The HTTP server runs as a tokio task alongside the existing event loop (heartbeat, file watching, action subscription). Three stateless endpoints compute results from the worktree's git repo on each request. Port is configurable via `config.toml`.

**Phase context:** Phase 1 established Convex tables (reviews, reviewThreads, reviewChecks, reviewGates). Phase 2 added the tina-session review CLI. This phase adds the daemon HTTP layer that serves heavy/computed data (diffs, file content) that shouldn't live in Convex.

---

## Task 1: Add axum dependency and http_port config

**Files:**
- `tina-daemon/Cargo.toml`
- `tina-daemon/src/config.rs`

**Model:** opus

**review:** spec-only

**Depends on:** none

### Steps

1. Add `axum` and `tower-http` (for CORS) to `tina-daemon/Cargo.toml`:

```toml
# HTTP server
axum = "0.8"
tower-http = { version = "0.6", features = ["cors"] }
```

2. Add `http_port` field to `DaemonConfig`:

In `tina-daemon/src/config.rs`, add `http_port: u16` to `DaemonConfig`:

```rust
pub struct DaemonConfig {
    pub env: String,
    pub convex_url: String,
    pub auth_token: String,
    pub node_name: String,
    pub http_port: u16,
}
```

Add `http_port: Option<u16>` to `ProfileConfig`:

```rust
struct ProfileConfig {
    convex_url: Option<String>,
    auth_token: Option<String>,
    node_name: Option<String>,
    http_port: Option<u16>,
}
```

Add `http_port: Option<u16>` to `ConfigFile` (legacy flat field).

3. Resolve `http_port` in `from_file_and_env` following the same pattern as other fields:

```rust
let resolved_http_port = std::env::var("TINA_HTTP_PORT")
    .ok()
    .and_then(|s| s.parse::<u16>().ok())
    .or_else(|| profile.and_then(|p| p.http_port))
    .or(http_port)
    .unwrap_or(7842);
```

Default port: `7842`.

4. Wire through `build()`:

```rust
fn build(
    env: String,
    convex_url: Option<String>,
    auth_token: Option<String>,
    node_name: Option<String>,
    http_port: u16,
) -> Result<Self> {
    // ... existing validation ...
    Ok(Self {
        env,
        convex_url,
        auth_token,
        node_name,
        http_port,
    })
}
```

5. Update all existing test call sites for `build()` to pass `http_port: 7842`.

6. Add config test:

```rust
#[test]
fn test_build_with_custom_http_port() {
    let config = DaemonConfig::build(
        "prod".to_string(),
        Some("https://test.convex.cloud".to_string()),
        Some("token".to_string()),
        Some("node".to_string()),
        9999,
    )
    .unwrap();
    assert_eq!(config.http_port, 9999);
}
```

Run:
```bash
cargo test --manifest-path tina-daemon/Cargo.toml -- config
```
Expected: All config tests pass, including new http_port test.

---

## Task 2: Implement git diff functions

**Files:**
- `tina-daemon/src/git.rs`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Add `DiffFileStat` struct for the file list endpoint:

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffFileStat {
    pub path: String,
    pub status: String,       // "added", "modified", "deleted", "renamed"
    pub insertions: u32,
    pub deletions: u32,
    pub old_path: Option<String>, // for renames
}
```

2. Add `get_diff_file_list` function — runs `git diff --numstat --diff-filter=ACDMR --find-renames <base>...HEAD` and parses output:

```rust
pub fn get_diff_file_list(repo_path: &Path, base: &str) -> Result<Vec<DiffFileStat>> {
    // Run: git diff --numstat --diff-filter=ACDMR --find-renames <base>...HEAD
    // Also: git diff --name-status --diff-filter=ACDMR --find-renames <base>...HEAD
    // to get status (A/M/D/R) per file
    // Combine numstat (insertions/deletions) with name-status (file status)
}
```

Use two git commands:
- `git diff --name-status --diff-filter=ACDMR --find-renames {base}...HEAD` → file statuses
- `git diff --numstat --diff-filter=ACDMR --find-renames {base}...HEAD` → line counts

Parse and join them by file path. Map status letters: A→"added", M→"modified", D→"deleted", R→"renamed".

3. Add `DiffHunk` and `DiffLine` structs for the single-file diff:

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_count: u32,
    pub new_start: u32,
    pub new_count: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffLine {
    pub kind: String,          // "context", "add", "delete"
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub text: String,
}
```

4. Add `get_file_diff` function — runs `git diff -U3 <base>...HEAD -- <file>` and parses unified diff output into `Vec<DiffHunk>`:

```rust
pub fn get_file_diff(repo_path: &Path, base: &str, file: &str) -> Result<Vec<DiffHunk>> {
    // Run: git diff -U3 <base>...HEAD -- <file>
    // Parse unified diff format: @@ -old_start,old_count +new_start,new_count @@
    // Lines starting with ' ' = context, '+' = add, '-' = delete
}
```

5. Add `get_file_at_ref` function — runs `git show <ref>:<file>`:

```rust
pub fn get_file_at_ref(repo_path: &Path, git_ref: &str, file: &str) -> Result<String> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["show", &format!("{}:{}", git_ref, file)])
        .output()
        .context("Failed to run git show")?;
    if !output.status.success() {
        anyhow::bail!("git show failed: {}", String::from_utf8_lossy(&output.stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
```

6. Add unit tests for parsing functions:

- `test_parse_diff_file_list` — multi-file diff with add/modify/delete/rename
- `test_parse_diff_file_list_empty` — empty diff produces empty vec
- `test_parse_file_diff_hunks` — multi-hunk diff parses correctly
- `test_parse_file_diff_single_hunk` — context + add + delete lines
- `test_parse_file_diff_empty` — no diff for file produces empty vec
- `test_parse_diff_binary_file` — binary file stats handled (- -)

Run:
```bash
cargo test --manifest-path tina-daemon/Cargo.toml -- git
```
Expected: All git tests pass including new diff parsing tests.

---

## Task 3: Implement HTTP server module with axum routes

**Files:**
- `tina-daemon/src/http.rs` (new)
- `tina-daemon/src/lib.rs`

**Model:** opus

**review:** full

**Depends on:** 1, 2

### Steps

1. Create `tina-daemon/src/http.rs` with the HTTP server module.

2. Define `AppState` shared state:

```rust
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    // No mutable state needed — all endpoints are stateless git operations.
    // State struct exists for future extensibility (e.g., caching).
}
```

3. Define query parameter structs:

```rust
#[derive(Debug, serde::Deserialize)]
pub struct DiffListParams {
    pub worktree: String,
    pub base: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct DiffFileParams {
    pub worktree: String,
    pub base: String,
    pub file: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct FileParams {
    pub worktree: String,
    pub path: String,
    #[serde(rename = "ref")]
    pub git_ref: String,
}
```

4. Implement handler functions:

```rust
use axum::{extract::Query, http::StatusCode, Json};
use std::path::Path;

use crate::git;

pub async fn get_diff_list(
    Query(params): Query<DiffListParams>,
) -> Result<Json<Vec<git::DiffFileStat>>, (StatusCode, String)> {
    let worktree = Path::new(&params.worktree);
    if !worktree.exists() {
        return Err((StatusCode::BAD_REQUEST, format!("worktree not found: {}", params.worktree)));
    }
    tokio::task::spawn_blocking(move || {
        git::get_diff_file_list(Path::new(&params.worktree), &params.base)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map(Json)
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn get_diff_file(
    Query(params): Query<DiffFileParams>,
) -> Result<Json<Vec<git::DiffHunk>>, (StatusCode, String)> {
    let worktree = Path::new(&params.worktree);
    if !worktree.exists() {
        return Err((StatusCode::BAD_REQUEST, format!("worktree not found: {}", params.worktree)));
    }
    tokio::task::spawn_blocking(move || {
        git::get_file_diff(Path::new(&params.worktree), &params.base, &params.file)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map(Json)
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn get_file(
    Query(params): Query<FileParams>,
) -> Result<String, (StatusCode, String)> {
    let worktree = Path::new(&params.worktree);
    if !worktree.exists() {
        return Err((StatusCode::BAD_REQUEST, format!("worktree not found: {}", params.worktree)));
    }
    tokio::task::spawn_blocking(move || {
        git::get_file_at_ref(Path::new(&params.worktree), &params.git_ref, &params.path)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
```

5. Add router builder function:

```rust
use axum::Router;
use tower_http::cors::{Any, CorsLayer};

pub fn build_router() -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/diff", axum::routing::get(get_diff_list))
        .route("/diff/file", axum::routing::get(get_diff_file))
        .route("/file", axum::routing::get(get_file))
        .layer(cors)
}
```

6. Add `spawn_http_server` function:

```rust
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;
use tracing::info;

pub async fn spawn_http_server(
    port: u16,
    cancel: CancellationToken,
) -> Result<tokio::task::JoinHandle<()>, anyhow::Error> {
    let router = build_router();
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port)).await?;
    info!(port = port, "HTTP server listening");

    let handle = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async move { cancel.cancelled().await })
            .await
            .ok();
    });

    Ok(handle)
}
```

7. Register module in `lib.rs`:

```rust
pub mod http;
```

Run:
```bash
cargo check --manifest-path tina-daemon/Cargo.toml
```
Expected: Compiles without errors.

---

## Task 4: Wire HTTP server into daemon main loop

**Files:**
- `tina-daemon/src/main.rs`

**Model:** opus

**review:** spec-only

**Depends on:** 3

### Steps

1. Import the http module at the top of main.rs:

```rust
use tina_daemon::http;
```

2. After the heartbeat spawn (around line 196) and before the watcher setup, spawn the HTTP server:

```rust
// Start HTTP server
let http_cancel = cancel.clone();
let http_handle = http::spawn_http_server(config.http_port, http_cancel).await?;
```

3. In the clean shutdown section (after the main loop break), abort the HTTP server handle alongside the heartbeat:

```rust
heartbeat_handle.abort();
http_handle.abort();
info!("daemon stopped");
```

Run:
```bash
cargo check --manifest-path tina-daemon/Cargo.toml
```
Expected: Compiles without errors.

---

## Task 5: Add integration tests for HTTP endpoints

**Files:**
- `tina-daemon/src/http.rs`

**Model:** opus

**review:** full

**Depends on:** 3

### Steps

1. Add test dependencies to the `#[cfg(test)] mod tests` block in `http.rs`.

2. Create a test helper that initializes a git repo in a temp dir with known commits:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt; // for oneshot
    use tempfile::TempDir;
    use std::process::Command;

    fn setup_test_repo() -> TempDir {
        let dir = TempDir::new().unwrap();
        let repo = dir.path();
        // Initialize repo
        Command::new("git").args(["init"]).current_dir(repo).output().unwrap();
        Command::new("git").args(["config", "user.email", "test@test.com"]).current_dir(repo).output().unwrap();
        Command::new("git").args(["config", "user.name", "Test"]).current_dir(repo).output().unwrap();
        // Create initial commit on main
        std::fs::write(repo.join("hello.txt"), "hello\nworld\n").unwrap();
        Command::new("git").args(["add", "."]).current_dir(repo).output().unwrap();
        Command::new("git").args(["commit", "-m", "initial"]).current_dir(repo).output().unwrap();
        // Create branch and make changes
        Command::new("git").args(["checkout", "-b", "feature"]).current_dir(repo).output().unwrap();
        std::fs::write(repo.join("hello.txt"), "hello\nmodified world\n").unwrap();
        std::fs::write(repo.join("new.txt"), "new file\n").unwrap();
        Command::new("git").args(["add", "."]).current_dir(repo).output().unwrap();
        Command::new("git").args(["commit", "-m", "changes"]).current_dir(repo).output().unwrap();
        dir
    }
}
```

3. Test `GET /diff`:

```rust
#[tokio::test]
async fn test_get_diff_list() {
    let dir = setup_test_repo();
    let app = build_router();
    let worktree = dir.path().to_str().unwrap();

    let resp = app
        .oneshot(
            Request::builder()
                .uri(&format!("/diff?worktree={}&base=main", urlencoding::encode(worktree)))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
    let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
    let files: Vec<git::DiffFileStat> = serde_json::from_slice(&body).unwrap();
    assert!(files.len() >= 2); // hello.txt modified, new.txt added
}
```

4. Test `GET /diff/file`:

```rust
#[tokio::test]
async fn test_get_diff_file() {
    let dir = setup_test_repo();
    let app = build_router();
    let worktree = dir.path().to_str().unwrap();

    let resp = app
        .oneshot(
            Request::builder()
                .uri(&format!("/diff/file?worktree={}&base=main&file=hello.txt", urlencoding::encode(worktree)))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
    let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
    let hunks: Vec<git::DiffHunk> = serde_json::from_slice(&body).unwrap();
    assert!(!hunks.is_empty());
}
```

5. Test `GET /file`:

```rust
#[tokio::test]
async fn test_get_file() {
    let dir = setup_test_repo();
    let app = build_router();
    let worktree = dir.path().to_str().unwrap();

    let resp = app
        .oneshot(
            Request::builder()
                .uri(&format!("/file?worktree={}&path=hello.txt&ref=main", urlencoding::encode(worktree)))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
    let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
    let content = String::from_utf8(body.to_vec()).unwrap();
    assert!(content.contains("hello"));
    assert!(content.contains("world"));
}
```

6. Test error cases:

```rust
#[tokio::test]
async fn test_get_diff_nonexistent_worktree() {
    let app = build_router();
    let resp = app
        .oneshot(
            Request::builder()
                .uri("/diff?worktree=/nonexistent/path&base=main")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}
```

7. Add `urlencoding` dev-dependency to `tina-daemon/Cargo.toml`:

```toml
[dev-dependencies]
tempfile = "3"
urlencoding = "2"
tower = { version = "0.5", features = ["util"] }
```

Run:
```bash
cargo test --manifest-path tina-daemon/Cargo.toml -- http
```
Expected: All HTTP integration tests pass.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 600 |

---

## Phase Estimates

| Task | Estimated Duration |
|------|-------------------|
| Task 1: Add axum dependency and http_port config | 3 min |
| Task 2: Implement git diff functions | 5 min |
| Task 3: Implement HTTP server module | 4 min |
| Task 4: Wire HTTP server into main loop | 2 min |
| Task 5: Integration tests | 4 min |
| **Total** | **18 min** |

---

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
