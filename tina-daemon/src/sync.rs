use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result};
use chrono::Utc;
use tokio::sync::Mutex;
use tracing::{debug, error, warn};

use tina_data::{TaskEventRecord, TeamMemberRecord, TinaConvexClient};
use tina_session::session::lookup::SessionLookup;
use tina_session::state::schema::{Task, Team};

/// Cached state for detecting changes and avoiding redundant Convex writes.
pub struct SyncCache {
    /// Maps `(orchestration_id, task_id)` -> `(status, subject, owner)`
    pub task_state: HashMap<(String, String), TaskCacheEntry>,
    /// Maps `(orchestration_id, phase_number, agent_name)` -> last recorded_at
    pub team_member_state: HashMap<(String, String, String), String>,
    /// Maps `feature_name` -> convex orchestration ID
    pub orchestration_ids: HashMap<String, String>,
}

/// Cached task state for change detection.
#[derive(Debug, Clone, PartialEq)]
pub struct TaskCacheEntry {
    pub status: String,
    pub subject: String,
    pub owner: Option<String>,
}

impl SyncCache {
    pub fn new() -> Self {
        Self {
            task_state: HashMap::new(),
            team_member_state: HashMap::new(),
            orchestration_ids: HashMap::new(),
        }
    }
}

/// Sync team members from a team config file to Convex.
///
/// Reads team config, finds the associated orchestration, and upserts each member.
pub async fn sync_team_members(
    client: &Arc<Mutex<TinaConvexClient>>,
    cache: &mut SyncCache,
    teams_dir: &Path,
    team_name: &str,
) -> Result<()> {
    let team = load_team_config(teams_dir, team_name)?;
    let orchestration_id = match find_orchestration_id(cache, team_name, &team)? {
        Some(id) => id,
        None => {
            debug!(team = %team_name, "no orchestration found for team, skipping");
            return Ok(());
        }
    };

    let phase_number = extract_phase_number(team_name).unwrap_or_else(|| "0".to_string());
    let now = Utc::now().to_rfc3339();

    for member in &team.members {
        let cache_key = (
            orchestration_id.clone(),
            phase_number.clone(),
            member.name.clone(),
        );

        // Skip if already synced with same recorded_at (idempotent)
        if cache.team_member_state.contains_key(&cache_key) {
            continue;
        }

        let joined_at = chrono::DateTime::from_timestamp_millis(member.joined_at)
            .map(|dt| dt.to_rfc3339());

        let record = TeamMemberRecord {
            orchestration_id: orchestration_id.clone(),
            phase_number: phase_number.clone(),
            agent_name: member.name.clone(),
            agent_type: member.agent_type.clone(),
            model: Some(member.model.clone()),
            joined_at,
            recorded_at: now.clone(),
        };

        let mut client = client.lock().await;
        match client.upsert_team_member(&record).await {
            Ok(_) => {
                cache
                    .team_member_state
                    .insert(cache_key, now.clone());
                debug!(agent = %member.name, orchestration = %orchestration_id, "synced team member");
            }
            Err(e) => {
                error!(agent = %member.name, error = %e, "failed to sync team member");
            }
        }
    }

    Ok(())
}

/// Sync tasks from the filesystem to Convex.
///
/// Reads task files, compares against cache, and records events for changes.
pub async fn sync_tasks(
    client: &Arc<Mutex<TinaConvexClient>>,
    cache: &mut SyncCache,
    teams_dir: &Path,
    tasks_dir: &Path,
) -> Result<()> {
    let team_names = list_team_names(teams_dir)?;

    for team_name in &team_names {
        let team = match load_team_config(teams_dir, team_name) {
            Ok(t) => t,
            Err(e) => {
                warn!(team = %team_name, error = %e, "failed to load team config");
                continue;
            }
        };

        let orchestration_id = match find_orchestration_id(cache, team_name, &team)? {
            Some(id) => id,
            None => continue,
        };

        let phase_number = extract_phase_number(team_name);
        // Claude CLI stores tasks under ~/.claude/tasks/{team_name}/, not by session ID
        let task_team_dir = tasks_dir.join(team_name);

        if !task_team_dir.exists() {
            continue;
        }

        sync_task_dir(
            client,
            cache,
            &orchestration_id,
            phase_number.as_deref(),
            &task_team_dir,
        )
        .await?;
    }

    Ok(())
}

