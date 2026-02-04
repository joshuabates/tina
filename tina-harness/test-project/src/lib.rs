//! Test project library
//!
//! A minimal two-module Rust project for orchestration scenarios.

pub mod core;

// Re-export main types for convenience
pub use core::processor::{Processor, ProcessorConfig};
