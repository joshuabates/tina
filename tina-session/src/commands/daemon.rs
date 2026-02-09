use std::path::Path;

use tina_session::daemon::{self, DaemonLaunchOptions};

pub fn start(env: Option<&str>, daemon_bin: Option<&Path>) -> anyhow::Result<u8> {
    let options = DaemonLaunchOptions {
        env: env.map(str::to_string),
        daemon_bin: daemon_bin.map(Path::to_path_buf),
    };
    let pid = daemon::start_with_options(&options)?;
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

pub fn run_with_options(env: Option<&str>, daemon_bin: Option<&Path>) -> anyhow::Result<u8> {
    let options = DaemonLaunchOptions {
        env: env.map(str::to_string),
        daemon_bin: daemon_bin.map(Path::to_path_buf),
    };
    daemon::run_foreground_with_options(&options)?;
    Ok(0)
}
