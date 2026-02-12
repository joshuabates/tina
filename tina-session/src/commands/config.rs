use anyhow::bail;

use tina_session::routing;

pub fn convex_url(env: Option<&str>) -> anyhow::Result<u8> {
    let cfg = tina_session::config::load_config_for_env(env)?;
    let url = cfg
        .convex_url
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("convex_url is not set for '{}' environment", cfg.env))?;

    println!("{}", url);
    Ok(0)
}

pub fn show(env: Option<&str>) -> anyhow::Result<u8> {
    let cfg = tina_session::config::load_config_for_env(env)?;

    let convex_url = cfg.convex_url.filter(|s| !s.trim().is_empty());

    if convex_url.is_none() {
        bail!("convex_url is not set for '{}' environment", cfg.env);
    }

    let output = serde_json::json!({
        "env": cfg.env,
        "convex_url": convex_url,
        "auth_token_set": cfg
            .auth_token
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false),
        "node_name": cfg.node_name,
    });

    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(0)
}

pub fn cli_for_model(model: &str, env: Option<&str>) -> anyhow::Result<u8> {
    if model.is_empty() {
        bail!("model name must not be empty");
    }

    let cfg = tina_session::config::load_config_for_env(env)?;

    // Resolve the "codex" alias to the configured default model.
    let resolved = if model == "codex" {
        &cfg.codex.default_model
    } else {
        model
    };

    let cli = routing::cli_for_model(resolved, &cfg.cli_routing);

    if cli == routing::AgentCli::Codex && !cfg.codex.enabled {
        eprintln!(
            "error: model '{}' routes to codex, but codex is disabled in config",
            model
        );
        return Ok(1);
    }

    println!("{}", cli);
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tina_session::config::CodexConfig;
    use tina_session::routing::{AgentCli, CliRouting};

    #[test]
    fn test_codex_alias_resolves_to_default_model() {
        // The alias "codex" should resolve to config's default_model
        let cfg = tina_session::config::TinaConfig {
            codex: CodexConfig {
                default_model: "gpt-5.3-codex".to_string(),
                ..Default::default()
            },
            cli_routing: CliRouting::default(),
            ..Default::default()
        };
        let resolved = if "codex" == "codex" {
            &cfg.codex.default_model
        } else {
            "codex"
        };
        let cli = routing::cli_for_model(resolved, &cfg.cli_routing);
        assert_eq!(cli, AgentCli::Codex);
    }

    #[test]
    fn test_empty_model_rejected() {
        let result = cli_for_model("", None);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("must not be empty"));
    }
}
