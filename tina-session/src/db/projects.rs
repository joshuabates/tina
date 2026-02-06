use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub repo_path: String,
    pub created_at: String,
}

/// Find a project by repo_path, or create it if it doesn't exist.
/// Returns the project id.
pub fn find_or_create_by_repo_path(
    conn: &Connection,
    name: &str,
    repo_path: &str,
) -> rusqlite::Result<i64> {
    // Try to find existing
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM projects WHERE repo_path = ?1",
            params![repo_path],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        return Ok(id);
    }

    // Insert new
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO projects (name, repo_path, created_at) VALUES (?1, ?2, ?3)",
        params![name, repo_path, now],
    )?;
    Ok(conn.last_insert_rowid())
}

/// List all projects.
pub fn list(conn: &Connection) -> rusqlite::Result<Vec<Project>> {
    let mut stmt = conn.prepare("SELECT id, name, repo_path, created_at FROM projects ORDER BY name")?;
    let rows = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            repo_path: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

/// Rename a project.
pub fn rename(conn: &Connection, id: i64, new_name: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE projects SET name = ?1 WHERE id = ?2",
        params![new_name, id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_db;

    #[test]
    fn test_find_or_create_inserts_new() {
        let conn = test_db();
        let id = find_or_create_by_repo_path(&conn, "my-project", "/path/to/repo").unwrap();
        assert!(id > 0);

        // Verify it's in the database
        let projects = list(&conn).unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "my-project");
        assert_eq!(projects[0].repo_path, "/path/to/repo");
    }

    #[test]
    fn test_find_or_create_returns_existing() {
        let conn = test_db();
        let id1 = find_or_create_by_repo_path(&conn, "my-project", "/path/to/repo").unwrap();
        let id2 = find_or_create_by_repo_path(&conn, "different-name", "/path/to/repo").unwrap();
        assert_eq!(id1, id2);

        // Should still be just one project
        let projects = list(&conn).unwrap();
        assert_eq!(projects.len(), 1);
    }

    #[test]
    fn test_list_projects() {
        let conn = test_db();
        find_or_create_by_repo_path(&conn, "alpha", "/path/a").unwrap();
        find_or_create_by_repo_path(&conn, "beta", "/path/b").unwrap();

        let projects = list(&conn).unwrap();
        assert_eq!(projects.len(), 2);
        // Should be sorted by name
        assert_eq!(projects[0].name, "alpha");
        assert_eq!(projects[1].name, "beta");
    }

    #[test]
    fn test_rename_project() {
        let conn = test_db();
        let id = find_or_create_by_repo_path(&conn, "old-name", "/path/to/repo").unwrap();

        rename(&conn, id, "new-name").unwrap();

        let projects = list(&conn).unwrap();
        assert_eq!(projects[0].name, "new-name");
    }
}