/// Sync all task files in a directory, detecting changes against the cache.
async fn sync_task_dir(
    client: &Arc<Mutex<TinaConvexClient>>,
    cache: &mut SyncCache,
    orchestration_id: &str,
    phase_number: Option<&str>,
    task_dir: &Path,
) -> Result<()> {
    let tasks = load_task_files(task_dir)?;
    let now = Utc::now().to_rfc3339();

    for task in &tasks {
        let cache_key = (orchestration_id.to_string(), task.id.clone());
        let current = TaskCacheEntry {
            status: task.status.to_string(),
            subject: task.subject.clone(),
            owner: task.owner.clone(),
        };

        // Skip if unchanged
        if cache.task_state.get(&cache_key) == Some(&current) {
            continue;
        }

        let blocked_by_json = if task.blocked_by.is_empty() {
            None
        } else {
            Some(serde_json::to_string(&task.blocked_by)?)
        };

        let metadata_json = if task.metadata.is_null() {
            None
        } else {
            Some(serde_json::to_string(&task.metadata)?)
        };

        let event = TaskEventRecord {
            orchestration_id: orchestration_id.to_string(),
            phase_number: phase_number.map(|s| s.to_string()),
            task_id: task.id.clone(),
            subject: task.subject.clone(),
            description: Some(task.description.clone()),
            status: task.status.to_string(),
            owner: task.owner.clone(),
            blocked_by: blocked_by_json,
            metadata: metadata_json,
            recorded_at: now.clone(),
        };

        let mut client = client.lock().await;
        match client.record_task_event(&event).await {
            Ok(_) => {
                cache.task_state.insert(cache_key, current);
                debug!(
                    task_id = %task.id,
                    status = %task.status,
                    "synced task event"
                );
            }
            Err(e) => {
                error!(task_id = %task.id, error = %e, "failed to sync task event");
            }
        }
    }

    Ok(())
}

/// Sync all known teams and tasks (called on startup or after detecting changes).
pub async fn sync_all(
    client: &Arc<Mutex<TinaConvexClient>>,
    cache: &mut SyncCache,
    teams_dir: &Path,
    tasks_dir: &Path,
    node_id: &str,
) -> Result<()> {
    if let Err(e) = refresh_orchestration_ids(client, cache, node_id).await {
        warn!(error = %e, "failed to refresh orchestration ids");
    }

    let team_names = list_team_names(teams_dir)?;

    for team_name in &team_names {
        if let Err(e) = sync_team_members(client, cache, teams_dir, team_name).await {
            warn!(team = %team_name, error = %e, "failed to sync team");
        }
    }

    if let Err(e) = sync_tasks(client, cache, teams_dir, tasks_dir).await {
        warn!(error = %e, "failed to sync tasks");
    }

    Ok(())
}

/// Refresh the feature -> orchestration ID map.
///
/// Includes all orchestrations, not just those from this node, because
/// tina-session and the daemon register separate node IDs. A future
/// improvement would be to have registerNode return an existing node
/// for the same hostname so all components share one node ID.
pub async fn refresh_orchestration_ids(
    client: &Arc<Mutex<TinaConvexClient>>,
    cache: &mut SyncCache,
    _node_id: &str,
) -> Result<()> {
    let entries = {
        let mut client_guard = client.lock().await;
        client_guard.list_orchestrations().await?
    };

    // When multiple orchestrations share the same feature name (from repeated runs),
    // keep the most recent one (by started_at timestamp).
    let mut new_map: HashMap<String, (String, String)> = HashMap::new();
    for entry in entries {
        let key = entry.record.feature_name.clone();
        let started = entry.record.started_at.clone();
        match new_map.get(&key) {
            Some((_, existing_started)) if existing_started >= &started => {}
            _ => {
                new_map.insert(key, (entry.id.clone(), started));
            }
        }
    }
    let new_map: HashMap<String, String> = new_map
        .into_iter()
        .map(|(k, (id, _))| (k, id))
        .collect();

    debug!(count = new_map.len(), "refreshed orchestration ID cache");
    cache.orchestration_ids = new_map;
    Ok(())
}

