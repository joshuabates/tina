use tina_session::convex;

pub fn run(feature: &str) -> anyhow::Result<u8> {
    let orch = convex::run_convex(|mut writer| async move { writer.get_by_feature(feature).await })?;

    let Some(home) = dirs::home_dir() else {
        anyhow::bail!("Could not determine home directory for local cleanup");
    };

    let teams_root = home.join(".claude").join("teams");
    let tasks_root = home.join(".claude").join("tasks");

    let orchestration_team = format!("{}-orchestration", feature);
    let phase_prefix = format!("{}-phase-", feature);

    let mut removed_any = false;

    let mut remove_if_exists = |path: std::path::PathBuf| -> anyhow::Result<()> {
        if path.exists() {
            std::fs::remove_dir_all(&path)?;
            println!("Removed {}", path.display());
            removed_any = true;
        }
        Ok(())
    };

    // Remove orchestration team/task directories.
    remove_if_exists(teams_root.join(&orchestration_team))?;
    remove_if_exists(tasks_root.join(&orchestration_team))?;

    // Remove phase team/task directories for this feature.
    if teams_root.is_dir() {
        for entry in std::fs::read_dir(&teams_root)? {
            let entry = entry?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with(&phase_prefix) {
                remove_if_exists(entry.path())?;
            }
        }
    }
    if tasks_root.is_dir() {
        for entry in std::fs::read_dir(&tasks_root)? {
            let entry = entry?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with(&phase_prefix) {
                remove_if_exists(entry.path())?;
            }
        }
    }

    if !removed_any {
        println!("No local team/task state found for '{}'.", feature);
    }

    match orch {
        Some(o) => {
            println!(
                "Convex orchestration '{}' ({}) still exists. Local runtime artifacts were cleaned only.",
                feature, o.id
            );
            Ok(0)
        }
        None => {
            println!(
                "No Convex orchestration found for '{}'. Local cleanup complete.",
                feature
            );
            Ok(0)
        }
    }
}
