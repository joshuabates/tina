use axum::extract::Query;
use axum::http::{HeaderValue, Method, StatusCode};
use axum::routing::get;
use axum::{Json, Router};
use std::path::{Path, PathBuf};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

use crate::git;

/// Shared application state.
///
/// Currently empty — all endpoints are stateless git operations.
/// Exists for future extensibility (e.g., caching).
#[derive(Clone)]
pub struct AppState {}

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

pub async fn get_diff_list(
    Query(params): Query<DiffListParams>,
) -> Result<Json<Vec<git::DiffFileStat>>, (StatusCode, String)> {
    let worktree = validate_worktree_path(&params.worktree)?;
    tokio::task::spawn_blocking(move || git::get_diff_file_list(&worktree, &params.base))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn get_diff_file(
    Query(params): Query<DiffFileParams>,
) -> Result<Json<Vec<git::DiffHunk>>, (StatusCode, String)> {
    let worktree = validate_worktree_path(&params.worktree)?;
    tokio::task::spawn_blocking(move || git::get_file_diff(&worktree, &params.base, &params.file))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn get_file(Query(params): Query<FileParams>) -> Result<String, (StatusCode, String)> {
    let worktree = validate_worktree_path(&params.worktree)?;
    tokio::task::spawn_blocking(move || {
        git::get_file_at_ref(&worktree, &params.git_ref, &params.path)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn get_health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

pub fn build_router() -> Router {
    let cors = CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost:5173"),
            HeaderValue::from_static("http://127.0.0.1:5173"),
            HeaderValue::from_static("http://localhost:4173"),
            HeaderValue::from_static("http://127.0.0.1:4173"),
        ])
        .allow_methods([Method::GET, Method::OPTIONS])
        .allow_headers(Any);

    Router::new()
        .route("/health", get(get_health))
        .route("/diff", get(get_diff_list))
        .route("/diff/file", get(get_diff_file))
        .route("/file", get(get_file))
        .layer(cors)
}

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
}
