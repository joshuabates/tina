use tina_session::watch;

pub fn run(
    feature: &str,
    phase: &str,
    timeout: Option<u64>,
    stream_interval: Option<u64>,
    team: Option<&str>,
) -> anyhow::Result<u8> {
    let runtime = super::runtime_context::resolve_phase_runtime_context(feature, phase, team)?;
    let cwd = runtime.cwd;
    let status_path = runtime.status_path;

    eprintln!("Waiting for phase {} completion...", phase);
    eprintln!("Watching: {}", status_path.display());

    let team_name = Some(runtime.team_name.as_str());
    let tmux_session = runtime.session_name;

    // Use streaming or simple wait based on interval
    let result = if let Some(interval) = stream_interval {
        if let Some(t) = team_name {
            eprintln!(
                "Streaming updates every {}s (tracking team: {})",
                interval, t
            );
        } else {
            eprintln!("Streaming updates every {}s", interval);
        }
        watch::watch_status_streaming(
            &status_path,
            &cwd,
            team_name,
            timeout,
            interval,
            Some(tmux_session.as_str()),
        )
    } else {
        watch::watch_status(&status_path, timeout, Some(tmux_session.as_str()))
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
