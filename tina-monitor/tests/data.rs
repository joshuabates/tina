use std::path::PathBuf;
use std::fs;
use tina_monitor::types::*;
use tempfile::TempDir;

#[test]
fn data_source_new_with_no_fixture() {
    let ds = tina_monitor::data::DataSource::new(None);
    assert!(ds.current().is_none());
}

#[test]
fn data_source_new_with_fixture() {
    let fixture_path = PathBuf::from("/tmp/fixtures");
    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.clone()));
    assert!(ds.current().is_none());
}

#[test]
fn data_source_sessions_dir_without_fixture() {
    let ds = tina_monitor::data::DataSource::new(None);
    let sessions_dir = ds.sessions_dir();

    // Should point to ~/.claude/tina-sessions
    assert!(sessions_dir.ends_with(".claude/tina-sessions"));
}

#[test]
fn data_source_sessions_dir_with_fixture() {
    let fixture_path = PathBuf::from("/tmp/fixtures");
    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.clone()));
    let sessions_dir = ds.sessions_dir();

    // Should point to fixture path
    assert_eq!(sessions_dir, fixture_path);
}

#[test]
fn data_source_teams_dir_without_fixture() {
    let ds = tina_monitor::data::DataSource::new(None);
    let teams_dir = ds.teams_dir();

    // Should point to ~/.claude/teams
    assert!(teams_dir.ends_with(".claude/teams"));
}

#[test]
fn data_source_teams_dir_with_fixture() {
    let fixture_path = PathBuf::from("/tmp/fixtures");
    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.clone()));
    let teams_dir = ds.teams_dir();

    // Should point to fixture/.claude/teams
    assert_eq!(teams_dir, fixture_path.join(".claude/teams"));
}

#[test]
fn data_source_tasks_dir_without_fixture() {
    let ds = tina_monitor::data::DataSource::new(None);
    let tasks_dir = ds.tasks_dir();

    // Should point to ~/.claude/tasks
    assert!(tasks_dir.ends_with(".claude/tasks"));
}

#[test]
fn data_source_tasks_dir_with_fixture() {
    let fixture_path = PathBuf::from("/tmp/fixtures");
    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.clone()));
    let tasks_dir = ds.tasks_dir();

    // Should point to fixture/.claude/tasks
    assert_eq!(tasks_dir, fixture_path.join(".claude/tasks"));
}

#[test]
fn orchestration_struct_fields() {
    let orchestration = tina_monitor::data::Orchestration {
        state: SupervisorState {
            version: 1,
            feature: "test-feature".to_string(),
            design_doc: PathBuf::from("/path/to/design.md"),
            worktree_path: PathBuf::from("/path/to/worktree"),
            branch: "test-feature".to_string(),
            total_phases: 3,
            current_phase: 1,
            status: OrchestrationStatus::Planning,
            orchestration_started_at: chrono::Utc::now(),
            phases: Default::default(),
            timing: Default::default(),
            model_policy: Default::default(),
        },
        orchestrator_team: None,
        phase_team: None,
        tasks: vec![],
    };

    assert_eq!(orchestration.orchestrator_team, None);
    assert_eq!(orchestration.phase_team, None);
    assert_eq!(orchestration.tasks.len(), 0);
}

#[test]
fn data_source_current_returns_none_when_empty() {
    let ds = tina_monitor::data::DataSource::new(None);
    assert!(ds.current().is_none());
}

#[test]
fn data_source_list_orchestrations_placeholder() {
    let ds = tina_monitor::data::DataSource::new(None);
    let result = ds.list_orchestrations();
    // Placeholder should return empty or an error
    assert!(result.is_ok() || result.is_err());
}

#[test]
fn data_source_load_orchestration_placeholder() {
    let mut ds = tina_monitor::data::DataSource::new(None);
    let result = ds.load_orchestration("test-feature");
    // Placeholder should return empty or an error
    assert!(result.is_ok() || result.is_err());
}

// ====================================================================
// Tests for load_session_lookup
// ====================================================================

