use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use serde::Deserialize;

/// Daemon configuration loaded from file and/or environment.
#[derive(Debug, Clone)]
pub struct DaemonConfig {
    /// Active environment profile (`prod` or `dev`).
    pub env: String,
    pub convex_url: String,
    pub auth_token: String,
    pub node_name: String,
    pub http_port: u16,
}

#[derive(Debug, Deserialize, Default, Clone)]
struct ProfileConfig {
    convex_url: Option<String>,
    auth_token: Option<String>,
    node_name: Option<String>,
    http_port: Option<u16>,
}

/// Raw TOML file structure for `~/.config/tina/config.toml`.
#[derive(Debug, Deserialize, Default)]
struct ConfigFile {
    // Legacy flat fields (still supported).
    convex_url: Option<String>,
    auth_token: Option<String>,
    node_name: Option<String>,
    http_port: Option<u16>,

    // New profile fields.
    active_env: Option<String>,
    prod: Option<ProfileConfig>,
    dev: Option<ProfileConfig>,
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
    /// Priority: environment variables override profile and file values.
    /// File path can be overridden by `config_path` argument.
    /// Environment profile can be overridden by `env_override`.
    pub fn load(config_path: Option<&PathBuf>, env_override: Option<&str>) -> Result<Self> {
        let path = config_path.cloned().unwrap_or_else(default_config_path);

        let file_config = if path.exists() {
            let content = std::fs::read_to_string(&path)
                .with_context(|| format!("failed to read config: {}", path.display()))?;
            toml::from_str::<ConfigFile>(&content)
                .with_context(|| format!("failed to parse config: {}", path.display()))?
        } else {
            ConfigFile::default()
        };

        Self::from_file_and_env(file_config, env_override)
    }

    /// Build config from parsed file values and current environment.
    fn from_file_and_env(file_config: ConfigFile, env_override: Option<&str>) -> Result<Self> {
        let ConfigFile {
            convex_url,
            auth_token,
            node_name,
            http_port,
            active_env,
            prod,
            dev,
        } = file_config;

        let env = resolve_env(env_override, active_env.as_deref())?;
        let profile = match env.as_str() {
            "dev" => dev.as_ref(),
            "prod" => prod.as_ref(),
            _ => None,
        };

        let resolved_convex_url = std::env::var("TINA_CONVEX_URL")
            .ok()
            .or_else(|| profile.and_then(|p| p.convex_url.clone()))
            .or(convex_url);
        let resolved_auth_token = std::env::var("TINA_AUTH_TOKEN")
            .ok()
            .or_else(|| profile.and_then(|p| p.auth_token.clone()))
            .or(auth_token);
        let resolved_node_name = std::env::var("TINA_NODE_NAME")
            .ok()
            .or_else(|| profile.and_then(|p| p.node_name.clone()))
            .or(node_name);
        let resolved_http_port = std::env::var("TINA_HTTP_PORT")
            .ok()
            .and_then(|s| s.parse::<u16>().ok())
            .or_else(|| profile.and_then(|p| p.http_port))
            .or(http_port)
            .unwrap_or(7842);

        Self::build(
            env,
            resolved_convex_url,
            resolved_auth_token,
            resolved_node_name,
            resolved_http_port,
        )
    }

    /// Build config from resolved option values (after file + env merging).
    fn build(
        env: String,
        convex_url: Option<String>,
        auth_token: Option<String>,
        node_name: Option<String>,
        http_port: u16,
    ) -> Result<Self> {
        let convex_url = match convex_url {
            Some(url) if !url.is_empty() => url,
            _ => bail!("convex_url is required (set in config file or TINA_CONVEX_URL env var)"),
        };
        let auth_token = match auth_token {
            Some(token) if !token.is_empty() => token,
            _ => bail!("auth_token is required (set in config file or TINA_AUTH_TOKEN env var)"),
        };
        let node_name = node_name.filter(|n| !n.is_empty()).unwrap_or_else(|| {
            hostname::get()
                .ok()
                .and_then(|h| h.into_string().ok())
                .unwrap_or_else(|| "unknown".to_string())
        });

        Ok(Self {
            env,
            convex_url,
            auth_token,
            node_name,
            http_port,
        })
    }
}

