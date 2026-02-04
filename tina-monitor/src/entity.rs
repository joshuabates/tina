//! Entity system for representing selectable items and their actions
//!
//! Entities wrap TeamMember, Task, and Commit types to provide a unified
//! interface for actions and quicklook display.

use crate::git::commits::Commit;
use crate::types::{Task, TeamMember};

/// A selectable entity in the TUI
#[derive(Debug, Clone, PartialEq)]
pub enum Entity {
    TeamMember(TeamMember),
    Task(Task),
    Commit(Commit),
}

/// Actions that can be performed on entities
#[derive(Debug, Clone, PartialEq)]
pub enum EntityAction {
    /// Attach to a tmux pane
    AttachTmux { pane_id: String },
    /// Send a command to a tmux pane
    SendCommand { pane_id: String, command: String },
    /// View task details (handled by quicklook)
    ViewTaskDetail { task_id: String },
    /// Jump to the owner of a task
    JumpToOwner { owner: String },
    /// View git diff for a commit
    ViewDiff { sha: String },
    /// Copy SHA to clipboard
    CopySha { sha: String },
}

impl Entity {
    /// Get available actions for this entity as (key, label, action) tuples
    pub fn available_actions(&self) -> Vec<(char, &'static str, EntityAction)> {
        match self {
            Entity::TeamMember(m) => {
                let mut actions = Vec::new();
                if let Some(pane_id) = &m.tmux_pane_id {
                    actions.push((
                        'a',
                        "Attach",
                        EntityAction::AttachTmux {
                            pane_id: pane_id.clone(),
                        },
                    ));
                    actions.push((
                        's',
                        "Send",
                        EntityAction::SendCommand {
                            pane_id: pane_id.clone(),
                            command: String::new(),
                        },
                    ));
                }
                actions
            }
            Entity::Task(t) => {
                let mut actions = vec![(
                    'i',
                    "Inspect",
                    EntityAction::ViewTaskDetail {
                        task_id: t.id.clone(),
                    },
                )];
                if let Some(owner) = &t.owner {
                    actions.push((
                        'o',
                        "Jump to owner",
                        EntityAction::JumpToOwner {
                            owner: owner.clone(),
                        },
                    ));
                }
                actions
            }
            Entity::Commit(c) => vec![
                (
                    'd',
                    "View diff",
                    EntityAction::ViewDiff {
                        sha: c.hash.clone(),
                    },
                ),
                (
                    'y',
                    "Copy SHA",
                    EntityAction::CopySha {
                        sha: c.hash.clone(),
                    },
                ),
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::TaskStatus;
    use std::path::PathBuf;

    fn create_team_member(name: &str, pane_id: Option<String>) -> TeamMember {
        TeamMember {
            agent_id: format!("agent-{}", name),
            name: name.to_string(),
            agent_type: Some("test".to_string()),
            model: "claude-opus".to_string(),
            joined_at: 0,
            tmux_pane_id: pane_id,
            cwd: PathBuf::from("/test"),
            subscriptions: vec![],
        }
    }

    fn create_task(id: &str, owner: Option<&str>) -> Task {
        Task {
            id: id.to_string(),
            subject: format!("Task {}", id),
            description: "Test task".to_string(),
            active_form: None,
            status: TaskStatus::Pending,
            owner: owner.map(|s| s.to_string()),
            blocks: vec![],
            blocked_by: vec![],
            metadata: serde_json::Value::Null,
        }
    }

    fn create_commit(sha: &str) -> Commit {
        Commit {
            short_hash: sha[..7].to_string(),
            hash: sha.to_string(),
            subject: "Test commit".to_string(),
            author: "Test".to_string(),
            relative_time: "now".to_string(),
        }
    }

    #[test]
    fn team_member_with_pane_has_attach_and_send_actions() {
        let member = create_team_member("alice", Some("0".to_string()));
        let entity = Entity::TeamMember(member);
        let actions = entity.available_actions();

        assert_eq!(actions.len(), 2);
        assert_eq!(actions[0].0, 'a');
        assert_eq!(actions[0].1, "Attach");
        assert_eq!(actions[1].0, 's');
        assert_eq!(actions[1].1, "Send");
    }

    #[test]
    fn team_member_without_pane_has_no_actions() {
        let member = create_team_member("bob", None);
        let entity = Entity::TeamMember(member);
        let actions = entity.available_actions();

        assert!(actions.is_empty());
    }

    #[test]
    fn task_has_inspect_action() {
        let task = create_task("task-1", None);
        let entity = Entity::Task(task);
        let actions = entity.available_actions();

        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].0, 'i');
        assert_eq!(actions[0].1, "Inspect");
    }

    #[test]
    fn task_with_owner_has_jump_to_owner_action() {
        let task = create_task("task-1", Some("alice"));
        let entity = Entity::Task(task);
        let actions = entity.available_actions();

        assert_eq!(actions.len(), 2);
        assert_eq!(actions[1].0, 'o');
        assert_eq!(actions[1].1, "Jump to owner");
    }

    #[test]
    fn commit_has_diff_and_copy_actions() {
        let commit = create_commit("abc1234567890");
        let entity = Entity::Commit(commit);
        let actions = entity.available_actions();

        assert_eq!(actions.len(), 2);
        assert_eq!(actions[0].0, 'd');
        assert_eq!(actions[0].1, "View diff");
        assert_eq!(actions[1].0, 'y');
        assert_eq!(actions[1].1, "Copy SHA");
    }
}
