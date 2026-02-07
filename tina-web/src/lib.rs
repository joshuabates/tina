pub mod api;
pub mod state;
pub mod ws;

use std::sync::Arc;

use axum::routing::{get, post, put};
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use crate::state::AppState;

/// Build the Axum router with all routes
pub fn build_router(state: Arc<AppState>) -> Router {
    let api_routes = Router::new()
        .route("/health", get(api::health))
        // Projects
        .route("/projects", get(api::list_projects).post(api::create_project))
        .route(
            "/projects/{id}/orchestrations",
            get(api::list_project_orchestrations),
        )
        .route("/projects/{id}", put(api::rename_project))
        // Orchestrations
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
        )
        .route(
            "/orchestrations/{id}/tasks/{task_id}/events",
            get(api::get_task_events),
        )
        .route(
            "/orchestrations/{id}/events",
            get(api::get_orchestration_events),
        )
        .route(
            "/orchestrations/{id}/phases/{phase_number}/events",
            get(api::get_phase_events),
        )
        .route("/alerts/stuck-tasks", get(api::get_stuck_tasks))
        .route(
            "/orchestrations/{id}/pause",
            post(api::pause_orchestration),
        )
        .route(
            "/orchestrations/{id}/resume",
            post(api::resume_orchestration),
        )
        .route(
            "/orchestrations/{id}/phases/{phase}/retry",
            post(api::retry_phase),
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
        // Projects
        .route("/projects", get(api::list_projects).post(api::create_project))
        .route(
            "/projects/{id}/orchestrations",
            get(api::list_project_orchestrations),
        )
        .route("/projects/{id}", put(api::rename_project))
        // Orchestrations
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
        )
        .route(
            "/orchestrations/{id}/tasks/{task_id}/events",
            get(api::get_task_events),
        )
        .route(
            "/orchestrations/{id}/events",
            get(api::get_orchestration_events),
        )
        .route(
            "/orchestrations/{id}/phases/{phase_number}/events",
            get(api::get_phase_events),
        )
        .route("/alerts/stuck-tasks", get(api::get_stuck_tasks))
        .route(
            "/orchestrations/{id}/pause",
            post(api::pause_orchestration),
        )
        .route(
            "/orchestrations/{id}/resume",
            post(api::resume_orchestration),
        )
        .route(
            "/orchestrations/{id}/phases/{phase}/retry",
            post(api::retry_phase),
        );

    Router::new()
        .nest("/api", api_routes)
        .route("/ws", get(ws::ws_handler))
        .fallback_service(ServeDir::new(static_dir))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    fn test_state() -> Arc<AppState> {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.keep().join("test.db");
        AppState::open(&db_path)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let state = test_state();
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
        let state = test_state();
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
        let state = test_state();
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
        let state = test_state();
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
        let state = test_state();
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
        let state = test_state();
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
        let state = test_state();
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

    #[tokio::test]
    async fn test_list_projects_endpoint() {
        let state = test_state();
        let app = build_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/projects")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(json.as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_create_project_endpoint() {
        let state = test_state();
        let app = build_router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/projects")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::to_string(&serde_json::json!({
                            "name": "test-project",
                            "repo_path": "/test/repo"
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["name"], "test-project");
    }
}
