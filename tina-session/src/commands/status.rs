use tina_session::session::lookup::SessionLookup;
use tina_session::watch::{get_current_status, get_last_commit, get_task_progress, StatusUpdate};

pub fn run(feature: &str, phase: &str, team: Option<&str>) -> anyhow::Result<u8> {
    let lookup = SessionLookup::load(feature)?;
    let cwd = &lookup.worktree_path;

    // Construct status file path
    let status_path = cwd
        .join(".claude")
        .join("tina")
        .join(format!("phase-{}", phase))
        .join("status.json");

    // Derive team name if not provided: {feature}-phase-{phase}
    let derived_team;
    let team_name = match team {
        Some(t) => Some(t),
        None => {
            derived_team = format!("{}-phase-{}", feature, phase);
            Some(derived_team.as_str())
        }
    };

    // Get current status
    let status = get_current_status(&status_path);
    let (tasks_complete, tasks_total, current_task) = get_task_progress(team_name);
    let last_commit = get_last_commit(cwd);

    // Check if complete/blocked for git_range/blocked_reason
    let (git_range, blocked_reason) = if status_path.exists() {
        if let Ok(contents) = std::fs::read_to_string(&status_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                let git_range = json
                    .get("git_range")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let blocked_reason = json
                    .get("blocked_reason")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                (git_range, blocked_reason)
            } else {
                (None, None)
            }
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    let update = StatusUpdate {
        elapsed_secs: 0, // Not applicable for one-shot
        status,
        tasks_complete,
        tasks_total,
        current_task,
        last_commit,
        git_range,
        blocked_reason,
    };

    println!("{}", serde_json::to_string(&update)?);

    Ok(0)
}
