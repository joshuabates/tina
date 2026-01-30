//! Teams command handler

use crate::cli::OutputFormat;
use crate::data::{teams, tina_state};
use crate::TeamFilter;
use anyhow::Result;
use serde::Serialize;
use std::path::Path;

/// Team list entry for output
#[derive(Debug, Serialize)]
pub struct TeamListEntry {
    pub name: String,
    pub cwd: String,
    pub member_count: usize,
    pub is_orchestration: bool,
}

/// List all teams
pub fn list_teams(format: OutputFormat, filter: Option<TeamFilter>) -> Result<i32> {
    let team_names = teams::list_teams()?;

    let mut output = Vec::new();
    for name in team_names {
        let team = match teams::load_team(&name) {
            Ok(t) => t,
            Err(_) => continue, // Skip teams that can't be loaded
        };

        let cwd = team
            .members
            .first()
            .map(|m| m.cwd.display().to_string())
            .unwrap_or_default();

        // Check if this is an orchestration
        let is_orchestration = tina_state::load_supervisor_state(Path::new(&cwd))
            .unwrap_or(None)
            .is_some();

        // Apply filter
        if let Some(ref f) = filter {
            match f {
                TeamFilter::Orchestration if !is_orchestration => continue,
                TeamFilter::Phase if is_orchestration => continue,
                _ => {}
            }
        }

        output.push(TeamListEntry {
            name,
            cwd,
            member_count: team.members.len(),
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
            cwd: "/path/to/project".to_string(),
            member_count: 3,
            is_orchestration: true,
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"name\":\"test-team\""));
        assert!(json.contains("\"member_count\":3"));
        assert!(json.contains("\"is_orchestration\":true"));
    }
}
