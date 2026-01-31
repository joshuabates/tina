use tina_session::session::naming::session_name;
use tina_session::tmux;

pub fn run(feature: &str, phase: &str) -> anyhow::Result<u8> {
    let name = session_name(feature, phase);

    if !tmux::session_exists(&name) {
        println!("Session '{}' does not exist.", name);
        return Ok(0);
    }

    tmux::kill_session(&name)?;
    println!("Stopped session '{}'", name);
    Ok(0)
}
