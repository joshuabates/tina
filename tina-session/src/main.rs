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
    /// Initialize orchestration (creates worktree and Convex state, outputs JSON)
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

        /// Review gate enforcement scope.
        #[arg(long, value_parser = ["task_and_phase", "task_only", "phase_only"])]
        review_enforcement: Option<String>,

        /// Detector comparison scope.
        #[arg(long, value_parser = ["whole_repo_pattern_index", "touched_area_only", "architectural_allowlist_only"])]
        detector_scope: Option<String>,

        /// Architect consultation mode.
        #[arg(long, value_parser = ["manual_only", "manual_plus_auto", "disabled"])]
        architect_mode: Option<String>,

        /// Test integrity strictness profile.
        #[arg(long, value_parser = ["strict_baseline", "max_strict", "minimal"])]
        test_integrity_profile: Option<String>,

        /// Whether detector findings are hard-blocking.
        #[arg(long)]
        hard_block_detectors: Option<bool>,

        /// Whether rare post-fix detector overrides are allowed.
        #[arg(long)]
        allow_rare_override: Option<bool>,

        /// Whether implementers must attempt fixes before requesting override.
        #[arg(long)]
        require_fix_first: Option<bool>,
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

        /// Working directory for tmux session. Defaults to orchestration worktree from Convex.
        #[arg(long)]
        cwd: Option<PathBuf>,

        /// Install dependencies before starting (npm, cargo, pip)
        #[arg(long, default_value = "false")]
        install_deps: bool,

        /// Parent team ID (Convex doc ID of the orchestration team)
        #[arg(long)]
        parent_team_id: Option<String>,
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

    /// Config helpers
    Config {
        #[command(subcommand)]
        command: ConfigCommands,
    },

    /// List active orchestrations
    List,

    /// Register a team in Convex (links team to orchestration)
    RegisterTeam {
        /// Convex orchestration doc ID
        #[arg(long)]
        orchestration_id: String,

        /// Team name (e.g., "my-feature-phase-1")
        #[arg(long)]
        team: String,

        /// Lead session ID
        #[arg(long)]
        lead_session_id: String,

        /// Phase number (optional, null for orchestration team)
        #[arg(long)]
        phase_number: Option<String>,

        /// Parent team ID (Convex doc ID of the orchestration team)
        #[arg(long)]
        parent_team_id: Option<String>,
    },

    /// Run a task via the Codex CLI, track in Convex, return JSON output
    ExecCodex {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5")
        #[arg(long)]
        phase: String,

        /// Task ID for tracking
        #[arg(long)]
        task_id: String,

        /// Prompt text or @filepath to read prompt from file
        #[arg(long)]
        prompt: String,

        /// Working directory for the codex subprocess
        #[arg(long)]
        cwd: PathBuf,

        /// Model name (overrides config default_model)
        #[arg(long)]
        model: Option<String>,

        /// Sandbox mode (overrides config default_sandbox)
        #[arg(long)]
        sandbox: Option<String>,

        /// Timeout in seconds (overrides config timeout_secs)
        #[arg(long)]
        timeout_secs: Option<u64>,

        /// Write codex stdout to this file path
        #[arg(long)]
        output: Option<PathBuf>,
    },

    /// Clean up orchestration state
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

    /// Work management subcommands (designs, tickets, comments)
    Work {
        #[command(subcommand)]
        command: WorkCommands,
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
    Start {
        /// Environment profile (`prod` or `dev`)
        #[arg(long)]
        env: Option<String>,

        /// Explicit path to the tina-daemon binary
        #[arg(long)]
        daemon_bin: Option<PathBuf>,
    },

    /// Stop the running daemon
    Stop,

    /// Check if the daemon is running
    Status,

    /// Run the daemon in the foreground (used internally)
    Run {
        /// Environment profile (`prod` or `dev`)
        #[arg(long)]
        env: Option<String>,

        /// Explicit path to the tina-daemon binary
        #[arg(long)]
        daemon_bin: Option<PathBuf>,
    },
}

