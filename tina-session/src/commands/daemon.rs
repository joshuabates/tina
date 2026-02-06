use tina_session::daemon;

pub fn start() -> anyhow::Result<u8> {
    let pid = daemon::start()?;
    println!("Daemon started (pid {})", pid);
    Ok(0)
}

pub fn stop() -> anyhow::Result<u8> {
    daemon::stop()?;
    println!("Daemon stopped");
    Ok(0)
}

pub fn status() -> anyhow::Result<u8> {
    match daemon::status() {
        Some(pid) => {
            println!("Daemon is running (pid {})", pid);
            Ok(0)
        }
        None => {
            println!("Daemon is not running");
            Ok(1)
        }
    }
}

pub fn run() -> anyhow::Result<u8> {
    daemon::run_foreground()?;
    Ok(0)
}
