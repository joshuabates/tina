//! Shared data layer for Tina orchestration monitoring
//!
//! This crate provides the Convex client wrapper and shared types
//! for orchestration state. Used by tina-daemon, tina-session,
//! and tina-monitor.

pub mod convex_client;
pub mod tina_state;
pub mod types;

// Re-export canonical types from tina-session for convenience
pub use tina_session::state::schema::{
    Agent, ContextMetrics, OrchestrationStatus, PhaseBreakdown, PhaseState, PhaseStatus,
    SessionLookup, SupervisorState, Task, TaskStatus, Team, TimingGap, TimingStats,
};

pub use convex_client::TinaConvexClient;
pub use types::*;
