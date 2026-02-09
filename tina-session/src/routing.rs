use std::fmt;

use serde::Deserialize;

/// Which CLI tool to use for running an agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentCli {
    Claude,
    Codex,
}

impl fmt::Display for AgentCli {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AgentCli::Claude => write!(f, "claude"),
            AgentCli::Codex => write!(f, "codex"),
        }
    }
}

/// Configurable routing rules that determine which CLI handles a given model.
#[derive(Debug, Clone, Deserialize)]
pub struct CliRouting {
    /// Model names that route to Codex exactly.
    #[serde(default = "default_codex_exact")]
    pub codex_exact: Vec<String>,

    /// Model name prefixes that route to Codex.
    #[serde(default = "default_codex_prefixes")]
    pub codex_prefixes: Vec<String>,
}

fn default_codex_exact() -> Vec<String> {
    vec!["codex".to_string()]
}

fn default_codex_prefixes() -> Vec<String> {
    vec![
        "gpt-".to_string(),
        "o1-".to_string(),
        "o3-".to_string(),
        "o4-".to_string(),
    ]
}

impl Default for CliRouting {
    fn default() -> Self {
        Self {
            codex_exact: default_codex_exact(),
            codex_prefixes: default_codex_prefixes(),
        }
    }
}

/// Determine which CLI should handle the given model name.
pub fn cli_for_model(model: &str, routing: &CliRouting) -> AgentCli {
    if routing.codex_exact.iter().any(|e| e == model) {
        return AgentCli::Codex;
    }
    if routing
        .codex_prefixes
        .iter()
        .any(|p| model.starts_with(p.as_str()))
    {
        return AgentCli::Codex;
    }
    AgentCli::Claude
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match_routes_to_codex() {
        let routing = CliRouting::default();
        assert_eq!(cli_for_model("codex", &routing), AgentCli::Codex);
    }

    #[test]
    fn prefix_match_routes_to_codex() {
        let routing = CliRouting::default();
        assert_eq!(cli_for_model("gpt-5.3-codex", &routing), AgentCli::Codex);
    }

    #[test]
    fn anthropic_models_route_to_claude() {
        let routing = CliRouting::default();
        assert_eq!(cli_for_model("opus", &routing), AgentCli::Claude);
        assert_eq!(cli_for_model("haiku", &routing), AgentCli::Claude);
    }

    #[test]
    fn empty_routing_defaults_to_claude() {
        let routing = CliRouting {
            codex_exact: vec![],
            codex_prefixes: vec![],
        };
        assert_eq!(cli_for_model("codex", &routing), AgentCli::Claude);
        assert_eq!(cli_for_model("gpt-5.3-codex", &routing), AgentCli::Claude);
    }

    #[test]
    fn custom_exact_list() {
        let routing = CliRouting {
            codex_exact: vec!["my-model".to_string()],
            codex_prefixes: vec![],
        };
        assert_eq!(cli_for_model("my-model", &routing), AgentCli::Codex);
        assert_eq!(cli_for_model("codex", &routing), AgentCli::Claude);
    }

    #[test]
    fn display_impl() {
        assert_eq!(AgentCli::Claude.to_string(), "claude");
        assert_eq!(AgentCli::Codex.to_string(), "codex");
    }

    #[test]
    fn o1_o3_o4_prefixes_route_to_codex() {
        let routing = CliRouting::default();
        assert_eq!(cli_for_model("o1-preview", &routing), AgentCli::Codex);
        assert_eq!(cli_for_model("o3-mini", &routing), AgentCli::Codex);
        assert_eq!(cli_for_model("o4-mini", &routing), AgentCli::Codex);
    }
}
