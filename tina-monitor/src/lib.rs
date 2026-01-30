//! tina-monitor library
//!
//! This library exposes the TUI and data modules for the tina-monitor binary.

use clap::ValueEnum;

pub mod cli;
pub mod config;
pub mod data;
pub mod terminal;
pub mod tmux;
pub mod tui;

/// Filter for task status in task listings
#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum TaskStatusFilter {
    Pending,
    InProgress,
    Completed,
}

/// Filter for team type in team listings
#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum TeamFilter {
    Orchestration,
    Phase,
}
