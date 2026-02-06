mod fixture;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

use fixture::FixtureBuilder;
use tina_web::state::AppState;

/// Load state from fixture, returning a shared AppState for multiple requests
async fn load_state(fixture: &FixtureBuilder) -> std::sync::Arc<AppState> {
    let state = AppState::with_base_dir(fixture.base_dir());
    state.reload().await;
    state
}

/// Make a GET request against a loaded state
async fn get_json_with_state(
    state: &std::sync::Arc<AppState>,
    path: &str,
) -> (StatusCode, serde_json::Value) {
    let app = tina_web::build_router(state.clone());

    let response = app
        .oneshot(
            Request::builder()
                .uri(path)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value =
        serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
    (status, json)
}

/// Helper: build app with fixture data and make a GET request
async fn get_json(
    fixture: &FixtureBuilder,
    path: &str,
) -> (StatusCode, serde_json::Value) {
    let state = load_state(fixture).await;
    get_json_with_state(&state, path).await
}

#[tokio::test]
async fn test_list_orchestrations_with_fixture() {
    let fixture = FixtureBuilder::new();
    let worktree = fixture.base_dir().join("worktrees").join("my-project");

    fixture
        .add_team(
            "my-project-orchestration",
            &worktree,
            &[("leader", "team-lead")],
        )
        .add_supervisor_state(&worktree, "my-project", 3, 2, "executing")
        .add_session_lookup("my-project", &worktree)
        .add_tasks(
            "my-project-orchestration",
            &[
                ("1", "plan-phase-1", "completed"),
                ("2", "execute-phase-1", "completed"),
                ("3", "plan-phase-2", "in_progress"),
            ],
        );

    let (status, json) = get_json(&fixture, "/api/orchestrations").await;

    assert_eq!(status, StatusCode::OK);
    let arr = json.as_array().expect("expected array");
    assert_eq!(arr.len(), 1);

    let orch = &arr[0];
    assert_eq!(orch["team_name"], "my-project-orchestration");
    assert_eq!(orch["feature_name"], "my-project");
    assert_eq!(orch["current_phase"], 2);
    assert_eq!(orch["total_phases"], 3);
}

#[tokio::test]
async fn test_get_single_orchestration() {
    let fixture = FixtureBuilder::new();
    let worktree = fixture.base_dir().join("worktrees").join("single");

    fixture
        .add_team(
            "single-orchestration",
            &worktree,
            &[("leader", "team-lead")],
        )
        .add_supervisor_state(&worktree, "single", 4, 1, "executing")
        .add_session_lookup("single", &worktree);

    let (status, json) =
        get_json(&fixture, "/api/orchestrations/single-orchestration").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["team_name"], "single-orchestration");
    assert_eq!(json["feature_name"], "single");
    assert_eq!(json["total_phases"], 4);
}

#[tokio::test]
async fn test_get_nonexistent_returns_404() {
    let fixture = FixtureBuilder::new();
    let worktree = fixture.base_dir().join("worktrees").join("exists");

    fixture
        .add_team(
            "exists-orchestration",
            &worktree,
            &[("leader", "team-lead")],
        )
        .add_supervisor_state(&worktree, "exists", 2, 1, "executing")
        .add_session_lookup("exists", &worktree);

    let (status, _) =
        get_json(&fixture, "/api/orchestrations/nonexistent").await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_orchestration_tasks() {
    let fixture = FixtureBuilder::new();
    let worktree = fixture.base_dir().join("worktrees").join("tasks-test");

    fixture
        .add_team(
            "tasks-test-orchestration",
            &worktree,
            &[("leader", "team-lead")],
        )
        .add_supervisor_state(&worktree, "tasks-test", 2, 1, "executing")
        .add_session_lookup("tasks-test", &worktree)
        .add_tasks(
            "tasks-test-orchestration",
            &[
                ("1", "validate-design", "completed"),
                ("2", "plan-phase-1", "completed"),
                ("3", "execute-phase-1", "in_progress"),
            ],
        );

    let state = load_state(&fixture).await;

    // The /tasks endpoint returns phase tasks (o.tasks), not orchestrator tasks.
    // Since we haven't created a phase team, phase tasks are empty.
    let (status, json) = get_json_with_state(
        &state,
        "/api/orchestrations/tasks-test-orchestration/tasks",
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let tasks = json.as_array().expect("expected array");
    assert_eq!(tasks.len(), 0);

    // Verify orchestrator tasks are accessible via the detail endpoint
    let (status, detail) = get_json_with_state(
        &state,
        "/api/orchestrations/tasks-test-orchestration",
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let orchestrator_tasks = detail["orchestrator_tasks"]
        .as_array()
        .expect("expected orchestrator_tasks array");
    assert_eq!(orchestrator_tasks.len(), 3);
    assert_eq!(orchestrator_tasks[0]["subject"], "validate-design");
    assert_eq!(orchestrator_tasks[0]["status"], "completed");
}

#[tokio::test]
async fn test_orchestration_team_members() {
    let fixture = FixtureBuilder::new();
    let worktree = fixture.base_dir().join("worktrees").join("team-test");

    fixture
        .add_team(
            "team-test-orchestration",
            &worktree,
            &[
                ("leader", "team-lead"),
                ("planner", "planner"),
                ("executor", "executor"),
            ],
        )
        .add_supervisor_state(&worktree, "team-test", 2, 1, "executing")
        .add_session_lookup("team-test", &worktree);

    let (status, json) = get_json(
        &fixture,
        "/api/orchestrations/team-test-orchestration/team",
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let members = json.as_array().expect("expected array");
    // The /team endpoint returns phase members (o.members), not orchestration team.
    // Since we haven't set up a phase team, this returns empty.
    assert!(members.is_empty());
}

#[tokio::test]
async fn test_empty_base_dir() {
    let fixture = FixtureBuilder::new();

    let (status, json) = get_json(&fixture, "/api/orchestrations").await;

    assert_eq!(status, StatusCode::OK);
    let arr = json.as_array().expect("expected array");
    assert_eq!(arr.len(), 0);
}

#[tokio::test]
async fn test_multiple_orchestrations() {
    let fixture = FixtureBuilder::new();
    let worktree_a = fixture.base_dir().join("worktrees").join("alpha");
    let worktree_b = fixture.base_dir().join("worktrees").join("beta");

    fixture
        .add_team(
            "alpha-orchestration",
            &worktree_a,
            &[("leader", "team-lead")],
        )
        .add_supervisor_state(&worktree_a, "alpha", 3, 1, "executing")
        .add_session_lookup("alpha", &worktree_a)
        .add_team(
            "beta-orchestration",
            &worktree_b,
            &[("leader", "team-lead")],
        )
        .add_supervisor_state(&worktree_b, "beta", 5, 3, "executing")
        .add_session_lookup("beta", &worktree_b);

    let (status, json) = get_json(&fixture, "/api/orchestrations").await;

    assert_eq!(status, StatusCode::OK);
    let arr = json.as_array().expect("expected array");
    assert_eq!(arr.len(), 2);

    let names: Vec<&str> = arr
        .iter()
        .map(|o| o["team_name"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"alpha-orchestration"));
    assert!(names.contains(&"beta-orchestration"));
}
