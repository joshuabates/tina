use rusqlite::Connection;

/// Run all pending migrations on the database.
///
/// Uses `PRAGMA user_version` to track which migrations have been applied.
pub fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let version: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if version < 1 {
        migrate_v0_to_v1(conn)?;
    }

    Ok(())
}

fn migrate_v0_to_v1(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE projects (
            id          INTEGER PRIMARY KEY,
            name        TEXT NOT NULL UNIQUE,
            repo_path   TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE orchestrations (
            id                  TEXT PRIMARY KEY,
            project_id          INTEGER NOT NULL REFERENCES projects,
            feature_name        TEXT NOT NULL,
            design_doc_path     TEXT NOT NULL,
            branch              TEXT NOT NULL,
            worktree_path       TEXT,
            total_phases        INTEGER NOT NULL,
            status              TEXT NOT NULL,
            started_at          TEXT NOT NULL,
            completed_at        TEXT,
            total_elapsed_mins  INTEGER
        );

        CREATE TABLE phases (
            id                  INTEGER PRIMARY KEY,
            orchestration_id    TEXT NOT NULL REFERENCES orchestrations,
            phase_number        TEXT NOT NULL,
            status              TEXT NOT NULL,
            plan_path           TEXT,
            git_range           TEXT,
            planning_mins       INTEGER,
            execution_mins      INTEGER,
            review_mins         INTEGER,
            started_at          TEXT,
            completed_at        TEXT,
            UNIQUE(orchestration_id, phase_number)
        );

        CREATE TABLE task_events (
            id                  INTEGER PRIMARY KEY,
            orchestration_id    TEXT NOT NULL REFERENCES orchestrations,
            phase_number        TEXT,
            task_id             TEXT NOT NULL,
            subject             TEXT NOT NULL,
            description         TEXT,
            status              TEXT NOT NULL,
            owner               TEXT,
            blocked_by          TEXT,
            metadata            TEXT,
            recorded_at         TEXT NOT NULL
        );

        CREATE TABLE team_members (
            id                  INTEGER PRIMARY KEY,
            orchestration_id    TEXT NOT NULL REFERENCES orchestrations,
            phase_number        TEXT NOT NULL,
            agent_name          TEXT NOT NULL,
            agent_type          TEXT,
            model               TEXT,
            joined_at           TEXT,
            recorded_at         TEXT NOT NULL
        );

        CREATE INDEX idx_orchestrations_project ON orchestrations(project_id);
        CREATE INDEX idx_phases_orchestration ON phases(orchestration_id);
        CREATE INDEX idx_task_events_orchestration ON task_events(orchestration_id);
        CREATE INDEX idx_task_events_task ON task_events(orchestration_id, task_id);
        CREATE INDEX idx_team_members_orchestration ON team_members(orchestration_id);

        PRAGMA user_version = 1;
        ",
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migrate_from_zero() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        migrate(&conn).expect("migration should succeed");

        // user_version should be 1
        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);

        // All tables should exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert!(tables.contains(&"projects".to_string()));
        assert!(tables.contains(&"orchestrations".to_string()));
        assert!(tables.contains(&"phases".to_string()));
        assert!(tables.contains(&"task_events".to_string()));
        assert!(tables.contains(&"team_members".to_string()));

        // All indexes should exist
        let indexes: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert!(indexes.contains(&"idx_orchestrations_project".to_string()));
        assert!(indexes.contains(&"idx_phases_orchestration".to_string()));
        assert!(indexes.contains(&"idx_task_events_orchestration".to_string()));
        assert!(indexes.contains(&"idx_task_events_task".to_string()));
        assert!(indexes.contains(&"idx_team_members_orchestration".to_string()));
    }

    #[test]
    fn test_migrate_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        migrate(&conn).expect("first migration should succeed");
        migrate(&conn).expect("second migration should succeed");

        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }
}
