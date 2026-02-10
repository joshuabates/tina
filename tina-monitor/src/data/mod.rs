//! Data modules for tina-monitor
//!
//! Provides the Convex-backed data layer for reading orchestration state,
//! plus a local file-based data source for the panel-grid app shell.

pub mod convex;
pub mod local;

pub use convex::{
    ConvexDataSource, MonitorOrchestration, MonitorOrchestrationStatus, OrchestrationSummary,
    TaskSummary,
};
pub use local::{DataSource, LoadedOrchestration};

/// Type alias for backward compatibility with app.rs
pub type Orchestration = LoadedOrchestration;
