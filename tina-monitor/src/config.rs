//! Configuration file support for tina-monitor

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Main configuration structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub terminal: TerminalConfig,
    pub tui: TuiConfig,
    pub safety: SafetyConfig,
    pub logging: LoggingConfig,
}

/// Terminal handler configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TerminalConfig {
    /// Preferred terminal handler: "kitty", "iterm", or "print"
    pub handler: String,
}

/// TUI refresh configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TuiConfig {
    /// Refresh interval in milliseconds
    pub refresh_interval: u64,
    /// Log polling interval in milliseconds
    pub log_poll_interval: u64,
}

/// Safety and confirmation settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SafetyConfig {
    /// Confirm before sending commands
    pub confirm_send: bool,
    /// List of safe commands that don't require confirmation
    pub safe_commands: Vec<String>,
}

/// Logging configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LoggingConfig {
    /// Path to command log file
    pub command_log: PathBuf,
}


impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            handler: "print".to_string(),
        }
    }
}

impl Default for TuiConfig {
    fn default() -> Self {
        Self {
            refresh_interval: 1000,
            log_poll_interval: 500,
        }
    }
}

impl Default for SafetyConfig {
    fn default() -> Self {
        Self {
            confirm_send: true,
            safe_commands: vec!["status".to_string(), "help".to_string(), "list".to_string()],
        }
    }
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            command_log: PathBuf::from("~/.local/share/tina-monitor/commands.log"),
        }
    }
}

impl Config {
    /// Returns the path to the configuration file
    pub fn config_path() -> PathBuf {
        let mut path = dirs::home_dir().expect("Could not determine home directory");
        path.push(".config");
        path.push("tina-monitor");
        path.push("config.toml");
        path
    }

    /// Load configuration from file, falling back to defaults if not found
    pub fn load() -> anyhow::Result<Self> {
        let path = Self::config_path();

        if !path.exists() {
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(&path)?;
        let config: Config = toml::from_str(&contents)?;
        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    fn create_test_config_file(dir: &TempDir, contents: &str) -> PathBuf {
        let config_path = dir.path().join("config.toml");
        let mut file = fs::File::create(&config_path).unwrap();
        file.write_all(contents.as_bytes()).unwrap();
        config_path
    }

    #[test]
    fn test_default_config_values() {
        let config = Config::default();

        assert_eq!(config.terminal.handler, "print");
        assert_eq!(config.tui.refresh_interval, 1000);
        assert_eq!(config.tui.log_poll_interval, 500);
        assert_eq!(config.safety.confirm_send, true);
        assert_eq!(config.safety.safe_commands.len(), 3);
        assert_eq!(
            config.logging.command_log,
            PathBuf::from("~/.local/share/tina-monitor/commands.log")
        );
    }

    #[test]
    fn test_loading_from_toml_file() {
        let temp_dir = TempDir::new().unwrap();
        let toml_content = r#"
[terminal]
handler = "kitty"

[tui]
refresh_interval = 2000
log_poll_interval = 1000

[safety]
confirm_send = false
safe_commands = ["status", "help"]

[logging]
command_log = "/tmp/commands.log"
"#;
        let config_path = create_test_config_file(&temp_dir, toml_content);

        let contents = fs::read_to_string(&config_path).unwrap();
        let config: Config = toml::from_str(&contents).unwrap();

        assert_eq!(config.terminal.handler, "kitty");
        assert_eq!(config.tui.refresh_interval, 2000);
        assert_eq!(config.tui.log_poll_interval, 1000);
        assert_eq!(config.safety.confirm_send, false);
        assert_eq!(config.safety.safe_commands.len(), 2);
        assert_eq!(
            config.logging.command_log,
            PathBuf::from("/tmp/commands.log")
        );
    }

    #[test]
    fn test_missing_config_file_returns_defaults() {
        let temp_dir = TempDir::new().unwrap();
        let non_existent = temp_dir.path().join("nonexistent.toml");

        // Simulate the load behavior for missing file
        let config = if non_existent.exists() {
            let contents = fs::read_to_string(&non_existent).unwrap();
            toml::from_str(&contents).unwrap()
        } else {
            Config::default()
        };

        assert_eq!(config.terminal.handler, "print");
        assert_eq!(config.tui.refresh_interval, 1000);
    }

    #[test]
    fn test_partial_config_uses_defaults() {
        let temp_dir = TempDir::new().unwrap();
        let toml_content = r#"
[terminal]
handler = "iterm"

[tui]
refresh_interval = 3000
# log_poll_interval is missing, should use default
"#;
        let config_path = create_test_config_file(&temp_dir, toml_content);

        let contents = fs::read_to_string(&config_path).unwrap();
        let config: Config = toml::from_str(&contents).unwrap();

        assert_eq!(config.terminal.handler, "iterm");
        assert_eq!(config.tui.refresh_interval, 3000);
        assert_eq!(config.tui.log_poll_interval, 500); // default value
        assert_eq!(config.safety.confirm_send, true); // default value (section missing)
    }
}
