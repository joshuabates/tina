use tina_session::session::naming::session_name;
use tina_session::tmux;

pub fn run(feature: &str, phase: &str) -> anyhow::Result<u8> {
    let name = session_name(feature, phase);
    if tmux::session_exists(&name) {
        Ok(0) // exists
    } else {
        Ok(1) // does not exist
    }
}
