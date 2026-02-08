pub mod watcher;

use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Command;

/// Returns the PID file path: `~/.local/share/tina/daemon.pid`
pub fn pid_path() -> PathBuf {
    let data_dir = dirs::data_local_dir().expect("Could not determine local data directory");
    data_dir.join("tina").join("daemon.pid")
}

/// Start the daemon as a background process.
///
/// Forks the current binary with `daemon run` and writes the child PID to the PID file.
/// Returns Ok(pid) if started successfully, Err if already running.
pub fn start() -> anyhow::Result<u32> {
    if let Some(pid) = running_pid() {
        anyhow::bail!("Daemon already running (pid {})", pid);
    }

    let exe = std::env::current_exe()?;
    let child = Command::new(exe)
        .args(["daemon", "run"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()?;

    let pid = child.id();
    write_pid(pid)?;
    Ok(pid)
}

/// Stop the daemon by sending SIGTERM to the PID.
pub fn stop() -> anyhow::Result<()> {
    let pid = running_pid().ok_or_else(|| anyhow::anyhow!("Daemon is not running"))?;

    // Send SIGTERM
    #[cfg(unix)]
    {
        unsafe { libc::kill(pid as i32, libc::SIGTERM) };
    }

    remove_pid()?;
    Ok(())
}

/// Check if the daemon is running. Returns the PID if so.
pub fn status() -> Option<u32> {
    running_pid()
}

/// Read the PID file and check if the process is still alive.
fn running_pid() -> Option<u32> {
    let path = pid_path();
    if !path.exists() {
        return None;
    }

    let mut contents = String::new();
    fs::File::open(&path)
        .ok()?
        .read_to_string(&mut contents)
        .ok()?;

    let pid: u32 = contents.trim().parse().ok()?;

    // Check if process is alive
    if is_process_alive(pid) {
        Some(pid)
    } else {
        // Stale PID file - clean up
        let _ = fs::remove_file(&path);
        None
    }
}

/// Check if a process with the given PID is alive.
fn is_process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // kill -0 checks if process exists without sending a signal
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

/// Write a PID to the PID file.
fn write_pid(pid: u32) -> anyhow::Result<()> {
    let path = pid_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = fs::File::create(&path)?;
    write!(file, "{}", pid)?;
    Ok(())
}

/// Remove the PID file.
fn remove_pid() -> anyhow::Result<()> {
    let path = pid_path();
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

/// Run the daemon in the foreground.
///
/// The embedded daemon is deprecated. Use tina-daemon instead, which syncs
/// local state to Convex.
pub fn run_foreground() -> anyhow::Result<()> {
    eprintln!("Warning: The embedded daemon is deprecated. Use tina-daemon instead.");
    eprintln!("Install: cargo install --path tina-daemon");
    anyhow::bail!("Embedded daemon removed. Use tina-daemon for file sync.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pid_path_ends_correctly() {
        let path = pid_path();
        assert!(path.ends_with("tina/daemon.pid"));
    }

    #[test]
    fn test_write_and_read_pid() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("daemon.pid");

        // Write PID manually
        let mut file = fs::File::create(&path).unwrap();
        write!(file, "12345").unwrap();
        drop(file);

        // Read it back
        let mut contents = String::new();
        fs::File::open(&path)
            .unwrap()
            .read_to_string(&mut contents)
            .unwrap();
        let pid: u32 = contents.trim().parse().unwrap();
        assert_eq!(pid, 12345);
    }

    #[test]
    fn test_is_process_alive_current() {
        // Our own process should be alive
        let pid = std::process::id();
        assert!(is_process_alive(pid));
    }

    #[test]
    fn test_is_process_alive_nonexistent() {
        // Very high PID should not exist
        assert!(!is_process_alive(4_000_000));
    }
}
