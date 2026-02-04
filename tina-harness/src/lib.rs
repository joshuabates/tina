//! tina-harness library
//!
//! Test harness for tina orchestration and monitor.

pub mod commands;

// Re-export validation types from tina-session for convenience
pub use tina_session::state::validation::{ValidationIssue, ValidationResult};
