//! tina-harness library
//!
//! Test harness for tina orchestration and monitor.

pub mod commands;
pub mod failure;
pub mod scenario;
pub mod verify;

// Re-export validation types from tina-session for convenience
pub use tina_session::state::validation::{ValidationIssue, ValidationResult};

// Re-export main types
pub use failure::{CategorizedFailure, FailureCategory};
pub use scenario::{ConvexAssertions, ExpectedState, FileAssertion, LastPassed, Scenario};
