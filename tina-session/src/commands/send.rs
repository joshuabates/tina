use tina_session::session::naming::session_name;
use tina_session::tmux;

pub fn run(feature: &str, phase: u32, text: &str) -> anyhow::Result<u8> {
    let name = session_name(feature, phase);

    if !tmux::session_exists(&name) {
        anyhow::bail!("Session '{}' does not exist", name);
    }

    tmux::send_keys(&name, text)?;
    println!("Sent to {}: {}", name, text);
    Ok(0)
}
