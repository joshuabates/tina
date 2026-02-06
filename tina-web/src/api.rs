use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Json;
use serde::{Deserialize, Serialize};

use tina_data::db;

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

// --- Projects ---

#[derive(Serialize)]
pub struct ProjectWithCounts {
    #[serde(flatten)]
    pub project: db::Project,
    pub orchestration_count: i64,
}

pub async fn list_projects(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ProjectWithCounts>>, StatusCode> {
    let conn = state.conn().await;
    let projects = db::list_projects(&conn).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut result = Vec::with_capacity(projects.len());
    for project in projects {
        let orchs = db::list_by_project(&conn, project.id)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        result.push(ProjectWithCounts {
            project,
            orchestration_count: orchs.len() as i64,
        });
    }

    Ok(Json(result))
}

pub async fn list_project_orchestrations(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<Vec<db::Orchestration>>, StatusCode> {
    let conn = state.conn().await;
    db::list_by_project(&conn, id)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[derive(Deserialize)]
pub struct RenameProject {
    pub name: String,
}

pub async fn rename_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(body): Json<RenameProject>,
) -> Result<StatusCode, StatusCode> {
    let conn = state.conn().await;
    db::rename_project(&conn, id, &body.name)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
pub struct CreateProject {
    pub name: String,
    pub repo_path: String,
}

pub async fn create_project(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateProject>,
) -> Result<(StatusCode, Json<db::Project>), StatusCode> {
    let conn = state.conn().await;
    let id = db::find_or_create_by_repo_path(&conn, &body.name, &body.repo_path)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Fetch the created project to return it
    let projects = db::list_projects(&conn).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let project = projects
        .into_iter()
        .find(|p| p.id == id)
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(project)))
}

// --- Orchestrations ---

pub async fn list_orchestrations(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<db::Orchestration>>, StatusCode> {
    let conn = state.conn().await;
    db::list_orchestrations(&conn)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn get_orchestration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<db::OrchestrationDetail>, StatusCode> {
    let conn = state.conn().await;
    db::orchestration_detail(&conn, &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn get_orchestration_tasks(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<db::TaskEvent>>, StatusCode> {
    let conn = state.conn().await;

    // Verify orchestration exists
    let detail = db::orchestration_detail(&conn, &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(detail.tasks))
}

pub async fn get_orchestration_team(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<db::TeamMember>>, StatusCode> {
    let conn = state.conn().await;

    let detail = db::orchestration_detail(&conn, &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(detail.members))
}

pub async fn get_orchestration_phases(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Vec<db::Phase>>, StatusCode> {
    let conn = state.conn().await;

    let detail = db::orchestration_detail(&conn, &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(detail.phases))
}

pub async fn get_task_events(
    State(state): State<Arc<AppState>>,
    Path((id, task_id)): Path<(String, String)>,
) -> Result<Json<Vec<db::TaskEvent>>, StatusCode> {
    let conn = state.conn().await;

    // Resolve orchestration id (could be feature name or exact id)
    let detail = db::orchestration_detail(&conn, &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let events = db::history_for_task(&conn, &detail.orchestration.id, &task_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(events))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::State;

    fn test_state() -> Arc<AppState> {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.keep().join("test.db");
        AppState::open(&db_path)
    }

    #[tokio::test]
    async fn test_health_returns_ok() {
        let response = health().await;
        assert_eq!(response.status, "ok");
    }

    #[tokio::test]
    async fn test_list_orchestrations_empty() {
        let state = test_state();
        let response = list_orchestrations(State(state)).await.unwrap();
        assert!(response.0.is_empty());
    }

    #[tokio::test]
    async fn test_list_projects_empty() {
        let state = test_state();
        let response = list_projects(State(state)).await.unwrap();
        assert!(response.0.is_empty());
    }

    #[tokio::test]
    async fn test_get_nonexistent_orchestration_returns_404() {
        let state = test_state();
        let result = get_orchestration(State(state), Path("nonexistent".to_string())).await;
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_nonexistent_tasks_returns_404() {
        let state = test_state();
        let result =
            get_orchestration_tasks(State(state), Path("nonexistent".to_string())).await;
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_nonexistent_team_returns_404() {
        let state = test_state();
        let result =
            get_orchestration_team(State(state), Path("nonexistent".to_string())).await;
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_nonexistent_phases_returns_404() {
        let state = test_state();
        let result =
            get_orchestration_phases(State(state), Path("nonexistent".to_string())).await;
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_create_and_list_project() {
        let state = test_state();
        let body = CreateProject {
            name: "my-project".to_string(),
            repo_path: "/path/to/repo".to_string(),
        };

        let (status, json) = create_project(State(state.clone()), Json(body)).await.unwrap();
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(json.0.name, "my-project");

        let projects = list_projects(State(state)).await.unwrap();
        assert_eq!(projects.0.len(), 1);
        assert_eq!(projects.0[0].project.name, "my-project");
        assert_eq!(projects.0[0].orchestration_count, 0);
    }

    #[tokio::test]
    async fn test_rename_project() {
        let state = test_state();
        let body = CreateProject {
            name: "old-name".to_string(),
            repo_path: "/path/to/repo".to_string(),
        };
        let (_, json) = create_project(State(state.clone()), Json(body)).await.unwrap();

        let rename_body = RenameProject {
            name: "new-name".to_string(),
        };
        let status = rename_project(State(state.clone()), Path(json.0.id), Json(rename_body))
            .await
            .unwrap();
        assert_eq!(status, StatusCode::OK);

        let projects = list_projects(State(state)).await.unwrap();
        assert_eq!(projects.0[0].project.name, "new-name");
    }
}
