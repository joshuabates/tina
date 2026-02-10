use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use regex::Regex;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

use tina_data::{ActiveTeamRecord, CommitRecord, OrchestrationEventRecord, PlanRecord, TaskEventRecord, TeamMemberRecord, TinaConvexClient};
use tina_session::state::schema::{Agent, Task, Team};

use crate::git;
use crate::watcher::WorktreeInfo;

/// Cached state for detecting changes and avoiding redundant Convex writes.
pub struct SyncCache {
    /// Maps `(orchestration_id, task_id)` -> `(status, subject, owner)`
    pub task_state: HashMap<(String, String), TaskCacheEntry>,
    /// Maps `(orchestration_id, phase_number, agent_name)` -> last recorded_at
    pub team_member_state: HashMap<(String, String, String), String>,
    /// Maps `team_name` -> set of agent names (for detecting removals)
    pub team_members: HashMap<String, HashMap<String, Agent>>,
    /// Maps `orchestration_id` -> last known commit SHA
    pub last_commit_sha: HashMap<String, String>,
    /// Active worktrees discovered from Convex
    pub worktrees: Vec<WorktreeInfo>,
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
            team_members: HashMap::new(),
            last_commit_sha: HashMap::new(),
            worktrees: Vec::new(),
        }
    }

    pub fn set_worktrees(&mut self, worktrees: Vec<WorktreeInfo>) {
        self.worktrees = worktrees;
    }

    pub fn find_worktree_by_ref_path(&self, ref_path: &Path) -> Option<&WorktreeInfo> {
        self.worktrees.iter().find(|wt| {
            let expected = wt.worktree_path
                .join(".git")
                .join("refs")
                .join("heads")
                .join(&wt.branch);
            expected == ref_path
        })
    }

    pub fn find_worktree_by_plan_path(&self, plan_path: &Path) -> Option<&WorktreeInfo> {
        self.worktrees.iter().find(|wt| {
            let plans_dir = wt.worktree_path.join("docs").join("plans");
            plan_path.starts_with(&plans_dir)
        })
    }
}

/// Sync team members from a team config file to Convex.
///
/// Uses the `ActiveTeamRecord` from Convex to get the orchestration ID and phase number
/// directly, avoiding per-team lookups and name-based phase extraction.
/// Also detects member removals and records shutdown events.
pub async fn sync_team_members(
    client: &Arc<Mutex<TinaConvexClient>>,
    cache: &mut SyncCache,
    teams_dir: &Path,
    team: &ActiveTeamRecord,
) -> Result<()> {
    let team_config = load_team_config(teams_dir, &team.team_name)?;

    let orchestration_id = &team.orchestration_id;
    let phase_number = team.phase_number.clone().unwrap_or_else(|| "0".to_string());
    let now = Utc::now().to_rfc3339();

    // Build current members map
    let current_members: HashMap<String, Agent> = team_config
        .members
        .iter()
        .map(|m| (m.name.clone(), m.clone()))
        .collect();

    // Detect removals (members in previous but not in current)
    if let Some(previous_members) = cache.team_members.get(&team.team_name) {
        for (name, agent) in previous_members {
            if !current_members.contains_key(name) {
                // Member was removed - record shutdown event
                if let Err(e) = record_shutdown_event(client, orchestration_id, &phase_number, agent).await {
                    error!(agent = %name, error = %e, "failed to record shutdown event");
                }
            }
        }
    }

    // Sync current members to Convex
    for member in &team_config.members {
        let cache_key = (
            orchestration_id.to_string(),
            phase_number.clone(),
            member.name.clone(),
        );

        // Skip if already synced with same recorded_at (idempotent)
        if cache.team_member_state.contains_key(&cache_key) {
            continue;
        }

        let joined_at =
            chrono::DateTime::from_timestamp_millis(member.joined_at).map(|dt| dt.to_rfc3339());

        let record = TeamMemberRecord {
            orchestration_id: orchestration_id.to_string(),
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
                cache.team_member_state.insert(cache_key, now.clone());
                debug!(agent = %member.name, orchestration = %orchestration_id, "synced team member");
            }
            Err(e) => {
                error!(agent = %member.name, error = %e, "failed to sync team member");
            }
        }
    }

    // Update cache with current team state
    cache
        .team_members
        .insert(team.team_name.clone(), current_members);

    Ok(())
}

/// Record a shutdown event when a team member is removed.
async fn record_shutdown_event(
    client: &Arc<Mutex<TinaConvexClient>>,
    orchestration_id: &str,
    phase_number: &str,
    agent: &Agent,
) -> Result<()> {
    let event = OrchestrationEventRecord {
        orchestration_id: orchestration_id.to_string(),
        phase_number: Some(phase_number.to_string()),
        event_type: "agent_shutdown".to_string(),
        source: "tina-daemon".to_string(),
        summary: format!("{} shutdown", agent.name),
        detail: Some(
            serde_json::json!({
                "agent_name": agent.name,
                "agent_type": agent.agent_type,
                "shutdown_detected_at": chrono::Utc::now().to_rfc3339(),
            })
            .to_string(),
        ),
        recorded_at: chrono::Utc::now().to_rfc3339(),
    };

    let mut client_guard = client.lock().await;
    client_guard.record_event(&event).await?;
    info!(
        agent = %agent.name,
        orchestration = %orchestration_id,
        "recorded shutdown event"
    );

    Ok(())
}

