use thiserror::Error;

/// Error types for tina-session operations.
/// These are used by both the library and binary crates.
#[derive(Error, Debug)]
#[allow(dead_code)]
pub enum SessionError {
    #[error("Feature '{0}' not initialized. Run 'tina-session init' first.")]
    NotInitialized(String),

    #[error("Feature '{0}' already initialized at {1}")]
    AlreadyInitialized(String, String),

    #[error("Session '{0}' not found")]
    SessionNotFound(String),

    #[error("Session '{0}' already exists")]
    SessionAlreadyExists(String),

    #[error("Directory not found: {0}")]
    DirectoryNotFound(String),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Invalid status transition: cannot go from '{from}' to '{to}'")]
    InvalidTransition { from: String, to: String },

    #[error("Invalid status value: {0}. Valid values: planning, planned, executing, reviewing, complete, blocked")]
    InvalidStatus(String),

    #[error("Phase {0} does not exist (total phases: {1})")]
    PhaseNotFound(u32, u32),

    #[error("Missing required field: {0}")]
    MissingField(String),

    #[error("Timeout waiting for {0}")]
    Timeout(String),

    #[error("Claude not ready after {0} seconds")]
    ClaudeNotReady(u64),

    #[error("Tmux error: {0}")]
    TmuxError(String),

    #[error("Plan validation failed: {0}")]
    PlanValidation(String),

    #[error("Complexity check failed: {0}")]
    ComplexityCheck(String),

    #[error("Verification failed: {0}")]
    VerificationFailed(String),

    #[error("Invalid model '{0}'. Must be 'opus' or 'haiku'.")]
    InvalidModel(String),

    #[error("Convex error: {0}")]
    ConvexError(String),
}

#[allow(dead_code)]
pub type Result<T> = std::result::Result<T, SessionError>;
