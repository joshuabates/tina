//! Task file parsing module

use crate::{Task, TaskStatus};
use anyhow::{Context, Result};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

/// Get the tasks directory path
pub fn tasks_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".claude")
        .join("tasks")
}

/// Get the tasks directory under a specific base directory
pub fn tasks_dir_in(base: &std::path::Path) -> PathBuf {
    base.join(".claude").join("tasks")
}

/// Load all tasks for a session
pub fn load_tasks(session_id: &str) -> Result<Vec<Task>> {
    load_tasks_in(&tasks_dir(), session_id)
}

/// Load all tasks for a session from a specific tasks directory
pub fn load_tasks_in(tasks_dir: &std::path::Path, session_id: &str) -> Result<Vec<Task>> {
    let session_dir = tasks_dir.join(session_id);
    if !session_dir.exists() {
        return Ok(vec![]);
    }

    let mut tasks = Vec::new();
    for entry in fs::read_dir(&session_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            let content = fs::read_to_string(&path)
                .with_context(|| format!("Failed to read task: {}", path.display()))?;
            let task: Task = serde_json::from_str(&content)
                .with_context(|| format!("Failed to parse task: {}", path.display()))?;
            tasks.push(task);
        }
    }

    // Sort by ID (numeric if possible)
    tasks.sort_by(|a, b| match (a.id.parse::<u32>(), b.id.parse::<u32>()) {
        (Ok(a_num), Ok(b_num)) => a_num.cmp(&b_num),
        _ => a.id.cmp(&b.id),
    });

    Ok(tasks)
}

/// Task summary statistics
#[derive(Debug, Clone, Serialize)]
pub struct TaskSummary {
    pub total: usize,
    pub completed: usize,
    pub in_progress: usize,
    pub pending: usize,
    pub blocked: usize,
}

impl TaskSummary {
    pub fn from_tasks(tasks: &[Task]) -> Self {
        let mut summary = TaskSummary {
            total: tasks.len(),
            completed: 0,
            in_progress: 0,
            pending: 0,
            blocked: 0,
        };

        for task in tasks {
            match task.status {
                TaskStatus::Completed => summary.completed += 1,
                TaskStatus::InProgress => summary.in_progress += 1,
                TaskStatus::Pending => {
                    if task.blocked_by.is_empty() {
                        summary.pending += 1;
                    } else {
                        summary.blocked += 1;
                    }
                }
            }
        }

        summary
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_task(dir: &std::path::Path, id: &str, status: &str) {
        let task_json = format!(
            r#"{{
                "id": "{}",
                "subject": "Task {}",
                "description": "Test task",
                "activeForm": "Working on task {}",
                "status": "{}",
                "owner": null,
                "blocks": [],
                "blockedBy": [],
                "metadata": {{}}
            }}"#,
            id, id, id, status
        );
        fs::write(dir.join(format!("{}.json", id)), task_json).unwrap();
    }

    #[allow(dead_code)]
    fn create_blocked_task(dir: &std::path::Path, id: &str, blocked_by: &str) {
        let task_json = format!(
            r#"{{
                "id": "{}",
                "subject": "Task {}",
                "description": "Test task",
                "activeForm": "Working on task {}",
                "status": "pending",
                "owner": null,
                "blocks": [],
                "blockedBy": ["{}"],
                "metadata": {{}}
            }}"#,
            id, id, id, blocked_by
        );
        fs::write(dir.join(format!("{}.json", id)), task_json).unwrap();
    }

    #[test]
    fn test_load_tasks_from_session_dir() {
        let temp_dir = TempDir::new().unwrap();
        let session_dir = temp_dir.path().join("session-abc");
        fs::create_dir_all(&session_dir).unwrap();

        create_test_task(&session_dir, "1", "completed");
        create_test_task(&session_dir, "2", "in_progress");
        create_test_task(&session_dir, "3", "pending");

        // Test the logic of loading tasks
        let mut tasks = Vec::new();
        for entry in fs::read_dir(&session_dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                let content = fs::read_to_string(&path).unwrap();
                let task: Task = serde_json::from_str(&content).unwrap();
                tasks.push(task);
            }
        }
        tasks.sort_by(|a, b| a.id.cmp(&b.id));

        assert_eq!(tasks.len(), 3);
        assert_eq!(tasks[0].status, TaskStatus::Completed);
        assert_eq!(tasks[1].status, TaskStatus::InProgress);
        assert_eq!(tasks[2].status, TaskStatus::Pending);
    }

    #[test]
    fn test_task_sorting_numeric() {
        let temp_dir = TempDir::new().unwrap();
        let session_dir = temp_dir.path();

        create_test_task(session_dir, "10", "pending");
        create_test_task(session_dir, "2", "pending");
        create_test_task(session_dir, "1", "pending");

        let mut tasks = Vec::new();
        for entry in fs::read_dir(session_dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                let content = fs::read_to_string(&path).unwrap();
                let task: Task = serde_json::from_str(&content).unwrap();
                tasks.push(task);
            }
        }

        // Sort numerically
        tasks.sort_by(|a, b| match (a.id.parse::<u32>(), b.id.parse::<u32>()) {
            (Ok(a_num), Ok(b_num)) => a_num.cmp(&b_num),
            _ => a.id.cmp(&b.id),
        });

        assert_eq!(tasks[0].id, "1");
        assert_eq!(tasks[1].id, "2");
        assert_eq!(tasks[2].id, "10");
    }

    #[test]
    fn test_task_summary_from_tasks() {
        let tasks = vec![
            Task {
                id: "1".to_string(),
                subject: "Task 1".to_string(),
                description: "".to_string(),
                active_form: None,
                status: TaskStatus::Completed,
                owner: None,
                blocks: vec![],
                blocked_by: vec![],
                metadata: serde_json::Value::Null,
            },
            Task {
                id: "2".to_string(),
                subject: "Task 2".to_string(),
                description: "".to_string(),
                active_form: None,
                status: TaskStatus::Completed,
                owner: None,
                blocks: vec![],
                blocked_by: vec![],
                metadata: serde_json::Value::Null,
            },
            Task {
                id: "3".to_string(),
                subject: "Task 3".to_string(),
                description: "".to_string(),
                active_form: None,
                status: TaskStatus::InProgress,
                owner: None,
                blocks: vec![],
                blocked_by: vec![],
                metadata: serde_json::Value::Null,
            },
            Task {
                id: "4".to_string(),
                subject: "Task 4".to_string(),
                description: "".to_string(),
                active_form: None,
                status: TaskStatus::Pending,
                owner: None,
                blocks: vec![],
                blocked_by: vec![],
                metadata: serde_json::Value::Null,
            },
            Task {
                id: "5".to_string(),
                subject: "Task 5".to_string(),
                description: "".to_string(),
                active_form: None,
                status: TaskStatus::Pending,
                owner: None,
                blocks: vec![],
                blocked_by: vec!["3".to_string()],
                metadata: serde_json::Value::Null,
            },
        ];

        let summary = TaskSummary::from_tasks(&tasks);

        assert_eq!(summary.total, 5);
        assert_eq!(summary.completed, 2);
        assert_eq!(summary.in_progress, 1);
        assert_eq!(summary.pending, 1);
        assert_eq!(summary.blocked, 1);
    }

    #[test]
    fn test_empty_session() {
        let _temp_dir = TempDir::new().unwrap();
        // Empty session - should return empty vec
        let tasks: Vec<Task> = vec![];
        let summary = TaskSummary::from_tasks(&tasks);
        assert_eq!(summary.total, 0);
    }
}
