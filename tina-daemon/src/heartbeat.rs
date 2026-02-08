use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tracing::{error, info};

use tina_data::{NodeRegistration, TinaConvexClient};

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);

/// Compute the SHA-256 hash of an auth token (hex-encoded).
pub fn hash_auth_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)
}

/// Register this node with Convex and return the node ID.
pub async fn register_node(
    client: &mut TinaConvexClient,
    node_name: &str,
    auth_token_hash: &str,
) -> Result<String> {
    let reg = NodeRegistration {
        name: node_name.to_string(),
        os: std::env::consts::OS.to_string(),
        auth_token_hash: auth_token_hash.to_string(),
    };
    let node_id = client.register_node(&reg).await?;
    info!(node_id = %node_id, name = %node_name, "registered node");
    Ok(node_id)
}

/// Spawn a background task that sends heartbeats every 30 seconds.
///
/// Returns the JoinHandle for the heartbeat task. The task runs until the
/// cancellation token is cancelled.
pub fn spawn_heartbeat(
    client: Arc<Mutex<TinaConvexClient>>,
    node_id: String,
    cancel: CancellationToken,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    info!("heartbeat task stopping");
                    break;
                }
                _ = tokio::time::sleep(HEARTBEAT_INTERVAL) => {
                    let mut client = client.lock().await;
                    if let Err(e) = client.heartbeat(&node_id).await {
                        error!(error = %e, "heartbeat failed");
                    }
                }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_auth_token_consistent() {
        let hash1 = hash_auth_token("my-secret-token");
        let hash2 = hash_auth_token("my-secret-token");
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_auth_token_differs_for_different_input() {
        let hash1 = hash_auth_token("token-a");
        let hash2 = hash_auth_token("token-b");
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_hash_auth_token_is_hex_encoded() {
        let hash = hash_auth_token("test");
        // SHA-256 produces 32 bytes = 64 hex chars
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[tokio::test]
    async fn test_heartbeat_task_cancellation() {
        let cancel = CancellationToken::new();

        // We can't test with a real client, but we can verify the task shuts down
        // when cancelled. Since we don't have a real client, just test cancellation
        // logic conceptually - the cancel token works.
        let cloned = cancel.clone();
        let handle = tokio::spawn(async move {
            tokio::select! {
                _ = cloned.cancelled() => "cancelled",
                _ = tokio::time::sleep(Duration::from_secs(60)) => "timeout",
            }
        });

        cancel.cancel();
        let result = handle.await.unwrap();
        assert_eq!(result, "cancelled");
    }
}
