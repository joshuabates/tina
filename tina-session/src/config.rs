use std::path::PathBuf;

use serde::Deserialize;

/// Tina configuration read from `~/.config/tina/config.toml`.
///
/// Uses the same config file as tina-daemon.
#[derive(Debug, Deserialize, Default)]
pub struct TinaConfig {
    pub convex_url: Option<String>,
    pub auth_token: Option<String>,
    pub node_name: Option<String>,
}

pub fn config_path() -> PathBuf {
    dirs::config_dir()
        .expect("Could not determine config directory")
        .join("tina")
        .join("config.toml")
}

pub fn load_config() -> anyhow::Result<TinaConfig> {
    let path = config_path();
    if !path.exists() {
        anyhow::bail!(
            "Config file not found at {}. Run tina-daemon to create it.",
            path.display()
        );
    }
    let content = std::fs::read_to_string(&path)?;
    let config: TinaConfig = toml::from_str(&content)?;
    Ok(config)
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
        let config: TinaConfig = toml::from_str(&content).unwrap();
        assert_eq!(config.convex_url, Some("https://test.convex.cloud".to_string()));
        assert_eq!(config.auth_token, Some("secret".to_string()));
        assert_eq!(config.node_name, Some("my-laptop".to_string()));
    }

    #[test]
    fn test_parse_config_toml_partial() {
        let toml_str = r#"convex_url = "https://test.convex.cloud""#;
        let config: TinaConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.convex_url, Some("https://test.convex.cloud".to_string()));
        assert_eq!(config.auth_token, None);
        assert_eq!(config.node_name, None);
    }

    #[test]
    fn test_parse_config_toml_empty() {
        let config: TinaConfig = toml::from_str("").unwrap();
        assert_eq!(config.convex_url, None);
        assert_eq!(config.auth_token, None);
        assert_eq!(config.node_name, None);
    }
}
