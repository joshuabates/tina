//! tina-harness CLI
//!
//! Test harness for tina orchestration and monitor.

use std::path::PathBuf;

use clap::{Parser, Subcommand};
use tina_harness::commands;

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
        path: PathBuf,

        /// Report mode - print all issues but exit with success
        #[arg(long)]
        report: bool,
    },
    /// Run a test scenario
    Run {
        /// Scenario name (directory in scenarios/)
        scenario: String,

        /// Use full orchestration instead of mock
        #[arg(long)]
        full: bool,

        /// Force re-run even if baseline exists
        #[arg(long)]
        force_baseline: bool,

        /// Path to scenarios directory (default: ./scenarios)
        #[arg(long)]
        scenarios_dir: Option<PathBuf>,

        /// Path to test-project template (default: ./test-project)
        #[arg(long)]
        test_project_dir: Option<PathBuf>,

        /// Working directory for scenario execution (default: /tmp/tina-harness)
        #[arg(long)]
        work_dir: Option<PathBuf>,
    },
    /// Generate a test scenario from parameters
    GenerateScenario {
        /// Number of phases in the scenario
        #[arg(long, default_value = "1")]
        phases: u32,

        /// Include remediation phase
        #[arg(long)]
        include_remediation: bool,

        /// Phase number where failure should occur (0 = no failure)
        #[arg(long, default_value = "0")]
        failure_at_phase: u32,

        /// Output directory for the scenario
        #[arg(long)]
        output: PathBuf,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Validate { path, report } => commands::validate::run(&path, report),
        Commands::GenerateScenario {
            phases,
            include_remediation,
            failure_at_phase,
            output,
        } => {
            let config = commands::generate::GenerateConfig {
                phases,
                include_remediation,
                failure_at_phase,
                output_dir: output.clone(),
            };

            commands::generate::generate(&config)?;
            println!("Generated scenario at: {}", output.display());
            Ok(())
        }
        Commands::Run {
            scenario,
            full,
            force_baseline,
            scenarios_dir,
            test_project_dir,
            work_dir,
        } => {
            // Determine paths relative to current directory or use provided
            let harness_dir = std::env::current_dir()?;
            let scenarios_dir = scenarios_dir.unwrap_or_else(|| harness_dir.join("scenarios"));
            let test_project_dir =
                test_project_dir.unwrap_or_else(|| harness_dir.join("test-project"));
            let work_dir = work_dir.unwrap_or_else(|| PathBuf::from("/tmp/tina-harness"));

            let config = commands::run::RunConfig {
                scenarios_dir,
                test_project_dir,
                work_dir,
                full,
                force_baseline,
            };

            let result = commands::run::run(&scenario, &config)?;

            // Print result
            if result.skipped {
                println!("SKIP: {}", result.scenario_name);
            } else if result.passed {
                println!("PASS: {}", result.scenario_name);
                println!("  Work dir: {}", result.work_dir.display());
            } else {
                println!("FAIL: {}", result.scenario_name);
                println!("  Work dir: {}", result.work_dir.display());
                println!("  Failures:");
                for failure in &result.failures {
                    println!("    - {}", failure);
                }
                std::process::exit(1);
            }

            Ok(())
        }
    }
}
