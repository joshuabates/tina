use std::fs;
use std::path::Path;

use chrono::Utc;
use rusqlite::Connection;

use crate::db::{orchestrations, task_events, team_members};
use crate::session::lookup::SessionLookup;
use crate::state::schema::{Task, Team};

/// Scan teams and tasks directories and sync any changes to SQLite.
///
/// For each team that has an associated orchestration in the database:
/// - Upserts team members
/// - Upserts task events (inserting new events for status changes)
pub fn sync_all(conn: &Connection, teams_dir: &Path, tasks_dir: &Path) -> anyhow::Result<()> {
    let team_names = list_team_names(teams_dir)?;

    for team_name in &team_names {
        if let Err(e) = sync_team(conn, teams_dir, tasks_dir, team_name) {
            eprintln!("Failed to sync team '{}': {}", team_name, e);
        }
    }

    Ok(())
}

/// Sync a single team's members and tasks to SQLite.
fn sync_team(
    conn: &Connection,
    teams_dir: &Path,
    tasks_dir: &Path,
    team_name: &str,
) -> anyhow::Result<()> {
    // Load team config
    let team = load_team_config(teams_dir, team_name)?;

    // Find the orchestration this team belongs to.
    // Teams are associated by matching the orchestration's feature name:
    // - Orchestration teams: "{feature}-orchestration"
    // - Phase teams: team's first member cwd matches worktree_path
    let orchestration_id = match find_orchestration_for_team(conn, team_name, &team)? {
        Some(id) => id,
        None => return Ok(()), // Not associated with any known orchestration
    };

    // Determine phase number from team name if possible
    let phase_number = extract_phase_number(team_name);

    // Sync team members
    let now = Utc::now().to_rfc3339();
    for member in &team.members {
        let tm = team_members::TeamMember {
            id: None,
            orchestration_id: orchestration_id.clone(),
            phase_number: phase_number.clone().unwrap_or_else(|| "0".to_string()),
            agent_name: member.name.clone(),
            agent_type: member.agent_type.clone(),
            model: Some(member.model.clone()),
            joined_at: Some(
                chrono::DateTime::from_timestamp_millis(member.joined_at)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
            ),
            recorded_at: now.clone(),
        };
        team_members::upsert(conn, &tm)?;
    }

    // Sync tasks - read from tasks_dir/{lead_session_id}/
    let task_session_dir = tasks_dir.join(&team.lead_session_id);
    if task_session_dir.exists() {
        sync_tasks(conn, &orchestration_id, phase_number.as_deref(), &task_session_dir)?;
    }

    Ok(())
}

/// Sync task files from a task directory into SQLite as task events.
///
/// For each task JSON file, checks if the current status differs from the latest
/// event in the database. If so, inserts a new event.
fn sync_tasks(
    conn: &Connection,
    orchestration_id: &str,
    phase_number: Option<&str>,
    task_dir: &Path,
) -> anyhow::Result<()> {
    let now = Utc::now().to_rfc3339();

    // Load current tasks from filesystem
    let fs_tasks = load_task_files(task_dir)?;

    // Load latest events per task from database
    let db_latest = task_events::latest_per_task(conn, orchestration_id)?;

    for task in &fs_tasks {
        // Check if this task's status has changed from what's in the database
        let needs_insert = match db_latest.iter().find(|e| e.task_id == task.id) {
            Some(existing) => {
                existing.status != task.status.to_string()
                    || existing.subject != task.subject
                    || existing.owner != task.owner
            }
            None => true, // New task, not in database yet
        };

        if needs_insert {
            let blocked_by_json = if task.blocked_by.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&task.blocked_by)?)
            };

            let metadata_json = if task.metadata.is_null() {
                None
            } else {
                Some(serde_json::to_string(&task.metadata)?)
            };

            let event = task_events::TaskEvent {
                id: None,
                orchestration_id: orchestration_id.to_string(),
                phase_number: phase_number.map(|s| s.to_string()),
                task_id: task.id.clone(),
                subject: task.subject.clone(),
                description: Some(task.description.clone()),
                status: task.status.to_string(),
                owner: task.owner.clone(),
                blocked_by: blocked_by_json,
                metadata: metadata_json,
                recorded_at: now.clone(),
            };
            task_events::insert_event(conn, &event)?;
        }
    }

    Ok(())
}

/// Find the orchestration ID for a team.
///
/// Strategy:
/// 1. If team name ends with "-orchestration", extract feature name and look up by feature.
/// 2. Otherwise, try to match by the team's first member cwd against worktree_path.
fn find_orchestration_for_team(
    conn: &Connection,
    team_name: &str,
    team: &Team,
) -> anyhow::Result<Option<String>> {
    // Check if this is an orchestration team
    if team_name.ends_with("-orchestration") {
        let feature = team_name.trim_end_matches("-orchestration");
        if let Some(orch) = orchestrations::find_by_feature(conn, feature)? {
            return Ok(Some(orch.id));
        }
    }

    // Try session lookup: check if any feature's session points to this team's worktree
    let member_cwd = team
        .members
        .first()
        .map(|m| m.cwd.clone())
        .unwrap_or_default();

    // Look through session lookups to find which orchestration's worktree matches
    let lookups = SessionLookup::list_all().unwrap_or_default();
    for lookup in lookups {
        if lookup.cwd == member_cwd {
            if let Some(orch) = orchestrations::find_by_feature(conn, &lookup.feature)? {
                return Ok(Some(orch.id));
            }
        }
    }

    Ok(None)
}

