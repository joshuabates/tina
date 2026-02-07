use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::process::ExitCode;

use tina_session::session::naming::validate_phase;

mod commands;
mod error;

/// Validate phase format and return an error with helpful guidance if invalid.
fn check_phase(phase: &str) -> anyhow::Result<()> {
    validate_phase(phase).map_err(|e| anyhow::anyhow!("{}", e))
}

#[derive(Parser)]
#[command(name = "tina-session")]
#[command(about = "Phase lifecycle management for Tina orchestrations")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize orchestration (creates worktree, lookup file + supervisor-state.json)
    Init {
        /// Feature name (used for session naming)
        #[arg(long)]
        feature: String,

        /// Project root directory (where .worktrees/ will be created)
        #[arg(long)]
        cwd: PathBuf,

        /// Path to design document
        #[arg(long)]
        design_doc: PathBuf,

        /// Git branch name
        #[arg(long)]
        branch: String,

        /// Total number of phases
        #[arg(long)]
        total_phases: u32,
    },

    /// Start phase execution (creates tmux, starts Claude, sends skill)
    Start {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,

        /// Path to plan file
        #[arg(long)]
        plan: PathBuf,

        /// Install dependencies before starting (npm, cargo, pip)
        #[arg(long, default_value = "false")]
        install_deps: bool,
    },

    /// Wait for phase completion
    Wait {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,

        /// Timeout in seconds (default: no timeout)
        #[arg(long)]
        timeout: Option<u64>,

        /// Stream status updates at this interval (seconds). Shows progress while waiting.
        #[arg(long)]
        stream: Option<u64>,

        /// Team name for task progress tracking (default: {feature}-phase-{phase})
        #[arg(long)]
        team: Option<String>,
    },

    /// Stop phase and cleanup session
    Stop {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,
    },

    /// State management subcommands
    State {
        #[command(subcommand)]
        command: StateCommands,
    },

    /// Validation subcommands
    Check {
        #[command(subcommand)]
        command: CheckCommands,
    },

    /// Get canonical session name
    Name {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,
    },

    /// Check if session exists
    Exists {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,
    },

    /// Send text to session
    Send {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,

        /// Text to send
        #[arg(long)]
        text: String,
    },

    /// Attach to session in current terminal
    Attach {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,
    },

    /// Capture screen contents from session
    Capture {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,

        /// Number of lines to capture (default: 100)
        #[arg(long, default_value = "100")]
        lines: u32,
    },

    /// Get current phase status (one-shot, no waiting)
    Status {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,

        /// Team name for task progress tracking (default: {feature}-phase-{phase})
        #[arg(long)]
        team: Option<String>,
    },

    /// Daemon management subcommands
    Daemon {
        #[command(subcommand)]
        command: DaemonCommands,
    },

    /// List active orchestrations
    List,

    /// Remove lookup file for feature
    Cleanup {
        /// Feature name
        #[arg(long)]
        feature: String,
    },

    /// Orchestration state machine subcommands
    Orchestrate {
        #[command(subcommand)]
        command: OrchestrateCommands,
    },
}

#[derive(Subcommand)]
enum StateCommands {
    /// Update phase status
    Update {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,

        /// New status (planning, planned, executing, reviewing, complete, blocked)
        #[arg(long)]
        status: String,

        /// Plan path (for planning phase)
        #[arg(long)]
        plan_path: Option<PathBuf>,
    },

    /// Record phase completion
    PhaseComplete {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,

        /// Git range (e.g., abc123..def456)
        #[arg(long)]
        git_range: String,
    },

    /// Record blocked state
    Blocked {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,

        /// Reason for being blocked
        #[arg(long)]
        reason: String,
    },

    /// Display current state
    Show {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (optional, shows specific phase)
        #[arg(long)]
        phase: Option<String>,

        /// Output format
        #[arg(long, value_enum, default_value = "text")]
        format: OutputFormat,
    },
}

#[derive(Subcommand)]
enum CheckCommands {
    /// Check complexity against budget
    Complexity {
        /// Working directory
        #[arg(long)]
        cwd: PathBuf,

        /// Max lines per file
        #[arg(long, default_value = "400")]
        max_file_lines: u32,

        /// Max total implementation lines
        #[arg(long, default_value = "2000")]
        max_total_lines: u32,

        /// Max lines per function
        #[arg(long, default_value = "50")]
        max_function_lines: u32,
    },

    /// Run test and lint verification
    Verify {
        /// Working directory
        #[arg(long)]
        cwd: PathBuf,
    },

    /// Validate plan file
    Plan {
        /// Path to plan file
        #[arg(long)]
        path: PathBuf,
    },
}

#[derive(Subcommand)]
enum DaemonCommands {
    /// Start the daemon as a background process
    Start,

    /// Stop the running daemon
    Stop,

    /// Check if the daemon is running
    Status,

    /// Run the daemon in the foreground (used internally)
    Run,
}

