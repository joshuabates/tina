pub mod api;
pub mod state;
pub mod ws;

use std::sync::Arc;
use std::time::Duration;

use axum::routing::get;
use axum::Router;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use crate::state::AppState;

/// Build the Axum router with all routes
pub fn build_router(state: Arc<AppState>) -> Router {
    let api_routes = Router::new()
        .route("/health", get(api::health))
        .route("/orchestrations", get(api::list_orchestrations))
        .route("/orchestrations/{id}", get(api::get_orchestration))
        .route(
            "/orchestrations/{id}/tasks",
            get(api::get_orchestration_tasks),
        )
        .route(
            "/orchestrations/{id}/team",
            get(api::get_orchestration_team),
        )
        .route(
            "/orchestrations/{id}/phases",
            get(api::get_orchestration_phases),
        );

    Router::new()
        .nest("/api", api_routes)
        .route("/ws", get(ws::ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

/// Build the router with static file serving for production builds
pub fn build_router_with_static(state: Arc<AppState>, static_dir: &str) -> Router {
    let api_routes = Router::new()
        .route("/health", get(api::health))
        .route("/orchestrations", get(api::list_orchestrations))
        .route("/orchestrations/{id}", get(api::get_orchestration))
        .route(
            "/orchestrations/{id}/tasks",
            get(api::get_orchestration_tasks),
        )
        .route(
            "/orchestrations/{id}/team",
            get(api::get_orchestration_team),
        )
        .route(
            "/orchestrations/{id}/phases",
            get(api::get_orchestration_phases),
        );

    Router::new()
        .nest("/api", api_routes)
        .route("/ws", get(ws::ws_handler))
        .fallback_service(ServeDir::new(static_dir))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

/// Start the file watcher that triggers state reloads on file changes
pub fn start_file_watcher(state: Arc<AppState>) -> anyhow::Result<RecommendedWatcher> {
    let watcher_state = state.clone();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if res.is_ok() {
                let state = watcher_state.clone();
                tokio::spawn(async move {
                    state.reload().await;
                });
            }
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    )?;

    let home_dir = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("Could not find home directory"))?;
    let claude_dir = home_dir.join(".claude");

    // Watch teams directory
    let teams_dir = claude_dir.join("teams");
    if teams_dir.exists() {
        watcher.watch(&teams_dir, RecursiveMode::Recursive)?;
    }

    // Watch tasks directory
    let tasks_dir = claude_dir.join("tasks");
    if tasks_dir.exists() {
        watcher.watch(&tasks_dir, RecursiveMode::Recursive)?;
    }

    Ok(watcher)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_health_endpoint() {
        let state = AppState::new();
        let app = build_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_list_orchestrations_endpoint() {
        let state = AppState::new();
        let app = build_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/orchestrations")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_get_nonexistent_orchestration_endpoint() {
        let state = AppState::new();
        let app = build_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/orchestrations/nonexistent")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_orchestration_tasks_endpoint() {
        let state = AppState::new();
        let app = build_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/orchestrations/nonexistent/tasks")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_orchestration_team_endpoint() {
        let state = AppState::new();
        let app = build_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/orchestrations/nonexistent/team")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_orchestration_phases_endpoint() {
        let state = AppState::new();
        let app = build_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/orchestrations/nonexistent/phases")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_health_response_body() {
        let state = AppState::new();
        let app = build_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
    }
}
