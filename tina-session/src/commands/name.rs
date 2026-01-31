use tina_session::session::naming::session_name;

pub fn run(feature: &str, phase: &str) -> anyhow::Result<u8> {
    println!("{}", session_name(feature, phase));
    Ok(0)
}
