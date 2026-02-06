use rusqlite::{params, Connection};

#[derive(Debug, Clone, PartialEq)]
pub struct TeamMember {
    pub id: Option<i64>,
    pub orchestration_id: String,
    pub phase_number: String,
    pub agent_name: String,
    pub agent_type: Option<String>,
    pub model: Option<String>,
    pub joined_at: Option<String>,
    pub recorded_at: String,
}

/// Upsert a team member record.
///
/// Uses (orchestration_id, phase_number, agent_name) as the logical key.
/// If a record with the same key exists, updates it; otherwise inserts.
pub fn upsert(conn: &Connection, member: &TeamMember) -> rusqlite::Result<()> {
    // Check if exists
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM team_members WHERE orchestration_id = ?1 AND phase_number = ?2 AND agent_name = ?3",
            params![member.orchestration_id, member.phase_number, member.agent_name],
            |row| row.get(0),
        )
        .ok();

    match existing {
        Some(id) => {
            conn.execute(
                "UPDATE team_members SET agent_type = ?1, model = ?2, joined_at = ?3, recorded_at = ?4 WHERE id = ?5",
                params![member.agent_type, member.model, member.joined_at, member.recorded_at, id],
            )?;
        }
        None => {
            conn.execute(
                "INSERT INTO team_members (orchestration_id, phase_number, agent_name, agent_type, model, joined_at, recorded_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    member.orchestration_id,
                    member.phase_number,
                    member.agent_name,
                    member.agent_type,
                    member.model,
                    member.joined_at,
                    member.recorded_at,
                ],
            )?;
        }
    }
    Ok(())
}

/// List all team members for an orchestration.
pub fn list_by_orchestration(conn: &Connection, orchestration_id: &str) -> rusqlite::Result<Vec<TeamMember>> {
    let mut stmt = conn.prepare(
        "SELECT id, orchestration_id, phase_number, agent_name, agent_type, model, joined_at, recorded_at
         FROM team_members WHERE orchestration_id = ?1 ORDER BY phase_number, agent_name",
    )?;
    let rows = stmt.query_map(params![orchestration_id], |row| {
        Ok(TeamMember {
            id: row.get(0)?,
            orchestration_id: row.get(1)?,
            phase_number: row.get(2)?,
            agent_name: row.get(3)?,
            agent_type: row.get(4)?,
            model: row.get(5)?,
            joined_at: row.get(6)?,
            recorded_at: row.get(7)?,
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
    fn test_upsert_team_member() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        let member = TeamMember {
            id: None,
            orchestration_id: orch_id.clone(),
            phase_number: "1".to_string(),
            agent_name: "researcher".to_string(),
            agent_type: Some("general-purpose".to_string()),
            model: Some("claude-opus-4-6".to_string()),
            joined_at: Some("2026-02-06T00:00:00Z".to_string()),
            recorded_at: "2026-02-06T00:00:00Z".to_string(),
        };

        upsert(&conn, &member).expect("upsert should succeed");

        let members = list_by_orchestration(&conn, &orch_id).unwrap();
        assert_eq!(members.len(), 1);
        assert_eq!(members[0].agent_name, "researcher");
        assert_eq!(members[0].agent_type.as_deref(), Some("general-purpose"));

        // Upsert again with updated model - should not create duplicate
        let updated = TeamMember {
            model: Some("claude-sonnet-4-5".to_string()),
            recorded_at: "2026-02-06T00:01:00Z".to_string(),
            ..member
        };
        upsert(&conn, &updated).unwrap();

        let members = list_by_orchestration(&conn, &orch_id).unwrap();
        assert_eq!(members.len(), 1);
        assert_eq!(members[0].model.as_deref(), Some("claude-sonnet-4-5"));
    }

    #[test]
    fn test_list_by_orchestration() {
        let conn = test_db();
        let orch_id = setup_orchestration(&conn);

        let member1 = TeamMember {
            id: None,
            orchestration_id: orch_id.clone(),
            phase_number: "1".to_string(),
            agent_name: "alpha".to_string(),
            agent_type: None,
            model: None,
            joined_at: None,
            recorded_at: "2026-02-06T00:00:00Z".to_string(),
        };
        let member2 = TeamMember {
            agent_name: "beta".to_string(),
            ..member1.clone()
        };

        upsert(&conn, &member1).unwrap();
        upsert(&conn, &member2).unwrap();

        let members = list_by_orchestration(&conn, &orch_id).unwrap();
        assert_eq!(members.len(), 2);
        // Ordered by phase_number then agent_name
        assert_eq!(members[0].agent_name, "alpha");
        assert_eq!(members[1].agent_name, "beta");
    }
}
