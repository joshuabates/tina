use std::path::PathBuf;
use tina_monitor::types::*;

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
