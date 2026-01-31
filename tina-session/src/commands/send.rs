use tina_session::session::naming::session_name;
use tina_session::tmux;

pub fn run(feature: &str, phase: &str, text: &str) -> anyhow::Result<u8> {
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

    tmux::send_keys(&name, text)?;
    println!("Sent to {}: {}", name, text);
    Ok(0)
}
