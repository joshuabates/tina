use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use serde::Deserialize;

/// Daemon configuration loaded from file and/or environment.
#[derive(Debug, Clone)]
pub struct DaemonConfig {
    pub convex_url: String,
    pub auth_token: String,
    pub node_name: String,
}

/// Raw TOML file structure for `~/.config/tina/config.toml`.
#[derive(Debug, Deserialize, Default)]
struct ConfigFile {
    convex_url: Option<String>,
    auth_token: Option<String>,
    node_name: Option<String>,
}

/// Default config file location.
fn default_config_path() -> PathBuf {
    dirs::config_dir()
        .expect("could not determine config directory")
        .join("tina")
        .join("config.toml")
}

impl DaemonConfig {
    /// Load configuration from file and environment variables.
    ///
    /// Priority: environment variables override file values.
    /// File path can be overridden by `config_path` argument.
    pub fn load(config_path: Option<&PathBuf>) -> Result<Self> {
        let path = config_path
            .cloned()
            .unwrap_or_else(default_config_path);

        let file_config = if path.exists() {
            let content = std::fs::read_to_string(&path)
                .with_context(|| format!("failed to read config: {}", path.display()))?;
            toml::from_str::<ConfigFile>(&content)
                .with_context(|| format!("failed to parse config: {}", path.display()))?
        } else {
            ConfigFile::default()
        };

        Self::from_file_and_env(file_config)
    }

    /// Build config from parsed file values and current environment.
    fn from_file_and_env(file_config: ConfigFile) -> Result<Self> {
        let convex_url = std::env::var("TINA_CONVEX_URL")
            .ok()
            .or(file_config.convex_url);
        let auth_token = std::env::var("TINA_AUTH_TOKEN")
            .ok()
            .or(file_config.auth_token);
        let node_name = std::env::var("TINA_NODE_NAME")
            .ok()
            .or(file_config.node_name);

        Self::build(convex_url, auth_token, node_name)
    }

    /// Build config from resolved option values (after file + env merging).
    fn build(
        convex_url: Option<String>,
        auth_token: Option<String>,
        node_name: Option<String>,
    ) -> Result<Self> {
        let convex_url = match convex_url {
            Some(url) if !url.is_empty() => url,
            _ => bail!("convex_url is required (set in config file or TINA_CONVEX_URL env var)"),
        };
        let auth_token = match auth_token {
            Some(token) if !token.is_empty() => token,
            _ => bail!("auth_token is required (set in config file or TINA_AUTH_TOKEN env var)"),
        };
        let node_name = node_name
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| {
                hostname::get()
                    .ok()
                    .and_then(|h| h.into_string().ok())
                    .unwrap_or_else(|| "unknown".to_string())
            });

        Ok(Self {
            convex_url,
            auth_token,
            node_name,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test the build() function directly to avoid env var mutation.

    #[test]
    fn test_build_with_all_fields() {
        let config = DaemonConfig::build(
            Some("https://test.convex.cloud".to_string()),
            Some("secret-token".to_string()),
            Some("test-laptop".to_string()),
        )
        .unwrap();

        assert_eq!(config.convex_url, "https://test.convex.cloud");
        assert_eq!(config.auth_token, "secret-token");
        assert_eq!(config.node_name, "test-laptop");
    }

    #[test]
    fn test_build_missing_convex_url_errors() {
        let result = DaemonConfig::build(None, Some("token".to_string()), None);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("convex_url"));
    }

    #[test]
    fn test_build_empty_convex_url_errors() {
        let result = DaemonConfig::build(
            Some("".to_string()),
            Some("token".to_string()),
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("convex_url"));
    }

    #[test]
    fn test_build_missing_auth_token_errors() {
        let result = DaemonConfig::build(
            Some("https://test.convex.cloud".to_string()),
            None,
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("auth_token"));
    }

    #[test]
    fn test_build_empty_auth_token_errors() {
        let result = DaemonConfig::build(
            Some("https://test.convex.cloud".to_string()),
            Some("".to_string()),
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("auth_token"));
    }

    #[test]
    fn test_build_node_name_defaults_to_hostname() {
        let config = DaemonConfig::build(
            Some("https://test.convex.cloud".to_string()),
            Some("token".to_string()),
            None,
        )
        .unwrap();

        // Should fall back to hostname (non-empty)
        assert!(!config.node_name.is_empty());
    }

    #[test]
    fn test_build_empty_node_name_defaults_to_hostname() {
        let config = DaemonConfig::build(
            Some("https://test.convex.cloud".to_string()),
            Some("token".to_string()),
            Some("".to_string()),
        )
        .unwrap();

        assert!(!config.node_name.is_empty());
    }

    #[test]
    fn test_config_file_parsing() {
        let toml_str = r#"
convex_url = "https://test.convex.cloud"
auth_token = "secret"
node_name = "my-laptop"
"#;
        let file_config: ConfigFile = toml::from_str(toml_str).unwrap();
        assert_eq!(file_config.convex_url, Some("https://test.convex.cloud".to_string()));
        assert_eq!(file_config.auth_token, Some("secret".to_string()));
        assert_eq!(file_config.node_name, Some("my-laptop".to_string()));
    }

    #[test]
    fn test_config_file_partial_parsing() {
        let toml_str = r#"convex_url = "https://test.convex.cloud""#;
        let file_config: ConfigFile = toml::from_str(toml_str).unwrap();
        assert_eq!(file_config.convex_url, Some("https://test.convex.cloud".to_string()));
        assert_eq!(file_config.auth_token, None);
        assert_eq!(file_config.node_name, None);
    }

    #[test]
    fn test_config_file_empty_parsing() {
        let file_config: ConfigFile = toml::from_str("").unwrap();
        assert_eq!(file_config.convex_url, None);
        assert_eq!(file_config.auth_token, None);
        assert_eq!(file_config.node_name, None);
    }

    #[test]
    fn test_load_from_file() {
        use std::fs;
        use tempfile::TempDir;

        let dir = TempDir::new().unwrap();
        let config_path = dir.path().join("config.toml");
        fs::write(
            &config_path,
            r#"
convex_url = "https://test.convex.cloud"
auth_token = "secret-token"
node_name = "test-laptop"
"#,
        )
        .unwrap();

        // This test works regardless of env vars because the file provides all values.
        // If env vars happen to be set, they'll override -- but the test just checks
        // that loading from a valid file doesn't error.
        let config = DaemonConfig::load(Some(&config_path)).unwrap();
        assert!(!config.convex_url.is_empty());
        assert!(!config.auth_token.is_empty());
        assert!(!config.node_name.is_empty());
    }

    #[test]
    fn test_load_nonexistent_file_without_env_vars_errors() {
        // Without env vars AND without a file, it should fail.
        // But we can't safely clear env vars in parallel tests,
        // so we use build() directly instead.
        let result = DaemonConfig::build(None, None, None);
        assert!(result.is_err());
    }
}
