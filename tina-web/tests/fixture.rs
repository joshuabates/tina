use std::sync::Arc;

use tempfile::TempDir;
use tina_web::state::AppState;

/// Creates a complete orchestration fixture backed by a temp SQLite database.
#[allow(dead_code)]
pub struct FixtureBuilder {
    /// Kept alive to prevent temp directory cleanup
    dir: TempDir,
    state: Arc<AppState>,
}

impl FixtureBuilder {
    pub fn new() -> Self {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let state = AppState::open(&db_path);

        Self { dir, state }
    }

    pub fn state(&self) -> Arc<AppState> {
        self.state.clone()
    }

    /// Insert a project into the database. Returns project id.
    pub async fn add_project(&self, name: &str, repo_path: &str) -> i64 {
        let conn = self.state.conn().await;
        tina_data::db::find_or_create_by_repo_path(&conn, name, repo_path).unwrap()
    }

    /// Insert an orchestration into the database.
    pub async fn add_orchestration(
        &self,
        id: &str,
        project_id: i64,
        feature_name: &str,
        total_phases: i32,
        status: &str,
    ) -> &Self {
        let conn = self.state.conn().await;
        let orch = tina_data::db::Orchestration {
            id: id.to_string(),
            project_id,
            feature_name: feature_name.to_string(),
            design_doc_path: format!("docs/plans/{}.md", feature_name),
            branch: format!("feature/{}", feature_name),
            worktree_path: None,
            total_phases,
            status: status.to_string(),
            started_at: "2026-01-30T10:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: None,
        };
        tina_session::db::orchestrations::insert(&conn, &orch).unwrap();
        self
    }

    /// Insert a phase record.
    #[allow(dead_code)]
    pub async fn add_phase(
        &self,
        orchestration_id: &str,
        phase_number: &str,
        status: &str,
    ) -> &Self {
        let conn = self.state.conn().await;
        let phase = tina_data::db::Phase {
            id: None,
            orchestration_id: orchestration_id.to_string(),
            phase_number: phase_number.to_string(),
            status: status.to_string(),
            plan_path: None,
            git_range: None,
            planning_mins: None,
            execution_mins: None,
            review_mins: None,
            started_at: Some("2026-01-30T10:00:00Z".to_string()),
            completed_at: None,
        };
        tina_session::db::phases::upsert(&conn, &phase).unwrap();
        self
    }

    /// Insert task events.
    pub async fn add_task_events(
        &self,
        orchestration_id: &str,
        phase_number: Option<&str>,
        tasks: &[(&str, &str, &str)], // (task_id, subject, status)
    ) -> &Self {
        let conn = self.state.conn().await;
        for (task_id, subject, status) in tasks {
            let event = tina_data::db::TaskEvent {
                id: None,
                orchestration_id: orchestration_id.to_string(),
                phase_number: phase_number.map(|s| s.to_string()),
                task_id: task_id.to_string(),
                subject: subject.to_string(),
                description: Some("Test task".to_string()),
                status: status.to_string(),
                owner: None,
                blocked_by: None,
                metadata: None,
                recorded_at: "2026-01-30T10:00:00Z".to_string(),
            };
            tina_session::db::task_events::insert_event(&conn, &event).unwrap();
        }
        self
    }

    /// Insert team members.
    pub async fn add_team_members(
        &self,
        orchestration_id: &str,
        phase_number: &str,
        members: &[(&str, &str)], // (agent_name, agent_type)
    ) -> &Self {
        let conn = self.state.conn().await;
        for (agent_name, agent_type) in members {
            let member = tina_data::db::TeamMember {
                id: None,
                orchestration_id: orchestration_id.to_string(),
                phase_number: phase_number.to_string(),
                agent_name: agent_name.to_string(),
                agent_type: Some(agent_type.to_string()),
                model: Some("claude-opus-4-6".to_string()),
                joined_at: Some("2026-01-30T10:00:00Z".to_string()),
                recorded_at: "2026-01-30T10:00:00Z".to_string(),
            };
            tina_session::db::team_members::upsert(&conn, &member).unwrap();
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fixture_creates_project() {
        let fixture = FixtureBuilder::new();
        let id = fixture.add_project("test-proj", "/path/to/repo").await;
        assert!(id > 0);
    }

    #[tokio::test]
    async fn test_fixture_creates_orchestration() {
        let fixture = FixtureBuilder::new();
        let pid = fixture.add_project("proj", "/repo").await;
        fixture
            .add_orchestration("feat_2026", pid, "feat", 3, "executing")
            .await;

        let state = fixture.state();
        let conn = state.conn().await;
        let orchs = tina_data::db::list_orchestrations(&conn).unwrap();
        assert_eq!(orchs.len(), 1);
        assert_eq!(orchs[0].feature_name, "feat");
    }
}
