use rusqlite::{params, Connection};

#[derive(Debug, Clone, PartialEq)]
pub struct Phase {
    pub id: Option<i64>,
    pub orchestration_id: String,
    pub phase_number: String,
    pub status: String,
    pub plan_path: Option<String>,
    pub git_range: Option<String>,
    pub planning_mins: Option<i32>,
    pub execution_mins: Option<i32>,
    pub review_mins: Option<i32>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

/// Upsert a phase record (insert or replace by orchestration_id + phase_number).
pub fn upsert(conn: &Connection, phase: &Phase) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO phases (orchestration_id, phase_number, status, plan_path, git_range, planning_mins, execution_mins, review_mins, started_at, completed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(orchestration_id, phase_number)
         DO UPDATE SET status = excluded.status,
                       plan_path = COALESCE(excluded.plan_path, plan_path),
                       git_range = COALESCE(excluded.git_range, git_range),
                       planning_mins = COALESCE(excluded.planning_mins, planning_mins),
                       execution_mins = COALESCE(excluded.execution_mins, execution_mins),
                       review_mins = COALESCE(excluded.review_mins, review_mins),
                       started_at = COALESCE(excluded.started_at, started_at),
                       completed_at = COALESCE(excluded.completed_at, completed_at)",
        params![
            phase.orchestration_id,
            phase.phase_number,
            phase.status,
            phase.plan_path,
            phase.git_range,
            phase.planning_mins,
            phase.execution_mins,
            phase.review_mins,
            phase.started_at,
            phase.completed_at,
        ],
    )?;
    Ok(())
}

/// List all phases for an orchestration, ordered by phase_number.
pub fn list_by_orchestration(conn: &Connection, orchestration_id: &str) -> rusqlite::Result<Vec<Phase>> {
    let mut stmt = conn.prepare(
        "SELECT id, orchestration_id, phase_number, status, plan_path, git_range, planning_mins, execution_mins, review_mins, started_at, completed_at
         FROM phases WHERE orchestration_id = ?1 ORDER BY phase_number",
    )?;
    let rows = stmt.query_map(params![orchestration_id], |row| {
        Ok(Phase {
            id: row.get(0)?,
            orchestration_id: row.get(1)?,
            phase_number: row.get(2)?,
            status: row.get(3)?,
            plan_path: row.get(4)?,
            git_range: row.get(5)?,
            planning_mins: row.get(6)?,
            execution_mins: row.get(7)?,
            review_mins: row.get(8)?,
            started_at: row.get(9)?,
            completed_at: row.get(10)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{orchestrations, projects, test_db};

    fn setup_orchestration(conn: &Connection) -> String {
        let pid = projects::find_or_create_by_repo_path(conn, "proj", "/repo").unwrap();
        let orch = orchestrations::Orchestration {
            id: "feat_2026-02-06T00:00:00Z".to_string(),
            project_id: pid,
            feature_name: "feat".to_string(),
            design_doc_path: "/docs/design.md".to_string(),
            branch: "tina/feat".to_string(),
            worktree_path: None,
            total_phases: 3,
            status: "planning".to_string(),
            started_at: "2026-02-06T00:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: None,
        };
        orchestrations::insert(conn, &orch).unwrap();
        orch.id
    }

    #[test]
    fn test_upsert_inserts_new() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        let phase = Phase {
            id: None,
            orchestration_id: orch_id.clone(),
            phase_number: "1".to_string(),
            status: "planning".to_string(),
            plan_path: None,
            git_range: None,
            planning_mins: None,
            execution_mins: None,
            review_mins: None,
            started_at: Some("2026-02-06T00:00:00Z".to_string()),
            completed_at: None,
        };

        upsert(&conn, &phase).expect("upsert should succeed");

        let phases = list_by_orchestration(&conn, &orch_id).unwrap();
        assert_eq!(phases.len(), 1);
        assert_eq!(phases[0].phase_number, "1");
        assert_eq!(phases[0].status, "planning");
    }

    #[test]
    fn test_upsert_updates_existing() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        let phase = Phase {
            id: None,
            orchestration_id: orch_id.clone(),
            phase_number: "1".to_string(),
            status: "planning".to_string(),
            plan_path: Some("/plan.md".to_string()),
            git_range: None,
            planning_mins: Some(5),
            execution_mins: None,
            review_mins: None,
            started_at: Some("2026-02-06T00:00:00Z".to_string()),
            completed_at: None,
        };
        upsert(&conn, &phase).unwrap();

        // Update the same phase
        let updated = Phase {
            id: None,
            orchestration_id: orch_id.clone(),
            phase_number: "1".to_string(),
            status: "executing".to_string(),
            plan_path: None, // Should keep existing plan_path via COALESCE
            git_range: None,
            planning_mins: None, // Should keep existing via COALESCE
            execution_mins: Some(10),
            review_mins: None,
            started_at: None, // Should keep existing via COALESCE
            completed_at: None,
        };
        upsert(&conn, &updated).unwrap();

        let phases = list_by_orchestration(&conn, &orch_id).unwrap();
        assert_eq!(phases.len(), 1);
        assert_eq!(phases[0].status, "executing");
        assert_eq!(phases[0].plan_path.as_deref(), Some("/plan.md"));
        assert_eq!(phases[0].planning_mins, Some(5));
        assert_eq!(phases[0].execution_mins, Some(10));
        assert_eq!(phases[0].started_at.as_deref(), Some("2026-02-06T00:00:00Z"));
    }

    #[test]
    fn test_list_by_orchestration() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        for n in ["1", "2", "3"] {
            let phase = Phase {
                id: None,
                orchestration_id: orch_id.clone(),
                phase_number: n.to_string(),
                status: "planning".to_string(),
                plan_path: None,
                git_range: None,
                planning_mins: None,
                execution_mins: None,
                review_mins: None,
                started_at: None,
                completed_at: None,
            };
            upsert(&conn, &phase).unwrap();
        }

        let phases = list_by_orchestration(&conn, &orch_id).unwrap();
        assert_eq!(phases.len(), 3);
        assert_eq!(phases[0].phase_number, "1");
        assert_eq!(phases[1].phase_number, "2");
        assert_eq!(phases[2].phase_number, "3");
    }
}
