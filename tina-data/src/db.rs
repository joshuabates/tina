//! Re-exports of tina-session database query functions for tina-web consumption.
//!
//! tina-session owns the database (single writer). This module re-exports
//! read-only query functions and types so tina-web can read from SQLite
//! without depending on tina-session directly for db operations.

// Connection management
pub use tina_session::db::{default_db_path, open_or_create};

// Types
pub use tina_session::db::orchestrations::Orchestration;
pub use tina_session::db::phases::Phase;
pub use tina_session::db::projects::Project;
pub use tina_session::db::queries::OrchestrationDetail;
pub use tina_session::db::task_events::TaskEvent;
pub use tina_session::db::team_members::TeamMember;

// Read-only query functions
pub use tina_session::db::orchestrations::{find_by_feature, list_by_project};
pub use tina_session::db::phases::list_by_orchestration as list_phases;
pub use tina_session::db::projects::list as list_projects;
pub use tina_session::db::queries::orchestration_detail;
pub use tina_session::db::task_events::{history_for_task, latest_per_task};
pub use tina_session::db::team_members::list_by_orchestration as list_team_members;

// Re-export rusqlite Connection for consumers
pub use rusqlite::Connection;
