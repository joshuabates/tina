use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::extract::Query;
use axum::http::{HeaderValue, Method, StatusCode};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tower_http::cors::{Any, CorsLayer};
use tina_data::TinaConvexClient;
use tracing::info;

use crate::git;
use crate::sessions;
use crate::terminal;

/// Shared application state for HTTP handlers.
#[derive(Clone)]
pub struct AppState {
    pub convex_client: Option<Arc<Mutex<TinaConvexClient>>>,
}

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

#[derive(Debug, serde::Deserialize)]
pub struct CommitDetailsParams {
    pub worktree: String,
    pub shas: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetailsResponse {
    pub commits: Vec<git::GitCommit>,
    pub missing_shas: Vec<String>,
}

fn validate_worktree_path(raw: &str) -> Result<PathBuf, (StatusCode, String)> {
    let worktree = Path::new(raw);
    if !worktree.is_absolute() {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("worktree must be an absolute path: {}", raw),
        ));
    }

    let canonical = std::fs::canonicalize(worktree).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            format!("worktree not found: {}", raw),
        )
    })?;

    if !canonical.is_dir() {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("worktree is not a directory: {}", canonical.display()),
        ));
    }

    if !canonical.join(".git").exists() {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("worktree is not a git worktree: {}", canonical.display()),
        ));
    }

    Ok(canonical)
}

fn parse_sha_list(raw: &str) -> Result<Vec<String>, (StatusCode, String)> {
    let shas = raw
        .split(',')
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    if shas.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "shas must include at least one SHA".to_string(),
        ));
    }

    Ok(shas)
}

fn map_git_error(op: &str, error: anyhow::Error) -> (StatusCode, String) {
    let message = error.to_string();
    let lowered = message.to_ascii_lowercase();

    let status = if lowered.contains("unknown revision")
        || lowered.contains("bad revision")
        || lowered.contains("invalid object name")
        || lowered.contains("ambiguous argument")
        || lowered.contains("invalid commit sha")
    {
        StatusCode::BAD_REQUEST
    } else {
        StatusCode::INTERNAL_SERVER_ERROR
    };

    (status, format!("{}: {}", op, message))
}

pub async fn get_diff_list(
    Query(params): Query<DiffListParams>,
) -> Result<Json<Vec<git::DiffFileStat>>, (StatusCode, String)> {
    let worktree = validate_worktree_path(&params.worktree)?;
    tokio::task::spawn_blocking(move || git::get_diff_file_list(&worktree, &params.base))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map(Json)
        .map_err(|e| map_git_error("diff list failed", e))
}

pub async fn get_diff_file(
    Query(params): Query<DiffFileParams>,
) -> Result<Json<Vec<git::DiffHunk>>, (StatusCode, String)> {
    let worktree = validate_worktree_path(&params.worktree)?;
    tokio::task::spawn_blocking(move || git::get_file_diff(&worktree, &params.base, &params.file))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map(Json)
        .map_err(|e| map_git_error("file diff failed", e))
}

pub async fn get_file(Query(params): Query<FileParams>) -> Result<String, (StatusCode, String)> {
    let worktree = validate_worktree_path(&params.worktree)?;
    tokio::task::spawn_blocking(move || {
        git::get_file_at_ref(&worktree, &params.git_ref, &params.path)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| map_git_error("file lookup failed", e))
}

pub async fn get_commit_details(
    Query(params): Query<CommitDetailsParams>,
) -> Result<Json<CommitDetailsResponse>, (StatusCode, String)> {
    let worktree = validate_worktree_path(&params.worktree)?;
    let shas = parse_sha_list(&params.shas)?;
    let requested_count = shas.len();

    let lookup = tokio::task::spawn_blocking(move || git::get_commit_details_by_sha(&worktree, &shas))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|e| map_git_error("commit lookup failed", e))?;

    if lookup.commits.is_empty() && lookup.missing_shas.len() == requested_count {
        return Err((
            StatusCode::NOT_FOUND,
            format!("commits not found: {}", lookup.missing_shas.join(",")),
        ));
    }

    Ok(Json(CommitDetailsResponse {
        commits: lookup.commits,
        missing_shas: lookup.missing_shas,
    }))
}

async fn get_health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

pub fn build_router() -> Router {
    build_router_with_state(AppState {
        convex_client: None,
    })
}

