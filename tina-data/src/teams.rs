//! Team configuration parsing module

use crate::Team;
use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};

/// Get the teams directory path
pub fn teams_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".claude")
        .join("teams")
}

/// Get the teams directory under a specific base directory
pub fn teams_dir_in(base: &Path) -> PathBuf {
    base.join(".claude").join("teams")
}

/// Load a team by name
pub fn load_team(name: &str) -> Result<Team> {
    load_team_in(&teams_dir(), name)
}

/// Load a team by name from a specific teams directory
pub fn load_team_in(teams_dir: &Path, name: &str) -> Result<Team> {
    let config_path = teams_dir.join(name).join("config.json");
    let content = fs::read_to_string(&config_path)
        .with_context(|| format!("Failed to read team config: {}", config_path.display()))?;
    let team: Team = serde_json::from_str(&content)
        .with_context(|| format!("Failed to parse team config: {}", config_path.display()))?;
    Ok(team)
}

/// List all team names
pub fn list_teams() -> Result<Vec<String>> {
    list_teams_in(&teams_dir())
}

/// List all team names from a specific teams directory
pub fn list_teams_in(dir: &Path) -> Result<Vec<String>> {
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut teams = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            if let Some(name) = entry.file_name().to_str() {
                // Verify config.json exists
                if entry.path().join("config.json").exists() {
                    teams.push(name.to_string());
                }
            }
        }
    }
    teams.sort();
    Ok(teams)
}

/// Find all teams whose members work in the given worktree path
/// Excludes orchestration teams (which work in the main repo, not the worktree)
pub fn find_teams_for_worktree(worktree_path: &std::path::Path) -> Result<Vec<Team>> {
    find_teams_for_worktree_in(&teams_dir(), worktree_path)
}

/// Find all teams whose members work in the given worktree path, searching in a specific teams directory
pub fn find_teams_for_worktree_in(dir: &Path, worktree_path: &std::path::Path) -> Result<Vec<Team>> {
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut teams = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        let config_path = entry.path().join("config.json");
        if !config_path.exists() {
            continue;
        }

        // Try to load and check the team
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(team) = serde_json::from_str::<Team>(&content) {
                // Check if first member's cwd matches the worktree
                if let Some(member) = team.members.first() {
                    if member.cwd == worktree_path {
                        // Skip orchestration teams
                        if !team.name.ends_with("-orchestration") {
                            teams.push(team);
                        }
                    }
                }
            }
        }
    }

    Ok(teams)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_team(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
        let team_dir = dir.join(name);
        fs::create_dir_all(&team_dir).unwrap();
        let config = format!(
            r#"{{
                "name": "{}",
                "description": "Test team",
                "createdAt": 1706644800000,
                "leadAgentId": "leader@{}",
                "leadSessionId": "session-123",
                "members": [{{
                    "agentId": "leader@{}",
                    "name": "leader",
                    "agentType": "team-lead",
                    "model": "claude-opus-4-5-20251101",
                    "joinedAt": 1706644800000,
                    "tmuxPaneId": null,
                    "cwd": "/path/to/project",
                    "subscriptions": []
                }}]
            }}"#,
            name, name, name
        );
        let config_path = team_dir.join("config.json");
        fs::write(&config_path, config).unwrap();
        team_dir
    }

    #[test]
    fn test_load_team_from_fixture() {
        let temp_dir = TempDir::new().unwrap();
        create_test_team(temp_dir.path(), "test-team");

        // We can't easily mock teams_dir(), but we can test the parsing logic
        let config_path = temp_dir.path().join("test-team").join("config.json");
        let content = fs::read_to_string(&config_path).unwrap();
        let team: Team = serde_json::from_str(&content).unwrap();

        assert_eq!(team.name, "test-team");
        assert_eq!(team.members.len(), 1);
    }

    #[test]
    fn test_list_teams_empty_dir() {
        let temp_dir = TempDir::new().unwrap();
        let mut teams = Vec::new();
        for entry in fs::read_dir(temp_dir.path()).unwrap() {
            let entry = entry.unwrap();
            if entry.file_type().unwrap().is_dir() {
                if entry.path().join("config.json").exists() {
                    teams.push(entry.file_name().to_string_lossy().to_string());
                }
            }
        }
        assert!(teams.is_empty());
    }

    #[test]
    fn test_list_teams_with_teams() {
        let temp_dir = TempDir::new().unwrap();
        create_test_team(temp_dir.path(), "team-a");
        create_test_team(temp_dir.path(), "team-b");
        // Create a dir without config.json - should be ignored
        fs::create_dir_all(temp_dir.path().join("not-a-team")).unwrap();

        let mut teams = Vec::new();
        for entry in fs::read_dir(temp_dir.path()).unwrap() {
            let entry = entry.unwrap();
            if entry.file_type().unwrap().is_dir() {
                if entry.path().join("config.json").exists() {
                    teams.push(entry.file_name().to_string_lossy().to_string());
                }
            }
        }
        teams.sort();

        assert_eq!(teams, vec!["team-a", "team-b"]);
    }

    #[test]
    fn test_malformed_json_error() {
        let temp_dir = TempDir::new().unwrap();
        let team_dir = temp_dir.path().join("bad-team");
        fs::create_dir_all(&team_dir).unwrap();
        fs::write(team_dir.join("config.json"), "{ invalid json }").unwrap();

        let content = fs::read_to_string(team_dir.join("config.json")).unwrap();
        let result: std::result::Result<Team, _> = serde_json::from_str(&content);
        assert!(result.is_err());
    }
}