/// Extract phase number from a team name.
///
/// Examples: "feat-phase-2-execution" -> "2", "phase-1" -> "1"
fn extract_phase_number(team_name: &str) -> Option<String> {
    // Look for "phase-N" pattern
    for part in team_name.split('-') {
        if let Ok(n) = part.parse::<u32>() {
            // Check if preceded by "phase"
            let pattern = format!("phase-{}", n);
            if team_name.contains(&pattern) {
                return Some(n.to_string());
            }
        }
    }
    None
}

/// List all team directory names.
fn list_team_names(teams_dir: &Path) -> anyhow::Result<Vec<String>> {
    if !teams_dir.exists() {
        return Ok(vec![]);
    }

    let mut names = Vec::new();
    for entry in fs::read_dir(teams_dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            if entry.path().join("config.json").exists() {
                if let Some(name) = entry.file_name().to_str() {
                    names.push(name.to_string());
                }
            }
        }
    }
    names.sort();
    Ok(names)
}

/// Load a team config from teams_dir/{name}/config.json.
fn load_team_config(teams_dir: &Path, name: &str) -> anyhow::Result<Team> {
    let path = teams_dir.join(name).join("config.json");
    let content = fs::read_to_string(&path)?;
    let team: Team = serde_json::from_str(&content)?;
    Ok(team)
}

