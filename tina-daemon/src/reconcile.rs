//! Daemon crash recovery reconciliation.
//!
//! On daemon restart (and periodically), reconciles Convex state with actual
//! tmux state. Sessions whose panes no longer exist are marked as ended.

use std::collections::HashSet;
use std::process::Command;
use std::sync::Arc;

use anyhow::Result;
use tokio::sync::Mutex;
use tracing::{info, warn};

use tina_data::{ActiveTerminalSession, TeamMemberWithPane, TinaConvexClient};

/// A parsed tmux pane from `tmux list-panes -a`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TmuxPane {
    pub pane_id: String,
    pub is_dead: bool,
}

/// Result of a reconciliation run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReconcileResult {
    /// Number of terminal sessions marked as ended.
    pub sessions_ended: usize,
    /// Number of team members with dead panes (logged only, not modified).
    pub members_with_dead_panes: usize,
}

/// Parse tmux list-panes output into a list of pane records.
///
/// Expected format from `tmux list-panes -a -F "#{pane_id} #{pane_dead}"`:
/// ```text
/// %0 0
/// %1 1
/// %2 0
/// ```
pub fn parse_tmux_panes(output: &str) -> Vec<TmuxPane> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let mut parts = line.split_whitespace();
            let pane_id = parts.next()?;
            let dead_flag = parts.next().unwrap_or("0");
            Some(TmuxPane {
                pane_id: pane_id.to_string(),
                is_dead: dead_flag == "1",
            })
        })
        .collect()
}

/// Get the set of alive tmux pane IDs.
///
/// Returns `None` if tmux is not running (server not started).
/// Dead panes (pane_dead=1) are excluded from the alive set.
pub fn alive_pane_ids(panes: &[TmuxPane]) -> HashSet<&str> {
    panes
        .iter()
        .filter(|p| !p.is_dead)
        .map(|p| p.pane_id.as_str())
        .collect()
}

/// Query tmux for all panes (blocking — call from `spawn_blocking`).
///
/// Returns `Ok(Some(output))` if tmux is running, `Ok(None)` if tmux server
/// is not started (no sessions), or `Err` on failures (including missing tmux binary).
pub fn list_tmux_panes_blocking() -> Result<Option<String>> {
    let output = Command::new("tmux")
        .args(["list-panes", "-a", "-F", "#{pane_id} #{pane_dead}"])
        .output();

    match output {
        Ok(out) => {
            if out.status.success() {
                Ok(Some(String::from_utf8_lossy(&out.stdout).to_string()))
            } else {
                // tmux returns non-zero when server is not running
                let stderr = String::from_utf8_lossy(&out.stderr);
                if stderr.contains("no server running")
                    || stderr.contains("no current session")
                    || stderr.contains("error connecting")
                {
                    Ok(None)
                } else {
                    anyhow::bail!("tmux list-panes failed: {}", stderr.trim());
                }
            }
        }
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                anyhow::bail!("tmux binary not found in PATH")
            }
            Err(e.into())
        }
    }
}

/// Determine which sessions need to be marked as ended.
///
/// A session is ended if its pane ID is not in the alive set.
pub fn sessions_to_end<'a>(
    sessions: &'a [ActiveTerminalSession],
    alive: &HashSet<&str>,
) -> Vec<&'a ActiveTerminalSession> {
    sessions
        .iter()
        .filter(|s| !alive.contains(s.tmux_pane_id.as_str()))
        .collect()
}

/// Determine which team members have dead panes (for logging only).
pub fn members_with_dead_panes<'a>(
    members: &'a [TeamMemberWithPane],
    alive: &HashSet<&str>,
) -> Vec<&'a TeamMemberWithPane> {
    members
        .iter()
        .filter(|m| !alive.contains(m.tmux_pane_id.as_str()))
        .collect()
}

