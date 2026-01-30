use clap::{Parser, Subcommand, ValueEnum};
use std::process::ExitCode;

use tina_monitor::{cli, TaskStatusFilter, TeamFilter};

#[derive(Parser)]
#[command(name = "tina-monitor")]
#[command(about = "Monitor Tina orchestrations")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Query status of teams, tasks, or orchestrations
    Status {
        #[command(subcommand)]
        entity: StatusEntity,
    },
    /// List all teams
    Teams {
        /// Output format
        #[arg(long, value_enum, default_value = "text")]
        format: OutputFormat,
        /// Filter by type
        #[arg(long, value_enum)]
        filter: Option<TeamFilter>,
    },
    /// List tasks for a team
    Tasks {
        /// Team name
        team_name: String,
        /// Output format
        #[arg(long, value_enum, default_value = "text")]
        format: OutputFormat,
        /// Filter by status
        #[arg(long, value_enum)]
        status: Option<TaskStatusFilter>,
    },
}

#[derive(Subcommand)]
enum StatusEntity {
    /// Get team status
    Team {
        /// Team name
        name: String,
        /// Output format
        #[arg(long, value_enum, default_value = "text")]
        format: OutputFormat,
        /// Check condition and exit with code
        #[arg(long, value_enum)]
        check: Option<CheckCondition>,
    },
    /// Get orchestration status
    Orchestration {
        /// Orchestration name
        name: String,
        /// Output format
        #[arg(long, value_enum, default_value = "text")]
        format: OutputFormat,
        /// Check condition and exit with code
        #[arg(long, value_enum)]
        check: Option<CheckCondition>,
    },
    /// Get task status
    Task {
        /// Team name
        team_name: String,
        /// Task ID
        task_id: String,
        /// Output format
        #[arg(long, value_enum, default_value = "text")]
        format: OutputFormat,
    },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum OutputFormat {
    Text,
    Json,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum CheckCondition {
    Complete,
    Blocked,
    Executing,
}

impl From<OutputFormat> for cli::OutputFormat {
    fn from(f: OutputFormat) -> Self {
        match f {
            OutputFormat::Text => cli::OutputFormat::Text,
            OutputFormat::Json => cli::OutputFormat::Json,
        }
    }
}

impl From<CheckCondition> for cli::CheckCondition {
    fn from(c: CheckCondition) -> Self {
        match c {
            CheckCondition::Complete => cli::CheckCondition::Complete,
            CheckCondition::Blocked => cli::CheckCondition::Blocked,
            CheckCondition::Executing => cli::CheckCondition::Executing,
        }
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => ExitCode::from(code as u8),
        Err(e) => {
            eprintln!("Error: {:#}", e);
            ExitCode::FAILURE
        }
    }
}

fn run() -> anyhow::Result<i32> {
    let cli_args = Cli::parse();

    match cli_args.command {
        Some(Commands::Status { entity }) => match entity {
            StatusEntity::Team { name, format, check } => {
                cli::status_team(&name, format.into(), check.map(Into::into))
            }
            StatusEntity::Orchestration { name, format, check } => {
                cli::status_orchestration(&name, format.into(), check.map(Into::into))
            }
            StatusEntity::Task {
                team_name,
                task_id,
                format,
            } => cli::status_task(&team_name, &task_id, format.into()),
        },
        Some(Commands::Teams { format, filter }) => cli::teams::list_teams(format.into(), filter),
        Some(Commands::Tasks {
            team_name,
            format,
            status,
        }) => cli::tasks::list_tasks(&team_name, format.into(), status),
        None => {
            println!("Use --help for usage information");
            Ok(0)
        }
    }
}
