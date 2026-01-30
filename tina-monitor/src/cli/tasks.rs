//! Tasks command handler

use crate::cli::OutputFormat;
use crate::data::{tasks, teams, types::TaskStatus};
use crate::TaskStatusFilter;
use anyhow::Result;
use serde::Serialize;

/// Task list entry for output
#[derive(Debug, Serialize)]
pub struct TaskListEntry {
    pub id: String,
    pub subject: String,
    pub status: TaskStatus,
    pub owner: Option<String>,
    pub blocked_by: Vec<String>,
}

/// List tasks for a team
pub fn list_tasks(
    team_name: &str,
    format: OutputFormat,
    status_filter: Option<TaskStatusFilter>,
) -> Result<i32> {
    let team = teams::load_team(team_name)?;
    let mut task_list = tasks::load_tasks(&team.lead_session_id)?;

    // Apply status filter
    if let Some(filter) = status_filter {
        let target_status = match filter {
            TaskStatusFilter::Pending => TaskStatus::Pending,
            TaskStatusFilter::InProgress => TaskStatus::InProgress,
            TaskStatusFilter::Completed => TaskStatus::Completed,
        };
        task_list.retain(|t| t.status == target_status);
    }

    let output: Vec<TaskListEntry> = task_list
        .into_iter()
        .map(|t| TaskListEntry {
            id: t.id,
            subject: t.subject,
            status: t.status,
            owner: t.owner,
            blocked_by: t.blocked_by,
        })
        .collect();

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&output)?);
        }
        OutputFormat::Text => {
            if output.is_empty() {
                println!("No tasks found");
            } else {
                println!("{:<6} {:<12} {:<40}", "ID", "STATUS", "SUBJECT");
                println!("{:-<6} {:-<12} {:-<40}", "", "", "");
                for entry in &output {
                    let status_str = match entry.status {
                        TaskStatus::Pending => {
                            if entry.blocked_by.is_empty() {
                                "pending"
                            } else {
                                "blocked"
                            }
                        }
                        TaskStatus::InProgress => "in_progress",
                        TaskStatus::Completed => "completed",
                    };
                    // Truncate subject if too long
                    let subject = if entry.subject.len() > 40 {
                        format!("{}...", &entry.subject[..37])
                    } else {
                        entry.subject.clone()
                    };
                    println!("{:<6} {:<12} {:<40}", entry.id, status_str, subject);
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
    fn test_task_list_entry_serialization() {
        let entry = TaskListEntry {
            id: "1".to_string(),
            subject: "Test task".to_string(),
            status: TaskStatus::InProgress,
            owner: Some("worker".to_string()),
            blocked_by: vec![],
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"id\":\"1\""));
        assert!(json.contains("\"status\":\"in_progress\""));
        assert!(json.contains("\"owner\":\"worker\""));
    }
}
