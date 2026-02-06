use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use serde::Serialize;

use tina_data::db;

use crate::state::AppState;

#[derive(Serialize)]
#[serde(tag = "type", content = "data")]
enum WsMessage {
    #[serde(rename = "orchestrations_updated")]
    OrchestrationsUpdated(Vec<db::Orchestration>),
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    // Send initial state
    let orchestrations = {
        let conn = state.conn().await;
        db::list_orchestrations(&conn).unwrap_or_default()
    };
    let msg = WsMessage::OrchestrationsUpdated(orchestrations);
    if let Ok(json) = serde_json::to_string(&msg) {
        if sender.send(Message::Text(json.into())).await.is_err() {
            return;
        }
    }

    // Subscribe to updates
    let mut update_rx = state.subscribe();

    // Spawn a task to forward updates to the WebSocket
    let send_state = state.clone();
    let mut send_task = tokio::spawn(async move {
        while update_rx.recv().await.is_ok() {
            let orchestrations = {
                let conn = send_state.conn().await;
                db::list_orchestrations(&conn).unwrap_or_default()
            };
            let msg = WsMessage::OrchestrationsUpdated(orchestrations);
            if let Ok(json) = serde_json::to_string(&msg) {
                if sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Receive messages from the client (mainly for keepalive/close detection)
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if matches!(msg, Message::Close(_)) {
                break;
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = &mut send_task => {
            recv_task.abort();
        }
        _ = &mut recv_task => {
            send_task.abort();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ws_message_serializes_correctly() {
        let msg = WsMessage::OrchestrationsUpdated(vec![]);
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"orchestrations_updated\""));
        assert!(json.contains("\"data\":[]"));
    }
}
