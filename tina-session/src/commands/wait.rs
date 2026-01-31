use tina_session::session::lookup::SessionLookup;
use tina_session::watch;

pub fn run(feature: &str, phase: u32, timeout: Option<u64>) -> anyhow::Result<u8> {
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

    // Watch for completion
    match watch::watch_status(&status_path, timeout) {
        Ok(result) => {
            // Output JSON to stdout
            println!("{}", serde_json::to_string(&result)?);

            // Return exit code based on status
            match result.status.as_str() {
                "complete" => Ok(0),
                "blocked" => Ok(1),
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