pub fn build_router_with_state(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost:5173"),
            HeaderValue::from_static("http://127.0.0.1:5173"),
            HeaderValue::from_static("http://localhost:4173"),
            HeaderValue::from_static("http://127.0.0.1:4173"),
        ])
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(Any);

    Router::new()
        .route("/health", get(get_health))
        .route("/diff", get(get_diff_list))
        .route("/diff/file", get(get_diff_file))
        .route("/file", get(get_file))
        .route("/commits", get(get_commit_details))
        .route(
            "/ws/terminal/{paneId}",
            get(terminal::ws_terminal_handler),
        )
        .route("/sessions", post(sessions::create_session))
        .route(
            "/sessions/{sessionName}",
            delete(sessions::delete_session),
        )
        .with_state(state)
        .layer(cors)
}

pub async fn spawn_http_server(
    port: u16,
    cancel: CancellationToken,
) -> Result<tokio::task::JoinHandle<()>, anyhow::Error> {
    spawn_http_server_with_client(port, cancel, None).await
}

pub async fn spawn_http_server_with_client(
    port: u16,
    cancel: CancellationToken,
    convex_client: Option<Arc<Mutex<TinaConvexClient>>>,
) -> Result<tokio::task::JoinHandle<()>, anyhow::Error> {
    let router = build_router_with_state(AppState { convex_client });
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn test_router() -> Router {
        build_router()
    }

    fn get(uri: &str) -> Request<Body> {
        Request::builder().uri(uri).body(Body::empty()).unwrap()
    }

    #[tokio::test]
    async fn test_health_returns_ok() {
        let resp = test_router().oneshot(get("/health")).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1_000_000)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
    }

    #[tokio::test]
    async fn test_diff_list_rejects_missing_worktree() {
        let resp = test_router()
            .oneshot(get("/diff?worktree=/nonexistent/path&base=main"))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_diff_file_rejects_missing_worktree() {
        let resp = test_router()
            .oneshot(get(
                "/diff/file?worktree=/nonexistent/path&base=main&file=foo.rs",
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_file_rejects_missing_worktree() {
        let resp = test_router()
            .oneshot(get("/file?worktree=/nonexistent/path&path=foo.rs&ref=HEAD"))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_commits_rejects_missing_worktree() {
        let resp = test_router()
            .oneshot(get(
                "/commits?worktree=/nonexistent/path&shas=abc1234,def5678",
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_diff_list_missing_params_returns_bad_request() {
        let resp = test_router().oneshot(get("/diff")).await.unwrap();
        // Missing query params → 400 from axum's Query extractor
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_diff_file_missing_params_returns_bad_request() {
        let resp = test_router().oneshot(get("/diff/file")).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_file_missing_params_returns_bad_request() {
        let resp = test_router().oneshot(get("/file")).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_commits_missing_params_returns_bad_request() {
        let resp = test_router().oneshot(get("/commits")).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_spawn_http_server_starts_and_stops() {
        let cancel = CancellationToken::new();
        let handle = spawn_http_server(0, cancel.clone()).await;
        assert!(handle.is_ok(), "server should start on port 0");

        cancel.cancel();
        let join = handle.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), join)
            .await
            .expect("server should shut down within 2s")
            .expect("server task should not panic");
    }

    #[tokio::test]
    async fn test_cors_headers_present() {
        let req: Request<Body> = Request::builder()
            .method("OPTIONS")
            .uri("/diff?worktree=/tmp&base=main")
            .header("Origin", "http://localhost:5173")
            .header("Access-Control-Request-Method", "GET")
            .body(Body::empty())
            .unwrap();
        let resp = test_router().oneshot(req).await.unwrap();
        assert!(resp.headers().get("access-control-allow-origin").is_some());
    }

    #[tokio::test]
    async fn test_rejects_non_git_worktree() {
        let tmp = tempfile::tempdir().unwrap();
        let worktree = tmp.path().to_str().unwrap();
        let uri = format!("/diff?worktree={}&base=main", urlencoding::encode(worktree));
        let resp = test_router().oneshot(get(&uri)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    /// Create a temp git repo with a known diff between `main` and `feature` branches.
    ///
    /// - `main` has hello.txt ("hello\nworld\n")
    /// - `feature` modifies hello.txt and adds new.txt
    ///
    /// Returns the TempDir (repo is on the `feature` branch).
    fn setup_test_repo() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();

        run_git(dir, &["init", "-b", "main"]);
        run_git(dir, &["config", "user.email", "test@test.com"]);
        run_git(dir, &["config", "user.name", "Test"]);

        std::fs::write(dir.join("hello.txt"), "hello\nworld\n").unwrap();
        run_git(dir, &["add", "hello.txt"]);
        run_git(dir, &["commit", "-m", "initial"]);

        run_git(dir, &["checkout", "-b", "feature"]);
        std::fs::write(dir.join("hello.txt"), "hello\nmodified world\n").unwrap();
        std::fs::write(dir.join("new.txt"), "new file content\n").unwrap();
        run_git(dir, &["add", "."]);
        run_git(dir, &["commit", "-m", "feature changes"]);

        tmp
    }

    fn run_git(dir: &std::path::Path, args: &[&str]) {
        let output = std::process::Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn run_git_capture(dir: &std::path::Path, args: &[&str]) -> String {
        let output = std::process::Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    #[tokio::test]
    async fn test_diff_list_returns_changed_files() {
        let repo = setup_test_repo();
        let worktree = repo.path().to_str().unwrap();
        let uri = format!("/diff?worktree={}&base=main", urlencoding::encode(worktree));
        let resp = test_router().oneshot(get(&uri)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1_000_000)
            .await
            .unwrap();
        let files: Vec<serde_json::Value> = serde_json::from_slice(&body).unwrap();
        assert!(
            files.len() >= 2,
            "expected at least 2 changed files, got {}",
            files.len()
        );

        let paths: Vec<&str> = files.iter().filter_map(|f| f["path"].as_str()).collect();
        assert!(
            paths.contains(&"hello.txt"),
            "missing hello.txt in {paths:?}"
        );
        assert!(paths.contains(&"new.txt"), "missing new.txt in {paths:?}");
    }

    #[tokio::test]
    async fn test_diff_file_returns_hunks() {
        let repo = setup_test_repo();
        let worktree = repo.path().to_str().unwrap();
        let uri = format!(
            "/diff/file?worktree={}&base=main&file=hello.txt",
            urlencoding::encode(worktree)
        );
        let resp = test_router().oneshot(get(&uri)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1_000_000)
            .await
            .unwrap();
        let hunks: Vec<serde_json::Value> = serde_json::from_slice(&body).unwrap();
        assert!(
            !hunks.is_empty(),
            "expected at least one hunk for hello.txt"
        );
    }

    #[tokio::test]
    async fn test_file_at_ref_returns_content() {
        let repo = setup_test_repo();
        let worktree = repo.path().to_str().unwrap();
        let uri = format!(
            "/file?worktree={}&path=hello.txt&ref=main",
            urlencoding::encode(worktree)
        );
        let resp = test_router().oneshot(get(&uri)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1_000_000)
            .await
            .unwrap();
        let text = String::from_utf8(body.to_vec()).unwrap();
        assert!(text.contains("hello"), "expected 'hello' in file content");
        assert!(text.contains("world"), "expected 'world' in file content");
    }

    #[tokio::test]
    async fn test_ws_terminal_route_is_registered() {
        // Non-WebSocket GET to a terminal route returns 400 (not 404),
        // proving the route is registered. WebSocket upgrade would be needed
        // for a real connection.
        let resp = test_router()
            .oneshot(get("/ws/terminal/302"))
            .await
            .unwrap();
        // 400 from WebSocketUpgrade extractor (missing WS headers) proves the
        // route matched. A missing route would return 404.
        assert_ne!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_ws_terminal_route_not_found_for_missing_pane_id() {
        // No pane ID in path → 404 (route doesn't match).
        let resp = test_router()
            .oneshot(get("/ws/terminal/"))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_file_rejects_invalid_ref() {
        let repo = setup_test_repo();
        let worktree = repo.path().to_str().unwrap();
        let uri = format!(
            "/file?worktree={}&path=hello.txt&ref=not-a-real-ref",
            urlencoding::encode(worktree)
        );
        let resp = test_router().oneshot(get(&uri)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_commits_rejects_invalid_sha() {
        let repo = setup_test_repo();
        let worktree = repo.path().to_str().unwrap();
        let uri = format!(
            "/commits?worktree={}&shas=not-a-sha",
            urlencoding::encode(worktree)
        );
        let resp = test_router().oneshot(get(&uri)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_commits_returns_found_and_missing_shas() {
        let repo = setup_test_repo();
        let worktree = repo.path().to_str().unwrap();
        let head = run_git_capture(repo.path(), &["rev-parse", "HEAD"]);
        let uri = format!(
            "/commits?worktree={}&shas={},deadbeef",
            urlencoding::encode(worktree),
            head
        );
        let resp = test_router().oneshot(get(&uri)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body = axum::body::to_bytes(resp.into_body(), 1_000_000)
            .await
            .unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let commits = payload.get("commits").unwrap().as_array().unwrap();
        let missing = payload.get("missingShas").unwrap().as_array().unwrap();

        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].get("sha").unwrap().as_str(), Some(head.as_str()));
        assert_eq!(missing, &vec![serde_json::Value::from("deadbeef")]);
    }

    #[tokio::test]
    async fn test_commits_returns_not_found_when_all_missing() {
        let repo = setup_test_repo();
        let worktree = repo.path().to_str().unwrap();
        let uri = format!(
            "/commits?worktree={}&shas=deadbeef,cafebabe",
            urlencoding::encode(worktree)
        );
        let resp = test_router().oneshot(get(&uri)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
    /// Resolve the git repo root from CARGO_MANIFEST_DIR.
    fn repo_root() -> String {
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        // tina-daemon is one level below the repo root
        manifest_dir.parent().unwrap().to_str().unwrap().to_string()
    }

    #[tokio::test]
    async fn test_diff_list_with_real_repo() {
        let worktree = repo_root();
        let uri = format!(
            "/diff?worktree={}&base=HEAD~1",
            urlencoding::encode(&worktree)
        );
        let resp = test_router().oneshot(get(&uri)).await.unwrap();
        // Should either succeed (200) or fail from git (500) — not 400
        assert_ne!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_file_with_real_repo() {
        let worktree = repo_root();
        let uri = format!(
            "/file?worktree={}&path=tina-daemon/Cargo.toml&ref=HEAD",
            urlencoding::encode(&worktree)
        );
        let resp = test_router().oneshot(get(&uri)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(resp.into_body(), 1_000_000)
            .await
            .unwrap();
        let text = String::from_utf8(body.to_vec()).unwrap();
        assert!(text.contains("[package]"));
        assert!(text.contains("tina-daemon"));
    }

    // --- Session endpoint tests ---

    fn post_json(uri: &str, body: &str) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri(uri)
            .header("Content-Type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    fn delete_req(uri: &str) -> Request<Body> {
        Request::builder()
            .method("DELETE")
            .uri(uri)
            .body(Body::empty())
            .unwrap()
    }

    #[tokio::test]
    async fn test_create_session_rejects_missing_body() {
        let req = Request::builder()
            .method("POST")
            .uri("/sessions")
            .header("Content-Type", "application/json")
            .body(Body::empty())
            .unwrap();
        let resp = test_router().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_create_session_rejects_invalid_cli() {
        let resp = test_router()
            .oneshot(post_json(
                "/sessions",
                r#"{"label": "test", "cli": "invalid"}"#,
            ))
            .await
            .unwrap();
        // Invalid enum variant → 422 (Unprocessable Entity) from axum
        assert!(
            resp.status() == StatusCode::BAD_REQUEST
                || resp.status() == StatusCode::UNPROCESSABLE_ENTITY,
            "expected 400 or 422, got {}",
            resp.status()
        );
    }

    #[tokio::test]
    async fn test_create_session_rejects_missing_label() {
        let resp = test_router()
            .oneshot(post_json("/sessions", r#"{"cli": "claude"}"#))
            .await
            .unwrap();
        assert!(
            resp.status() == StatusCode::BAD_REQUEST
                || resp.status() == StatusCode::UNPROCESSABLE_ENTITY,
            "expected 400 or 422, got {}",
            resp.status()
        );
    }

    #[tokio::test]
    async fn test_delete_session_nonexistent_returns_error_or_success() {
        // Deleting a nonexistent tmux session — kill_session_blocking
        // returns Ok because it ignores "session not found" errors.
        let resp = test_router()
            .oneshot(delete_req("/sessions/tina-adhoc-nonexistent"))
            .await
            .unwrap();
        // Should succeed (204) since kill_session_blocking ignores not-found
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn test_cors_allows_post_and_delete() {
        // Test CORS preflight for POST
        let req = Request::builder()
            .method("OPTIONS")
            .uri("/sessions")
            .header("Origin", "http://localhost:5173")
            .header("Access-Control-Request-Method", "POST")
            .body(Body::empty())
            .unwrap();
        let resp = test_router().oneshot(req).await.unwrap();
        assert!(resp.headers().get("access-control-allow-origin").is_some());

        // Test CORS preflight for DELETE
        let req = Request::builder()
            .method("OPTIONS")
            .uri("/sessions/tina-adhoc-abc")
            .header("Origin", "http://localhost:5173")
            .header("Access-Control-Request-Method", "DELETE")
            .body(Body::empty())
            .unwrap();
        let resp = test_router().oneshot(req).await.unwrap();
        assert!(resp.headers().get("access-control-allow-origin").is_some());
    }
}