// --- File reading helpers (ported from tina-session/src/daemon/sync.rs) ---

/// List all team directory names that have a config.json.
pub fn list_team_names(teams_dir: &Path) -> Result<Vec<String>> {
    if !teams_dir.exists() {
        return Ok(vec![]);
    }

    let mut names = Vec::new();
    for entry in fs::read_dir(teams_dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() && entry.path().join("config.json").exists() {
            if let Some(name) = entry.file_name().to_str() {
                names.push(name.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

/// Load a team config from `teams_dir/{name}/config.json`.
pub fn load_team_config(teams_dir: &Path, name: &str) -> Result<Team> {
    let path = teams_dir.join(name).join("config.json");
    let content = fs::read_to_string(&path)
        .with_context(|| format!("reading team config: {}", path.display()))?;
    let team: Team = serde_json::from_str(&content)
        .with_context(|| format!("parsing team config: {}", path.display()))?;
    Ok(team)
}

/// Load all task JSON files from a directory.
pub fn load_task_files(dir: &Path) -> Result<Vec<Task>> {
    let mut tasks = Vec::new();
    if !dir.exists() {
        return Ok(tasks);
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            match fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str::<Task>(&content) {
                    Ok(task) => tasks.push(task),
                    Err(e) => warn!(path = %path.display(), error = %e, "failed to parse task"),
                },
                Err(e) => warn!(path = %path.display(), error = %e, "failed to read task"),
            }
        }
    }
    Ok(tasks)
}

/// Find the Convex orchestration ID for a team.
///
/// Strategy:
/// 1. If team name ends with "-orchestration", extract feature and look up in cache.
/// 2. Otherwise, match by the first member's cwd against session lookups.
fn find_orchestration_id(
    cache: &SyncCache,
    team_name: &str,
    team: &Team,
) -> Result<Option<String>> {
    // Check orchestration teams
    if team_name.ends_with("-orchestration") {
        let feature = team_name.trim_end_matches("-orchestration");
        if let Some(id) = cache.orchestration_ids.get(feature) {
            return Ok(Some(id.clone()));
        }
    }

    // Try session lookup matching by first member's cwd
    let member_cwd = team
        .members
        .first()
        .map(|m| m.cwd.clone())
        .unwrap_or_default();

    let lookups = SessionLookup::list_all().unwrap_or_default();
    for lookup in &lookups {
        if lookup.worktree_path == member_cwd {
            if let Some(id) = cache.orchestration_ids.get(&lookup.feature) {
                return Ok(Some(id.clone()));
            }
        }
    }

    Ok(None)
}

/// Extract a phase number from a team name.
///
/// Looks for "phase-N" patterns in the name.
pub fn extract_phase_number(team_name: &str) -> Option<String> {
    for part in team_name.split('-') {
        if let Ok(n) = part.parse::<u32>() {
            let pattern = format!("phase-{}", n);
            if team_name.contains(&pattern) {
                return Some(n.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // --- extract_phase_number tests ---

    #[test]
    fn test_extract_phase_number_with_suffix() {
        assert_eq!(
            extract_phase_number("feat-phase-2-execution"),
            Some("2".to_string())
        );
    }

    #[test]
    fn test_extract_phase_number_trailing() {
        assert_eq!(
            extract_phase_number("my-feature-phase-1"),
            Some("1".to_string())
        );
    }

    #[test]
    fn test_extract_phase_number_orchestration() {
        assert_eq!(extract_phase_number("feat-orchestration"), None);
    }

    #[test]
    fn test_extract_phase_number_no_match() {
        assert_eq!(extract_phase_number("random-team"), None);
    }

    // --- File reading tests ---

    fn create_team_dir(dir: &Path, name: &str, cwd: &str) {
        let team_dir = dir.join(name);
        fs::create_dir_all(&team_dir).unwrap();
        let config = format!(
            r#"{{
                "name": "{}",
                "description": "Test",
                "createdAt": 1706644800000,
                "leadAgentId": "lead@{}",
                "leadSessionId": "session-{}",
                "members": [{{
                    "agentId": "lead@{}",
                    "name": "team-lead",
                    "agentType": "team-lead",
                    "model": "claude-opus-4-6",
                    "joinedAt": 1706644800000,
                    "tmuxPaneId": null,
                    "cwd": "{}",
                    "subscriptions": []
                }}, {{
                    "agentId": "worker@{}",
                    "name": "worker",
                    "agentType": "general-purpose",
                    "model": "claude-sonnet-4-5",
                    "joinedAt": 1706644800001,
                    "tmuxPaneId": null,
                    "cwd": "{}",
                    "subscriptions": []
                }}]
            }}"#,
            name, name, name, name, cwd, name, cwd
        );
        fs::write(team_dir.join("config.json"), config).unwrap();
    }

    fn create_task_file(dir: &Path, id: &str, subject: &str, status: &str) {
        fs::create_dir_all(dir).unwrap();
        let json = format!(
            r#"{{
                "id": "{}",
                "subject": "{}",
                "description": "Test task",
                "status": "{}",
                "owner": null,
                "blocks": [],
                "blockedBy": [],
                "metadata": {{}}
            }}"#,
            id, subject, status
        );
        fs::write(dir.join(format!("{}.json", id)), json).unwrap();
    }

    #[test]
    fn test_list_team_names() {
        let temp = TempDir::new().unwrap();
        let teams_dir = temp.path().join("teams");
        fs::create_dir_all(&teams_dir).unwrap();

        create_team_dir(&teams_dir, "team-a", "/path");
        create_team_dir(&teams_dir, "team-b", "/path");

        // Directory without config.json should be ignored
        fs::create_dir_all(teams_dir.join("not-a-team")).unwrap();

        let names = list_team_names(&teams_dir).unwrap();
        assert_eq!(names, vec!["team-a", "team-b"]);
    }

    #[test]
    fn test_list_team_names_missing_dir() {
        let temp = TempDir::new().unwrap();
        let teams_dir = temp.path().join("nonexistent");

        let names = list_team_names(&teams_dir).unwrap();
        assert!(names.is_empty());
    }

    #[test]
    fn test_load_team_config() {
        let temp = TempDir::new().unwrap();
        let teams_dir = temp.path().join("teams");
        create_team_dir(&teams_dir, "my-team", "/path");

        let team = load_team_config(&teams_dir, "my-team").unwrap();
        assert_eq!(team.name, "my-team");
        assert_eq!(team.members.len(), 2);
        assert_eq!(team.members[0].name, "team-lead");
        assert_eq!(team.members[1].name, "worker");
    }

    #[test]
    fn test_load_task_files() {
        let temp = TempDir::new().unwrap();
        let task_dir = temp.path().join("tasks");

        create_task_file(&task_dir, "1", "Build feature", "pending");
        create_task_file(&task_dir, "2", "Write tests", "in_progress");

        let tasks = load_task_files(&task_dir).unwrap();
        assert_eq!(tasks.len(), 2);
    }

    #[test]
    fn test_load_task_files_missing_dir() {
        let temp = TempDir::new().unwrap();
        let task_dir = temp.path().join("nonexistent");

        let tasks = load_task_files(&task_dir).unwrap();
        assert!(tasks.is_empty());
    }

    // --- Cache tests ---

    #[test]
    fn test_cache_prevents_duplicate_task_sync() {
        let mut cache = SyncCache::new();
        let key = ("orch-1".to_string(), "task-1".to_string());
        let entry = TaskCacheEntry {
            status: "pending".to_string(),
            subject: "Test".to_string(),
            owner: None,
        };

        cache.task_state.insert(key.clone(), entry.clone());

        // Same entry should match
        assert_eq!(cache.task_state.get(&key), Some(&entry));
    }

    #[test]
    fn test_cache_detects_task_change() {
        let mut cache = SyncCache::new();
        let key = ("orch-1".to_string(), "task-1".to_string());

        let old = TaskCacheEntry {
            status: "pending".to_string(),
            subject: "Test".to_string(),
            owner: None,
        };
        cache.task_state.insert(key.clone(), old);

        let new = TaskCacheEntry {
            status: "in_progress".to_string(),
            subject: "Test".to_string(),
            owner: Some("worker".to_string()),
        };

        // Different entry should not match
        assert_ne!(cache.task_state.get(&key), Some(&new));
    }

    // --- Mapping tests ---

}
