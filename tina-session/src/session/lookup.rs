use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::{Result, SessionError};

/// Session lookup entry stored at ~/.claude/tina-sessions/{feature}.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLookup {
    pub feature: String,
    pub cwd: PathBuf,
    pub created_at: DateTime<Utc>,
}

impl SessionLookup {
    /// Create a new session lookup entry.
    pub fn new(feature: &str, cwd: PathBuf) -> Self {
        Self {
            feature: feature.to_string(),
            cwd,
            created_at: Utc::now(),
        }
    }

    /// Get the directory where lookup files are stored.
    pub fn lookup_dir() -> PathBuf {
        let mut path = dirs::home_dir().expect("Could not determine home directory");
        path.push(".claude");
        path.push("tina-sessions");
        path
    }

    /// Get the path to a specific feature's lookup file.
    pub fn lookup_path(feature: &str) -> PathBuf {
        let mut path = Self::lookup_dir();
        path.push(format!("{}.json", feature));
        path
    }

    /// Load a session lookup entry for a feature.
    pub fn load(feature: &str) -> Result<Self> {
        let path = Self::lookup_path(feature);
        if !path.exists() {
            return Err(SessionError::NotInitialized(feature.to_string()));
        }
        let contents = fs::read_to_string(&path)
            .map_err(|e| SessionError::FileNotFound(format!("{}: {}", path.display(), e)))?;
        let lookup: Self = serde_json::from_str(&contents)
            .map_err(|e| SessionError::FileNotFound(format!("Invalid JSON: {}", e)))?;
        Ok(lookup)
    }

    /// Save this session lookup entry.
    pub fn save(&self) -> Result<()> {
        let dir = Self::lookup_dir();
        fs::create_dir_all(&dir)
            .map_err(|e| SessionError::DirectoryNotFound(format!("{}: {}", dir.display(), e)))?;

        let path = Self::lookup_path(&self.feature);
        let contents = serde_json::to_string_pretty(self)
            .map_err(|e| SessionError::FileNotFound(format!("Serialization error: {}", e)))?;
        fs::write(&path, contents)
            .map_err(|e| SessionError::FileNotFound(format!("{}: {}", path.display(), e)))?;
        Ok(())
    }

    /// Delete a session lookup entry.
    pub fn delete(feature: &str) -> Result<()> {
        let path = Self::lookup_path(feature);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| SessionError::FileNotFound(format!("{}: {}", path.display(), e)))?;
        }
        Ok(())
    }

    /// List all session lookup entries.
    pub fn list_all() -> Result<Vec<Self>> {
        let dir = Self::lookup_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let mut entries = Vec::new();
        for entry in fs::read_dir(&dir)
            .map_err(|e| SessionError::DirectoryNotFound(format!("{}: {}", dir.display(), e)))?
        {
            let entry = entry
                .map_err(|e| SessionError::DirectoryNotFound(format!("Read error: {}", e)))?;
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Some(stem) = path.file_stem() {
                    if let Ok(lookup) = Self::load(stem.to_string_lossy().as_ref()) {
                        entries.push(lookup);
                    }
                }
            }
        }
        Ok(entries)
    }

    /// Check if a feature is initialized.
    pub fn exists(feature: &str) -> bool {
        Self::lookup_path(feature).exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // Note: These tests would need to mock the home directory
    // For now, we test the struct creation

    #[test]
    fn test_session_lookup_new() {
        let lookup = SessionLookup::new("auth", PathBuf::from("/tmp/worktree"));
        assert_eq!(lookup.feature, "auth");
        assert_eq!(lookup.cwd, PathBuf::from("/tmp/worktree"));
    }

    #[test]
    fn test_lookup_path() {
        let path = SessionLookup::lookup_path("auth");
        assert!(path.to_string_lossy().contains("tina-sessions"));
        assert!(path.to_string_lossy().contains("auth.json"));
    }
}