#[derive(Subcommand)]
enum ConfigCommands {
    /// Print the resolved Convex URL for the selected environment
    ConvexUrl {
        /// Environment profile (`prod` or `dev`). Defaults to prod.
        #[arg(long)]
        env: Option<String>,
    },

    /// Print resolved config fields (JSON)
    Show {
        /// Environment profile (`prod` or `dev`). Defaults to prod.
        #[arg(long)]
        env: Option<String>,
    },

    /// Print which CLI handles a given model name ("claude" or "codex")
    CliForModel {
        /// Model name to check routing for
        #[arg(long)]
        model: String,

        /// Environment profile (`prod` or `dev`). Defaults to prod.
        #[arg(long)]
        env: Option<String>,
    },
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

#[derive(Subcommand)]
enum WorkCommands {
    /// Design management
    Design {
        #[command(subcommand)]
        command: DesignCommands,
    },

    /// Ticket management
    Ticket {
        #[command(subcommand)]
        command: TicketCommands,
    },

    /// Comment management
    Comment {
        #[command(subcommand)]
        command: CommentCommands,
    },
}

#[derive(Subcommand)]
enum DesignCommands {
    /// Create a new design
    Create {
        /// Project ID
        #[arg(long)]
        project_id: String,

        /// Design title
        #[arg(long)]
        title: String,

        /// Design content (markdown)
        #[arg(long)]
        markdown: Option<String>,

        /// Read markdown from file instead of inline
        #[arg(long)]
        markdown_file: Option<PathBuf>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Get a design by ID or key
    Get {
        /// Design ID
        #[arg(long)]
        id: Option<String>,

        /// Design key (e.g., DESIGN-001)
        #[arg(long)]
        key: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// List designs
    List {
        /// Project ID
        #[arg(long)]
        project_id: String,

        /// Filter by status
        #[arg(long)]
        status: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Update a design
    Update {
        /// Design ID
        #[arg(long)]
        id: String,

        /// New title
        #[arg(long)]
        title: Option<String>,

        /// New markdown content
        #[arg(long)]
        markdown: Option<String>,

        /// Read markdown from file instead of inline
        #[arg(long)]
        markdown_file: Option<PathBuf>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Transition a design to a new status
    Transition {
        /// Design ID
        #[arg(long)]
        id: String,

        /// New status
        #[arg(long)]
        status: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Resolve (fetch) a design by ID for orchestration
    Resolve {
        /// Design ID
        #[arg(long)]
        design_id: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand)]
enum TicketCommands {
    /// Create a new ticket
    Create {
        /// Project ID
        #[arg(long)]
        project_id: String,

        /// Ticket title
        #[arg(long)]
        title: String,

        /// Ticket description
        #[arg(long)]
        description: String,

        /// Priority level
        #[arg(long, default_value = "medium")]
        priority: String,

        /// Related design ID
        #[arg(long)]
        design_id: Option<String>,

        /// Assignee
        #[arg(long)]
        assignee: Option<String>,

        /// Time estimate
        #[arg(long)]
        estimate: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Get a ticket by ID or key
    Get {
        /// Ticket ID
        #[arg(long)]
        id: Option<String>,

        /// Ticket key (e.g., TICKET-001)
        #[arg(long)]
        key: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// List tickets
    List {
        /// Project ID
        #[arg(long)]
        project_id: String,

        /// Filter by status
        #[arg(long)]
        status: Option<String>,

        /// Filter by design ID
        #[arg(long)]
        design_id: Option<String>,

        /// Filter by assignee
        #[arg(long)]
        assignee: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Update a ticket
    Update {
        /// Ticket ID
        #[arg(long)]
        id: String,

        /// New title
        #[arg(long)]
        title: Option<String>,

        /// New description
        #[arg(long)]
        description: Option<String>,

        /// New priority
        #[arg(long)]
        priority: Option<String>,

        /// New related design ID
        #[arg(long)]
        design_id: Option<String>,

        /// New assignee
        #[arg(long)]
        assignee: Option<String>,

        /// New time estimate
        #[arg(long)]
        estimate: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Transition a ticket to a new status
    Transition {
        /// Ticket ID
        #[arg(long)]
        id: String,

        /// New status
        #[arg(long)]
        status: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand)]
enum CommentCommands {
    /// Add a comment
    Add {
        /// Project ID
        #[arg(long)]
        project_id: String,

        /// Target type ("design" or "ticket")
        #[arg(long)]
        target_type: String,

        /// Target ID (design or ticket)
        #[arg(long)]
        target_id: String,

        /// Author type ("human" or "agent")
        #[arg(long)]
        author_type: String,

        /// Author name
        #[arg(long)]
        author_name: String,

        /// Comment body
        #[arg(long)]
        body: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// List comments for a target
    List {
        /// Target type ("design" or "ticket")
        #[arg(long)]
        target_type: String,

        /// Target ID (design or ticket)
        #[arg(long)]
        target_id: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

#[derive(Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
enum OutputFormat {
    Text,
    Json,
}

fn resolve_markdown(
    inline: Option<String>,
    file: Option<PathBuf>,
) -> anyhow::Result<String> {
    use anyhow::Context;
    match (inline, file) {
        (Some(_), Some(_)) => {
            anyhow::bail!("Cannot specify both --markdown and --markdown-file")
        }
        (Some(md), None) => Ok(md),
        (None, Some(path)) => std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read markdown file: {}", path.display())),
        (None, None) => anyhow::bail!("Must specify either --markdown or --markdown-file"),
    }
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
            review_enforcement,
            detector_scope,
            architect_mode,
            test_integrity_profile,
            hard_block_detectors,
            allow_rare_override,
            require_fix_first,
        } => commands::init::run(
            &feature,
            &cwd,
            &design_doc,
            &branch,
            total_phases,
            review_enforcement.as_deref(),
            detector_scope.as_deref(),
            architect_mode.as_deref(),
            test_integrity_profile.as_deref(),
            hard_block_detectors,
            allow_rare_override,
            require_fix_first,
        ),

        Commands::Start {
            feature,
            phase,
            plan,
            cwd,
            install_deps,
            parent_team_id,
        } => {
            check_phase(&phase)?;
            commands::start::run(
                &feature,
                &phase,
                &plan,
                cwd.as_deref(),
                install_deps,
                parent_team_id.as_deref(),
            )
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
            } => commands::check::complexity(
                &cwd,
                max_file_lines,
                max_total_lines,
                max_function_lines,
            ),

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
            DaemonCommands::Start { env, daemon_bin } => {
                commands::daemon::start(env.as_deref(), daemon_bin.as_deref())
            }
            DaemonCommands::Stop => commands::daemon::stop(),
            DaemonCommands::Status => commands::daemon::status(),
            DaemonCommands::Run { env, daemon_bin } => {
                commands::daemon::run_with_options(env.as_deref(), daemon_bin.as_deref())
            }
        },

        Commands::Config { command } => match command {
            ConfigCommands::ConvexUrl { env } => commands::config::convex_url(env.as_deref()),
            ConfigCommands::Show { env } => commands::config::show(env.as_deref()),
            ConfigCommands::CliForModel { model, env } => {
                commands::config::cli_for_model(&model, env.as_deref())
            }
        },

        Commands::List => commands::list::run(),

        Commands::RegisterTeam {
            orchestration_id,
            team,
            lead_session_id,
            phase_number,
            parent_team_id,
        } => commands::register_team::run(
            &orchestration_id,
            &team,
            &lead_session_id,
            phase_number.as_deref(),
            parent_team_id.as_deref(),
        ),

        Commands::ExecCodex {
            feature,
            phase,
            task_id,
            prompt,
            cwd,
            model,
            sandbox,
            timeout_secs,
            output,
        } => {
            check_phase(&phase)?;
            commands::exec_codex::run(
                &feature,
                &phase,
                &task_id,
                &prompt,
                &cwd,
                model.as_deref(),
                sandbox.as_deref(),
                timeout_secs,
                output.as_deref(),
            )
        }

        Commands::Cleanup { feature } => commands::cleanup::run(&feature),

        Commands::Orchestrate { command } => match command {
            OrchestrateCommands::Next { feature } => commands::orchestrate::next(&feature),

            OrchestrateCommands::Advance {
                feature,
                phase,
                event,
                plan_path,
                git_range,
                issues,
            } => commands::orchestrate::advance(
                &feature,
                &phase,
                &event,
                plan_path.as_deref(),
                git_range.as_deref(),
                issues.as_deref(),
            ),
        },

        Commands::Work { command } => match command {
            WorkCommands::Design { command } => match command {
                DesignCommands::Create {
                    project_id,
                    title,
                    markdown,
                    markdown_file,
                    json,
                } => {
                    let md = resolve_markdown(markdown, markdown_file)?;
                    commands::work::design_create(&project_id, &title, &md, json)
                }

                DesignCommands::Get { id, key, json } => {
                    commands::work::design_get(id.as_deref(), key.as_deref(), json)
                }

                DesignCommands::List {
                    project_id,
                    status,
                    json,
                } => commands::work::design_list(&project_id, status.as_deref(), json),

                DesignCommands::Update {
                    id,
                    title,
                    markdown,
                    markdown_file,
                    json,
                } => {
                    let md = if markdown.is_some() || markdown_file.is_some() {
                        Some(resolve_markdown(markdown, markdown_file)?)
                    } else {
                        None
                    };
                    commands::work::design_update(&id, title.as_deref(), md.as_deref(), json)
                }

                DesignCommands::Transition { id, status, json } => {
                    commands::work::design_transition(&id, &status, json)
                }

                DesignCommands::Resolve { design_id, json } => {
                    commands::work::design_resolve(&design_id, json)
                }
            },

            WorkCommands::Ticket { command } => match command {
                TicketCommands::Create {
                    project_id,
                    title,
                    description,
                    priority,
                    design_id,
                    assignee,
                    estimate,
                    json,
                } => commands::work::ticket_create(
                    &project_id,
                    &title,
                    &description,
                    &priority,
                    design_id.as_deref(),
                    assignee.as_deref(),
                    estimate.as_deref(),
                    json,
                ),

                TicketCommands::Get { id, key, json } => {
                    commands::work::ticket_get(id.as_deref(), key.as_deref(), json)
                }

                TicketCommands::List {
                    project_id,
                    status,
                    design_id,
                    assignee,
                    json,
                } => commands::work::ticket_list(
                    &project_id,
                    status.as_deref(),
                    design_id.as_deref(),
                    assignee.as_deref(),
                    json,
                ),

                TicketCommands::Update {
                    id,
                    title,
                    description,
                    priority,
                    design_id,
                    assignee,
                    estimate,
                    json,
                } => commands::work::ticket_update(
                    &id,
                    title.as_deref(),
                    description.as_deref(),
                    priority.as_deref(),
                    design_id.as_deref(),
                    assignee.as_deref(),
                    estimate.as_deref(),
                    json,
                ),

                TicketCommands::Transition { id, status, json } => {
                    commands::work::ticket_transition(&id, &status, json)
                }
            },

            WorkCommands::Comment { command } => match command {
                CommentCommands::Add {
                    project_id,
                    target_type,
                    target_id,
                    author_type,
                    author_name,
                    body,
                    json,
                } => commands::work::comment_add(
                    &project_id,
                    &target_type,
                    &target_id,
                    &author_type,
                    &author_name,
                    &body,
                    json,
                ),

                CommentCommands::List {
                    target_type,
                    target_id,
                    json,
                } => commands::work::comment_list(&target_type, &target_id, json),
            },
        },
    }
}
