use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Json;
use serde::Serialize;

use tina_data::discovery::Orchestration;
use tina_data::tasks::TaskSummary;
use tina_data::{Agent, Task};

use crate::state::AppState;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
}

pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
    })
}

pub async fn list_orchestrations(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<Orchestration>> {
    Json(state.get_orchestrations().await)
}

pub async fn get_orchestration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Orchestration>, StatusCode> {
    state
        .get_orchestration(&id)
        .await
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn get_orchestration_tasks(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<Task>>, StatusCode> {
    state
        .get_orchestration(&id)
        .await
        .map(|o| Json(o.tasks))
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn get_orchestration_team(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<Agent>>, StatusCode> {
    state
        .get_orchestration(&id)
        .await
        .map(|o| Json(o.members))
        .ok_or(StatusCode::NOT_FOUND)
}

#[derive(Debug, Serialize)]
pub struct PhasesResponse {
    pub current_phase: u32,
    pub total_phases: u32,
    pub task_summary: TaskSummary,
}

pub async fn get_orchestration_phases(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<PhasesResponse>, StatusCode> {
    state
        .get_orchestration(&id)
        .await
        .map(|o| {
            Json(PhasesResponse {
                current_phase: o.current_phase,
                total_phases: o.total_phases,
                task_summary: TaskSummary::from_tasks(&o.tasks),
            })
        })
        .ok_or(StatusCode::NOT_FOUND)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_returns_ok() {
        let response = health().await;
        assert_eq!(response.status, "ok");
    }

    #[tokio::test]
    async fn test_list_orchestrations_empty() {
        let state = AppState::new();
        let response = list_orchestrations(State(state)).await;
        assert!(response.0.is_empty());
    }

    #[tokio::test]
    async fn test_get_nonexistent_orchestration_returns_404() {
        let state = AppState::new();
        let result = get_orchestration(State(state), Path("nonexistent".to_string())).await;
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_nonexistent_tasks_returns_404() {
        let state = AppState::new();
        let result =
            get_orchestration_tasks(State(state), Path("nonexistent".to_string())).await;
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_nonexistent_team_returns_404() {
        let state = AppState::new();
        let result =
            get_orchestration_team(State(state), Path("nonexistent".to_string())).await;
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_nonexistent_phases_returns_404() {
        let state = AppState::new();
        let result =
            get_orchestration_phases(State(state), Path("nonexistent".to_string())).await;
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }
}
