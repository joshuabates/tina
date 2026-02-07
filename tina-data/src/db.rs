//! Re-exports of tina-session database query functions for tina-web consumption.
//!
//! tina-session owns the database (single writer). This module re-exports
//! read-only query functions and types so tina-web can read from SQLite
//! without depending on tina-session directly for db operations.

// Connection management
pub use tina_session::db::{default_db_path, open_or_create};

// Types
pub use tina_session::db::orchestration_events::OrchestrationEvent;
pub use tina_session::db::orchestration_events::StuckTask;
pub use tina_session::db::orchestrations::Orchestration;
pub use tina_session::db::phases::Phase;
pub use tina_session::db::projects::Project;
pub use tina_session::db::queries::OrchestrationDetail;
pub use tina_session::db::task_events::TaskEvent;
pub use tina_session::db::team_members::TeamMember;

// Read-only query functions
pub use tina_session::db::orchestration_events::{
    list_by_orchestration as list_orchestration_events,
    list_by_orchestration_since as list_orchestration_events_since,
    list_by_phase as list_phase_events,
    stuck_tasks,
};
pub use tina_session::db::orchestrations::{find_by_feature, list_all as list_orchestrations, list_by_project};
pub use tina_session::db::phases::list_by_orchestration as list_phases;
pub use tina_session::db::projects::{find_or_create_by_repo_path, list as list_projects, rename as rename_project};
pub use tina_session::db::queries::orchestration_detail;
pub use tina_session::db::task_events::{history_for_task, latest_per_task};
pub use tina_session::db::team_members::list_by_orchestration as list_team_members;

// Re-export rusqlite Connection for consumers
pub use rusqlite::Connection;
