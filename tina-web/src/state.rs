use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

use tina_data::discovery::Orchestration;

/// Shared application state accessible by all handlers
pub struct AppState {
    /// Cached orchestration data
    orchestrations: RwLock<Vec<Orchestration>>,
    /// Broadcast channel for notifying WebSocket clients of updates
    update_tx: broadcast::Sender<()>,
}

impl AppState {
    pub fn new() -> Arc<Self> {
        let (update_tx, _) = broadcast::channel(16);
        Arc::new(Self {
            orchestrations: RwLock::new(Vec::new()),
            update_tx,
        })
    }

    /// Get a snapshot of all orchestrations
    pub async fn get_orchestrations(&self) -> Vec<Orchestration> {
        self.orchestrations.read().await.clone()
    }

    /// Get a single orchestration by team name
    pub async fn get_orchestration(&self, team_name: &str) -> Option<Orchestration> {
        self.orchestrations
            .read()
            .await
            .iter()
            .find(|o| o.team_name == team_name)
            .cloned()
    }

    /// Reload orchestrations from disk and notify subscribers
    pub async fn reload(&self) {
        let orchestrations = tina_data::discovery::find_orchestrations().unwrap_or_default();
        *self.orchestrations.write().await = orchestrations;
        let _ = self.update_tx.send(());
    }

    /// Subscribe to update notifications
    pub fn subscribe(&self) -> broadcast::Receiver<()> {
        self.update_tx.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_new_state_has_empty_orchestrations() {
        let state = AppState::new();
        let orchestrations = state.get_orchestrations().await;
        assert!(orchestrations.is_empty());
    }

    #[tokio::test]
    async fn test_get_nonexistent_orchestration_returns_none() {
        let state = AppState::new();
        let result = state.get_orchestration("nonexistent").await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_subscribe_returns_receiver() {
        let state = AppState::new();
        let mut rx = state.subscribe();

        // Reload should send a notification
        state.reload().await;

        // Should receive the notification
        let result = rx.try_recv();
        assert!(result.is_ok());
    }
}
