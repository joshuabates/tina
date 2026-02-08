//! Teams command handler

use crate::cli::OutputFormat;
use crate::config::Config;
use crate::data::ConvexDataSource;
use crate::TeamFilter;
use anyhow::{anyhow, Result};
use serde::Serialize;

/// Team list entry for output
#[derive(Debug, Serialize)]
pub struct TeamListEntry {
    pub name: String,
    pub worktree_path: String,
    pub member_count: usize,
    pub is_orchestration: bool,
}

/// List all teams (orchestrations in Convex model)
pub fn list_teams(format: OutputFormat, filter: Option<TeamFilter>) -> Result<i32> {
    let config = Config::load()?;
    if config.convex.url.is_empty() {
        return Err(anyhow!("Convex URL not configured in config.toml"));
    }

    let rt = tokio::runtime::Runtime::new()?;
    let orchestrations = rt.block_on(async {
        let mut ds = ConvexDataSource::new(&config.convex.url).await?;
        ds.list_orchestrations().await
    })?;

    let mut output = Vec::new();
    for orch in orchestrations {
        let worktree_path = orch.worktree_path.display().to_string();

        // In Convex model, all entries are orchestrations
        let is_orchestration = true;

        // Apply filter
        if let Some(ref f) = filter {
            match f {
                TeamFilter::Orchestration if !is_orchestration => continue,
                TeamFilter::Phase if is_orchestration => continue,
                _ => {}
            }
        }

        output.push(TeamListEntry {
            name: orch.team_name(),
            worktree_path,
            member_count: orch.members.len(),
            is_orchestration,
        });
    }

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&output)?);
        }
        OutputFormat::Text => {
            if output.is_empty() {
                println!("No teams found");
            } else {
                println!("{:<30} {:>8} {:>12}", "NAME", "MEMBERS", "TYPE");
                println!("{:-<30} {:->8} {:->12}", "", "", "");
                for entry in &output {
                    let team_type = if entry.is_orchestration {
                        "orchestration"
                    } else {
                        "phase"
                    };
                    println!(
                        "{:<30} {:>8} {:>12}",
                        entry.name, entry.member_count, team_type
                    );
                }
            }
        }
    }

    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_team_list_entry_serialization() {
        let entry = TeamListEntry {
            name: "test-team".to_string(),
            worktree_path: "/path/to/project".to_string(),
            member_count: 3,
            is_orchestration: true,
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"name\":\"test-team\""));
        assert!(json.contains("\"member_count\":3"));
        assert!(json.contains("\"is_orchestration\":true"));
    }
}
