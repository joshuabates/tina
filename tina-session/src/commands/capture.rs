use tina_session::session::naming::session_name;
use tina_session::tmux;

pub fn run(feature: &str, phase: &str, lines: u32) -> anyhow::Result<u8> {
    let name = session_name(feature, phase);

    if !tmux::session_exists(&name) {
        anyhow::bail!(
            "Session '{}' does not exist.\n\
             \n\
             To list active sessions: tina-session list\n\
             To start a new session: tina-session start --feature {} --phase {} --plan <path>",
            name,
            feature,
            phase
        );
    }

    let content = tmux::capture_pane_lines(&name, lines)?;
    print!("{}", content);
    Ok(0)
}
