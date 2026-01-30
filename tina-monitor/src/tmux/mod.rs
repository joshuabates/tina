//! Tmux integration module

pub mod capture;

pub use capture::{capture_pane, is_tmux_available, pane_exists, CaptureError};