fn resolve_env(env_override: Option<&str>, active_env: Option<&str>) -> Result<String> {
    let raw = env_override
        .map(str::to_string)
        .or_else(|| std::env::var("TINA_ENV").ok())
        .or_else(|| active_env.map(str::to_string))
        .unwrap_or_else(|| "prod".to_string());

    match raw.trim().to_ascii_lowercase().as_str() {
        "prod" | "production" => Ok("prod".to_string()),
        "dev" | "development" => Ok("dev".to_string()),
        other => bail!(
            "Invalid Tina environment '{}'. Expected 'prod' or 'dev'.",
            other
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test the build() function directly to avoid env var mutation.

    #[test]
    fn test_build_with_all_fields() {
        let config = DaemonConfig::build(
            "prod".to_string(),
            Some("https://test.convex.cloud".to_string()),
            Some("secret-token".to_string()),
            Some("test-laptop".to_string()),
            7842,
        )
        .unwrap();

        assert_eq!(config.env, "prod");
        assert_eq!(config.convex_url, "https://test.convex.cloud");
        assert_eq!(config.auth_token, "secret-token");
        assert_eq!(config.node_name, "test-laptop");
        assert_eq!(config.http_port, 7842);
    }

    #[test]
    fn test_build_missing_convex_url_errors() {
        let result =
            DaemonConfig::build("prod".to_string(), None, Some("token".to_string()), None, 7842);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("convex_url"));
    }

    #[test]
    fn test_build_empty_convex_url_errors() {
        let result = DaemonConfig::build(
            "prod".to_string(),
            Some("".to_string()),
            Some("token".to_string()),
            None,
            7842,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("convex_url"));
    }

    #[test]
    fn test_build_missing_auth_token_errors() {
        let result = DaemonConfig::build(
            "prod".to_string(),
            Some("https://test.convex.cloud".to_string()),
            None,
            None,
            7842,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("auth_token"));
    }

    #[test]
    fn test_build_empty_auth_token_errors() {
        let result = DaemonConfig::build(
            "prod".to_string(),
            Some("https://test.convex.cloud".to_string()),
            Some("".to_string()),
            None,
            7842,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("auth_token"));
    }

    #[test]
    fn test_build_node_name_defaults_to_hostname() {
        let config = DaemonConfig::build(
            "prod".to_string(),
            Some("https://test.convex.cloud".to_string()),
            Some("token".to_string()),
            None,
            7842,
        )
        .unwrap();

        assert!(!config.node_name.is_empty());
    }

    #[test]
    fn test_build_empty_node_name_defaults_to_hostname() {
        let config = DaemonConfig::build(
            "prod".to_string(),
            Some("https://test.convex.cloud".to_string()),
            Some("token".to_string()),
            Some("".to_string()),
            7842,
        )
        .unwrap();

        assert!(!config.node_name.is_empty());
    }

    #[test]
    fn test_config_file_parsing_legacy() {
        let toml_str = r#"
convex_url = "https://test.convex.cloud"
auth_token = "secret"
node_name = "my-laptop"
"#;
        let file_config: ConfigFile = toml::from_str(toml_str).unwrap();
        assert_eq!(
            file_config.convex_url,
            Some("https://test.convex.cloud".to_string())
        );
        assert_eq!(file_config.auth_token, Some("secret".to_string()));
        assert_eq!(file_config.node_name, Some("my-laptop".to_string()));
        assert!(file_config.prod.is_none());
        assert!(file_config.dev.is_none());
    }

    #[test]
    fn test_config_file_parsing_profiles() {
        let toml_str = r#"
active_env = "dev"

[prod]
convex_url = "https://prod.convex.cloud"
auth_token = "prod-token"

[dev]
convex_url = "https://dev.convex.cloud"
auth_token = "dev-token"
node_name = "dev-laptop"
"#;
        let file_config: ConfigFile = toml::from_str(toml_str).unwrap();
        assert_eq!(file_config.active_env.as_deref(), Some("dev"));
        assert_eq!(
            file_config
                .prod
                .as_ref()
                .and_then(|p| p.convex_url.as_deref()),
            Some("https://prod.convex.cloud")
        );
        assert_eq!(
            file_config
                .dev
                .as_ref()
                .and_then(|p| p.auth_token.as_deref()),
            Some("dev-token")
        );
    }

    #[test]
    fn test_from_file_and_env_uses_profile() {
        let file = ConfigFile {
            active_env: Some("dev".to_string()),
            prod: Some(ProfileConfig {
                convex_url: Some("https://prod.convex.cloud".to_string()),
                auth_token: Some("prod-token".to_string()),
                node_name: Some("prod-node".to_string()),
                http_port: None,
            }),
            dev: Some(ProfileConfig {
                convex_url: Some("https://dev.convex.cloud".to_string()),
                auth_token: Some("dev-token".to_string()),
                node_name: Some("dev-node".to_string()),
                http_port: None,
            }),
            ..ConfigFile::default()
        };

        let config = DaemonConfig::from_file_and_env(file, Some("dev")).unwrap();
        assert_eq!(config.env, "dev");
        assert_eq!(config.convex_url, "https://dev.convex.cloud");
        assert_eq!(config.auth_token, "dev-token");
        assert_eq!(config.node_name, "dev-node");
    }

    #[test]
    fn test_resolve_env_defaults_prod() {
        let env = resolve_env(Some("prod"), None).unwrap();
        assert_eq!(env, "prod");
    }

    #[test]
    fn test_resolve_env_normalizes_aliases() {
        assert_eq!(resolve_env(Some("production"), None).unwrap(), "prod");
        assert_eq!(resolve_env(Some("development"), None).unwrap(), "dev");
    }

    #[test]
    fn test_resolve_env_rejects_invalid_value() {
        let err = resolve_env(Some("staging"), None).unwrap_err();
        assert!(err.to_string().contains("Invalid Tina environment"));
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
active_env = "prod"

[prod]
convex_url = "https://prod.convex.cloud"
auth_token = "prod-token"
node_name = "prod-node"
"#,
        )
        .unwrap();

        let config = DaemonConfig::load(Some(&config_path), Some("prod")).unwrap();
        assert_eq!(config.env, "prod");
        assert_eq!(config.convex_url, "https://prod.convex.cloud");
        assert_eq!(config.auth_token, "prod-token");
        assert_eq!(config.node_name, "prod-node");
    }

    #[test]
    fn test_load_nonexistent_file_without_env_vars_errors() {
        let result = DaemonConfig::build("prod".to_string(), None, None, None, 7842);
        assert!(result.is_err());
    }

    #[test]
    fn test_build_with_custom_http_port() {
        let config = DaemonConfig::build(
            "prod".to_string(),
            Some("https://test.convex.cloud".to_string()),
            Some("token".to_string()),
            Some("node".to_string()),
            9999,
        )
        .unwrap();
        assert_eq!(config.http_port, 9999);
    }
}