#[derive(Subcommand)]
enum OrchestrateCommands {
    /// Determine the next action based on current orchestration state
    Next {
        /// Feature name
        #[arg(long)]
        feature: String,
    },

    /// Record a phase event and get the next action
    Advance {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5")
        #[arg(long)]
        phase: String,

        /// Event type: validation_pass, validation_warning, validation_stop,
        /// plan_complete, execute_started, execute_complete, review_pass, review_gaps, retry, error
        #[arg(long)]
        event: String,

        /// Plan path (required for plan_complete event)
        #[arg(long)]
        plan_path: Option<PathBuf>,

        /// Git range (required for execute_complete event)
        #[arg(long)]
        git_range: Option<String>,

        /// Issues or error reason (comma-separated for review_gaps)
        #[arg(long)]
        issues: Option<String>,
    },
}

#[derive(Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
enum OutputFormat {
    Text,
    Json,
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => ExitCode::from(code),
        Err(e) => {
            eprintln!("Error: {:#}", e);
            ExitCode::FAILURE
        }
    }
}

fn run() -> anyhow::Result<u8> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Init {
            feature,
            cwd,
            design_doc,
            branch,
            total_phases,
        } => commands::init::run(&feature, &cwd, &design_doc, &branch, total_phases),

        Commands::Start {
            feature,
            phase,
            plan,
            install_deps,
        } => {
            check_phase(&phase)?;
            commands::start::run(&feature, &phase, &plan, install_deps)
        }

        Commands::Wait {
            feature,
            phase,
            timeout,
            stream,
            team,
        } => {
            check_phase(&phase)?;
            commands::wait::run(&feature, &phase, timeout, stream, team.as_deref())
        }

        Commands::Stop { feature, phase } => {
            check_phase(&phase)?;
            commands::stop::run(&feature, &phase)
        }

        Commands::State { command } => match command {
            StateCommands::Update {
                feature,
                phase,
                status,
                plan_path,
            } => {
                check_phase(&phase)?;
                commands::state::update(&feature, &phase, &status, plan_path.as_deref())
            }

            StateCommands::PhaseComplete {
                feature,
                phase,
                git_range,
            } => {
                check_phase(&phase)?;
                commands::state::phase_complete(&feature, &phase, &git_range)
            }

            StateCommands::Blocked {
                feature,
                phase,
                reason,
            } => {
                check_phase(&phase)?;
                commands::state::blocked(&feature, &phase, &reason)
            }

            StateCommands::Show {
                feature,
                phase,
                format,
            } => {
                if let Some(ref p) = phase {
                    check_phase(p)?;
                }
                commands::state::show(&feature, phase.as_deref(), format == OutputFormat::Json)
            }
        },

        Commands::Check { command } => match command {
            CheckCommands::Complexity {
                cwd,
                max_file_lines,
                max_total_lines,
                max_function_lines,
            } => commands::check::complexity(&cwd, max_file_lines, max_total_lines, max_function_lines),

            CheckCommands::Verify { cwd } => commands::check::verify(&cwd),

            CheckCommands::Plan { path } => commands::check::plan(&path),
        },

        Commands::Name { feature, phase } => {
            check_phase(&phase)?;
            commands::name::run(&feature, &phase)
        }

        Commands::Exists { feature, phase } => {
            check_phase(&phase)?;
            commands::exists::run(&feature, &phase)
        }

        Commands::Send {
            feature,
            phase,
            text,
        } => {
            check_phase(&phase)?;
            commands::send::run(&feature, &phase, &text)
        }

        Commands::Attach { feature, phase } => {
            check_phase(&phase)?;
            commands::attach::run(&feature, &phase)
        }

        Commands::Capture {
            feature,
            phase,
            lines,
        } => {
            check_phase(&phase)?;
            commands::capture::run(&feature, &phase, lines)
        }

        Commands::Status {
            feature,
            phase,
            team,
        } => {
            check_phase(&phase)?;
            commands::status::run(&feature, &phase, team.as_deref())
        }

        Commands::Daemon { command } => match command {
            DaemonCommands::Start => commands::daemon::start(),
            DaemonCommands::Stop => commands::daemon::stop(),
            DaemonCommands::Status => commands::daemon::status(),
            DaemonCommands::Run => commands::daemon::run(),
        },

        Commands::List => commands::list::run(),

        Commands::Cleanup { feature } => commands::cleanup::run(&feature),

        Commands::Orchestrate { command } => match command {
            OrchestrateCommands::Next { feature } => {
                commands::orchestrate::next(&feature)
            }

            OrchestrateCommands::Advance {
                feature,
                phase,
                event,
                plan_path,
                git_range,
                issues,
            } => {
                commands::orchestrate::advance(
                    &feature,
                    &phase,
                    &event,
                    plan_path.as_deref(),
                    git_range.as_deref(),
                    issues.as_deref(),
                )
            }
        },
    }
}
