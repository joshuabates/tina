//! Command logging for sent commands

use chrono::Utc;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

pub struct CommandLogger {
    log_path: PathBuf,
}

impl CommandLogger {
    pub fn new(log_path: PathBuf) -> Self {
        let expanded_path = Self::expand_path(&log_path);
        Self {
            log_path: expanded_path,
        }
    }

    /// Expand ~ in path
    fn expand_path(path: &Path) -> PathBuf {
        if let Some(path_str) = path.to_str() {
            if let Some(stripped) = path_str.strip_prefix("~/") {
                if let Some(home) = dirs::home_dir() {
                    return home.join(stripped);
                }
            }
        }
        path.to_path_buf()
    }

    /// Log a sent command
    pub fn log(&self, target: &str, command: &str) -> anyhow::Result<()> {
        // Create parent directory if it doesn't exist
        if let Some(parent) = self.log_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Open file in append mode, create if doesn't exist
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)?;

        // Format: ISO 8601 timestamp, target pane, command
        let timestamp = Utc::now().to_rfc3339();
        let log_entry = format!("{} [{}] {}\n", timestamp, target, command);

        file.write_all(log_entry.as_bytes())?;

        Ok(())
    }
}
