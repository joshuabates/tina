//! Tmux integration module

pub mod capture;
pub mod send;

pub use capture::{capture_pane, is_tmux_available, pane_exists, CaptureError};
pub use send::{send_keys, send_keys_raw, SendError};
