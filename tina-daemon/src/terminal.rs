//! WebSocket-to-PTY terminal relay.
//!
//! Bridges xterm.js WebSocket connections to tmux panes via a PTY subprocess
//! running `tmux attach -t {paneId}`.
//!
//! Protocol:
//! - Text WebSocket frames carry terminal data (stdin/stdout).
//! - Binary WebSocket frames carry control messages:
//!   - Type 1 (Resize): [0x01, cols_hi, cols_lo, rows_hi, rows_lo]

use std::io::{Read, Write};
use std::process::Command;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

/// Control messages sent from xterm.js via binary WebSocket frames.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ControlMessage {
    /// Terminal resize: (cols, rows).
    Resize { cols: u16, rows: u16 },
}

/// Errors from parsing binary control messages.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ControlMessageError {
    /// Binary frame is empty.
    Empty,
    /// Unknown message type byte.
    UnknownType(u8),
    /// Payload too short for the declared message type.
    TooShort { expected: usize, got: usize },
}

impl std::fmt::Display for ControlMessageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => write!(f, "empty control message"),
            Self::UnknownType(t) => write!(f, "unknown control message type: {t}"),
            Self::TooShort { expected, got } => {
                write!(
                    f,
                    "control message too short: expected {expected} bytes, got {got}"
                )
            }
        }
    }
}

impl std::error::Error for ControlMessageError {}

const MSG_TYPE_RESIZE: u8 = 1;
const RESIZE_PAYLOAD_LEN: usize = 5; // 1 type + 2 cols + 2 rows

/// Parse a binary WebSocket frame into a [`ControlMessage`].
pub fn parse_control_message(data: &[u8]) -> Result<ControlMessage, ControlMessageError> {
    if data.is_empty() {
        return Err(ControlMessageError::Empty);
    }

    match data[0] {
        MSG_TYPE_RESIZE => {
            if data.len() < RESIZE_PAYLOAD_LEN {
                return Err(ControlMessageError::TooShort {
                    expected: RESIZE_PAYLOAD_LEN,
                    got: data.len(),
                });
            }
            let cols = u16::from_be_bytes([data[1], data[2]]);
            let rows = u16::from_be_bytes([data[3], data[4]]);
            Ok(ControlMessage::Resize { cols, rows })
        }
        other => Err(ControlMessageError::UnknownType(other)),
    }
}

/// Validate a tmux pane ID format (must start with `%` followed by digits).
pub fn is_valid_pane_id_format(pane_id: &str) -> bool {
    pane_id.starts_with('%')
        && pane_id.len() > 1
        && pane_id[1..].chars().all(|c| c.is_ascii_digit())
}

/// Check if a tmux pane exists (blocking — call from `spawn_blocking`).
///
/// Uses the same approach as tina-monitor's `pane_exists()`.
pub fn pane_exists_blocking(pane_id: &str) -> bool {
    Command::new("tmux")
        .args(["display-message", "-t", pane_id, "-p", "#{pane_id}"])
        .output()
        .map(|output| {
            if !output.status.success() {
                return false;
            }
            String::from_utf8_lossy(&output.stdout)
                .trim()
                .starts_with('%')
        })
        .unwrap_or(false)
}

/// Disable tmux mouse mode for a pane (blocking — call from `spawn_blocking`).
pub fn disable_mouse_mode_blocking(pane_id: &str) -> Result<(), String> {
    let output = Command::new("tmux")
        .args(["set", "-p", "-t", pane_id, "mouse", "off"])
        .output()
        .map_err(|e| format!("failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux set mouse off failed: {}", stderr.trim()));
    }
    Ok(())
}

/// Commands sent from the WebSocket receive loop to the PTY writer thread.
enum PtyCommand {
    /// Terminal input data.
    Data(Vec<u8>),
    /// Resize the PTY.
    Resize { cols: u16, rows: u16 },
}

/// Axum handler for `GET /ws/terminal/{paneId}`.
///
/// Validates the pane, upgrades to WebSocket, then bridges to a PTY running
/// `tmux attach -t {paneId}`.
pub async fn ws_terminal_handler(
    Path(pane_id): Path<String>,
    ws: axum::extract::WebSocketUpgrade,
) -> impl IntoResponse {
    // Validate pane ID format.
    if !is_valid_pane_id_format(&pane_id) {
        return (StatusCode::BAD_REQUEST, "invalid pane ID format").into_response();
    }

    // Check pane exists (blocking tmux call).
    let pane_check = pane_id.clone();
    let exists = tokio::task::spawn_blocking(move || pane_exists_blocking(&pane_check))
        .await
        .unwrap_or(false);

    if !exists {
        return (StatusCode::NOT_FOUND, "tmux pane not found").into_response();
    }

    // Disable mouse mode (best-effort).
    let pane_mouse = pane_id.clone();
    if let Err(e) =
        tokio::task::spawn_blocking(move || disable_mouse_mode_blocking(&pane_mouse))
            .await
            .unwrap_or(Err("spawn_blocking failed".into()))
    {
        warn!(pane_id = %pane_id, error = %e, "failed to disable mouse mode, continuing");
    }

    // Upgrade to WebSocket.
    ws.on_upgrade(move |socket| handle_terminal_session(socket, pane_id))
        .into_response()
}

