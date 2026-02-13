use axum::extract::Query;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use std::path::Path;
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

pub async fn get_diff_list(
    Query(params): Query<DiffListParams>,
) -> Result<Json<Vec<git::DiffFileStat>>, (StatusCode, String)> {
    let worktree = params.worktree.clone();
    if !Path::new(&worktree).exists() {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("worktree not found: {}", worktree),
        ));
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
    let worktree = params.worktree.clone();
    if !Path::new(&worktree).exists() {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("worktree not found: {}", worktree),
        ));
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
    let worktree = params.worktree.clone();
    if !Path::new(&worktree).exists() {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("worktree not found: {}", worktree),
        ));
    }
    tokio::task::spawn_blocking(move || {
        git::get_file_at_ref(Path::new(&params.worktree), &params.git_ref, &params.path)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub fn build_router() -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
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
        Request::builder()
            .uri(uri)
            .body(Body::empty())
            .unwrap()
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
            .oneshot(get("/diff/file?worktree=/nonexistent/path&base=main&file=foo.rs"))
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
        let resp = test_router()
            .oneshot(get("/diff"))
            .await
            .unwrap();
        // Missing query params → 400 from axum's Query extractor
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_diff_file_missing_params_returns_bad_request() {
        let resp = test_router()
            .oneshot(get("/diff/file"))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_file_missing_params_returns_bad_request() {
        let resp = test_router()
            .oneshot(get("/file"))
            .await
            .unwrap();
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
            .header("Origin", "http://localhost:3000")
            .header("Access-Control-Request-Method", "GET")
            .body(Body::empty())
            .unwrap();
        let resp = test_router().oneshot(req).await.unwrap();
        assert!(resp
            .headers()
            .get("access-control-allow-origin")
            .is_some());
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
        let resp = test_router()
            .oneshot(get(&uri))
            .await
            .unwrap();
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
        let resp = test_router()
            .oneshot(get(&uri))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(resp.into_body(), 1_000_000)
            .await
            .unwrap();
        let text = String::from_utf8(body.to_vec()).unwrap();
        assert!(text.contains("[package]"));
        assert!(text.contains("tina-daemon"));
    }
}
