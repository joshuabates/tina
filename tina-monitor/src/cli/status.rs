//! Status command handlers

use crate::config::Config;
use crate::data::{ConvexDataSource, MonitorOrchestrationStatus, TaskSummary};
use crate::types::*;
use anyhow::{anyhow, Result};
use serde::Serialize;

/// Output format for commands
#[derive(Debug, Clone, Copy)]
pub enum OutputFormat {
    Text,
    Json,
}

/// Check condition for exit codes
#[derive(Debug, Clone, Copy)]
pub enum CheckCondition {
    Complete,
    Blocked,
    Executing,
}

/// Team status output for JSON format
#[derive(Debug, Serialize)]
pub struct TeamStatusOutput {
    pub team_name: String,
    pub status: String,
    pub tasks: TaskSummary,
    pub blocked_reason: Option<String>,
}

/// Handle `status team <name>` command
///
/// In the Convex model, "teams" map to orchestrations. We find the orchestration
/// whose feature_name matches and derive team status from it.
pub fn status_team(name: &str, format: OutputFormat, check: Option<CheckCondition>) -> Result<i32> {
    let config = Config::load()?;
    if config.convex.url.is_empty() {
        return Err(anyhow!("Convex URL not configured in config.toml"));
    }

    let rt = tokio::runtime::Runtime::new()?;
    let orchestrations = rt.block_on(async {
        let mut ds = ConvexDataSource::new(&config.convex.url).await?;
        ds.list_orchestrations().await
    })?;

    // Find by feature name or team name pattern
    let orch = orchestrations
        .into_iter()
        .find(|o| {
            o.feature_name == name
                || o.team_name() == name
                || o.feature_name == name.trim_end_matches("-orchestration")
        })
        .ok_or_else(|| anyhow!("Team/orchestration not found: {}", name))?;

    let summary = TaskSummary::from_tasks(&orch.tasks);
    let (status, blocked_reason) = derive_team_status(&orch.tasks, &summary);

    let output = TeamStatusOutput {
        team_name: orch.team_name(),
        status: status.clone(),
        tasks: summary,
        blocked_reason: blocked_reason.clone(),
    };

    if let Some(condition) = check {
        let matches = match condition {
            CheckCondition::Complete => status == "complete",
            CheckCondition::Blocked => status == "blocked",
            CheckCondition::Executing => status == "executing",
        };
        return Ok(if matches { 0 } else { 1 });
    }

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&output)?);
        }
        OutputFormat::Text => {
            println!("Team: {}", output.team_name);
            println!("Status: {}", output.status);
            println!();
            println!("Tasks:");
            println!("  Total: {}", output.tasks.total);
            println!("  Completed: {}", output.tasks.completed);
            println!("  In Progress: {}", output.tasks.in_progress);
            println!("  Pending: {}", output.tasks.pending);
            println!("  Blocked: {}", output.tasks.blocked);
            if let Some(reason) = &output.blocked_reason {
                println!();
                println!("Blocked: {}", reason);
            }
        }
    }

    Ok(0)
}

fn derive_team_status(tasks: &[Task], summary: &TaskSummary) -> (String, Option<String>) {
    if summary.total == 0 {
        return ("idle".to_string(), None);
    }

    if summary.completed == summary.total {
        return ("complete".to_string(), None);
    }

    if summary.in_progress > 0 {
        return ("executing".to_string(), None);
    }

    if summary.blocked > 0 && summary.in_progress == 0 {
        let blocked_tasks: Vec<_> = tasks
            .iter()
            .filter(|t| t.status == TaskStatus::Pending && !t.blocked_by.is_empty())
            .map(|t| t.id.clone())
            .collect();
        let reason = format!("Tasks {} are blocked", blocked_tasks.join(", "));
        return ("blocked".to_string(), Some(reason));
    }

    ("idle".to_string(), None)
}

/// Orchestration status output for JSON format
#[derive(Debug, Serialize)]
pub struct OrchestrationStatusOutput {
    pub feature_name: String,
    pub worktree_path: String,
    pub current_phase: u32,
    pub total_phases: u32,
    pub spec_doc_path: String,
    pub status: MonitorOrchestrationStatus,
    pub tasks: TaskSummary,
}

/// Handle `status orchestration <name>` command
pub fn status_orchestration(
    name: &str,
    format: OutputFormat,
    check: Option<CheckCondition>,
) -> Result<i32> {
    let config = Config::load()?;
    if config.convex.url.is_empty() {
        return Err(anyhow!("Convex URL not configured in config.toml"));
    }

    let rt = tokio::runtime::Runtime::new()?;
    let orchestrations = rt.block_on(async {
        let mut ds = ConvexDataSource::new(&config.convex.url).await?;
        ds.list_orchestrations().await
    })?;

    let orch = orchestrations
        .into_iter()
        .find(|o| {
            o.feature_name == name
                || o.team_name() == name
                || o.feature_name == name.trim_end_matches("-orchestration")
        })
        .ok_or_else(|| anyhow!("Orchestration not found: {}", name))?;

    let summary = TaskSummary::from_tasks(&orch.tasks);

    let output = OrchestrationStatusOutput {
        feature_name: orch.feature_name.clone(),
        worktree_path: orch.worktree_path.display().to_string(),
        current_phase: orch.current_phase,
        total_phases: orch.total_phases,
        spec_doc_path: orch.spec_doc_path.display().to_string(),
        status: orch.status.clone(),
        tasks: summary.clone(),
    };

    let status_str = orch.status.to_string();

    if let Some(condition) = check {
        let matches = match condition {
            CheckCondition::Complete => status_str == "complete",
            CheckCondition::Blocked => status_str == "blocked",
            CheckCondition::Executing => status_str == "executing",
        };
        return Ok(if matches { 0 } else { 1 });
    }

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&output)?);
        }
        OutputFormat::Text => {
            println!("Orchestration: {}", output.feature_name);
            println!("Worktree: {}", output.worktree_path);
            println!("Phase: {}/{}", output.current_phase, output.total_phases);
            println!("Spec Doc: {}", output.spec_doc_path);
            println!("Status: {}", output.status);
            println!();
            println!("Tasks:");
            println!("  Total: {}", summary.total);
            println!("  Completed: {}", summary.completed);
            println!("  In Progress: {}", summary.in_progress);
            println!("  Pending: {}", summary.pending);
            println!("  Blocked: {}", summary.blocked);
        }
    }

    Ok(0)
}

