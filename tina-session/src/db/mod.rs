pub mod migrations;
pub mod orchestration_events;
pub mod orchestrations;
pub mod phases;
pub mod projects;
pub mod queries;
pub mod task_events;
pub mod team_members;

use std::path::Path;

use rusqlite::Connection;

/// Open or create the SQLite database at the given path.
///
/// Sets WAL journal mode and enables foreign keys.
/// Creates parent directories if needed.
pub fn open_or_create(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
                Some(format!("Cannot create directory {}: {}", parent.display(), e)),
            )
        })?;
    }

    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

/// Returns the default database path: `~/.local/share/tina/tina.db`
pub fn default_db_path() -> std::path::PathBuf {
    let data_dir = dirs::data_local_dir().expect("Could not determine local data directory");
    data_dir.join("tina").join("tina.db")
}

/// Create an in-memory database with migrations applied, for testing.
#[cfg(test)]
pub fn test_db() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    conn.pragma_update(None, "foreign_keys", "ON").expect("enable foreign keys");
    migrations::migrate(&conn).expect("run migrations");
    conn
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_or_create_creates_db() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("subdir").join("test.db");

        let conn = open_or_create(&db_path).expect("open_or_create should succeed");

        // Database file should exist
        assert!(db_path.exists());

        // WAL mode should be set
        let mode: String = conn
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .unwrap();
        assert_eq!(mode.to_lowercase(), "wal");

        // Foreign keys should be on
        let fk: i32 = conn
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn test_default_db_path_ends_correctly() {
        let path = default_db_path();
        assert!(path.ends_with("tina/tina.db"));
    }
}
