//! Scenario loading and types
//!
//! This module handles parsing scenario directories into structured types.

mod loader;
mod types;

pub use loader::load_scenario;
pub use types::{Assertions, ExpectedState, FileAssertion, Scenario};
