mod fixture;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

use fixture::FixtureBuilder;

/// Make a GET request against a fixture's state
async fn get_json(
    fixture: &FixtureBuilder,
    path: &str,
) -> (StatusCode, serde_json::Value) {
    let app = tina_web::build_router(fixture.state());

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

#[tokio::test]
async fn test_list_orchestrations_with_fixture() {
    let fixture = FixtureBuilder::new();
    let pid = fixture.add_project("my-project", "/repo/my-project").await;
    fixture
        .add_orchestration("my-project_2026", pid, "my-project", 3, "executing")
        .await;
    fixture
        .add_task_events(
            "my-project_2026",
            Some("1"),
            &[
                ("1", "plan-phase-1", "completed"),
                ("2", "execute-phase-1", "completed"),
                ("3", "plan-phase-2", "in_progress"),
            ],
        )
        .await;

    let (status, json) = get_json(&fixture, "/api/orchestrations").await;

    assert_eq!(status, StatusCode::OK);
    let arr = json.as_array().expect("expected array");
    assert_eq!(arr.len(), 1);

    let orch = &arr[0];
    assert_eq!(orch["feature_name"], "my-project");
    assert_eq!(orch["total_phases"], 3);
}

#[tokio::test]
async fn test_get_single_orchestration() {
    let fixture = FixtureBuilder::new();
    let pid = fixture.add_project("single-proj", "/repo/single").await;
    fixture
        .add_orchestration("single_2026", pid, "single", 4, "executing")
        .await;

    let (status, json) = get_json(&fixture, "/api/orchestrations/single").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["orchestration"]["feature_name"], "single");
    assert_eq!(json["orchestration"]["total_phases"], 4);
}

#[tokio::test]
async fn test_get_nonexistent_returns_404() {
    let fixture = FixtureBuilder::new();
    let pid = fixture.add_project("proj", "/repo").await;
    fixture
        .add_orchestration("exists_2026", pid, "exists", 2, "executing")
        .await;

    let (status, _) = get_json(&fixture, "/api/orchestrations/nonexistent").await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_orchestration_tasks() {
    let fixture = FixtureBuilder::new();
    let pid = fixture.add_project("tasks-proj", "/repo/tasks").await;
    fixture
        .add_orchestration("tasks-test_2026", pid, "tasks-test", 2, "executing")
        .await;
    fixture
        .add_task_events(
            "tasks-test_2026",
            Some("1"),
            &[
                ("1", "validate-design", "completed"),
                ("2", "plan-phase-1", "completed"),
                ("3", "execute-phase-1", "in_progress"),
            ],
        )
        .await;

    let (status, json) = get_json(&fixture, "/api/orchestrations/tasks-test/tasks").await;

    assert_eq!(status, StatusCode::OK);
    let tasks = json.as_array().expect("expected array");
    assert_eq!(tasks.len(), 3);
    assert_eq!(tasks[0]["subject"], "validate-design");
    assert_eq!(tasks[0]["status"], "completed");
}

#[tokio::test]
async fn test_orchestration_team_members() {
    let fixture = FixtureBuilder::new();
    let pid = fixture.add_project("team-proj", "/repo/team").await;
    fixture
        .add_orchestration("team-test_2026", pid, "team-test", 2, "executing")
        .await;
    fixture
        .add_team_members(
            "team-test_2026",
            "1",
            &[
                ("leader", "team-lead"),
                ("planner", "planner"),
                ("executor", "executor"),
            ],
        )
        .await;

    let (status, json) =
        get_json(&fixture, "/api/orchestrations/team-test/team").await;

    assert_eq!(status, StatusCode::OK);
    let members = json.as_array().expect("expected array");
    assert_eq!(members.len(), 3);
}

#[tokio::test]
async fn test_empty_database() {
    let fixture = FixtureBuilder::new();

    let (status, json) = get_json(&fixture, "/api/orchestrations").await;

    assert_eq!(status, StatusCode::OK);
    let arr = json.as_array().expect("expected array");
    assert_eq!(arr.len(), 0);
}

#[tokio::test]
async fn test_multiple_orchestrations() {
    let fixture = FixtureBuilder::new();
    let pid = fixture.add_project("multi-proj", "/repo/multi").await;
    fixture
        .add_orchestration("alpha_2026", pid, "alpha", 3, "executing")
        .await;
    fixture
        .add_orchestration("beta_2026", pid, "beta", 5, "executing")
        .await;

    let (status, json) = get_json(&fixture, "/api/orchestrations").await;

    assert_eq!(status, StatusCode::OK);
    let arr = json.as_array().expect("expected array");
    assert_eq!(arr.len(), 2);

    let names: Vec<&str> = arr
        .iter()
        .map(|o| o["feature_name"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"alpha"));
    assert!(names.contains(&"beta"));
}

#[tokio::test]
async fn test_projects_endpoint() {
    let fixture = FixtureBuilder::new();
    let pid = fixture.add_project("my-project", "/repo/my-project").await;
    fixture
        .add_orchestration("feat_2026", pid, "feat", 3, "executing")
        .await;

    let (status, json) = get_json(&fixture, "/api/projects").await;

    assert_eq!(status, StatusCode::OK);
    let arr = json.as_array().expect("expected array");
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["name"], "my-project");
    assert_eq!(arr[0]["orchestration_count"], 1);
}

#[tokio::test]
async fn test_project_orchestrations_endpoint() {
    let fixture = FixtureBuilder::new();
    let pid = fixture.add_project("proj", "/repo").await;
    fixture
        .add_orchestration("feat1_2026", pid, "feat1", 3, "executing")
        .await;
    fixture
        .add_orchestration("feat2_2026", pid, "feat2", 2, "complete")
        .await;

    let (status, json) =
        get_json(&fixture, &format!("/api/projects/{}/orchestrations", pid)).await;

    assert_eq!(status, StatusCode::OK);
    let arr = json.as_array().expect("expected array");
    assert_eq!(arr.len(), 2);
}

#[tokio::test]
async fn test_task_events_endpoint() {
    let fixture = FixtureBuilder::new();
    let pid = fixture.add_project("proj", "/repo").await;
    fixture
        .add_orchestration("feat_2026", pid, "feat", 3, "executing")
        .await;

    // Add multiple events for the same task (status progression)
    {
        let state = fixture.state();
        let conn = state.conn().await;
        for (status, time) in [("pending", "00:01"), ("in_progress", "00:02"), ("completed", "00:03")] {
            let event = tina_data::db::TaskEvent {
                id: None,
                orchestration_id: "feat_2026".to_string(),
                phase_number: Some("1".to_string()),
                task_id: "task-1".to_string(),
                subject: "Build feature".to_string(),
                description: None,
                status: status.to_string(),
                owner: None,
                blocked_by: None,
                metadata: None,
                recorded_at: format!("2026-01-30T{}:00Z", time),
            };
            tina_session::db::task_events::insert_event(&conn, &event).unwrap();
        }
    }

    let (status, json) =
        get_json(&fixture, "/api/orchestrations/feat/tasks/task-1/events").await;

    assert_eq!(status, StatusCode::OK);
    let events = json.as_array().expect("expected array");
    assert_eq!(events.len(), 3);
    assert_eq!(events[0]["status"], "pending");
    assert_eq!(events[1]["status"], "in_progress");
    assert_eq!(events[2]["status"], "completed");
}
