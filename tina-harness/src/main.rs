//! tina-harness CLI
//!
//! Test harness for tina orchestration and monitor.

use clap::{Parser, Subcommand};

mod commands;

#[derive(Parser)]
#[command(name = "tina-harness")]
#[command(about = "Test harness for tina orchestration and monitor")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Validate orchestration state files
    Validate {
        /// Path to validate (tina directory, state file, or team/task file)
        path: std::path::PathBuf,

        /// Report mode - print all issues but exit with success
        #[arg(long)]
        report: bool,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Validate { path, report } => {
            commands::validate::run(&path, report)
        }
    }
}
