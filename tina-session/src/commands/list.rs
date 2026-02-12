use tina_session::convex;

pub fn run() -> anyhow::Result<u8> {
    let orchestrations =
        convex::run_convex(|mut writer| async move { writer.list_orchestrations().await })?;

    if orchestrations.is_empty() {
        println!("No active orchestrations.");
        return Ok(0);
    }

    println!(
        "{:<20} {:<40} {:<10} {:<10}",
        "FEATURE", "WORKTREE", "PHASE", "STATUS"
    );
    println!("{}", "-".repeat(80));

    for orch in orchestrations {
        let phase = format!("{}/{}", orch.current_phase, orch.total_phases);

        let path_str = orch.worktree_path.as_deref().unwrap_or("?");
        let path_display = if path_str.len() > 38 {
            format!("...{}", &path_str[path_str.len() - 35..])
        } else {
            path_str.to_string()
        };

        println!(
            "{:<20} {:<40} {:<10} {:<10}",
            orch.feature_name, path_display, phase, orch.status
        );
    }

    Ok(0)
}
