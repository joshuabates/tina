use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

/// Creates a complete orchestration fixture in a temp directory.
/// The TempDir must be kept alive for the duration of the test.
pub struct FixtureBuilder {
    dir: TempDir,
}

impl FixtureBuilder {
    pub fn new() -> Self {
        Self {
            dir: TempDir::new().unwrap(),
        }
    }

    /// Get the base directory path (equivalent to home dir)
    pub fn base_dir(&self) -> PathBuf {
        self.dir.path().to_path_buf()
    }

    /// Create a team with config.json
    pub fn add_team(
        &self,
        team_name: &str,
        worktree_path: &Path,
        members: &[(&str, &str)], // (name, agent_type)
    ) -> &Self {
        let team_dir = self
            .dir
            .path()
            .join(".claude")
            .join("teams")
            .join(team_name);
        fs::create_dir_all(&team_dir).unwrap();

        let members_json: Vec<String> = members
            .iter()
            .map(|(name, agent_type)| {
                format!(
                    r#"{{
                        "agentId": "{}@{}",
                        "name": "{}",
                        "agentType": "{}",
                        "model": "claude-opus-4-5-20251101",
                        "joinedAt": 1706644800000,
                        "tmuxPaneId": null,
                        "cwd": "{}",
                        "subscriptions": []
                    }}"#,
                    name,
                    team_name,
                    name,
                    agent_type,
                    worktree_path.display()
                )
            })
            .collect();

        let lead_name = members.first().map(|(n, _)| *n).unwrap_or("leader");
        let config = format!(
            r#"{{
                "name": "{}",
                "description": "Test team",
                "createdAt": 1706644800000,
                "leadAgentId": "{}@{}",
                "leadSessionId": "{}",
                "members": [{}]
            }}"#,
            team_name,
            lead_name,
            team_name,
            team_name,
            members_json.join(",")
        );
        fs::write(team_dir.join("config.json"), config).unwrap();
        self
    }

    /// Create a supervisor-state.json in a worktree
    pub fn add_supervisor_state(
        &self,
        worktree_path: &Path,
        feature: &str,
        total_phases: u32,
        current_phase: u32,
        status: &str,
    ) -> &Self {
        let tina_dir = worktree_path.join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();

        let state = format!(
            r#"{{
                "version": 1,
                "feature": "{}",
                "design_doc": "docs/plans/design.md",
                "worktree_path": "{}",
                "branch": "feature/{}",
                "total_phases": {},
                "current_phase": {},
                "status": "{}",
                "orchestration_started_at": "2026-01-30T10:00:00Z",
                "phases": {{}},
                "timing": {{}}
            }}"#,
            feature,
            worktree_path.display(),
            feature,
            total_phases,
            current_phase,
            status
        );
        fs::write(tina_dir.join("supervisor-state.json"), state).unwrap();
        self
    }

    /// Create a session lookup in {base}/.claude/tina-sessions/
    pub fn add_session_lookup(&self, feature: &str, worktree_path: &Path) -> &Self {
        let sessions_dir = self.dir.path().join(".claude").join("tina-sessions");
        fs::create_dir_all(&sessions_dir).unwrap();

        let lookup = format!(
            r#"{{
                "feature": "{}",
                "cwd": "{}",
                "created_at": "2026-01-30T10:00:00Z"
            }}"#,
            feature,
            worktree_path.display()
        );
        fs::write(sessions_dir.join(format!("{}.json", feature)), lookup).unwrap();
        self
    }

    /// Create task files for a team
    pub fn add_tasks(
        &self,
        session_id: &str,
        tasks: &[(&str, &str, &str)], // (id, subject, status)
    ) -> &Self {
        let tasks_dir = self
            .dir
            .path()
            .join(".claude")
            .join("tasks")
            .join(session_id);
        fs::create_dir_all(&tasks_dir).unwrap();

        for (id, subject, status) in tasks {
            let task_json = format!(
                r#"{{
                    "id": "{}",
                    "subject": "{}",
                    "description": "Test task",
                    "activeForm": "Working on {}",
                    "status": "{}",
                    "owner": null,
                    "blocks": [],
                    "blockedBy": [],
                    "metadata": {{}}
                }}"#,
                id, subject, subject, status
            );
            fs::write(tasks_dir.join(format!("{}.json", id)), task_json).unwrap();
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixture_creates_files() {
        let fixture = FixtureBuilder::new();
        let worktree = fixture.base_dir().join("worktrees").join("test-project");
        fixture.add_team(
            "test-orchestration",
            &worktree,
            &[("leader", "team-lead")],
        );
        fixture.add_supervisor_state(&worktree, "test-feature", 3, 2, "executing");

        assert!(fixture
            .base_dir()
            .join(".claude/teams/test-orchestration/config.json")
            .exists());
        assert!(worktree
            .join(".claude/tina/supervisor-state.json")
            .exists());
    }

    #[test]
    fn test_fixture_creates_tasks() {
        let fixture = FixtureBuilder::new();
        fixture.add_tasks(
            "test-team",
            &[
                ("1", "Task one", "completed"),
                ("2", "Task two", "in_progress"),
            ],
        );

        let tasks_dir = fixture.base_dir().join(".claude/tasks/test-team");
        assert!(tasks_dir.join("1.json").exists());
        assert!(tasks_dir.join("2.json").exists());
    }

    #[test]
    fn test_fixture_creates_session_lookup() {
        let fixture = FixtureBuilder::new();
        let worktree = fixture.base_dir().join("worktrees").join("my-feature");
        fixture.add_session_lookup("my-feature", &worktree);

        assert!(fixture
            .base_dir()
            .join(".claude/tina-sessions/my-feature.json")
            .exists());
    }
}