/// Run the bidirectional PTY <-> WebSocket bridge for one connection.
async fn handle_terminal_session(socket: WebSocket, pane_id: String) {
    info!(pane_id = %pane_id, "terminal session starting");

    // Open PTY.
    let pty_system = native_pty_system();
    let pty_pair = match pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(pair) => pair,
        Err(e) => {
            error!(pane_id = %pane_id, error = %e, "failed to open PTY");
            return;
        }
    };

    // Spawn `tmux attach -t {paneId}` in the PTY.
    let mut cmd = CommandBuilder::new("tmux");
    cmd.args(["attach", "-t", &pane_id]);

    let mut child = match pty_pair.slave.spawn_command(cmd) {
        Ok(child) => child,
        Err(e) => {
            error!(pane_id = %pane_id, error = %e, "failed to spawn tmux attach");
            return;
        }
    };

    // Drop slave — we only interact via master.
    drop(pty_pair.slave);

    let mut pty_reader = match pty_pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            error!(pane_id = %pane_id, error = %e, "failed to clone PTY reader");
            return;
        }
    };

    let mut pty_writer: Box<dyn Write + Send> = match pty_pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            error!(pane_id = %pane_id, error = %e, "failed to take PTY writer");
            return;
        }
    };

    let master = pty_pair.master;
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Channel: PTY reader thread -> WebSocket sender task.
    let (pty_out_tx, mut pty_out_rx) = mpsc::channel::<Vec<u8>>(64);

    // Channel: WebSocket receiver -> PTY writer thread (data + resize).
    let (pty_in_tx, pty_in_rx) = mpsc::channel::<PtyCommand>(64);

    // ── Task 1: PTY read -> channel (blocking thread) ──
    let pane_id_reader = pane_id.clone();
    let pty_read_handle = tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; 4096];
        loop {
            match pty_reader.read(&mut buf) {
                Ok(0) => {
                    debug!(pane_id = %pane_id_reader, "PTY EOF");
                    break;
                }
                Ok(n) => {
                    if pty_out_tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break; // WebSocket side closed
                    }
                }
                Err(e) => {
                    debug!(pane_id = %pane_id_reader, error = %e, "PTY read error");
                    break;
                }
            }
        }
    });

    // ── Task 2: PTY write + resize (blocking thread) ──
    let pane_id_writer = pane_id.clone();
    let pty_write_handle = tokio::task::spawn_blocking(move || {
        let mut pty_in_rx = pty_in_rx;
        while let Some(cmd) = pty_in_rx.blocking_recv() {
            match cmd {
                PtyCommand::Data(data) => {
                    if let Err(e) = pty_writer.write_all(&data) {
                        debug!(pane_id = %pane_id_writer, error = %e, "PTY write error");
                        break;
                    }
                }
                PtyCommand::Resize { cols, rows } => {
                    if let Err(e) = master.resize(PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    }) {
                        warn!(
                            pane_id = %pane_id_writer,
                            cols, rows,
                            error = %e,
                            "PTY resize failed"
                        );
                    }
                }
            }
        }
    });

    // ── Task 3: Channel -> WebSocket send (async) ──
    let pane_id_sender = pane_id.clone();
    let ws_send_handle = tokio::spawn(async move {
        while let Some(data) = pty_out_rx.recv().await {
            // Send terminal output as binary to avoid UTF-8 validation issues.
            if ws_sender.send(Message::Binary(data.into())).await.is_err() {
                debug!(pane_id = %pane_id_sender, "WebSocket send failed");
                break;
            }
        }
        // PTY exited — send close frame.
        let _ = ws_sender.close().await;
    });

    // ── Main loop: WebSocket receive -> PTY commands ──
    let pane_id_recv = pane_id.clone();
    loop {
        match ws_receiver.next().await {
            Some(Ok(Message::Text(text))) => {
                if pty_in_tx
                    .send(PtyCommand::Data(text.as_bytes().to_vec()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Some(Ok(Message::Binary(data))) => {
                match parse_control_message(&data) {
                    Ok(ControlMessage::Resize { cols, rows }) => {
                        debug!(pane_id = %pane_id_recv, cols, rows, "resize request");
                        if pty_in_tx
                            .send(PtyCommand::Resize { cols, rows })
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(e) => {
                        warn!(pane_id = %pane_id_recv, error = %e, "invalid control message");
                    }
                }
            }
            Some(Ok(Message::Close(_))) | None => {
                debug!(pane_id = %pane_id_recv, "WebSocket closed by client");
                break;
            }
            Some(Ok(Message::Ping(_) | Message::Pong(_))) => {
                // Axum handles ping/pong automatically.
            }
            Some(Err(e)) => {
                debug!(pane_id = %pane_id_recv, error = %e, "WebSocket receive error");
                break;
            }
        }
    }

    // ── Cleanup ──
    // Drop the command channel to signal the writer thread to stop.
    drop(pty_in_tx);

    // Kill the tmux attach child process (detaches from tmux, pane stays alive).
    if let Err(e) = child.kill() {
        debug!(pane_id = %pane_id, error = %e, "failed to kill child (may have already exited)");
    }
    child.wait().ok();

    // Wait for tasks to finish.
    let _ = pty_read_handle.await;
    let _ = pty_write_handle.await;
    ws_send_handle.abort();

    info!(pane_id = %pane_id, "terminal session ended");
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Control message parsing ──

    #[test]
    fn parse_resize_message() {
        // Type 1, cols=80 (0x0050), rows=24 (0x0018)
        let data = [0x01, 0x00, 0x50, 0x00, 0x18];
        let msg = parse_control_message(&data).unwrap();
        assert_eq!(msg, ControlMessage::Resize { cols: 80, rows: 24 });
    }

    #[test]
    fn parse_resize_large_dimensions() {
        // Type 1, cols=300 (0x012C), rows=100 (0x0064)
        let data = [0x01, 0x01, 0x2C, 0x00, 0x64];
        let msg = parse_control_message(&data).unwrap();
        assert_eq!(msg, ControlMessage::Resize { cols: 300, rows: 100 });
    }

    #[test]
    fn parse_empty_message_returns_error() {
        let result = parse_control_message(&[]);
        assert_eq!(result, Err(ControlMessageError::Empty));
    }

    #[test]
    fn parse_unknown_type_returns_error() {
        let data = [0xFF, 0x00, 0x50, 0x00, 0x18];
        let result = parse_control_message(&data);
        assert_eq!(result, Err(ControlMessageError::UnknownType(0xFF)));
    }

    #[test]
    fn parse_resize_too_short_returns_error() {
        // Only 3 bytes — need 5 for resize
        let data = [0x01, 0x00, 0x50];
        let result = parse_control_message(&data);
        assert_eq!(
            result,
            Err(ControlMessageError::TooShort {
                expected: 5,
                got: 3,
            })
        );
    }

    #[test]
    fn parse_resize_just_type_byte_returns_error() {
        let data = [0x01];
        let result = parse_control_message(&data);
        assert_eq!(
            result,
            Err(ControlMessageError::TooShort {
                expected: 5,
                got: 1,
            })
        );
    }

    #[test]
    fn parse_resize_extra_bytes_are_ignored() {
        // Extra bytes after the 5-byte resize message should be fine
        let data = [0x01, 0x00, 0x50, 0x00, 0x18, 0xFF, 0xFF];
        let msg = parse_control_message(&data).unwrap();
        assert_eq!(msg, ControlMessage::Resize { cols: 80, rows: 24 });
    }

    // ── Pane ID format validation ──

    #[test]
    fn valid_pane_id_format_accepts_percent_prefix() {
        assert!(is_valid_pane_id_format("%0"));
        assert!(is_valid_pane_id_format("%302"));
        assert!(is_valid_pane_id_format("%99999"));
    }

    #[test]
    fn valid_pane_id_format_rejects_no_percent() {
        assert!(!is_valid_pane_id_format("302"));
        assert!(!is_valid_pane_id_format("pane0"));
    }

    #[test]
    fn valid_pane_id_format_rejects_percent_only() {
        assert!(!is_valid_pane_id_format("%"));
    }

    #[test]
    fn valid_pane_id_format_rejects_non_digit_after_percent() {
        assert!(!is_valid_pane_id_format("%abc"));
        assert!(!is_valid_pane_id_format("%30x"));
        assert!(!is_valid_pane_id_format("% 302"));
    }

    #[test]
    fn valid_pane_id_format_rejects_empty() {
        assert!(!is_valid_pane_id_format(""));
    }

    // ── Pane existence check (uses real tmux, so tests with invalid panes) ──

    #[test]
    fn pane_exists_returns_false_for_nonexistent_pane() {
        assert!(!pane_exists_blocking("%99999"));
    }

    #[test]
    fn pane_exists_returns_false_for_invalid_format() {
        assert!(!pane_exists_blocking("not-a-pane"));
    }
}