/// Load all task JSON files from a directory.
fn load_task_files(dir: &Path) -> anyhow::Result<Vec<Task>> {
    let mut tasks = Vec::new();
    if !dir.exists() {
        return Ok(tasks);
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            match fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str::<Task>(&content) {
                    Ok(task) => tasks.push(task),
                    Err(e) => eprintln!("Failed to parse task {}: {}", path.display(), e),
                },
                Err(e) => eprintln!("Failed to read task {}: {}", path.display(), e),
            }
        }
    }
    Ok(tasks)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{self, projects};
    use tempfile::TempDir;

    fn setup_test_db() -> Connection {
        db::test_db()
    }

    fn setup_orchestration(conn: &Connection) -> String {
        let pid = projects::find_or_create_by_repo_path(conn, "proj", "/repo").unwrap();
        let orch = orchestrations::Orchestration {
            id: "feat_2026-02-06T00:00:00Z".to_string(),
            project_id: pid,
            feature_name: "feat".to_string(),
            design_doc_path: "/docs/design.md".to_string(),
            branch: "tina/feat".to_string(),
            worktree_path: None,
            total_phases: 3,
            status: "planning".to_string(),
            started_at: "2026-02-06T00:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: None,
        };
        orchestrations::insert(conn, &orch).unwrap();
        orch.id
    }

    fn create_team_dir(dir: &Path, name: &str, cwd: &str) {
        let team_dir = dir.join(name);
        fs::create_dir_all(&team_dir).unwrap();
        let config = format!(
            r#"{{
                "name": "{}",
                "description": "Test",
                "createdAt": 1706644800000,
                "leadAgentId": "lead@{}",
                "leadSessionId": "session-{}",
                "members": [{{
                    "agentId": "lead@{}",
                    "name": "team-lead",
                    "agentType": "team-lead",
                    "model": "claude-opus-4-6",
                    "joinedAt": 1706644800000,
                    "tmuxPaneId": null,
                    "cwd": "{}",
                    "subscriptions": []
                }}, {{
                    "agentId": "worker@{}",
                    "name": "worker",
                    "agentType": "general-purpose",
                    "model": "claude-sonnet-4-5",
                    "joinedAt": 1706644800001,
                    "tmuxPaneId": null,
                    "cwd": "{}",
                    "subscriptions": []
                }}]
            }}"#,
            name, name, name, name, cwd, name, cwd
        );
        fs::write(team_dir.join("config.json"), config).unwrap();
    }

    fn create_task_file(dir: &Path, id: &str, subject: &str, status: &str) {
        fs::create_dir_all(dir).unwrap();
        let json = format!(
            r#"{{
                "id": "{}",
                "subject": "{}",
                "description": "Test task",
                "status": "{}",
                "owner": null,
                "blocks": [],
                "blockedBy": [],
                "metadata": {{}}
            }}"#,
            id, subject, status
        );
        fs::write(dir.join(format!("{}.json", id)), json).unwrap();
    }

    #[test]
    fn test_extract_phase_number() {
        assert_eq!(
            extract_phase_number("feat-phase-2-execution"),
            Some("2".to_string())
        );
        assert_eq!(
            extract_phase_number("my-feature-phase-1"),
            Some("1".to_string())
        );
        assert_eq!(extract_phase_number("feat-orchestration"), None);
        assert_eq!(extract_phase_number("random-team"), None);
    }

    #[test]
    fn test_list_team_names() {
        let temp = TempDir::new().unwrap();
        let teams_dir = temp.path().join("teams");
        fs::create_dir_all(&teams_dir).unwrap();

        create_team_dir(&teams_dir, "team-a", "/path");
        create_team_dir(&teams_dir, "team-b", "/path");

        // Directory without config.json should be ignored
        fs::create_dir_all(teams_dir.join("not-a-team")).unwrap();

        let names = list_team_names(&teams_dir).unwrap();
        assert_eq!(names, vec!["team-a", "team-b"]);
    }

    #[test]
    fn test_load_task_files() {
        let temp = TempDir::new().unwrap();
        let task_dir = temp.path().join("tasks");

        create_task_file(&task_dir, "1", "Build feature", "pending");
        create_task_file(&task_dir, "2", "Write tests", "in_progress");

        let tasks = load_task_files(&task_dir).unwrap();
        assert_eq!(tasks.len(), 2);
    }

    #[test]
    fn test_sync_tasks_inserts_new() {
        let conn = setup_test_db();
        let orch_id = setup_orchestration(&conn);

        let temp = TempDir::new().unwrap();
        let task_dir = temp.path().join("tasks");

        create_task_file(&task_dir, "1", "Build feature", "pending");
        create_task_file(&task_dir, "2", "Write tests", "in_progress");

        sync_tasks(&conn, &orch_id, Some("1"), &task_dir).unwrap();

        let events = task_events::latest_per_task(&conn, &orch_id).unwrap();
        assert_eq!(events.len(), 2);
    }

    #[test]
    fn test_sync_tasks_skips_unchanged() {
        let conn = setup_test_db();
        let orch_id = setup_orchestration(&conn);

        let temp = TempDir::new().unwrap();
        let task_dir = temp.path().join("tasks");

        create_task_file(&task_dir, "1", "Build feature", "pending");

        // First sync
        sync_tasks(&conn, &orch_id, Some("1"), &task_dir).unwrap();
        let events = task_events::history_for_task(&conn, &orch_id, "1").unwrap();
        assert_eq!(events.len(), 1);

        // Second sync with same data - should not insert again
        sync_tasks(&conn, &orch_id, Some("1"), &task_dir).unwrap();
        let events = task_events::history_for_task(&conn, &orch_id, "1").unwrap();
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn test_sync_tasks_detects_status_change() {
        let conn = setup_test_db();
        let orch_id = setup_orchestration(&conn);

        let temp = TempDir::new().unwrap();
        let task_dir = temp.path().join("tasks");

        create_task_file(&task_dir, "1", "Build feature", "pending");

        // First sync
        sync_tasks(&conn, &orch_id, Some("1"), &task_dir).unwrap();

        // Update task status
        create_task_file(&task_dir, "1", "Build feature", "in_progress");

        // Second sync - should detect the change
        sync_tasks(&conn, &orch_id, Some("1"), &task_dir).unwrap();

        let events = task_events::history_for_task(&conn, &orch_id, "1").unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].status, "pending");
        assert_eq!(events[1].status, "in_progress");
    }

    #[test]
    fn test_sync_team_members() {
        let conn = setup_test_db();
        let orch_id = setup_orchestration(&conn);

        let temp = TempDir::new().unwrap();
        let teams_dir = temp.path().join("teams");
        let tasks_dir = temp.path().join("tasks");
        fs::create_dir_all(&teams_dir).unwrap();
        fs::create_dir_all(&tasks_dir).unwrap();

        create_team_dir(&teams_dir, "feat-orchestration", "/repo");

        // Create task dir for the team's session
        create_task_file(
            &tasks_dir.join("session-feat-orchestration"),
            "1",
            "validate-design",
            "completed",
        );

        sync_team(&conn, &teams_dir, &tasks_dir, "feat-orchestration").unwrap();

        let members = team_members::list_by_orchestration(&conn, &orch_id).unwrap();
        assert_eq!(members.len(), 2);
        assert_eq!(members[0].agent_name, "team-lead");
        assert_eq!(members[1].agent_name, "worker");
    }

    #[test]
    fn test_find_orchestration_for_orchestration_team() {
        let conn = setup_test_db();
        let orch_id = setup_orchestration(&conn);

        // The team name "feat-orchestration" should match feature "feat"
        let team = Team {
            name: "feat-orchestration".to_string(),
            description: None,
            created_at: 0,
            lead_agent_id: "lead".to_string(),
            lead_session_id: "session".to_string(),
            members: vec![],
        };

        let result =
            find_orchestration_for_team(&conn, "feat-orchestration", &team).unwrap();
        assert_eq!(result, Some(orch_id));
    }

    #[test]
    fn test_find_orchestration_for_unknown_team() {
        let conn = setup_test_db();
        let _orch_id = setup_orchestration(&conn);

        let team = Team {
            name: "random-team".to_string(),
            description: None,
            created_at: 0,
            lead_agent_id: "lead".to_string(),
            lead_session_id: "session".to_string(),
            members: vec![],
        };

        let result = find_orchestration_for_team(&conn, "random-team", &team).unwrap();
        assert_eq!(result, None);
    }
}