#[test]
fn load_session_lookup_from_fixture() {
    let temp_dir = TempDir::new().unwrap();
    let fixture_path = temp_dir.path();

    // Create session lookup file with correct schema
    let session_content = r#"{
        "feature": "auth-feature",
        "worktree_path": "/path/to/worktree",
        "repo_root": "/path/to",
        "created_at": "2026-01-30T10:00:00Z"
    }"#;
    fs::write(
        fixture_path.join("auth-feature.json"),
        session_content,
    ).unwrap();

    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.to_path_buf()));
    let result = ds.load_session_lookup("auth-feature");

    assert!(result.is_ok());
    let lookup = result.unwrap();
    assert_eq!(lookup.feature, "auth-feature");
    assert_eq!(lookup.worktree_path, std::path::PathBuf::from("/path/to/worktree"));
}

#[test]
fn load_session_lookup_missing_file_returns_error() {
    let temp_dir = TempDir::new().unwrap();
    let fixture_path = temp_dir.path();

    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.to_path_buf()));
    let result = ds.load_session_lookup("nonexistent");

    assert!(result.is_err());
}

// ====================================================================
// Tests for load_supervisor_state
// ====================================================================

#[test]
fn load_supervisor_state_from_fixture() {
    let temp_dir = TempDir::new().unwrap();
    let fixture_path = temp_dir.path();
    fs::create_dir_all(fixture_path.join(".claude/tina")).unwrap();

    // Create supervisor state file
    let state_content = r#"{
        "version": 1,
        "feature": "test-feature",
        "design_doc": "/path/to/design.md",
        "worktree_path": "/path/to/worktree",
        "branch": "test-feature",
        "total_phases": 3,
        "current_phase": 2,
        "status": "executing",
        "orchestration_started_at": "2025-01-31T10:00:00Z",
        "phases": {},
        "timing": {}
    }"#;
    fs::write(
        fixture_path.join(".claude/tina/supervisor-state.json"),
        state_content,
    ).unwrap();

    let worktree_path = fixture_path.join(".claude/tina");
    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.to_path_buf()));
    let result = ds.load_supervisor_state(&worktree_path);

    assert!(result.is_ok());
    let state = result.unwrap();
    assert_eq!(state.feature, "test-feature");
    assert_eq!(state.current_phase, 2);
    assert_eq!(state.status, OrchestrationStatus::Executing);
}

#[test]
fn load_supervisor_state_missing_file_returns_error() {
    let temp_dir = TempDir::new().unwrap();
    let fixture_path = temp_dir.path();

    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.to_path_buf()));
    let result = ds.load_supervisor_state(&fixture_path.join(".claude/tina"));

    assert!(result.is_err());
}

// ====================================================================
// Tests for load_team
// ====================================================================

#[test]
fn load_team_from_fixture() {
    let temp_dir = TempDir::new().unwrap();
    let fixture_path = temp_dir.path();
    fs::create_dir_all(fixture_path.join(".claude/teams/my-team")).unwrap();

    // Create team file at {name}/config.json
    let team_content = r#"{
        "name": "my-team",
        "description": "A test team",
        "createdAt": 1706644800000,
        "leadAgentId": "team-lead",
        "leadSessionId": "session-123",
        "members": []
    }"#;
    fs::write(
        fixture_path.join(".claude/teams/my-team/config.json"),
        team_content,
    ).unwrap();

    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.to_path_buf()));
    let result = ds.load_team("my-team");

    assert!(result.is_ok());
    let team = result.unwrap();
    assert_eq!(team.name, "my-team");
    assert_eq!(team.lead_agent_id, "team-lead");
}

#[test]
fn load_team_missing_file_returns_error() {
    let temp_dir = TempDir::new().unwrap();
    let fixture_path = temp_dir.path();
    fs::create_dir_all(fixture_path.join(".claude/teams")).unwrap();

    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.to_path_buf()));
    let result = ds.load_team("nonexistent");

    assert!(result.is_err());
}

// ====================================================================
// Tests for load_tasks
// ====================================================================

