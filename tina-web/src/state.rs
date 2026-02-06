use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use rusqlite::Connection;
use tokio::sync::{broadcast, Mutex};

/// Shared application state accessible by all handlers.
///
/// Holds a SQLite connection and polls for changes on a configurable interval.
pub struct AppState {
    /// SQLite connection (protected by async Mutex for Send + Sync)
    conn: Mutex<Connection>,
    /// Broadcast channel for notifying WebSocket clients of updates
    update_tx: broadcast::Sender<()>,
    /// Polling interval for checking SQLite changes
    poll_interval: Duration,
}

impl AppState {
    /// Create AppState from the default database path (`~/.local/share/tina/tina.db`).
    pub fn new() -> Arc<Self> {
        let db_path = tina_data::db::default_db_path();
        Self::open(&db_path)
    }

    /// Create AppState from a specific database path.
    pub fn open(db_path: &PathBuf) -> Arc<Self> {
        let conn = tina_data::db::open_or_create(db_path)
            .expect("Failed to open SQLite database");
        tina_session::db::migrations::migrate(&conn)
            .expect("Failed to run database migrations");

        let (update_tx, _) = broadcast::channel(16);

        Arc::new(Self {
            conn: Mutex::new(conn),
            update_tx,
            poll_interval: Duration::from_secs(2),
        })
    }

    /// Access the database connection.
    pub async fn conn(&self) -> tokio::sync::MutexGuard<'_, Connection> {
        self.conn.lock().await
    }

    /// Subscribe to update notifications (for WebSocket push).
    pub fn subscribe(&self) -> broadcast::Receiver<()> {
        self.update_tx.subscribe()
    }

    /// Notify all subscribers that data may have changed.
    pub fn notify(&self) {
        let _ = self.update_tx.send(());
    }

    /// Get the polling interval.
    pub fn poll_interval(&self) -> Duration {
        self.poll_interval
    }
}

/// Start a background polling task that checks SQLite for changes.
///
/// Tracks the max task_events rowid and orchestrations count to detect changes,
/// then broadcasts to WebSocket clients when new data is found.
pub fn start_poller(state: Arc<AppState>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut last_max_event_id: i64 = {
            let conn = state.conn().await;
            conn.query_row(
                "SELECT COALESCE(MAX(id), 0) FROM task_events",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0)
        };

        let mut last_orch_count: i64 = {
            let conn = state.conn().await;
            conn.query_row("SELECT COUNT(*) FROM orchestrations", [], |row| row.get(0))
                .unwrap_or(0)
        };

        loop {
            tokio::time::sleep(state.poll_interval()).await;

            let (current_max_event_id, current_orch_count) = {
                let conn = state.conn().await;
                let max_id: i64 = conn
                    .query_row(
                        "SELECT COALESCE(MAX(id), 0) FROM task_events",
                        [],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);
                let count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM orchestrations", [], |row| row.get(0))
                    .unwrap_or(0);
                (max_id, count)
            };

            if current_max_event_id != last_max_event_id
                || current_orch_count != last_orch_count
            {
                last_max_event_id = current_max_event_id;
                last_orch_count = current_orch_count;
                state.notify();
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_state() -> Arc<AppState> {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.keep().join("test.db");
        AppState::open(&db_path)
    }

    #[tokio::test]
    async fn test_new_state_can_query() {
        let state = test_state();
        let conn = state.conn().await;
        let projects = tina_data::db::list_projects(&conn).unwrap();
        assert!(projects.is_empty());
    }

    #[tokio::test]
    async fn test_subscribe_receives_notification() {
        let state = test_state();
        let mut rx = state.subscribe();

        state.notify();

        let result = rx.try_recv();
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_poll_interval_default() {
        let state = test_state();
        assert_eq!(state.poll_interval(), Duration::from_secs(2));
    }
}
