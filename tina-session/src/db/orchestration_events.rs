use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OrchestrationEvent {
    pub id: Option<i64>,
    pub orchestration_id: String,
    pub phase_number: Option<String>,
    pub event_type: String,
    pub source: String,
    pub summary: String,
    pub detail: Option<String>,
    pub recorded_at: String,
}

/// Insert a new orchestration event. Returns the inserted row id.
pub fn insert(conn: &Connection, event: &OrchestrationEvent) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO orchestration_events (orchestration_id, phase_number, event_type, source, summary, detail, recorded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            event.orchestration_id,
            event.phase_number,
            event.event_type,
            event.source,
            event.summary,
            event.detail,
            event.recorded_at,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// List all events for an orchestration, ordered by recorded_at ascending.
pub fn list_by_orchestration(
    conn: &Connection,
    orchestration_id: &str,
) -> rusqlite::Result<Vec<OrchestrationEvent>> {
    let mut stmt = conn.prepare(
        "SELECT id, orchestration_id, phase_number, event_type, source, summary, detail, recorded_at
         FROM orchestration_events
         WHERE orchestration_id = ?1
         ORDER BY recorded_at, id",
    )?;
    let rows = stmt.query_map(params![orchestration_id], row_to_event)?;
    rows.collect()
}

/// List events with id > since_id for incremental polling.
pub fn list_by_orchestration_since(
    conn: &Connection,
    orchestration_id: &str,
    since_id: i64,
) -> rusqlite::Result<Vec<OrchestrationEvent>> {
    let mut stmt = conn.prepare(
        "SELECT id, orchestration_id, phase_number, event_type, source, summary, detail, recorded_at
         FROM orchestration_events
         WHERE orchestration_id = ?1 AND id > ?2
         ORDER BY recorded_at, id",
    )?;
    let rows = stmt.query_map(params![orchestration_id, since_id], row_to_event)?;
    rows.collect()
}

/// List events for a specific phase.
pub fn list_by_phase(
    conn: &Connection,
    orchestration_id: &str,
    phase_number: &str,
) -> rusqlite::Result<Vec<OrchestrationEvent>> {
    let mut stmt = conn.prepare(
        "SELECT id, orchestration_id, phase_number, event_type, source, summary, detail, recorded_at
         FROM orchestration_events
         WHERE orchestration_id = ?1 AND phase_number = ?2
         ORDER BY recorded_at, id",
    )?;
    let rows = stmt.query_map(params![orchestration_id, phase_number], row_to_event)?;
    rows.collect()
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StuckTask {
    pub orchestration_id: String,
    pub task_id: String,
    pub subject: String,
    pub owner: Option<String>,
    pub status: String,
    pub last_event_at: String,
    pub stuck_minutes: i64,
}

/// Find tasks that have been in_progress with no new task events for more than `threshold_mins`.
///
/// Only considers tasks in non-complete orchestrations.
pub fn stuck_tasks(conn: &Connection, threshold_mins: i64) -> rusqlite::Result<Vec<StuckTask>> {
    let mut stmt = conn.prepare(
        "SELECT te.orchestration_id, te.task_id, te.subject, te.owner, te.status, te.recorded_at,
                CAST((julianday('now') - julianday(te.recorded_at)) * 24 * 60 AS INTEGER) AS stuck_minutes
         FROM task_events te
         INNER JOIN (
             SELECT task_id, orchestration_id, MAX(id) as max_id
             FROM task_events
             GROUP BY orchestration_id, task_id
         ) latest ON te.id = latest.max_id
         INNER JOIN orchestrations o ON o.id = te.orchestration_id
         WHERE te.status = 'in_progress'
           AND o.status != 'complete'
           AND CAST((julianday('now') - julianday(te.recorded_at)) * 24 * 60 AS INTEGER) > ?1
         ORDER BY stuck_minutes DESC",
    )?;
    let rows = stmt.query_map(params![threshold_mins], |row| {
        Ok(StuckTask {
            orchestration_id: row.get(0)?,
            task_id: row.get(1)?,
            subject: row.get(2)?,
            owner: row.get(3)?,
            status: row.get(4)?,
            last_event_at: row.get(5)?,
            stuck_minutes: row.get(6)?,
        })
    })?;
    rows.collect()
}

fn row_to_event(row: &rusqlite::Row) -> rusqlite::Result<OrchestrationEvent> {
    Ok(OrchestrationEvent {
        id: row.get(0)?,
        orchestration_id: row.get(1)?,
        phase_number: row.get(2)?,
        event_type: row.get(3)?,
        source: row.get(4)?,
        summary: row.get(5)?,
        detail: row.get(6)?,
        recorded_at: row.get(7)?,
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
    fn test_insert_and_list() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        let event = OrchestrationEvent {
            id: None,
            orchestration_id: orch_id.clone(),
            phase_number: Some("1".to_string()),
            event_type: "phase_started".to_string(),
            source: "tina-session orchestrate".to_string(),
            summary: "Phase 1 planning started".to_string(),
            detail: None,
            recorded_at: "2026-02-06T00:00:00Z".to_string(),
        };

        let id = insert(&conn, &event).expect("insert should succeed");
        assert!(id > 0);

        let events = list_by_orchestration(&conn, &orch_id).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "phase_started");
        assert_eq!(events[0].source, "tina-session orchestrate");
    }

    #[test]
    fn test_list_by_phase() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        for (phase, event_type) in [("1", "phase_started"), ("1", "phase_completed"), ("2", "phase_started")] {
            insert(
                &conn,
                &OrchestrationEvent {
                    id: None,
                    orchestration_id: orch_id.clone(),
                    phase_number: Some(phase.to_string()),
                    event_type: event_type.to_string(),
                    source: "test".to_string(),
                    summary: format!("{} for phase {}", event_type, phase),
                    detail: None,
                    recorded_at: "2026-02-06T00:00:00Z".to_string(),
                },
            )
            .unwrap();
        }

        let phase1 = list_by_phase(&conn, &orch_id, "1").unwrap();
        assert_eq!(phase1.len(), 2);

        let phase2 = list_by_phase(&conn, &orch_id, "2").unwrap();
        assert_eq!(phase2.len(), 1);
    }

    #[test]
    fn test_list_since() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        let id1 = insert(
            &conn,
            &OrchestrationEvent {
                id: None,
                orchestration_id: orch_id.clone(),
                phase_number: Some("1".to_string()),
                event_type: "phase_started".to_string(),
                source: "test".to_string(),
                summary: "First event".to_string(),
                detail: None,
                recorded_at: "2026-02-06T00:01:00Z".to_string(),
            },
        )
        .unwrap();

        insert(
            &conn,
            &OrchestrationEvent {
                id: None,
                orchestration_id: orch_id.clone(),
                phase_number: Some("1".to_string()),
                event_type: "phase_completed".to_string(),
                source: "test".to_string(),
                summary: "Second event".to_string(),
                detail: None,
                recorded_at: "2026-02-06T00:02:00Z".to_string(),
            },
        )
        .unwrap();

        let since = list_by_orchestration_since(&conn, &orch_id, id1).unwrap();
        assert_eq!(since.len(), 1);
        assert_eq!(since[0].summary, "Second event");
    }

    #[test]
    fn test_stuck_tasks_detects_old_in_progress() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        // Insert a task that's been in_progress since a long time ago
        let old_event = crate::db::task_events::TaskEvent {
            id: None,
            orchestration_id: orch_id.clone(),
            phase_number: Some("1".to_string()),
            task_id: "task-1".to_string(),
            subject: "Long running task".to_string(),
            description: None,
            status: "in_progress".to_string(),
            owner: Some("executor-1".to_string()),
            blocked_by: None,
            metadata: None,
            recorded_at: "2020-01-01T00:00:00Z".to_string(), // Very old
        };
        crate::db::task_events::insert_event(&conn, &old_event).unwrap();

        let stuck = stuck_tasks(&conn, 15).unwrap();
        assert_eq!(stuck.len(), 1);
        assert_eq!(stuck[0].task_id, "task-1");
        assert_eq!(stuck[0].owner, Some("executor-1".to_string()));
        assert!(stuck[0].stuck_minutes > 15);
    }

    #[test]
    fn test_stuck_tasks_ignores_completed_tasks() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        // Insert in_progress then completed
        for (status, time) in [("in_progress", "2020-01-01T00:00:00Z"), ("completed", "2020-01-01T00:01:00Z")] {
            crate::db::task_events::insert_event(
                &conn,
                &crate::db::task_events::TaskEvent {
                    id: None,
                    orchestration_id: orch_id.clone(),
                    phase_number: Some("1".to_string()),
                    task_id: "task-1".to_string(),
                    subject: "Done task".to_string(),
                    description: None,
                    status: status.to_string(),
                    owner: None,
                    blocked_by: None,
                    metadata: None,
                    recorded_at: time.to_string(),
                },
            )
            .unwrap();
        }

        let stuck = stuck_tasks(&conn, 15).unwrap();
        assert!(stuck.is_empty());
    }

    #[test]
    fn test_stuck_tasks_ignores_complete_orchestrations() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        // Mark orchestration complete
        crate::db::orchestrations::update_status(&conn, &orch_id, "complete").unwrap();

        // Insert old in_progress task
        crate::db::task_events::insert_event(
            &conn,
            &crate::db::task_events::TaskEvent {
                id: None,
                orchestration_id: orch_id.clone(),
                phase_number: Some("1".to_string()),
                task_id: "task-1".to_string(),
                subject: "Old task".to_string(),
                description: None,
                status: "in_progress".to_string(),
                owner: None,
                blocked_by: None,
                metadata: None,
                recorded_at: "2020-01-01T00:00:00Z".to_string(),
            },
        )
        .unwrap();

        let stuck = stuck_tasks(&conn, 15).unwrap();
        assert!(stuck.is_empty());
    }

    #[test]
    fn test_empty_results() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        let events = list_by_orchestration(&conn, &orch_id).unwrap();
        assert!(events.is_empty());

        let events = list_by_orchestration_since(&conn, &orch_id, 0).unwrap();
        assert!(events.is_empty());

        let events = list_by_phase(&conn, &orch_id, "1").unwrap();
        assert!(events.is_empty());
    }
}