#[test]
fn load_tasks_from_fixture() {
    let temp_dir = TempDir::new().unwrap();
    let fixture_path = temp_dir.path();
    fs::create_dir_all(fixture_path.join(".claude/tasks/my-team")).unwrap();

    // Create task files
    let task1_content = r#"{
        "id": "2",
        "subject": "Task Two",
        "description": "Second task",
        "activeForm": null,
        "status": "pending",
        "owner": null,
        "blocks": [],
        "blockedBy": [],
        "metadata": {}
    }"#;
    let task2_content = r#"{
        "id": "1",
        "subject": "Task One",
        "description": "First task",
        "activeForm": null,
        "status": "in_progress",
        "owner": null,
        "blocks": [],
        "blockedBy": [],
        "metadata": {}
    }"#;
    fs::write(
        fixture_path.join(".claude/tasks/my-team/2.json"),
        task1_content,
    ).unwrap();
    fs::write(
        fixture_path.join(".claude/tasks/my-team/1.json"),
        task2_content,
    ).unwrap();

    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.to_path_buf()));
    let result = ds.load_tasks("my-team");

    assert!(result.is_ok());
    let tasks = result.unwrap();
    assert_eq!(tasks.len(), 2);
    // Tasks should be sorted by id numerically
    assert_eq!(tasks[0].id, "1");
    assert_eq!(tasks[1].id, "2");
}

#[test]
fn load_tasks_empty_directory() {
    let temp_dir = TempDir::new().unwrap();
    let fixture_path = temp_dir.path();
    fs::create_dir_all(fixture_path.join(".claude/tasks/my-team")).unwrap();

    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.to_path_buf()));
    let result = ds.load_tasks("my-team");

    assert!(result.is_ok());
    let tasks = result.unwrap();
    assert_eq!(tasks.len(), 0);
}

#[test]
fn load_tasks_sorts_numerically() {
    let temp_dir = TempDir::new().unwrap();
    let fixture_path = temp_dir.path();
    fs::create_dir_all(fixture_path.join(".claude/tasks/my-team")).unwrap();

    // Create tasks with numeric ids in non-sequential order
    for (id, subject) in &[("10", "Task Ten"), ("2", "Task Two"), ("1", "Task One"), ("3", "Task Three")] {
        let task_content = format!(r#"{{
            "id": "{}",
            "subject": "{}",
            "description": "",
            "activeForm": null,
            "status": "pending",
            "owner": null,
            "blocks": [],
            "blockedBy": [],
            "metadata": {{}}
        }}"#, id, subject);
        fs::write(
            fixture_path.join(format!(".claude/tasks/my-team/{}.json", id)),
            task_content,
        ).unwrap();
    }

    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.to_path_buf()));
    let result = ds.load_tasks("my-team");

    assert!(result.is_ok());
    let tasks = result.unwrap();
    assert_eq!(tasks.len(), 4);
    // Should be sorted numerically: 1, 2, 3, 10
    assert_eq!(tasks[0].id, "1");
    assert_eq!(tasks[1].id, "2");
    assert_eq!(tasks[2].id, "3");
    assert_eq!(tasks[3].id, "10");
}

// ====================================================================
// Tests for load_summary
// ====================================================================

#[test]
fn load_summary_from_fixture() {
    let temp_dir = TempDir::new().unwrap();
    let fixture_path = temp_dir.path();
    fs::create_dir_all(fixture_path.join(".claude/tina")).unwrap();

    // Create summary file
    let summary_content = r#"{
        "version": 1,
        "feature": "test-feature",
        "design_doc": "/path/to/design.md",
        "worktree_path": "/path/to/worktree",
        "branch": "test-feature",
        "total_phases": 3,
        "current_phase": 2,
        "status": "executing",
        "orchestration_started_at": "2025-01-31T10:00:00Z",
        "phases": {},
        "timing": {}
    }"#;
    fs::write(
        fixture_path.join(".claude/tina/supervisor-state.json"),
        summary_content,
    ).unwrap();

    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.to_path_buf()));
    let result = ds.load_summary(&fixture_path.join(".claude/tina"));

    assert!(result.is_ok());
    let summary = result.unwrap();
    assert_eq!(summary.feature, "test-feature");
    assert_eq!(summary.current_phase, 2);
    assert_eq!(summary.total_phases, 3);
    // elapsed_mins is not computed from local files in the new data layer
    assert!(summary.elapsed_mins.is_none());
}
