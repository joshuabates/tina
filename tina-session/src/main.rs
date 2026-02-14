use clap::{ArgGroup, Parser, Subcommand};
use std::path::PathBuf;
use std::process::ExitCode;

use tina_session::session::naming::validate_phase;

mod commands;
mod error;

/// Validate phase format and return an error with helpful guidance if invalid.
fn check_phase(phase: &str) -> anyhow::Result<()> {
    validate_phase(phase).map_err(|e| anyhow::anyhow!("{}", e))
}

/// Resolve markdown content from either inline or file source (optional).
fn resolve_optional_markdown(
    inline: Option<String>,
    file: Option<PathBuf>,
) -> anyhow::Result<Option<String>> {
    match (inline, file) {
        (Some(_), Some(_)) => anyhow::bail!("Cannot specify both --markdown and --markdown-file"),
        (Some(md), None) => Ok(Some(md)),
        (None, Some(path)) => Ok(Some(std::fs::read_to_string(&path)?)),
        (None, None) => Ok(None),
    }
}

/// Resolve markdown content from either inline or file source (required).
fn resolve_markdown(inline: Option<String>, file: Option<PathBuf>) -> anyhow::Result<String> {
    resolve_optional_markdown(inline, file)?
        .ok_or_else(|| anyhow::anyhow!("Must specify either --markdown or --markdown-file"))
}

