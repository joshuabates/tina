use tina_session::session::lookup::SessionLookup;
use tina_session::session::naming::session_name;
use tina_session::watch;

pub fn run(
    feature: &str,
    phase: &str,
    timeout: Option<u64>,
    stream_interval: Option<u64>,
    team: Option<&str>,
) -> anyhow::Result<u8> {
    // Load lookup to get cwd
    let lookup = SessionLookup::load(feature)?;
    let cwd = &lookup.cwd;

    // Construct status file path
    let status_path = cwd
        .join(".claude")
        .join("tina")
        .join(format!("phase-{}", phase))
        .join("status.json");

    eprintln!("Waiting for phase {} completion...", phase);
    eprintln!("Watching: {}", status_path.display());

    // Derive team name if not provided: {feature}-phase-{phase}
    let derived_team;
    let team_name = match team {
        Some(t) => Some(t),
        None => {
            derived_team = format!("{}-phase-{}", feature, phase);
            Some(derived_team.as_str())
        }
    };

    // Derive tmux session name for health checking
    let tmux_session = session_name(feature, phase);

    // Use streaming or simple wait based on interval
    let result = if let Some(interval) = stream_interval {
        if let Some(t) = team_name {
            eprintln!("Streaming updates every {}s (tracking team: {})", interval, t);
        } else {
            eprintln!("Streaming updates every {}s", interval);
        }
        watch::watch_status_streaming(
            &status_path,
            cwd,
            team_name,
            timeout,
            interval,
            Some(&tmux_session),
        )
    } else {
        watch::watch_status(&status_path, timeout, Some(&tmux_session))
    };

    match result {
        Ok(result) => {
            // Output final JSON to stdout (streaming already outputs updates)
            if stream_interval.is_none() {
                println!("{}", serde_json::to_string(&result)?);
            }

            // Return exit code based on status
            match result.status.as_str() {
                "complete" => Ok(0),
                "blocked" => Ok(1),
                "session_died" => Ok(3),
                _ => Ok(1),
            }
        }
        Err(e) => {
            eprintln!("Error: {}", e);
            // Timeout
            let result = watch::WaitResult {
                status: "timeout".to_string(),
                git_range: None,
                reason: Some(e.to_string()),
            };
            println!("{}", serde_json::to_string(&result)?);
            Ok(2)
        }
    }
}
