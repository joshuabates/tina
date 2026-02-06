use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TaskEvent {
    pub id: Option<i64>,
    pub orchestration_id: String,
    pub phase_number: Option<String>,
    pub task_id: String,
    pub subject: String,
    pub description: Option<String>,
    pub status: String,
    pub owner: Option<String>,
    pub blocked_by: Option<String>,
    pub metadata: Option<String>,
    pub recorded_at: String,
}

/// Insert a new task event row. Returns the inserted row id.
pub fn insert_event(conn: &Connection, event: &TaskEvent) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO task_events (orchestration_id, phase_number, task_id, subject, description, status, owner, blocked_by, metadata, recorded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            event.orchestration_id,
            event.phase_number,
            event.task_id,
            event.subject,
            event.description,
            event.status,
            event.owner,
            event.blocked_by,
            event.metadata,
            event.recorded_at,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Get the latest event per unique task_id for an orchestration (current snapshot).
pub fn latest_per_task(conn: &Connection, orchestration_id: &str) -> rusqlite::Result<Vec<TaskEvent>> {
    let mut stmt = conn.prepare(
        "SELECT te.id, te.orchestration_id, te.phase_number, te.task_id, te.subject, te.description, te.status, te.owner, te.blocked_by, te.metadata, te.recorded_at
         FROM task_events te
         INNER JOIN (
             SELECT task_id, MAX(id) as max_id
             FROM task_events
             WHERE orchestration_id = ?1
             GROUP BY task_id
         ) latest ON te.id = latest.max_id
         ORDER BY te.task_id",
    )?;
    let rows = stmt.query_map(params![orchestration_id], row_to_event)?;
    rows.collect()
}

/// Get the full event history for a specific task.
pub fn history_for_task(
    conn: &Connection,
    orchestration_id: &str,
    task_id: &str,
) -> rusqlite::Result<Vec<TaskEvent>> {
    let mut stmt = conn.prepare(
        "SELECT id, orchestration_id, phase_number, task_id, subject, description, status, owner, blocked_by, metadata, recorded_at
         FROM task_events
         WHERE orchestration_id = ?1 AND task_id = ?2
         ORDER BY id",
    )?;
    let rows = stmt.query_map(params![orchestration_id, task_id], row_to_event)?;
    rows.collect()
}

fn row_to_event(row: &rusqlite::Row) -> rusqlite::Result<TaskEvent> {
    Ok(TaskEvent {
        id: row.get(0)?,
        orchestration_id: row.get(1)?,
        phase_number: row.get(2)?,
        task_id: row.get(3)?,
        subject: row.get(4)?,
        description: row.get(5)?,
        status: row.get(6)?,
        owner: row.get(7)?,
        blocked_by: row.get(8)?,
        metadata: row.get(9)?,
        recorded_at: row.get(10)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{orchestrations, projects, test_db};

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

    #[test]
    fn test_insert_event() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        let event = TaskEvent {
            id: None,
            orchestration_id: orch_id.clone(),
            phase_number: Some("1".to_string()),
            task_id: "task-1".to_string(),
            subject: "Implement feature".to_string(),
            description: Some("Build the thing".to_string()),
            status: "pending".to_string(),
            owner: None,
            blocked_by: None,
            metadata: None,
            recorded_at: "2026-02-06T00:00:00Z".to_string(),
        };

        let id = insert_event(&conn, &event).expect("insert should succeed");
        assert!(id > 0);
    }

    #[test]
    fn test_latest_per_task() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        // Insert multiple events for the same task (status progression)
        for (status, time) in [("pending", "00:01"), ("in_progress", "00:02"), ("completed", "00:03")] {
            let event = TaskEvent {
                id: None,
                orchestration_id: orch_id.clone(),
                phase_number: Some("1".to_string()),
                task_id: "task-1".to_string(),
                subject: "Implement feature".to_string(),
                description: None,
                status: status.to_string(),
                owner: None,
                blocked_by: None,
                metadata: None,
                recorded_at: format!("2026-02-06T{}:00Z", time),
            };
            insert_event(&conn, &event).unwrap();
        }

        // Insert one event for a different task
        let event2 = TaskEvent {
            id: None,
            orchestration_id: orch_id.clone(),
            phase_number: Some("1".to_string()),
            task_id: "task-2".to_string(),
            subject: "Write tests".to_string(),
            description: None,
            status: "pending".to_string(),
            owner: None,
            blocked_by: None,
            metadata: None,
            recorded_at: "2026-02-06T00:04:00Z".to_string(),
        };
        insert_event(&conn, &event2).unwrap();

        let latest = latest_per_task(&conn, &orch_id).unwrap();
        assert_eq!(latest.len(), 2);

        // task-1 should show completed (the latest)
        let t1 = latest.iter().find(|e| e.task_id == "task-1").unwrap();
        assert_eq!(t1.status, "completed");

        // task-2 should show pending
        let t2 = latest.iter().find(|e| e.task_id == "task-2").unwrap();
        assert_eq!(t2.status, "pending");
    }

    #[test]
    fn test_history_for_task() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        for (status, time) in [("pending", "00:01"), ("in_progress", "00:02"), ("completed", "00:03")] {
            let event = TaskEvent {
                id: None,
                orchestration_id: orch_id.clone(),
                phase_number: Some("1".to_string()),
                task_id: "task-1".to_string(),
                subject: "Implement feature".to_string(),
                description: None,
                status: status.to_string(),
                owner: None,
                blocked_by: None,
                metadata: None,
                recorded_at: format!("2026-02-06T{}:00Z", time),
            };
            insert_event(&conn, &event).unwrap();
        }

        let history = history_for_task(&conn, &orch_id, "task-1").unwrap();
        assert_eq!(history.len(), 3);
        assert_eq!(history[0].status, "pending");
        assert_eq!(history[1].status, "in_progress");
        assert_eq!(history[2].status, "completed");
    }
}
