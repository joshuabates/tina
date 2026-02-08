use tina_session::session::lookup::SessionLookup;
use tina_session::state::schema::SupervisorState;

pub fn run() -> anyhow::Result<u8> {
    let lookups = SessionLookup::list_all()?;

    if lookups.is_empty() {
        println!("No active orchestrations.");
        return Ok(0);
    }

    println!("{:<20} {:<40} {:<10} {:<10}", "FEATURE", "WORKTREE", "PHASE", "STATUS");
    println!("{}", "-".repeat(80));

    for lookup in lookups {
        let (phase, status) = match SupervisorState::load(&lookup.feature) {
            Ok(state) => (
                format!("{}/{}", state.current_phase, state.total_phases),
                format!("{:?}", state.status).to_lowercase(),
            ),
            Err(_) => ("?".to_string(), "unknown".to_string()),
        };

        let path_str = lookup.worktree_path.display().to_string();
        let path_display = if path_str.len() > 38 {
            format!("...{}", &path_str[path_str.len() - 35..])
        } else {
            path_str
        };

        println!("{:<20} {:<40} {:<10} {:<10}", lookup.feature, path_display, phase, status);
    }

    Ok(0)
}