/// Sync tasks from the filesystem to Convex, driven by active teams from Convex.
///
/// Queries Convex for active teams to get orchestration IDs, then reads task
/// files from the filesystem and records events for changes.
pub async fn sync_tasks(
    client: &Arc<Mutex<TinaConvexClient>>,
    cache: &mut SyncCache,
    active_teams: &[ActiveTeamRecord],
    tasks_dir: &Path,
) -> Result<()> {
    for team in active_teams {
        // Claude CLI stores tasks under ~/.claude/tasks/{team_name}/
        let task_team_dir = tasks_dir.join(&team.team_name);

        if !task_team_dir.exists() {
            continue;
        }

        sync_task_dir(
            client,
            cache,
            &team.orchestration_id,
            team.phase_number.as_deref(),
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

/// Fetch active teams from Convex for use by sync operations.
pub async fn fetch_active_teams(
    client: &Arc<Mutex<TinaConvexClient>>,
) -> Result<Vec<ActiveTeamRecord>> {
    let mut client_guard = client.lock().await;
    client_guard.list_active_teams().await
}

/// Sync all known teams and tasks (called on startup or after detecting changes).
///
/// Queries Convex for active teams first, then syncs team members and tasks
/// using the returned orchestration IDs (no per-team lookup needed).
pub async fn sync_all(
    client: &Arc<Mutex<TinaConvexClient>>,
    cache: &mut SyncCache,
    teams_dir: &Path,
    tasks_dir: &Path,
) -> Result<()> {
    let active_teams = fetch_active_teams(client).await?;
    info!(
        count = active_teams.len(),
        "fetched active teams from Convex"
    );

    for team in &active_teams {
        if let Err(e) = sync_team_members(client, cache, teams_dir, team).await {
            warn!(team = %team.team_name, error = %e, "failed to sync team");
        }
    }

    if let Err(e) = sync_tasks(client, cache, &active_teams, tasks_dir).await {
        warn!(error = %e, "failed to sync tasks");
    }

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

/// Sync commits from a git repository to Convex.
///
/// Queries the repository for new commits since the last known SHA and records
/// them to Convex. Updates the cache with the latest SHA.
pub async fn sync_commits(
    client: &Arc<Mutex<TinaConvexClient>>,
    cache: &mut SyncCache,
    orchestration_id: &str,
    phase_number: &str,
    worktree_path: &Path,
    branch: &str,
) -> Result<()> {
    // Get last known SHA from cache
    let last_sha = cache.last_commit_sha.get(orchestration_id).map(|s| s.as_str());

    // Parse new commits
    let new_commits = git::get_new_commits(worktree_path, branch, last_sha)?;

    if new_commits.is_empty() {
        return Ok(());
    }

    info!(
        orchestration = %orchestration_id,
        count = new_commits.len(),
        "syncing new commits"
    );

    // Record each commit to Convex
    for commit in &new_commits {
        let record = CommitRecord {
            orchestration_id: orchestration_id.to_string(),
            phase_number: phase_number.to_string(),
            sha: commit.sha.clone(),
            short_sha: commit.short_sha.clone(),
            subject: commit.subject.clone(),
            author: commit.author.clone(),
            timestamp: commit.timestamp.clone(),
            insertions: commit.insertions,
            deletions: commit.deletions,
        };

        let mut client_guard = client.lock().await;
        match client_guard.record_commit(&record).await {
            Ok(_) => {
                debug!(sha = %commit.short_sha, orchestration = %orchestration_id, "recorded commit");
            }
            Err(e) => {
                error!(sha = %commit.short_sha, error = %e, "failed to record commit");
            }
        }
    }

    // Update cache with latest SHA
    if let Some(latest) = new_commits.first() {
        cache
            .last_commit_sha
            .insert(orchestration_id.to_string(), latest.sha.clone());
    }

    Ok(())
}

/// Sync a plan file to Convex.
///
/// Reads the plan file content and upserts it to Convex (creates or updates).
pub async fn sync_plan(
    client: &Arc<Mutex<TinaConvexClient>>,
    orchestration_id: &str,
    plan_path: &Path,
) -> Result<()> {
    // Read plan file content
    let content = tokio::fs::read_to_string(plan_path)
        .await
        .context("Failed to read plan file")?;

    // Extract phase number from filename
    let filename = plan_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("Invalid plan filename"))?;

    let phase_number = extract_phase_from_plan_filename(filename)?;

    // Upsert to Convex
    let record = PlanRecord {
        orchestration_id: orchestration_id.to_string(),
        phase_number,
        plan_path: plan_path.to_string_lossy().to_string(),
        content,
    };

    let mut client_guard = client.lock().await;
    match client_guard.upsert_plan(&record).await {
        Ok(_) => {
            info!(
                plan = %filename,
                orchestration = %orchestration_id,
                "synced plan"
            );
        }
        Err(e) => {
            error!(plan = %filename, error = %e, "failed to sync plan");
        }
    }

    Ok(())
}

/// Discover active worktrees from Convex orchestration state.
///
/// Queries for non-Complete orchestrations and extracts worktree paths
/// from the orchestration records.
pub async fn discover_worktrees(
    client: &Arc<Mutex<TinaConvexClient>>,
) -> Result<Vec<WorktreeInfo>> {
    let mut client_guard = client.lock().await;

    // Query for active orchestrations
    let orchestrations = client_guard
        .list_orchestrations()
        .await
        .context("Failed to query orchestrations")?;

    let mut worktrees = Vec::new();

    for entry in orchestrations {
        let orch = &entry.record;

        // Skip completed orchestrations
        if orch.status == "complete" || orch.status == "Complete" {
            continue;
        }

        // Extract worktree path - use from orchestration record if available
        let worktree_path = match &orch.worktree_path {
            Some(path) => path,
            None => {
                debug!(
                    feature = %orch.feature_name,
                    "orchestration has no worktree_path, skipping"
                );
                continue;
            }
        };

        let path_buf = PathBuf::from(worktree_path);
        if path_buf.exists() {
            worktrees.push(WorktreeInfo {
                orchestration_id: entry.id.clone(),
                feature: orch.feature_name.clone(),
                worktree_path: path_buf,
                branch: orch.branch.clone(),
                current_phase: orch.current_phase.to_string(),
            });
        } else {
            warn!(
                feature = %orch.feature_name,
                path = %worktree_path,
                "worktree path does not exist"
            );
        }
    }

    info!(count = worktrees.len(), "discovered active worktrees");
    Ok(worktrees)
}

/// Extract phase number from team name pattern: `{feature}-orchestration-phase-{N}`
pub fn extract_phase_from_team_name(team_name: &str) -> Result<String> {
    let re = Regex::new(r"-phase-(\d+)$")?;
    let captures = re
        .captures(team_name)
        .ok_or_else(|| anyhow!("Team name does not match phase pattern: {}", team_name))?;

    Ok(captures[1].to_string())
}

/// Extract phase number from plan filename pattern: `YYYY-MM-DD-{feature}-phase-{N}.md`
pub fn extract_phase_from_plan_filename(filename: &str) -> Result<String> {
    let re = Regex::new(r"-phase-(\d+)\.md$")?;
    let captures = re
        .captures(filename)
        .ok_or_else(|| anyhow!("Filename does not match phase pattern: {}", filename))?;

    Ok(captures[1].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

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

    #[test]
    fn test_extract_phase_from_team_name() {
        assert_eq!(
            extract_phase_from_team_name("my-feature-orchestration-phase-1").unwrap(),
            "1"
        );
        assert_eq!(
            extract_phase_from_team_name("multi-word-orchestration-phase-12").unwrap(),
            "12"
        );
        assert!(extract_phase_from_team_name("no-phase-suffix").is_err());
    }

    #[test]
    fn test_extract_phase_from_plan_filename() {
        assert_eq!(
            extract_phase_from_plan_filename("2026-02-10-my-feature-phase-1.md").unwrap(),
            "1"
        );
        assert_eq!(
            extract_phase_from_plan_filename("2026-01-15-multi-word-feature-phase-12.md").unwrap(),
            "12"
        );
        assert!(extract_phase_from_plan_filename("no-phase.md").is_err());
        assert!(extract_phase_from_plan_filename("phase-1.txt").is_err()); // wrong extension
    }

    #[test]
    fn test_find_worktree_by_ref_path() {
        let mut cache = SyncCache::new();
        cache.set_worktrees(vec![WorktreeInfo {
            orchestration_id: "orch1".to_string(),
            feature: "test-feature".to_string(),
            worktree_path: PathBuf::from("/project/.worktrees/test"),
            branch: "tina/test-feature".to_string(),
            current_phase: "1".to_string(),
        }]);

        let ref_path = PathBuf::from("/project/.worktrees/test/.git/refs/heads/tina/test-feature");
        let found = cache.find_worktree_by_ref_path(&ref_path);
        assert!(found.is_some());
        assert_eq!(found.unwrap().feature, "test-feature");
    }

    #[test]
    fn test_find_worktree_by_plan_path() {
        let mut cache = SyncCache::new();
        cache.set_worktrees(vec![WorktreeInfo {
            orchestration_id: "orch1".to_string(),
            feature: "test-feature".to_string(),
            worktree_path: PathBuf::from("/project/.worktrees/test"),
            branch: "tina/test-feature".to_string(),
            current_phase: "1".to_string(),
        }]);

        let plan_path = PathBuf::from("/project/.worktrees/test/docs/plans/2026-02-10-test-phase-1.md");
        let found = cache.find_worktree_by_plan_path(&plan_path);
        assert!(found.is_some());
        assert_eq!(found.unwrap().feature, "test-feature");
    }

    #[test]
    fn test_find_worktree_not_found() {
        let cache = SyncCache::new();
        let ref_path = PathBuf::from("/nonexistent/path");
        assert!(cache.find_worktree_by_ref_path(&ref_path).is_none());
    }
}
