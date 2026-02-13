use tina_session::convex;

pub fn run(
    orchestration_id: &str,
    team_name: &str,
    lead_session_id: &str,
    local_dir_name: &str,
    tmux_session_name: Option<&str>,
    phase_number: Option<&str>,
    parent_team_id: Option<&str>,
) -> anyhow::Result<u8> {
    let team_id = convex::run_convex(|mut writer| async move {
        let args = convex::RegisterTeamArgs {
            team_name: team_name.to_string(),
            orchestration_id: orchestration_id.to_string(),
            lead_session_id: lead_session_id.to_string(),
            local_dir_name: local_dir_name.to_string(),
            tmux_session_name: tmux_session_name.map(|s| s.to_string()),
            phase_number: phase_number.map(|s| s.to_string()),
            parent_team_id: parent_team_id.map(|s| s.to_string()),
            created_at: chrono::Utc::now().timestamp_millis() as f64,
        };
        writer.register_team(&args).await
    })?;

    let output = serde_json::json!({
        "team_id": team_id,
        "team_name": team_name,
        "orchestration_id": orchestration_id,
    });
    println!("{}", serde_json::to_string(&output)?);

    Ok(0)
}
