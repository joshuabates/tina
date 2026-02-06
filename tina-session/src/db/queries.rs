use rusqlite::Connection;

use super::orchestrations::{self, Orchestration};
use super::phases::{self, Phase};
use super::task_events::{self, TaskEvent};
use super::team_members::{self, TeamMember};

/// Full orchestration detail with phases, latest tasks, and team members.
#[derive(Debug, Clone)]
pub struct OrchestrationDetail {
    pub orchestration: Orchestration,
    pub phases: Vec<Phase>,
    pub tasks: Vec<TaskEvent>,
    pub members: Vec<TeamMember>,
}

/// Load full orchestration detail by id.
///
/// Returns the orchestration with its phases, latest task events, and team members.
pub fn orchestration_detail(
    conn: &Connection,
    id: &str,
) -> rusqlite::Result<Option<OrchestrationDetail>> {
    let orch = match orchestrations::find_by_feature(conn, id)? {
        Some(o) => o,
        None => {
            // Try by exact id
            match find_by_id(conn, id)? {
                Some(o) => o,
                None => return Ok(None),
            }
        }
    };

    let phases = phases::list_by_orchestration(conn, &orch.id)?;
    let tasks = task_events::latest_per_task(conn, &orch.id)?;
    let members = team_members::list_by_orchestration(conn, &orch.id)?;

    Ok(Some(OrchestrationDetail {
        orchestration: orch,
        phases,
        tasks,
        members,
    }))
}

fn find_by_id(conn: &Connection, id: &str) -> rusqlite::Result<Option<Orchestration>> {
    conn.query_row(
        "SELECT id, project_id, feature_name, design_doc_path, branch, worktree_path, total_phases, status, started_at, completed_at, total_elapsed_mins
         FROM orchestrations WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(Orchestration {
                id: row.get(0)?,
                project_id: row.get(1)?,
                feature_name: row.get(2)?,
                design_doc_path: row.get(3)?,
                branch: row.get(4)?,
                worktree_path: row.get(5)?,
                total_phases: row.get(6)?,
                status: row.get(7)?,
                started_at: row.get(8)?,
                completed_at: row.get(9)?,
                total_elapsed_mins: row.get(10)?,
            })
        },
    )
    .optional()
}

trait OptionalExt<T> {
    fn optional(self) -> rusqlite::Result<Option<T>>;
}

impl<T> OptionalExt<T> for rusqlite::Result<T> {
    fn optional(self) -> rusqlite::Result<Option<T>> {
        match self {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{orchestrations, phases, projects, task_events, team_members, test_db};

    #[test]
    fn test_orchestration_detail() {
        let conn = test_db();
        let pid = projects::find_or_create_by_repo_path(&conn, "proj", "/repo").unwrap();

        let orch = orchestrations::Orchestration {
            id: "feat_2026-02-06T00:00:00Z".to_string(),
            project_id: pid,
            feature_name: "feat".to_string(),
            design_doc_path: "/docs/design.md".to_string(),
            branch: "tina/feat".to_string(),
            worktree_path: Some("/worktrees/feat".to_string()),
            total_phases: 2,
            status: "executing".to_string(),
            started_at: "2026-02-06T00:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: None,
        };
        orchestrations::insert(&conn, &orch).unwrap();

        // Add phases
        phases::upsert(
            &conn,
            &phases::Phase {
                id: None,
                orchestration_id: orch.id.clone(),
                phase_number: "1".to_string(),
                status: "complete".to_string(),
                plan_path: Some("/plan1.md".to_string()),
                git_range: Some("abc..def".to_string()),
                planning_mins: Some(5),
                execution_mins: Some(15),
                review_mins: Some(3),
                started_at: Some("2026-02-06T00:00:00Z".to_string()),
                completed_at: Some("2026-02-06T00:23:00Z".to_string()),
            },
        )
        .unwrap();

        phases::upsert(
            &conn,
            &phases::Phase {
                id: None,
                orchestration_id: orch.id.clone(),
                phase_number: "2".to_string(),
                status: "executing".to_string(),
                plan_path: None,
                git_range: None,
                planning_mins: None,
                execution_mins: None,
                review_mins: None,
                started_at: Some("2026-02-06T00:25:00Z".to_string()),
                completed_at: None,
            },
        )
        .unwrap();

        // Add task events
        task_events::insert_event(
            &conn,
            &task_events::TaskEvent {
                id: None,
                orchestration_id: orch.id.clone(),
                phase_number: Some("1".to_string()),
                task_id: "task-1".to_string(),
                subject: "Build it".to_string(),
                description: None,
                status: "completed".to_string(),
                owner: Some("worker".to_string()),
                blocked_by: None,
                metadata: None,
                recorded_at: "2026-02-06T00:10:00Z".to_string(),
            },
        )
        .unwrap();

        // Add team member
        team_members::upsert(
            &conn,
            &team_members::TeamMember {
                id: None,
                orchestration_id: orch.id.clone(),
                phase_number: "1".to_string(),
                agent_name: "worker".to_string(),
                agent_type: Some("general-purpose".to_string()),
                model: Some("claude-opus-4-6".to_string()),
                joined_at: None,
                recorded_at: "2026-02-06T00:00:00Z".to_string(),
            },
        )
        .unwrap();

        // Load detail by feature name
        let detail = orchestration_detail(&conn, "feat").unwrap();
        assert!(detail.is_some());
        let detail = detail.unwrap();

        assert_eq!(detail.orchestration.feature_name, "feat");
        assert_eq!(detail.orchestration.status, "executing");
        assert_eq!(detail.phases.len(), 2);
        assert_eq!(detail.phases[0].status, "complete");
        assert_eq!(detail.phases[1].status, "executing");
        assert_eq!(detail.tasks.len(), 1);
        assert_eq!(detail.tasks[0].subject, "Build it");
        assert_eq!(detail.members.len(), 1);
        assert_eq!(detail.members[0].agent_name, "worker");

        // Load by exact id
        let detail2 = orchestration_detail(&conn, &orch.id).unwrap();
        assert!(detail2.is_some());

        // Non-existent returns None
        let missing = orchestration_detail(&conn, "no-such").unwrap();
        assert!(missing.is_none());
    }
}
