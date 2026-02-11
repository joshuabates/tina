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

        /// Also verify Convex state after a --full run
        #[arg(long)]
        verify: bool,

        /// Force re-run even if baseline exists
        #[arg(long)]
        force_baseline: bool,

        /// Skip binary rebuild (use existing binaries)
        #[arg(long)]
        skip_build: bool,

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
    /// Verify Convex state for an orchestration
    Verify {
        /// Feature name to verify
        feature: String,

        /// Minimum number of phases expected
        #[arg(long)]
        min_phases: Option<u32>,

        /// Minimum number of tasks expected
        #[arg(long)]
        min_tasks: Option<u32>,

        /// Minimum number of team members expected
        #[arg(long)]
        min_team_members: Option<u32>,

        /// Minimum number of phase-scoped tasks expected
        #[arg(long)]
        min_phase_tasks: Option<u32>,

        /// Minimum number of commits expected
        #[arg(long)]
        min_commits: Option<u32>,

        /// Minimum number of plans expected
        #[arg(long)]
        min_plans: Option<u32>,

        /// Minimum number of shutdown events expected
        #[arg(long)]
        min_shutdown_events: Option<u32>,

        /// Require at least one markdown task description
        #[arg(long)]
        has_markdown_task: bool,
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
            verify,
            force_baseline,
            skip_build,
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
                scenarios_dir: scenarios_dir.clone(),
                test_project_dir,
                work_dir,
                full,
                force_baseline,
                skip_build,
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

            // Run Convex verification if requested and the run passed
            if verify && full && result.passed && !result.skipped {
                println!("\n--- Convex Verification ---");

                // Check daemon is running
                if !commands::verify::check_daemon_running() {
                    println!("WARNING: tina-daemon does not appear to be running.");
                    println!("  Team members and tasks may not be synced to Convex.");
                    println!("  Start it with: TINA_ENV=dev cargo run --manifest-path tina-daemon/Cargo.toml");
                }

                // Load scenario to get Convex assertions
                let scenario_dir = scenarios_dir.join(&scenario);
                let loaded = tina_harness::scenario::load_scenario(&scenario_dir)?;
                let assertions =
                    loaded
                        .expected
                        .assertions
                        .convex
                        .unwrap_or(tina_harness::ConvexAssertions {
                            has_orchestration: true,
                            expected_status: None,
                            min_phases: Some(1),
                            min_tasks: Some(1),
                            min_team_members: Some(1),
                            min_phase_tasks: Some(1),
                            min_commits: None,
                            min_plans: None,
                            min_shutdown_events: None,
                            has_markdown_task: false,
                        });

                let verify_result = commands::verify::verify(&result.feature_name, &assertions)?;

                if verify_result.passed {
                    println!("VERIFY PASS: {}", verify_result.feature_name);
                    println!(
                        "  Phases: {}, Tasks: {} (phase-scoped: {}), Team Members: {}",
                        verify_result.phases_found,
                        verify_result.tasks_found,
                        verify_result.phase_tasks_found,
                        verify_result.members_found
                    );
                    println!(
                        "  Commits: {}, Plans: {}, Shutdown events: {}",
                        verify_result.commits_found,
                        verify_result.plans_found,
                        verify_result.shutdown_events_found
                    );
                } else {
                    println!("VERIFY FAIL: {}", verify_result.feature_name);
                    println!("  Failures:");
                    for failure in &verify_result.failures {
                        println!("    - {}", failure);
                    }
                    std::process::exit(1);
                }
            }

            Ok(())
        }
        Commands::Verify {
            feature,
            min_phases,
            min_tasks,
            min_team_members,
            min_phase_tasks,
            min_commits,
            min_plans,
            min_shutdown_events,
            has_markdown_task,
        } => {
            // Check daemon is running
            if !commands::verify::check_daemon_running() {
                println!("WARNING: tina-daemon does not appear to be running.");
                println!("  Team members and tasks may not be synced to Convex.");
            }

            let assertions = tina_harness::ConvexAssertions {
                has_orchestration: true,
                expected_status: None,
                min_phases,
                min_tasks,
                min_team_members,
                min_phase_tasks,
                min_commits,
                min_plans,
                min_shutdown_events,
                has_markdown_task,
            };

            let result = commands::verify::verify(&feature, &assertions)?;

            if result.passed {
                println!("VERIFY PASS: {}", result.feature_name);
                if let Some(ref id) = result.orchestration_id {
                    println!("  Orchestration ID: {}", id);
                }
                println!(
                    "  Phases: {}, Tasks: {} (phase-scoped: {}), Team Members: {}",
                    result.phases_found,
                    result.tasks_found,
                    result.phase_tasks_found,
                    result.members_found
                );
                println!(
                    "  Commits: {}, Plans: {}, Shutdown events: {}",
                    result.commits_found, result.plans_found, result.shutdown_events_found
                );
            } else {
                println!("VERIFY FAIL: {}", result.feature_name);
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
