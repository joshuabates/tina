use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Orchestration {
    pub id: String,
    pub project_id: i64,
    pub feature_name: String,
    pub design_doc_path: String,
    pub branch: String,
    pub worktree_path: Option<String>,
    pub total_phases: i32,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub total_elapsed_mins: Option<i32>,
}

/// Insert a new orchestration record.
pub fn insert(conn: &Connection, orch: &Orchestration) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO orchestrations (id, project_id, feature_name, design_doc_path, branch, worktree_path, total_phases, status, started_at, completed_at, total_elapsed_mins)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            orch.id,
            orch.project_id,
            orch.feature_name,
            orch.design_doc_path,
            orch.branch,
            orch.worktree_path,
            orch.total_phases,
            orch.status,
            orch.started_at,
            orch.completed_at,
            orch.total_elapsed_mins,
        ],
    )?;
    Ok(())
}

/// Update the status of an orchestration.
pub fn update_status(conn: &Connection, id: &str, status: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE orchestrations SET status = ?1 WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}

/// Set the worktree_path on an orchestration (initially NULL).
pub fn update_worktree_path(conn: &Connection, id: &str, path: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE orchestrations SET worktree_path = ?1 WHERE id = ?2",
        params![path, id],
    )?;
    Ok(())
}

/// Find an orchestration by feature name. Returns the most recent one.
pub fn find_by_feature(conn: &Connection, feature: &str) -> rusqlite::Result<Option<Orchestration>> {
    conn.query_row(
        "SELECT id, project_id, feature_name, design_doc_path, branch, worktree_path, total_phases, status, started_at, completed_at, total_elapsed_mins
         FROM orchestrations WHERE feature_name = ?1 ORDER BY started_at DESC LIMIT 1",
        params![feature],
        row_to_orchestration,
    )
    .optional()
}

/// List all orchestrations for a project, most recent first.
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<Orchestration>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, feature_name, design_doc_path, branch, worktree_path, total_phases, status, started_at, completed_at, total_elapsed_mins
         FROM orchestrations WHERE project_id = ?1 ORDER BY started_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], row_to_orchestration)?;
    rows.collect()
}

/// List all orchestrations, most recent first.
pub fn list_all(conn: &Connection) -> rusqlite::Result<Vec<Orchestration>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, feature_name, design_doc_path, branch, worktree_path, total_phases, status, started_at, completed_at, total_elapsed_mins
         FROM orchestrations ORDER BY started_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_orchestration)?;
    rows.collect()
}

fn row_to_orchestration(row: &rusqlite::Row) -> rusqlite::Result<Orchestration> {
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
}

/// Extension trait to convert rusqlite::Error to Option for query_row
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
    use crate::db::{projects, test_db};

    fn make_test_orchestration(project_id: i64) -> Orchestration {
        Orchestration {
            id: "test-feature_2026-02-06T00:00:00Z".to_string(),
            project_id,
            feature_name: "test-feature".to_string(),
            design_doc_path: "/docs/design.md".to_string(),
            branch: "tina/test-feature".to_string(),
            worktree_path: None,
            total_phases: 3,
            status: "planning".to_string(),
            started_at: "2026-02-06T00:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: None,
        }
    }

    #[test]
    fn test_insert_orchestration() {
        let conn = test_db();
        let pid = projects::find_or_create_by_repo_path(&conn, "proj", "/repo").unwrap();
        let orch = make_test_orchestration(pid);

        insert(&conn, &orch).expect("insert should succeed");

        let found = find_by_feature(&conn, "test-feature").unwrap();
        assert!(found.is_some());
        let found = found.unwrap();
        assert_eq!(found.id, orch.id);
        assert_eq!(found.feature_name, "test-feature");
        assert_eq!(found.status, "planning");
        assert!(found.worktree_path.is_none());
    }

    #[test]
    fn test_update_status() {
        let conn = test_db();
        let pid = projects::find_or_create_by_repo_path(&conn, "proj", "/repo").unwrap();
        let orch = make_test_orchestration(pid);
        insert(&conn, &orch).unwrap();

        update_status(&conn, &orch.id, "executing").unwrap();

        let found = find_by_feature(&conn, "test-feature").unwrap().unwrap();
        assert_eq!(found.status, "executing");
    }

    #[test]
    fn test_update_worktree_path() {
        let conn = test_db();
        let pid = projects::find_or_create_by_repo_path(&conn, "proj", "/repo").unwrap();
        let orch = make_test_orchestration(pid);
        insert(&conn, &orch).unwrap();

        update_worktree_path(&conn, &orch.id, "/worktrees/test-feature").unwrap();

        let found = find_by_feature(&conn, "test-feature").unwrap().unwrap();
        assert_eq!(found.worktree_path.as_deref(), Some("/worktrees/test-feature"));
    }

    #[test]
    fn test_find_by_feature() {
        let conn = test_db();
        let pid = projects::find_or_create_by_repo_path(&conn, "proj", "/repo").unwrap();
        let orch = make_test_orchestration(pid);
        insert(&conn, &orch).unwrap();

        // Should find it
        let found = find_by_feature(&conn, "test-feature").unwrap();
        assert!(found.is_some());

        // Should not find a non-existent feature
        let missing = find_by_feature(&conn, "no-such-feature").unwrap();
        assert!(missing.is_none());
    }

    #[test]
    fn test_list_by_project() {
        let conn = test_db();
        let pid = projects::find_or_create_by_repo_path(&conn, "proj", "/repo").unwrap();
        let pid2 = projects::find_or_create_by_repo_path(&conn, "other", "/other").unwrap();

        let mut orch1 = make_test_orchestration(pid);
        orch1.id = "feat1_2026-02-06T00:00:00Z".to_string();
        orch1.feature_name = "feat1".to_string();
        insert(&conn, &orch1).unwrap();

        let mut orch2 = make_test_orchestration(pid);
        orch2.id = "feat2_2026-02-06T01:00:00Z".to_string();
        orch2.feature_name = "feat2".to_string();
        orch2.started_at = "2026-02-06T01:00:00Z".to_string();
        insert(&conn, &orch2).unwrap();

        // Orchestration in a different project
        let mut orch3 = make_test_orchestration(pid2);
        orch3.id = "feat3_2026-02-06T02:00:00Z".to_string();
        orch3.feature_name = "feat3".to_string();
        insert(&conn, &orch3).unwrap();

        let list = list_by_project(&conn, pid).unwrap();
        assert_eq!(list.len(), 2);
        // Most recent first
        assert_eq!(list[0].feature_name, "feat2");
        assert_eq!(list[1].feature_name, "feat1");

        let list2 = list_by_project(&conn, pid2).unwrap();
        assert_eq!(list2.len(), 1);
        assert_eq!(list2[0].feature_name, "feat3");
    }
}
