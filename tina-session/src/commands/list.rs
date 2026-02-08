use tina_session::session::lookup::SessionLookup;
use tina_session::state::schema::SupervisorState;

pub fn run() -> anyhow::Result<u8> {
    let lookups = SessionLookup::list_all()?;

    if lookups.is_empty() {
        println!("No active orchestrations.");
        return Ok(0);
    }

    println!("{:<20} {:<40} {:<10} {:<10}", "FEATURE", "CWD", "PHASE", "STATUS");
    println!("{}", "-".repeat(80));

    for lookup in lookups {
        let (phase, status) = match SupervisorState::load(&lookup.feature) {
            Ok(state) => (
                format!("{}/{}", state.current_phase, state.total_phases),
                format!("{:?}", state.status).to_lowercase(),
            ),
            Err(_) => ("?".to_string(), "unknown".to_string()),
        };

        // Truncate cwd if too long
        let cwd_str = lookup.cwd.display().to_string();
        let cwd_display = if cwd_str.len() > 38 {
            format!("...{}", &cwd_str[cwd_str.len() - 35..])
        } else {
            cwd_str
        };

        println!("{:<20} {:<40} {:<10} {:<10}", lookup.feature, cwd_display, phase, status);
    }

    Ok(0)
}
