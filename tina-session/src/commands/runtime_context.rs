use std::path::PathBuf;

use tina_session::convex;
use tina_session::session::naming::session_name;

/// Runtime context derived from feature + phase for phase-level commands.
#[derive(Debug, Clone)]
pub struct PhaseRuntimeContext {
    pub cwd: PathBuf,
    pub status_path: PathBuf,
    pub team_name: String,
    pub session_name: String,
}

/// Resolve Convex orchestration data and common local paths/names for a phase command.
pub fn resolve_phase_runtime_context(
    feature: &str,
    phase: &str,
    team: Option<&str>,
) -> anyhow::Result<PhaseRuntimeContext> {
    let orchestration =
        convex::run_convex(|mut writer| async move { writer.get_by_feature(feature).await })?
            .ok_or_else(|| anyhow::anyhow!("No orchestration found for feature '{}'", feature))?;

    let cwd = PathBuf::from(
        orchestration
            .worktree_path
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("Orchestration has no worktree_path"))?,
    );

    let status_path = cwd
        .join(".claude")
        .join("tina")
        .join(format!("phase-{}", phase))
        .join("status.json");

    let team_name = team
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("{}-phase-{}", feature, phase));
    let session_name = session_name(feature, phase);

    Ok(PhaseRuntimeContext {
        cwd,
        status_path,
        team_name,
        session_name,
    })
}
