use std::process::Command;

use tina_session::session::naming::session_name;
use tina_session::tmux;

pub fn run(feature: &str, phase: u32) -> anyhow::Result<u8> {
    let name = session_name(feature, phase);

    if !tmux::session_exists(&name) {
        anyhow::bail!("Session '{}' does not exist", name);
    }

    // Replace current process with tmux attach
    let status = Command::new("tmux")
        .args(["attach", "-t", &name])
        .status()?;

    Ok(status.code().unwrap_or(1) as u8)
}
