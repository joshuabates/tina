pub mod watcher;

use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

/// Launch options for controlling which daemon binary/environment to run.
#[derive(Debug, Clone, Default)]
pub struct DaemonLaunchOptions {
    /// Environment profile (`prod`/`dev`) forwarded to tina-daemon via `--env`.
    pub env: Option<String>,
    /// Optional explicit path to the daemon binary.
    pub daemon_bin: Option<PathBuf>,
}

/// Returns the PID file path: `~/.local/share/tina/daemon.pid`
pub fn pid_path() -> PathBuf {
    let data_dir = dirs::data_local_dir().expect("Could not determine local data directory");
    data_dir.join("tina").join("daemon.pid")
}

/// Start tina-daemon as a background process.
///
/// Resolves the daemon binary in this order:
/// 1. Explicit `daemon_bin` option
/// 2. `TINA_DAEMON_BIN` environment variable
/// 3. Sibling `tina-daemon` next to the current `tina-session` binary
/// 4. `tina-daemon` from PATH
pub fn start_with_options(options: &DaemonLaunchOptions) -> anyhow::Result<u32> {
    if let Some(pid) = running_pid() {
        anyhow::bail!("Daemon already running (pid {})", pid);
    }

    let daemon_bin = resolve_daemon_bin(options.daemon_bin.as_ref());
    let mut command = Command::new(&daemon_bin);
    if let Some(env) = resolved_env_arg(options) {
        command.args(["--env", &env]);
    }

    let mut child = command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| {
            anyhow::anyhow!(
                "Failed to launch tina-daemon (binary: {}): {}",
                daemon_bin.display(),
                e
            )
        })?;

    let pid = child.id();

    // Detect immediate startup failures (e.g. wrong/old daemon binary).
    std::thread::sleep(Duration::from_millis(250));
    if let Some(status) = child.try_wait()? {
        anyhow::bail!(
            "tina-daemon exited immediately (status: {}) using binary '{}'. \
             This usually means an incompatible binary was selected. \
             Start again with --daemon-bin pointing to the repo build.",
            status,
            daemon_bin.display()
        );
    }

    write_pid(pid)?;
    Ok(pid)
}

/// Start the daemon using defaults.
pub fn start() -> anyhow::Result<u32> {
    start_with_options(&DaemonLaunchOptions::default())
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

/// Run the daemon in the foreground.
pub fn run_foreground_with_options(options: &DaemonLaunchOptions) -> anyhow::Result<()> {
    let daemon_bin = resolve_daemon_bin(options.daemon_bin.as_ref());
    let mut command = Command::new(&daemon_bin);
    if let Some(env) = resolved_env_arg(options) {
        command.args(["--env", &env]);
    }

    let status = command.status().map_err(|e| {
        anyhow::anyhow!(
            "Failed to launch tina-daemon (binary: {}): {}",
            daemon_bin.display(),
            e
        )
    })?;

    if status.success() {
        Ok(())
    } else {
        anyhow::bail!("tina-daemon exited with status {}", status)
    }
}

/// Run the daemon in the foreground using defaults.
pub fn run_foreground() -> anyhow::Result<()> {
    run_foreground_with_options(&DaemonLaunchOptions::default())
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

fn resolve_daemon_bin(explicit: Option<&PathBuf>) -> PathBuf {
    if let Some(path) = explicit {
        return path.clone();
    }

    if let Ok(path) = std::env::var("TINA_DAEMON_BIN") {
        if !path.trim().is_empty() {
            return PathBuf::from(path);
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            let sibling = dir.join("tina-daemon");
            if sibling.exists() {
                return sibling;
            }
        }
    }

    if let Some(workspace_bin) = resolve_workspace_daemon_bin() {
        return workspace_bin;
    }

    PathBuf::from("tina-daemon")
}

fn resolve_workspace_daemon_bin() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    resolve_workspace_daemon_bin_from(&cwd)
}

fn resolve_workspace_daemon_bin_from(start: &Path) -> Option<PathBuf> {
    let mut dir = start.to_path_buf();

    loop {
        let debug_bin = dir
            .join("tina-daemon")
            .join("target")
            .join("debug")
            .join("tina-daemon");
        if debug_bin.exists() {
            return Some(debug_bin);
        }

        let release_bin = dir
            .join("tina-daemon")
            .join("target")
            .join("release")
            .join("tina-daemon");
        if release_bin.exists() {
            return Some(release_bin);
        }

        if !dir.pop() {
            break;
        }
    }

    None
}

fn resolved_env_arg(options: &DaemonLaunchOptions) -> Option<String> {
    options
        .env
        .clone()
        .or_else(|| std::env::var("TINA_ENV").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
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

    #[test]
    fn test_resolved_env_arg_prefers_options() {
        let options = DaemonLaunchOptions {
            env: Some("dev".to_string()),
            daemon_bin: None,
        };
        assert_eq!(resolved_env_arg(&options).as_deref(), Some("dev"));
    }

    #[test]
    fn test_resolve_daemon_bin_uses_explicit_path() {
        let explicit = PathBuf::from("/tmp/custom-daemon");
        let resolved = resolve_daemon_bin(Some(&explicit));
        assert_eq!(resolved, explicit);
    }

    #[test]
    fn test_resolve_workspace_daemon_bin_from_finds_debug_binary() {
        let tmp = tempfile::tempdir().unwrap();
        let nested = tmp.path().join("a").join("b").join("c");
        fs::create_dir_all(&nested).unwrap();

        let daemon_bin = tmp
            .path()
            .join("tina-daemon")
            .join("target")
            .join("debug")
            .join("tina-daemon");
        fs::create_dir_all(daemon_bin.parent().unwrap()).unwrap();
        fs::File::create(&daemon_bin).unwrap();

        let found = resolve_workspace_daemon_bin_from(&nested).unwrap();
        assert_eq!(found, daemon_bin);
    }

    #[test]
    fn test_resolve_workspace_daemon_bin_from_none_when_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let found = resolve_workspace_daemon_bin_from(tmp.path());
        assert!(found.is_none());
    }
}
