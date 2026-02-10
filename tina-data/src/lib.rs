//! Shared data layer for Tina orchestration monitoring
//!
//! This crate provides the Convex client wrapper and shared types
//! for Convex orchestration data. Used by tina-daemon, tina-session,
//! tina-monitor, and tina-harness.

pub mod convex_client;
pub mod types;
pub mod generated {
    pub mod orchestration_core_fields;
}

pub use convex_client::TinaConvexClient;
pub use convex_client::{orchestration_event_to_args, orchestration_to_args, phase_to_args};
pub use types::*;
