use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::process::ExitCode;

mod commands;
mod error;

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
    /// Initialize orchestration (creates lookup file + supervisor-state.json)
    Init {
        /// Feature name (used for session naming)
        #[arg(long)]
        feature: String,

        /// Working directory (worktree path)
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

        /// Phase number
        #[arg(long)]
        phase: u32,

        /// Path to plan file
        #[arg(long)]
        plan: PathBuf,
    },

    /// Wait for phase completion
    Wait {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: u32,

        /// Timeout in seconds (default: no timeout)
        #[arg(long)]
        timeout: Option<u64>,
    },

    /// Stop phase and cleanup session
    Stop {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: u32,
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

        /// Phase number
        #[arg(long)]
        phase: u32,
    },

    /// Check if session exists
    Exists {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: u32,
    },

    /// Send text to session
    Send {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: u32,

        /// Text to send
        #[arg(long)]
        text: String,
    },

    /// Attach to session in current terminal
    Attach {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: u32,
    },

    /// List active orchestrations
    List,

    /// Remove lookup file for feature
    Cleanup {
        /// Feature name
        #[arg(long)]
        feature: String,
    },
}

#[derive(Subcommand)]
enum StateCommands {
    /// Update phase status
    Update {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: u32,

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

        /// Phase number
        #[arg(long)]
        phase: u32,

        /// Git range (e.g., abc123..def456)
        #[arg(long)]
        git_range: String,
    },

    /// Record blocked state
    Blocked {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: u32,

        /// Reason for being blocked
        #[arg(long)]
        reason: String,
    },

    /// Display current state
    Show {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number (optional, shows specific phase)
        #[arg(long)]
        phase: Option<u32>,

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

        /// Max cyclomatic complexity per function
        #[arg(long, default_value = "10")]
        max_complexity: u32,
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
        } => commands::start::run(&feature, phase, &plan),

        Commands::Wait {
            feature,
            phase,
            timeout,
        } => commands::wait::run(&feature, phase, timeout),

        Commands::Stop { feature, phase } => commands::stop::run(&feature, phase),

        Commands::State { command } => match command {
            StateCommands::Update {
                feature,
                phase,
                status,
                plan_path,
            } => commands::state::update(&feature, phase, &status, plan_path.as_deref()),

            StateCommands::PhaseComplete {
                feature,
                phase,
                git_range,
            } => commands::state::phase_complete(&feature, phase, &git_range),

            StateCommands::Blocked {
                feature,
                phase,
                reason,
            } => commands::state::blocked(&feature, phase, &reason),

            StateCommands::Show {
                feature,
                phase,
                format,
            } => commands::state::show(&feature, phase, format == OutputFormat::Json),
        },

        Commands::Check { command } => match command {
            CheckCommands::Complexity {
                cwd,
                max_file_lines,
                max_total_lines,
                max_complexity,
            } => commands::check::complexity(&cwd, max_file_lines, max_total_lines, max_complexity),

            CheckCommands::Verify { cwd } => commands::check::verify(&cwd),

            CheckCommands::Plan { path } => commands::check::plan(&path),
        },

        Commands::Name { feature, phase } => commands::name::run(&feature, phase),

        Commands::Exists { feature, phase } => commands::exists::run(&feature, phase),

        Commands::Send {
            feature,
            phase,
            text,
        } => commands::send::run(&feature, phase, &text),

        Commands::Attach { feature, phase } => commands::attach::run(&feature, phase),

        Commands::List => commands::list::run(),

        Commands::Cleanup { feature } => commands::cleanup::run(&feature),
    }
}