/// Extract the json flag from a WorkCommands enum variant.
fn extract_json_flag_from_work_command(cmd: &WorkCommands) -> bool {
    match cmd {
        WorkCommands::Spec { command } => match command {
            SpecCommands::Create { json, .. } => *json,
            SpecCommands::Get { json, .. } => *json,
            SpecCommands::List { json, .. } => *json,
            SpecCommands::Update { json, .. } => *json,
            SpecCommands::Transition { json, .. } => *json,
            SpecCommands::Resolve { json, .. } => *json,
            SpecCommands::ResolveToFile { json, .. } => *json,
        },
        WorkCommands::Ticket { command } => match command {
            TicketCommands::Create { json, .. } => *json,
            TicketCommands::Get { json, .. } => *json,
            TicketCommands::List { json, .. } => *json,
            TicketCommands::Update { json, .. } => *json,
            TicketCommands::Transition { json, .. } => *json,
        },
        WorkCommands::Comment { command } => match command {
            CommentCommands::Add { json, .. } => *json,
            CommentCommands::List { json, .. } => *json,
        },
    }
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

        /// Path to spec document (mutually exclusive with --spec-id)
        #[arg(long)]
        spec_doc: Option<PathBuf>,

        /// Convex spec document ID (mutually exclusive with --spec-doc)
        #[arg(long)]
        spec_id: Option<String>,

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

        /// Start orchestration lead tmux session and send /tina:orchestrate.
        #[arg(long)]
        launch_orchestrator: bool,
    },

    /// Start phase execution (creates tmux, starts Claude, sends skill)
    #[command(group(
        ArgGroup::new("plan_source")
            .required(true)
            .multiple(false)
            .args(["plan", "spec_id"])
    ))]
    Start {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase identifier (e.g., "1", "2", "1.5" for remediation)
        #[arg(long)]
        phase: String,

        /// Path to plan file (mutually exclusive with --spec-id)
        #[arg(long)]
        plan: Option<PathBuf>,

        /// Convex spec document ID used to materialize a phase plan (mutually exclusive with --plan)
        #[arg(long)]
        spec_id: Option<String>,

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

        /// Local directory name under ~/.claude/{teams,tasks}
        #[arg(long)]
        local_dir_name: String,

        /// tmux session name used for this team (optional)
        #[arg(long)]
        tmux_session_name: Option<String>,

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

        /// Agent role for tracking (e.g., "worker", "spec-reviewer", "code-quality-reviewer")
        #[arg(long)]
        role: Option<String>,
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

    /// Work management subcommands (specs, tickets, comments)
    Work {
        #[command(subcommand)]
        command: WorkCommands,
    },

    /// Review management (findings, checks, gates)
    Review {
        #[command(subcommand)]
        command: ReviewCommands,
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

    /// Preflight checks for PATH/binary command-surface drift
    Doctor,
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

    /// Update model and/or review policy for future work
    SetPolicy {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Model policy as JSON (optional, only provided fields are updated)
        #[arg(long)]
        model_json: Option<String>,

        /// Review policy as JSON (optional, only provided fields are updated)
        #[arg(long)]
        review_json: Option<String>,
    },

    /// Update the model for a single role
    SetRoleModel {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Role to update (validator, planner, executor, reviewer)
        #[arg(long)]
        role: String,

        /// New model name (opus, sonnet, haiku, gpt-5.3-codex, gpt-5.3-codex-spark)
        #[arg(long)]
        model: String,
    },

    /// Edit a pending execution task
    TaskEdit {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: String,

        /// Task number to edit
        #[arg(long)]
        task: u32,

        /// Expected revision for optimistic concurrency
        #[arg(long)]
        revision: u32,

        /// New subject (optional)
        #[arg(long)]
        subject: Option<String>,

        /// New description (optional)
        #[arg(long)]
        description: Option<String>,

        /// New model (optional: opus, sonnet, haiku, gpt-5.3-codex, gpt-5.3-codex-spark)
        #[arg(long)]
        model: Option<String>,
    },

    /// Insert a new task into the execution plan
    TaskInsert {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: String,

        /// Insert after this task number (0 for beginning)
        #[arg(long)]
        after_task: u32,

        /// Task subject
        #[arg(long)]
        subject: String,

        /// Model (optional: opus, sonnet, haiku, gpt-5.3-codex, gpt-5.3-codex-spark)
        #[arg(long)]
        model: Option<String>,

        /// Comma-separated dependency task numbers
        #[arg(long)]
        depends_on: Option<String>,
    },

    /// Override the model for a specific pending task
    TaskSetModel {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: String,

        /// Task number
        #[arg(long)]
        task: u32,

        /// Expected revision for optimistic concurrency
        #[arg(long)]
        revision: u32,

        /// New model (opus, sonnet, haiku, gpt-5.3-codex, gpt-5.3-codex-spark)
        #[arg(long)]
        model: String,
    },
}

#[derive(Subcommand)]
enum WorkCommands {
    /// Spec management
    Spec {
        #[command(subcommand)]
        command: SpecCommands,
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
enum SpecCommands {
    /// Create a new spec
    Create {
        /// Project ID
        #[arg(long)]
        project_id: String,

        /// Spec title
        #[arg(long)]
        title: String,

        /// Spec content (markdown)
        #[arg(long)]
        markdown: Option<String>,

        /// Read markdown from file instead of inline
        #[arg(long)]
        markdown_file: Option<PathBuf>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Get a spec by ID or key
    Get {
        /// Spec ID
        #[arg(long)]
        id: Option<String>,

        /// Spec key
        #[arg(long)]
        key: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// List specs in a project
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

    /// Update an existing spec
    Update {
        /// Spec ID
        #[arg(long)]
        id: String,

        /// New title (optional)
        #[arg(long)]
        title: Option<String>,

        /// New content (markdown)
        #[arg(long)]
        markdown: Option<String>,

        /// Read markdown from file instead of inline
        #[arg(long)]
        markdown_file: Option<PathBuf>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Transition a spec to a new status
    Transition {
        /// Spec ID
        #[arg(long)]
        id: String,

        /// New status
        #[arg(long)]
        status: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Fetch and display a spec by ID (resolve)
    Resolve {
        /// Spec ID
        #[arg(long)]
        spec_id: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Fetch a spec and write its markdown to a file
    ResolveToFile {
        /// Spec ID
        #[arg(long)]
        spec_id: String,

        /// Output file path
        #[arg(long)]
        output: PathBuf,

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

        /// Priority (default: medium)
        #[arg(long, default_value = "medium")]
        priority: String,

        /// Associated spec ID (optional)
        #[arg(long)]
        spec_id: Option<String>,

        /// Assignee (optional)
        #[arg(long)]
        assignee: Option<String>,

        /// Time estimate (optional)
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

        /// Ticket key
        #[arg(long)]
        key: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// List tickets in a project
    List {
        /// Project ID
        #[arg(long)]
        project_id: String,

        /// Filter by status (optional)
        #[arg(long)]
        status: Option<String>,

        /// Filter by spec ID (optional)
        #[arg(long)]
        spec_id: Option<String>,

        /// Filter by assignee (optional)
        #[arg(long)]
        assignee: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Update an existing ticket
    Update {
        /// Ticket ID
        #[arg(long)]
        id: String,

        /// New title (optional)
        #[arg(long)]
        title: Option<String>,

        /// New description (optional)
        #[arg(long)]
        description: Option<String>,

        /// New priority (optional)
        #[arg(long)]
        priority: Option<String>,

        /// New spec ID (optional)
        #[arg(long)]
        spec_id: Option<String>,

        /// Clear spec link from ticket
        #[arg(long)]
        clear_spec_id: bool,

        /// New assignee (optional)
        #[arg(long)]
        assignee: Option<String>,

        /// New time estimate (optional)
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
    /// Add a new comment
    Add {
        /// Project ID
        #[arg(long)]
        project_id: String,

        /// Target type (spec or ticket)
        #[arg(long)]
        target_type: String,

        /// Target ID (spec or ticket ID)
        #[arg(long)]
        target_id: String,

        /// Author type (human or agent)
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
        /// Target type (spec or ticket)
        #[arg(long)]
        target_type: String,

        /// Target ID (spec or ticket ID)
        #[arg(long)]
        target_id: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand)]
enum ReviewCommands {
    /// Start a new review for a phase or orchestration
    Start {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number (omit for orchestration-level review)
        #[arg(long)]
        phase: Option<String>,

        /// Reviewer agent name
        #[arg(long, default_value = "review-agent")]
        reviewer: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Complete an open review
    Complete {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Review ID (Convex document ID)
        #[arg(long)]
        review_id: String,

        /// Review outcome
        #[arg(long, value_parser = ["approved", "changes_requested", "superseded"])]
        status: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Add a finding (review thread) to the current review
    AddFinding {
        /// Review ID (Convex document ID)
        #[arg(long)]
        review_id: String,

        /// Orchestration ID (Convex document ID)
        #[arg(long)]
        orchestration_id: String,

        /// Source file path
        #[arg(long)]
        file: String,

        /// Line number
        #[arg(long)]
        line: i64,

        /// Git commit SHA this finding relates to
        #[arg(long)]
        commit: String,

        /// Severity level
        #[arg(long, value_parser = ["p0", "p1", "p2"])]
        severity: String,

        /// Which gate this finding can block
        #[arg(long, value_parser = ["plan", "review", "finalize"])]
        gate: String,

        /// Short title
        #[arg(long)]
        summary: String,

        /// Detailed explanation
        #[arg(long)]
        body: String,

        /// Who created it
        #[arg(long, value_parser = ["human", "agent"], default_value = "agent")]
        source: String,

        /// Author name
        #[arg(long, default_value = "review-agent")]
        author: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Resolve a finding
    ResolveFinding {
        /// Thread ID (Convex document ID)
        #[arg(long)]
        finding_id: String,

        /// Who resolved it
        #[arg(long, default_value = "review-agent")]
        resolved_by: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Run all CLI checks from tina-checks.toml
    RunChecks {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Review ID (Convex document ID)
        #[arg(long)]
        review_id: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Start a project check (agent-evaluated)
    StartCheck {
        /// Review ID (Convex document ID)
        #[arg(long)]
        review_id: String,

        /// Orchestration ID (Convex document ID)
        #[arg(long)]
        orchestration_id: String,

        /// Check name
        #[arg(long)]
        name: String,

        /// Check kind
        #[arg(long, value_parser = ["cli", "project"])]
        kind: String,

        /// CLI command (for cli kind)
        #[arg(long)]
        command: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Complete a running check
    CompleteCheck {
        /// Review ID (Convex document ID)
        #[arg(long)]
        review_id: String,

        /// Check name
        #[arg(long)]
        name: String,

        /// Check result
        #[arg(long, value_parser = ["passed", "failed"])]
        status: String,

        /// Explanation on failure
        #[arg(long)]
        comment: Option<String>,

        /// Captured stdout/stderr
        #[arg(long)]
        output: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// HITL gate management
    Gate {
        #[command(subcommand)]
        command: ReviewGateCommands,
    },
}

#[derive(Subcommand)]
enum ReviewGateCommands {
    /// Approve a gate
    Approve {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Gate to approve
        #[arg(long, value_parser = ["plan", "review", "finalize"])]
        gate: String,

        /// Who approved
        #[arg(long, default_value = "human")]
        decided_by: String,

        /// Summary explanation
        #[arg(long, default_value = "Approved")]
        summary: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Block a gate
    Block {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Gate to block
        #[arg(long, value_parser = ["plan", "review", "finalize"])]
        gate: String,

        /// Reason for blocking
        #[arg(long)]
        reason: String,

        /// Who blocked
        #[arg(long, default_value = "review-agent")]
        decided_by: String,

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
            spec_doc,
            spec_id,
            branch,
            total_phases,
            review_enforcement,
            detector_scope,
            architect_mode,
            test_integrity_profile,
            hard_block_detectors,
            allow_rare_override,
            require_fix_first,
            launch_orchestrator,
        } => {
            if launch_orchestrator {
                commands::init::run_with_options(
                    &feature,
                    &cwd,
                    spec_doc.as_deref(),
                    spec_id.as_deref(),
                    &branch,
                    total_phases,
                    review_enforcement.as_deref(),
                    detector_scope.as_deref(),
                    architect_mode.as_deref(),
                    test_integrity_profile.as_deref(),
                    hard_block_detectors,
                    allow_rare_override,
                    require_fix_first,
                    true,
                )
            } else {
                commands::init::run(
                    &feature,
                    &cwd,
                    spec_doc.as_deref(),
                    spec_id.as_deref(),
                    &branch,
                    total_phases,
                    review_enforcement.as_deref(),
                    detector_scope.as_deref(),
                    architect_mode.as_deref(),
                    test_integrity_profile.as_deref(),
                    hard_block_detectors,
                    allow_rare_override,
                    require_fix_first,
                )
            }
        }

        Commands::Start {
            feature,
            phase,
            plan,
            spec_id,
            cwd,
            install_deps,
            parent_team_id,
        } => {
            check_phase(&phase)?;
            commands::start::run(
                &feature,
                &phase,
                plan.as_deref(),
                spec_id.as_deref(),
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

            CheckCommands::Doctor => commands::check::doctor(),
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
            local_dir_name,
            tmux_session_name,
            phase_number,
            parent_team_id,
        } => commands::register_team::run(
            &orchestration_id,
            &team,
            &lead_session_id,
            &local_dir_name,
            tmux_session_name.as_deref(),
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
            role,
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
                role.as_deref(),
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

            OrchestrateCommands::SetPolicy {
                feature,
                model_json,
                review_json,
            } => commands::orchestrate::set_policy(
                &feature,
                model_json.as_deref(),
                review_json.as_deref(),
            ),

            OrchestrateCommands::SetRoleModel {
                feature,
                role,
                model,
            } => commands::orchestrate::set_role_model(&feature, &role, &model),

            OrchestrateCommands::TaskEdit {
                feature,
                phase,
                task,
                revision,
                subject,
                description,
                model,
            } => commands::orchestrate::task_edit(
                &feature,
                &phase,
                task,
                revision,
                subject.as_deref(),
                description.as_deref(),
                model.as_deref(),
            ),

            OrchestrateCommands::TaskInsert {
                feature,
                phase,
                after_task,
                subject,
                model,
                depends_on,
            } => commands::orchestrate::task_insert(
                &feature,
                &phase,
                after_task,
                &subject,
                model.as_deref(),
                depends_on.as_deref(),
            ),

            OrchestrateCommands::TaskSetModel {
                feature,
                phase,
                task,
                revision,
                model,
            } => commands::orchestrate::task_set_model(&feature, &phase, task, revision, &model),
        },

        Commands::Work { command } => {
            let json_mode = extract_json_flag_from_work_command(&command);
            let result = match command {
                WorkCommands::Spec { command } => match command {
                    SpecCommands::Create {
                        project_id,
                        title,
                        markdown,
                        markdown_file,
                        json,
                    } => {
                        let md = resolve_markdown(markdown, markdown_file)?;
                        commands::work::spec::create(&project_id, &title, &md, json)
                    }

                    SpecCommands::Get { id, key, json } => {
                        commands::work::spec::get(id.as_deref(), key.as_deref(), json)
                    }

                    SpecCommands::List {
                        project_id,
                        status,
                        json,
                    } => commands::work::spec::list(&project_id, status.as_deref(), json),

                    SpecCommands::Update {
                        id,
                        title,
                        markdown,
                        markdown_file,
                        json,
                    } => {
                        let final_md = resolve_optional_markdown(markdown, markdown_file)?;
                        commands::work::spec::update(
                            &id,
                            title.as_deref(),
                            final_md.as_deref(),
                            json,
                        )
                    }

                    SpecCommands::Transition { id, status, json } => {
                        commands::work::spec::transition(&id, &status, json)
                    }

                    SpecCommands::Resolve { spec_id, json } => {
                        commands::work::spec::resolve(&spec_id, json)
                    }

                    SpecCommands::ResolveToFile {
                        spec_id,
                        output,
                        json,
                    } => commands::work::spec::resolve_to_file(&spec_id, &output, json),
                },

                WorkCommands::Ticket { command } => match command {
                    TicketCommands::Create {
                        project_id,
                        title,
                        description,
                        priority,
                        spec_id,
                        assignee,
                        estimate,
                        json,
                    } => commands::work::ticket::create(
                        &project_id,
                        &title,
                        &description,
                        &priority,
                        spec_id.as_deref(),
                        assignee.as_deref(),
                        estimate.as_deref(),
                        json,
                    ),

                    TicketCommands::Get { id, key, json } => {
                        commands::work::ticket::get(id.as_deref(), key.as_deref(), json)
                    }

                    TicketCommands::List {
                        project_id,
                        status,
                        spec_id,
                        assignee,
                        json,
                    } => commands::work::ticket::list(
                        &project_id,
                        status.as_deref(),
                        spec_id.as_deref(),
                        assignee.as_deref(),
                        json,
                    ),

                    TicketCommands::Update {
                        id,
                        title,
                        description,
                        priority,
                        spec_id,
                        clear_spec_id,
                        assignee,
                        estimate,
                        json,
                    } => commands::work::ticket::update(
                        &id,
                        title.as_deref(),
                        description.as_deref(),
                        priority.as_deref(),
                        spec_id.as_deref(),
                        clear_spec_id,
                        assignee.as_deref(),
                        estimate.as_deref(),
                        json,
                    ),

                    TicketCommands::Transition { id, status, json } => {
                        commands::work::ticket::transition(&id, &status, json)
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
                    } => commands::work::comment::add(
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
                    } => commands::work::comment::list(&target_type, &target_id, json),
                },
            };

            match result {
                Ok(code) => Ok(code),
                Err(e) if json_mode => {
                    eprintln!(
                        "{}",
                        serde_json::json!({
                            "ok": false,
                            "error": format!("{:#}", e),
                        })
                    );
                    Ok(1)
                }
                Err(e) => Err(e),
            }
        }

        Commands::Review { command } => {
            let json_mode = match &command {
                ReviewCommands::Start { json, .. } => *json,
                ReviewCommands::Complete { json, .. } => *json,
                ReviewCommands::AddFinding { json, .. } => *json,
                ReviewCommands::ResolveFinding { json, .. } => *json,
                ReviewCommands::RunChecks { json, .. } => *json,
                ReviewCommands::StartCheck { json, .. } => *json,
                ReviewCommands::CompleteCheck { json, .. } => *json,
                ReviewCommands::Gate { command } => match command {
                    ReviewGateCommands::Approve { json, .. } => *json,
                    ReviewGateCommands::Block { json, .. } => *json,
                },
            };
            let result = match command {
                ReviewCommands::Start {
                    feature,
                    phase,
                    reviewer,
                    json,
                } => commands::review::start(&feature, phase.as_deref(), &reviewer, json),
                ReviewCommands::Complete {
                    feature,
                    review_id,
                    status,
                    json,
                } => commands::review::complete(&feature, &review_id, &status, json),
                ReviewCommands::AddFinding {
                    review_id,
                    orchestration_id,
                    file,
                    line,
                    commit,
                    severity,
                    gate,
                    summary,
                    body,
                    source,
                    author,
                    json,
                } => commands::review::add_finding(
                    &review_id,
                    &orchestration_id,
                    &file,
                    line,
                    &commit,
                    &severity,
                    &gate,
                    &summary,
                    &body,
                    &source,
                    &author,
                    json,
                ),
                ReviewCommands::ResolveFinding {
                    finding_id,
                    resolved_by,
                    json,
                } => commands::review::resolve_finding(&finding_id, &resolved_by, json),
                ReviewCommands::RunChecks {
                    feature,
                    review_id,
                    json,
                } => commands::review::run_checks(&feature, &review_id, json),
                ReviewCommands::StartCheck {
                    review_id,
                    orchestration_id,
                    name,
                    kind,
                    command,
                    json,
                } => commands::review::start_check(
                    &review_id,
                    &orchestration_id,
                    &name,
                    &kind,
                    command.as_deref(),
                    json,
                ),
                ReviewCommands::CompleteCheck {
                    review_id,
                    name,
                    status,
                    comment,
                    output,
                    json,
                } => commands::review::complete_check(
                    &review_id,
                    &name,
                    &status,
                    comment.as_deref(),
                    output.as_deref(),
                    json,
                ),
                ReviewCommands::Gate { command } => match command {
                    ReviewGateCommands::Approve {
                        feature,
                        gate,
                        decided_by,
                        summary,
                        json,
                    } => {
                        commands::review::gate_approve(&feature, &gate, &decided_by, &summary, json)
                    }
                    ReviewGateCommands::Block {
                        feature,
                        gate,
                        reason,
                        decided_by,
                        json,
                    } => commands::review::gate_block(&feature, &gate, &reason, &decided_by, json),
                },
            };
            match result {
                Ok(code) => Ok(code),
                Err(e) if json_mode => {
                    eprintln!(
                        "{}",
                        serde_json::json!({ "ok": false, "error": format!("{:#}", e) })
                    );
                    Ok(1)
                }
                Err(e) => Err(e),
            }
        }
    }
}