/// Run full reconciliation: query tmux, query Convex, mark dead sessions as ended.
pub async fn reconcile(client: &Arc<Mutex<TinaConvexClient>>) -> Result<ReconcileResult> {
    // Query tmux panes (blocking)
    let tmux_output = tokio::task::spawn_blocking(list_tmux_panes_blocking).await??;

    let alive = match &tmux_output {
        Some(output) => {
            let panes = parse_tmux_panes(output);
            alive_pane_ids(&panes).into_iter().map(|s| s.to_string()).collect::<HashSet<String>>()
        }
        None => {
            // tmux not running — all sessions are dead
            info!("tmux not running, all sessions will be marked as ended");
            HashSet::new()
        }
    };
    let alive_refs: HashSet<&str> = alive.iter().map(|s| s.as_str()).collect();

    // Query Convex for active terminal sessions
    let active_sessions = {
        let mut client_guard = client.lock().await;
        client_guard.list_active_terminal_sessions().await?
    };

    let to_end = sessions_to_end(&active_sessions, &alive_refs);
    let sessions_ended = to_end.len();

    // Mark dead sessions as ended
    let now = chrono::Utc::now().timestamp_millis() as f64;
    for session in &to_end {
        info!(
            session_name = %session.session_name,
            pane_id = %session.tmux_pane_id,
            "marking terminal session as ended (pane gone)"
        );
        let result = {
            let mut client_guard = client.lock().await;
            client_guard
                .mark_terminal_ended(&session.session_name, now)
                .await
        };
        if let Err(e) = result {
            warn!(
                session_name = %session.session_name,
                error = %e,
                "failed to mark terminal session as ended"
            );
        }
    }

    // Check team members with dead panes (log only, no modification)
    let active_members = {
        let mut client_guard = client.lock().await;
        client_guard.list_team_members_with_panes().await?
    };

    let dead_members = members_with_dead_panes(&active_members, &alive_refs);
    let members_with_dead_panes = dead_members.len();

    for member in &dead_members {
        warn!(
            agent_name = %member.agent_name,
            orchestration_id = %member.orchestration_id,
            phase_number = %member.phase_number,
            pane_id = %member.tmux_pane_id,
            "team member pane no longer exists"
        );
    }

    info!(
        sessions_ended = sessions_ended,
        members_with_dead_panes = members_with_dead_panes,
        "reconciliation complete"
    );

    Ok(ReconcileResult {
        sessions_ended,
        members_with_dead_panes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_tmux_panes tests ---

    #[test]
    fn parse_tmux_panes_normal_output() {
        let output = "%0 0\n%1 0\n%2 0\n";
        let panes = parse_tmux_panes(output);
        assert_eq!(
            panes,
            vec![
                TmuxPane { pane_id: "%0".to_string(), is_dead: false },
                TmuxPane { pane_id: "%1".to_string(), is_dead: false },
                TmuxPane { pane_id: "%2".to_string(), is_dead: false },
            ]
        );
    }

    #[test]
    fn parse_tmux_panes_with_dead_panes() {
        let output = "%0 0\n%1 1\n%2 0\n%3 1\n";
        let panes = parse_tmux_panes(output);
        assert_eq!(
            panes,
            vec![
                TmuxPane { pane_id: "%0".to_string(), is_dead: false },
                TmuxPane { pane_id: "%1".to_string(), is_dead: true },
                TmuxPane { pane_id: "%2".to_string(), is_dead: false },
                TmuxPane { pane_id: "%3".to_string(), is_dead: true },
            ]
        );
    }

    #[test]
    fn parse_tmux_panes_empty_output() {
        let panes = parse_tmux_panes("");
        assert!(panes.is_empty());
    }

    #[test]
    fn parse_tmux_panes_whitespace_only() {
        let panes = parse_tmux_panes("   \n  \n");
        assert!(panes.is_empty());
    }

    #[test]
    fn parse_tmux_panes_missing_dead_flag_defaults_alive() {
        let output = "%0\n%1 0\n";
        let panes = parse_tmux_panes(output);
        assert_eq!(
            panes,
            vec![
                TmuxPane { pane_id: "%0".to_string(), is_dead: false },
                TmuxPane { pane_id: "%1".to_string(), is_dead: false },
            ]
        );
    }

    // --- alive_pane_ids tests ---

    #[test]
    fn alive_pane_ids_excludes_dead() {
        let panes = vec![
            TmuxPane { pane_id: "%0".to_string(), is_dead: false },
            TmuxPane { pane_id: "%1".to_string(), is_dead: true },
            TmuxPane { pane_id: "%2".to_string(), is_dead: false },
        ];
        let alive = alive_pane_ids(&panes);
        assert!(alive.contains("%0"));
        assert!(!alive.contains("%1"));
        assert!(alive.contains("%2"));
        assert_eq!(alive.len(), 2);
    }

    #[test]
    fn alive_pane_ids_empty_when_all_dead() {
        let panes = vec![
            TmuxPane { pane_id: "%0".to_string(), is_dead: true },
            TmuxPane { pane_id: "%1".to_string(), is_dead: true },
        ];
        let alive = alive_pane_ids(&panes);
        assert!(alive.is_empty());
    }

    #[test]
    fn alive_pane_ids_empty_input() {
        let panes: Vec<TmuxPane> = vec![];
        let alive = alive_pane_ids(&panes);
        assert!(alive.is_empty());
    }

    // --- sessions_to_end tests ---

    #[test]
    fn sessions_to_end_with_all_panes_alive() {
        let sessions = vec![
            ActiveTerminalSession { session_name: "s1".to_string(), tmux_pane_id: "%0".to_string() },
            ActiveTerminalSession { session_name: "s2".to_string(), tmux_pane_id: "%1".to_string() },
        ];
        let alive: HashSet<&str> = ["%0", "%1"].into();
        let to_end = sessions_to_end(&sessions, &alive);
        assert!(to_end.is_empty());
    }

    #[test]
    fn sessions_to_end_with_some_dead() {
        let sessions = vec![
            ActiveTerminalSession { session_name: "s1".to_string(), tmux_pane_id: "%0".to_string() },
            ActiveTerminalSession { session_name: "s2".to_string(), tmux_pane_id: "%1".to_string() },
            ActiveTerminalSession { session_name: "s3".to_string(), tmux_pane_id: "%2".to_string() },
        ];
        let alive: HashSet<&str> = ["%0"].into();
        let to_end = sessions_to_end(&sessions, &alive);
        assert_eq!(to_end.len(), 2);
        assert_eq!(to_end[0].session_name, "s2");
        assert_eq!(to_end[1].session_name, "s3");
    }

    #[test]
    fn sessions_to_end_when_tmux_not_running() {
        let sessions = vec![
            ActiveTerminalSession { session_name: "s1".to_string(), tmux_pane_id: "%0".to_string() },
            ActiveTerminalSession { session_name: "s2".to_string(), tmux_pane_id: "%1".to_string() },
        ];
        // Empty alive set = tmux not running
        let alive: HashSet<&str> = HashSet::new();
        let to_end = sessions_to_end(&sessions, &alive);
        assert_eq!(to_end.len(), 2);
    }

    #[test]
    fn sessions_to_end_no_active_sessions() {
        let sessions: Vec<ActiveTerminalSession> = vec![];
        let alive: HashSet<&str> = ["%0", "%1"].into();
        let to_end = sessions_to_end(&sessions, &alive);
        assert!(to_end.is_empty());
    }

    // --- members_with_dead_panes tests ---

    #[test]
    fn team_members_dead_panes_with_all_alive() {
        let members = vec![
            TeamMemberWithPane {
                agent_name: "worker-1".to_string(),
                orchestration_id: "orch-1".to_string(),
                phase_number: "1".to_string(),
                tmux_pane_id: "%0".to_string(),
            },
        ];
        let alive: HashSet<&str> = ["%0"].into();
        let dead = members_with_dead_panes(&members, &alive);
        assert!(dead.is_empty());
    }

    #[test]
    fn team_members_dead_panes_with_some_dead() {
        let members = vec![
            TeamMemberWithPane {
                agent_name: "worker-1".to_string(),
                orchestration_id: "orch-1".to_string(),
                phase_number: "1".to_string(),
                tmux_pane_id: "%0".to_string(),
            },
            TeamMemberWithPane {
                agent_name: "worker-2".to_string(),
                orchestration_id: "orch-1".to_string(),
                phase_number: "1".to_string(),
                tmux_pane_id: "%5".to_string(),
            },
        ];
        let alive: HashSet<&str> = ["%0"].into();
        let dead = members_with_dead_panes(&members, &alive);
        assert_eq!(dead.len(), 1);
        assert_eq!(dead[0].agent_name, "worker-2");
    }

    #[test]
    fn team_members_dead_panes_when_tmux_not_running() {
        let members = vec![
            TeamMemberWithPane {
                agent_name: "worker-1".to_string(),
                orchestration_id: "orch-1".to_string(),
                phase_number: "1".to_string(),
                tmux_pane_id: "%0".to_string(),
            },
        ];
        let alive: HashSet<&str> = HashSet::new();
        let dead = members_with_dead_panes(&members, &alive);
        assert_eq!(dead.len(), 1);
    }
}
