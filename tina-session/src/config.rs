use std::path::PathBuf;

use anyhow::bail;
use serde::Deserialize;

/// Tina configuration read from `~/.config/tina/config.toml`.
///
/// Uses the same config file as tina-daemon.
#[derive(Debug, Clone, Default)]
pub struct TinaConfig {
    /// Active environment profile (`prod` or `dev`).
    pub env: String,
    pub convex_url: Option<String>,
    pub auth_token: Option<String>,
    pub node_name: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone)]
struct ProfileConfig {
    convex_url: Option<String>,
    auth_token: Option<String>,
    node_name: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct ConfigFile {
    // Legacy flat fields (still supported).
    convex_url: Option<String>,
    auth_token: Option<String>,
    node_name: Option<String>,

    // New profile fields.
    active_env: Option<String>,
    prod: Option<ProfileConfig>,
    dev: Option<ProfileConfig>,
}

pub fn config_path() -> PathBuf {
    dirs::config_dir()
        .expect("Could not determine config directory")
        .join("tina")
        .join("config.toml")
}

pub fn load_config() -> anyhow::Result<TinaConfig> {
    load_config_for_env(None)
}

pub fn load_config_for_env(env_override: Option<&str>) -> anyhow::Result<TinaConfig> {
    let path = config_path();
    if !path.exists() {
        anyhow::bail!(
            "Config file not found at {}. Run tina-daemon to create it.",
            path.display()
        );
    }
    let content = std::fs::read_to_string(&path)?;
    parse_config(&content, env_override)
}

fn parse_config(content: &str, env_override: Option<&str>) -> anyhow::Result<TinaConfig> {
    let file_config: ConfigFile = toml::from_str(content)?;
    let ConfigFile {
        convex_url,
        auth_token,
        node_name,
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

    Ok(TinaConfig {
        env,
        convex_url: resolved_convex_url,
        auth_token: resolved_auth_token,
        node_name: resolved_node_name,
    })
}

fn resolve_env(env_override: Option<&str>, active_env: Option<&str>) -> anyhow::Result<String> {
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
    use std::fs;

    #[test]
    fn test_config_path_ends_correctly() {
        let path = config_path();
        assert!(path.ends_with("tina/config.toml"));
    }

    #[test]
    fn test_load_config_missing_file() {
        // Default path likely doesn't exist in test env
        let result = load_config();
        // Either it succeeds (file exists) or fails with our message
        if let Err(e) = result {
            assert!(
                e.to_string().contains("Config file not found")
                    || e.to_string().contains("config.toml"),
            );
        }
    }

    #[test]
    fn test_parse_config_toml() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        fs::write(
            &path,
            r#"
convex_url = "https://test.convex.cloud"
auth_token = "secret"
node_name = "my-laptop"
"#,
        )
        .unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let config = parse_config(&content, Some("prod")).unwrap();
        assert_eq!(config.env, "prod");
        assert_eq!(
            config.convex_url,
            Some("https://test.convex.cloud".to_string())
        );
        assert_eq!(config.auth_token, Some("secret".to_string()));
        assert_eq!(config.node_name, Some("my-laptop".to_string()));
    }

    #[test]
    fn test_parse_config_toml_partial_legacy() {
        let toml_str = r#"convex_url = "https://test.convex.cloud""#;
        let config = parse_config(toml_str, Some("prod")).unwrap();
        assert_eq!(config.env, "prod");
        assert_eq!(
            config.convex_url,
            Some("https://test.convex.cloud".to_string())
        );
        assert_eq!(config.auth_token, None);
        assert_eq!(config.node_name, None);
    }

    #[test]
    fn test_parse_config_toml_empty() {
        let config = parse_config("", Some("prod")).unwrap();
        assert_eq!(config.env, "prod");
        assert_eq!(config.convex_url, None);
        assert_eq!(config.auth_token, None);
        assert_eq!(config.node_name, None);
    }

    #[test]
    fn test_parse_config_toml_uses_profile() {
        let toml_str = r#"
active_env = "dev"

[prod]
convex_url = "https://prod.convex.cloud"
auth_token = "prod-token"

[dev]
convex_url = "https://dev.convex.cloud"
auth_token = "dev-token"
node_name = "dev-node"
"#;
        let config = parse_config(toml_str, Some("dev")).unwrap();
        assert_eq!(config.env, "dev");
        assert_eq!(
            config.convex_url.as_deref(),
            Some("https://dev.convex.cloud")
        );
        assert_eq!(config.auth_token.as_deref(), Some("dev-token"));
        assert_eq!(config.node_name.as_deref(), Some("dev-node"));
    }

    #[test]
    fn test_parse_config_toml_explicit_env_override() {
        let toml_str = r#"
[prod]
convex_url = "https://prod.convex.cloud"
auth_token = "prod-token"

[dev]
convex_url = "https://dev.convex.cloud"
auth_token = "dev-token"
"#;
        let config = parse_config(toml_str, Some("prod")).unwrap();
        assert_eq!(config.env, "prod");
        assert_eq!(
            config.convex_url.as_deref(),
            Some("https://prod.convex.cloud")
        );
        assert_eq!(config.auth_token.as_deref(), Some("prod-token"));
    }

    #[test]
    fn test_parse_config_toml_invalid_env_errors() {
        let err = parse_config("", Some("staging")).unwrap_err();
        assert!(err.to_string().contains("Invalid Tina environment"));
    }
}
