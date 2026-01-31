use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::Result;

/// Result of waiting for phase completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaitResult {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_range: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Watch a status file for completion.
pub fn watch_status(_path: &Path, _timeout_secs: Option<u64>) -> Result<WaitResult> {
    todo!("status watching")
}