/// Task status output for JSON format
#[derive(Debug, Serialize)]
pub struct TaskStatusOutput {
    pub id: String,
    pub subject: String,
    pub description: String,
    pub status: TaskStatus,
    pub owner: Option<String>,
    pub blocked_by: Vec<String>,
    pub metadata: serde_json::Value,
}

/// Handle `status task <team> <id>` command
pub fn status_task(team_name: &str, task_id: &str, format: OutputFormat) -> Result<i32> {
    let config = Config::load()?;
    if config.convex.url.is_empty() {
        return Err(anyhow!("Convex URL not configured in config.toml"));
    }

    let rt = tokio::runtime::Runtime::new()?;
    let orchestrations = rt.block_on(async {
        let mut ds = ConvexDataSource::new(&config.convex.url).await?;
        ds.list_orchestrations().await
    })?;

    // Find orchestration by team name
    let orch = orchestrations
        .into_iter()
        .find(|o| {
            o.feature_name == team_name
                || o.team_name() == team_name
                || o.feature_name == team_name.trim_end_matches("-orchestration")
        })
        .ok_or_else(|| anyhow!("Team/orchestration not found: {}", team_name))?;

    let task = orch
        .tasks
        .into_iter()
        .find(|t| t.id == task_id)
        .ok_or_else(|| anyhow!("Task not found: {} in team {}", task_id, team_name))?;

    let output = TaskStatusOutput {
        id: task.id,
        subject: task.subject,
        description: task.description,
        status: task.status,
        owner: task.owner,
        blocked_by: task.blocked_by,
        metadata: task.metadata,
    };

    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&output)?);
        }
        OutputFormat::Text => {
            println!("Task: {} - {}", output.id, output.subject);
            println!("Status: {:?}", output.status);
            if let Some(owner) = &output.owner {
                println!("Owner: {}", owner);
            }
            if !output.blocked_by.is_empty() {
                println!("Blocked by: {}", output.blocked_by.join(", "));
            }
            println!();
            println!("Description:");
            println!("{}", output.description);
        }
    }

    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_task(id: &str, status: TaskStatus, blocked_by: Vec<String>) -> Task {
        Task {
            id: id.to_string(),
            subject: format!("Task {}", id),
            description: "".to_string(),
            active_form: None,
            status,
            owner: None,
            blocks: vec![],
            blocked_by,
            metadata: serde_json::Value::Null,
        }
    }

    #[test]
    fn test_derive_team_status_complete() {
        let tasks = vec![
            make_task("1", TaskStatus::Completed, vec![]),
            make_task("2", TaskStatus::Completed, vec![]),
        ];
        let summary = TaskSummary::from_tasks(&tasks);

        let (status, reason) = derive_team_status(&tasks, &summary);
        assert_eq!(status, "complete");
        assert!(reason.is_none());
    }

    #[test]
    fn test_derive_team_status_executing() {
        let tasks = vec![
            make_task("1", TaskStatus::Completed, vec![]),
            make_task("2", TaskStatus::InProgress, vec![]),
        ];
        let summary = TaskSummary::from_tasks(&tasks);

        let (status, reason) = derive_team_status(&tasks, &summary);
        assert_eq!(status, "executing");
        assert!(reason.is_none());
    }

    #[test]
    fn test_derive_team_status_blocked() {
        let tasks = vec![
            make_task("1", TaskStatus::Completed, vec![]),
            make_task("2", TaskStatus::Pending, vec!["external".to_string()]),
        ];
        let summary = TaskSummary::from_tasks(&tasks);

        let (status, reason) = derive_team_status(&tasks, &summary);
        assert_eq!(status, "blocked");
        assert!(reason.is_some());
        assert!(reason.unwrap().contains("2"));
    }

    #[test]
    fn test_derive_team_status_idle_empty() {
        let tasks: Vec<Task> = vec![];
        let summary = TaskSummary::from_tasks(&tasks);

        let (status, reason) = derive_team_status(&tasks, &summary);
        assert_eq!(status, "idle");
        assert!(reason.is_none());
    }

    #[test]
    fn test_derive_team_status_idle_pending() {
        let tasks = vec![
            make_task("1", TaskStatus::Completed, vec![]),
            make_task("2", TaskStatus::Pending, vec![]),
        ];
        let summary = TaskSummary::from_tasks(&tasks);

        let (status, reason) = derive_team_status(&tasks, &summary);
        assert_eq!(status, "idle");
        assert!(reason.is_none());
    }

    #[test]
    fn test_team_status_output_serialization() {
        let output = TeamStatusOutput {
            team_name: "test-team".to_string(),
            status: "executing".to_string(),
            tasks: TaskSummary {
                total: 5,
                completed: 3,
                in_progress: 1,
                pending: 1,
                blocked: 0,
            },
            blocked_reason: None,
        };

        let json = serde_json::to_string(&output).unwrap();
        assert!(json.contains("\"team_name\":\"test-team\""));
        assert!(json.contains("\"status\":\"executing\""));
        assert!(json.contains("\"total\":5"));
    }
}
