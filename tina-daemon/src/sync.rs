use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use regex::Regex;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

use tina_data::{
    ActiveTeamRecord, CommitRecord, OrchestrationEventRecord, PlanRecord, TaskEventRecord,
    TeamMemberRecord, TinaConvexClient,
};
use tina_session::state::schema::{Agent, Task, Team};

use crate::git;
use crate::telemetry::DaemonTelemetry;
use crate::watcher::WorktreeInfo;

/// Cached state for detecting changes and avoiding redundant Convex writes.
pub struct SyncCache {
    /// Maps `(orchestration_id, phase_key, task_id)` -> task snapshot fields that
    /// impact `taskEvents` projection writes.
    pub task_state: HashMap<(String, String, String), TaskCacheEntry>,
    /// Maps `(orchestration_id, phase_number, agent_name)` -> last recorded_at
    pub team_member_state: HashMap<(String, String, String), String>,
    /// Maps Convex `team_id` -> set of agent names (for detecting removals)
    pub team_members: HashMap<String, HashMap<String, Agent>>,
    /// Maps Convex `team_id` -> local directory name under ~/.claude/{teams,tasks}
    pub team_dir_name_by_id: HashMap<String, String>,
    /// Maps `orchestration_id` -> last known commit SHA
    pub last_commit_sha: HashMap<String, String>,
    /// Maps skip-event cache keys -> last emitted unix timestamp.
    pub skip_event_last_emitted: HashMap<String, i64>,
    /// Active worktrees discovered from Convex
    pub worktrees: Vec<WorktreeInfo>,
}

/// Cached task state for change detection.
#[derive(Debug, Clone, PartialEq)]
pub struct TaskCacheEntry {
    pub status: String,
    pub subject: String,
    pub description: String,
    pub owner: Option<String>,
    pub blocked_by: Option<String>,
    pub metadata: Option<String>,
}

const ORCHESTRATOR_PHASE_KEY: &str = "__orchestrator__";

impl SyncCache {
    pub fn new() -> Self {
        Self {
            task_state: HashMap::new(),
            team_member_state: HashMap::new(),
            team_members: HashMap::new(),
            team_dir_name_by_id: HashMap::new(),
            last_commit_sha: HashMap::new(),
            skip_event_last_emitted: HashMap::new(),
            worktrees: Vec::new(),
        }
    }

    pub fn set_worktrees(&mut self, worktrees: Vec<WorktreeInfo>) {
        self.worktrees = worktrees;
    }

    pub fn find_worktree_by_ref_path(&self, ref_path: &Path) -> Option<&WorktreeInfo> {
        self.worktrees.iter().find(|wt| {
            let expected_branch_ref = wt.branch_ref_path.as_ref().cloned().unwrap_or_else(|| {
                wt.worktree_path
                    .join(".git")
                    .join("refs")
                    .join("heads")
                    .join(&wt.branch)
            });

            // File-level watch events typically surface the exact ref path.
            if expected_branch_ref == ref_path {
                return true;
            }
            // Directory-level events can surface an ancestor path.
            if expected_branch_ref.starts_with(ref_path) {
                return true;
            }

            if let Some(git_dir) = wt.git_dir_path.as_ref() {
                return ref_path == git_dir.join("HEAD") || ref_path == git_dir.join("packed-refs");
            }

            false
        })
    }

    pub fn find_worktree_by_design_path(&self, design_path: &Path) -> Option<&WorktreeInfo> {
        self.worktrees.iter().find(|wt| {
            let designs_dir = wt
                .worktree_path
                .join("ui")
                .join("designs")
                .join("sets");
            design_path.starts_with(&designs_dir)
        })
    }

    pub fn find_worktree_by_plan_path(&self, plan_path: &Path) -> Option<&WorktreeInfo> {
        self.worktrees.iter().find(|wt| {
            // Primary location: worktree-local docs/plans.
            let worktree_plans_dir = wt.worktree_path.join("docs").join("plans");
            if plan_path.starts_with(&worktree_plans_dir) {
                return true;
            }

            // Fallback location: repository-root docs/plans (common when planner
            // is invoked from repo root while implementation runs in a worktree).
            wt.worktree_path
                .parent()
                .and_then(|p| p.parent())
                .map(|repo_root| plan_path.starts_with(repo_root.join("docs").join("plans")))
                .unwrap_or(false)
        })
    }
}

fn phase_cache_key(phase_number: Option<&str>) -> String {
    phase_number
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(ORCHESTRATOR_PHASE_KEY)
        .to_string()
}

fn task_cache_key(
    orchestration_id: &str,
    phase_number: Option<&str>,
    task_id: &str,
) -> (String, String, String) {
    (
        orchestration_id.to_string(),
        phase_cache_key(phase_number),
        task_id.to_string(),
    )
}

const SKIP_EVENT_THROTTLE_SECS: i64 = 60;

fn should_emit_skip_event(cache: &mut SyncCache, key: String, now_unix: i64) -> bool {
    match cache.skip_event_last_emitted.get(&key) {
        Some(last) if now_unix.saturating_sub(*last) < SKIP_EVENT_THROTTLE_SECS => false,
        _ => {
            cache.skip_event_last_emitted.insert(key, now_unix);
            true
        }
    }
}

fn maybe_advance_last_commit_sha(
    cache: &mut SyncCache,
    orchestration_id: &str,
    commits: &[git::GitCommit],
    all_writes_succeeded: bool,
) {
    if !all_writes_succeeded {
        return;
    }

    if let Some(latest) = commits.first() {
        cache
            .last_commit_sha
            .insert(orchestration_id.to_string(), latest.sha.clone());
    }
}

fn format_phase_number(phase: f64) -> Option<String> {
    if !phase.is_finite() {
        return None;
    }
    if phase.fract().abs() < f64::EPSILON {
        return Some(format!("{:.0}", phase));
    }

    let mut phase_string = phase.to_string();
    if phase_string.contains('.') {
        while phase_string.ends_with('0') {
            phase_string.pop();
        }
        if phase_string.ends_with('.') {
            phase_string.pop();
        }
    }
    Some(phase_string)
}

async fn resolve_live_phase_number(
    client: &Arc<Mutex<TinaConvexClient>>,
    orchestration_id: &str,
    fallback_phase_number: &str,
) -> String {
    let list_result = {
        let mut client_guard = client.lock().await;
        client_guard.list_orchestrations().await
    };

    match list_result {
        Ok(orchestrations) => orchestrations
            .into_iter()
            .find(|entry| entry.id == orchestration_id)
            .and_then(|entry| format_phase_number(entry.record.current_phase))
            .unwrap_or_else(|| fallback_phase_number.to_string()),
        Err(e) => {
            warn!(
                orchestration = %orchestration_id,
                error = %e,
                "failed to resolve live phase, using cached phase"
            );
            fallback_phase_number.to_string()
        }
    }
}

fn resolve_local_team_dir_name(team: &ActiveTeamRecord, cache: &mut SyncCache) -> Result<String> {
    if let Some(dir_name) = cache.team_dir_name_by_id.get(&team.id) {
        return Ok(dir_name.clone());
    }

    if team.local_dir_name.trim().is_empty() {
        return Err(anyhow!(
            "empty local_dir_name for team_id={} team_name={}",
            team.id,
            team.team_name
        ));
    }

    let dir_name = team.local_dir_name.clone();
    cache
        .team_dir_name_by_id
        .insert(team.id.clone(), dir_name.clone());
    Ok(dir_name)
}

fn resolve_task_team_dir(
    tasks_dir: &Path,
    team: &ActiveTeamRecord,
    cache: &mut SyncCache,
) -> Result<(PathBuf, String)> {
    let dir_name = resolve_local_team_dir_name(team, cache)?;
    Ok((tasks_dir.join(&dir_name), dir_name))
}

fn validate_team_config_path(teams_dir: &Path, local_team_dir_name: &str) -> Result<()> {
    if teams_dir
        .join(local_team_dir_name)
        .join("config.json")
        .is_file()
    {
        Ok(())
    } else {
        Err(anyhow!(
            "team config directory not found for local_dir_name={}",
            local_team_dir_name
        ))
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
    telemetry: Option<&DaemonTelemetry>,
) -> Result<()> {
    let started_at = chrono::Utc::now();
    let span_id = telemetry.map(|t| t.start_span("daemon.sync_team_members"));

    let local_team_dir_name = resolve_local_team_dir_name(team, cache)?;
    validate_team_config_path(teams_dir, &local_team_dir_name)?;
    let team_config = load_team_config(teams_dir, &local_team_dir_name)?;

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
    if let Some(previous_members) = cache.team_members.get(&team.id) {
        for (name, agent) in previous_members {
            if !current_members.contains_key(name) {
                // Member was removed - record shutdown event
                if let Err(e) =
                    record_shutdown_event(client, orchestration_id, &phase_number, agent).await
                {
                    error!(agent = %name, error = %e, "failed to record shutdown event");
                }
            }
        }
    }

    // Keep cache and Convex in sync with currently active members for this phase.
    cache.team_member_state.retain(|(oid, phase, agent_name), _| {
        !(oid == orchestration_id
            && phase == &phase_number
            && !current_members.contains_key(agent_name))
    });
    let active_agent_names: Vec<String> = current_members.keys().cloned().collect();
    let prune_result = {
        let mut client_guard = client.lock().await;
        client_guard
            .prune_team_members(orchestration_id, &phase_number, &active_agent_names)
            .await
    };
    if let Err(e) = prune_result {
        error!(
            orchestration = %orchestration_id,
            phase = %phase_number,
            error = %e,
            "failed to prune stale team members"
        );
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
            tmux_pane_id: member.tmux_pane_id.clone(),
            recorded_at: now.clone(),
        };

        let upsert_result = {
            let mut client_guard = client.lock().await;
            client_guard.upsert_team_member(&record).await
        };
        match upsert_result {
            Ok(_) => {
                cache.team_member_state.insert(cache_key, now.clone());
                debug!(agent = %member.name, orchestration = %orchestration_id, "synced team member");

                // Emit projection.write event
                if let Some(t) = telemetry {
                    let attrs = serde_json::json!({
                        "team_id": &team.id,
                        "team_name": &team.team_name,
                        "local_team_dir_name": &local_team_dir_name,
                        "agent_name": &member.name,
                        "orchestration_id": orchestration_id,
                        "phase_number": &phase_number,
                    })
                    .to_string();
                    t.emit_event(
                        "projection.write",
                        "info",
                        "team member synced",
                        Some(attrs),
                    )
                    .await;
                }
            }
            Err(e) => {
                error!(agent = %member.name, error = %e, "failed to sync team member");
            }
        }
    }

    // Update cache with current team state
    cache.team_members.insert(team.id.clone(), current_members);

    // Complete span
    if let (Some(t), Some(sid)) = (telemetry, &span_id) {
        t.end_span(
            sid,
            "daemon.sync_team_members",
            started_at,
            "ok",
            None,
            None,
        )
        .await;
    }

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
    telemetry: Option<&DaemonTelemetry>,
) -> Result<()> {
    let started_at = chrono::Utc::now();
    let span_id = telemetry.map(|t| t.start_span("daemon.sync_tasks"));
    let now_unix = Utc::now().timestamp();

    for team in active_teams {
        // Claude CLI stores tasks under ~/.claude/tasks/{local_team_dir_name}/.
        // local_team_dir_name is read from Convex teams.localDirName (not inferred from names).
        let (task_team_dir, local_team_dir_name) = resolve_task_team_dir(tasks_dir, team, cache)?;

        if !task_team_dir.exists() {
            // Emit skip event for missing task dir
            let emit = should_emit_skip_event(
                cache,
                format!("task_dir_missing:{}:{}", team.id, local_team_dir_name),
                now_unix,
            );
            if emit {
                if let Some(t) = telemetry {
                    let attrs = serde_json::json!({
                        "team_id": &team.id,
                        "team_name": &team.team_name,
                        "local_team_dir_name": &local_team_dir_name,
                        "reason": "task_dir_missing",
                    })
                    .to_string();
                    t.emit_event(
                        "projection.skip",
                        "info",
                        "task directory not found",
                        Some(attrs),
                    )
                    .await;
                }
            }
            continue;
        }

        sync_task_dir(
            client,
            cache,
            &team.orchestration_id,
            team.phase_number.as_deref(),
            &task_team_dir,
            telemetry,
        )
        .await?;
    }

    // Complete span
    if let (Some(t), Some(sid)) = (telemetry, &span_id) {
        t.end_span(sid, "daemon.sync_tasks", started_at, "ok", None, None)
            .await;
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
    telemetry: Option<&DaemonTelemetry>,
) -> Result<()> {
    let tasks = load_task_files(task_dir)?;
    let now = Utc::now().to_rfc3339();
    let mut unchanged_count = 0usize;

    for task in &tasks {
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

        let task_phase_number = phase_number.map(|s| s.to_string());
        let cache_key = task_cache_key(orchestration_id, task_phase_number.as_deref(), &task.id);
        let current = TaskCacheEntry {
            status: task.status.to_string(),
            subject: task.subject.clone(),
            description: task.description.clone(),
            owner: task.owner.clone(),
            blocked_by: blocked_by_json.clone(),
            metadata: metadata_json.clone(),
        };

        // Skip if unchanged
        if cache.task_state.get(&cache_key) == Some(&current) {
            unchanged_count += 1;
            continue;
        }

        let event = TaskEventRecord {
            orchestration_id: orchestration_id.to_string(),
            phase_number: task_phase_number.clone(),
            task_id: task.id.clone(),
            subject: task.subject.clone(),
            description: Some(task.description.clone()),
            status: task.status.to_string(),
            owner: task.owner.clone(),
            blocked_by: blocked_by_json,
            metadata: metadata_json,
            recorded_at: now.clone(),
        };

        let record_result = {
            let mut client_guard = client.lock().await;
            client_guard.record_task_event(&event).await
        };
        match record_result {
            Ok(_) => {
                cache.task_state.insert(cache_key, current);
                debug!(
                    task_id = %task.id,
                    status = %task.status,
                    "synced task event"
                );

                // Emit projection.write event
                if let Some(t) = telemetry {
                    let attrs = serde_json::json!({
                        "task_id": &task.id,
                        "orchestration_id": orchestration_id,
                        "status": &task.status,
                    })
                    .to_string();
                    t.emit_event(
                        "projection.write",
                        "info",
                        "task event written",
                        Some(attrs),
                    )
                    .await;
                }
            }
            Err(e) => {
                error!(task_id = %task.id, error = %e, "failed to sync task event");
            }
        }
    }

    // Emit a throttled summary skip event for unchanged tasks instead of one
    // event per unchanged task (prevents telemetry row explosions).
    if unchanged_count > 0 {
        let phase_key = phase_cache_key(phase_number);
        let emit = should_emit_skip_event(
            cache,
            format!("unchanged_cache:{}:{}", orchestration_id, phase_key),
            Utc::now().timestamp(),
        );
        if emit {
            if let Some(t) = telemetry {
                let attrs = serde_json::json!({
                    "orchestration_id": orchestration_id,
                    "phase_number": phase_number,
                    "reason": "unchanged_cache_batch",
                    "unchanged_tasks": unchanged_count,
                    "total_tasks": tasks.len(),
                })
                .to_string();
                t.emit_event(
                    "projection.skip",
                    "info",
                    "unchanged task batch skipped",
                    Some(attrs),
                )
                .await;
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
    telemetry: Option<&DaemonTelemetry>,
) -> Result<()> {
    let started_at = chrono::Utc::now();
    let span_id = telemetry.map(|t| t.start_span("daemon.sync_all"));

    let active_teams = fetch_active_teams(client).await?;
    info!(
        count = active_teams.len(),
        "fetched active teams from Convex"
    );

    for team in &active_teams {
        if let Err(e) = sync_team_members(client, cache, teams_dir, team, telemetry).await {
            warn!(team = %team.team_name, error = %e, "failed to sync team");
        }
    }

    if let Err(e) = sync_tasks(client, cache, &active_teams, tasks_dir, telemetry).await {
        warn!(error = %e, "failed to sync tasks");
    }

    // Complete span
    if let (Some(t), Some(sid)) = (telemetry, &span_id) {
        t.end_span(sid, "daemon.sync_all", started_at, "ok", None, None)
            .await;
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
    cached_phase_number: &str,
    worktree_path: &Path,
    branch: &str,
    telemetry: Option<&DaemonTelemetry>,
) -> Result<()> {
    let started_at = chrono::Utc::now();
    let span_id = telemetry.map(|t| t.start_span("daemon.sync_commits"));
    // Get last known SHA from cache
    let last_sha = cache
        .last_commit_sha
        .get(orchestration_id)
        .cloned();

    // Strict watch mode: only process commits after an initialized HEAD anchor.
    let Some(last_sha) = last_sha else {
        let anchor_sha = git::get_head_sha(worktree_path)?;
        cache
            .last_commit_sha
            .insert(orchestration_id.to_string(), anchor_sha.clone());

        if let Some(t) = telemetry {
            let attrs = serde_json::json!({
                "orchestration_id": orchestration_id,
                "reason": "initialized_head_anchor",
                "head_sha": anchor_sha,
            })
            .to_string();
            t.emit_event(
                "projection.skip",
                "info",
                "initialized commit anchor at HEAD",
                Some(attrs),
            )
            .await;
        }

        if let (Some(t), Some(sid)) = (telemetry, &span_id) {
            t.end_span(sid, "daemon.sync_commits", started_at, "ok", None, None)
                .await;
        }
        return Ok(());
    };
    let new_commits = git::get_new_commits(worktree_path, branch, Some(&last_sha))?;

    if new_commits.is_empty() {
        // Emit skip event for no new commits
        if let Some(t) = telemetry {
            let attrs = serde_json::json!({
                "orchestration_id": orchestration_id,
                "reason": "no_new_commits",
            })
            .to_string();
            t.emit_event(
                "projection.skip",
                "info",
                "no new commits to sync",
                Some(attrs),
            )
            .await;
        }

        if let (Some(t), Some(sid)) = (telemetry, &span_id) {
            t.end_span(sid, "daemon.sync_commits", started_at, "ok", None, None)
                .await;
        }
        return Ok(());
    }

    info!(
        orchestration = %orchestration_id,
        count = new_commits.len(),
        "syncing new commits"
    );

    let phase_number = resolve_live_phase_number(client, orchestration_id, cached_phase_number).await;
    if phase_number != cached_phase_number {
        info!(
            orchestration = %orchestration_id,
            cached_phase = %cached_phase_number,
            live_phase = %phase_number,
            "resolved newer phase for commit sync"
        );
    }
    if let Some(worktree) = cache
        .worktrees
        .iter_mut()
        .find(|wt| wt.orchestration_id == orchestration_id)
    {
        worktree.current_phase = phase_number.clone();
    }

    // Record each commit to Convex
    let mut all_writes_succeeded = true;
    let mut first_write_error = None;

    for commit in &new_commits {
        let record = CommitRecord {
            orchestration_id: orchestration_id.to_string(),
            phase_number: phase_number.to_string(),
            sha: commit.sha.clone(),
            short_sha: Some(commit.short_sha.clone()),
            subject: Some(commit.subject.clone()),
        };

        let record_result = {
            let mut client_guard = client.lock().await;
            client_guard.record_commit(&record).await
        };
        match record_result {
            Ok(_) => {
                debug!(sha = %commit.short_sha, orchestration = %orchestration_id, "recorded commit");

                // Emit projection.write event
                if let Some(t) = telemetry {
                    let attrs = serde_json::json!({
                        "orchestration_id": orchestration_id,
                        "sha": &commit.short_sha,
                    })
                    .to_string();
                    t.emit_event("projection.write", "info", "commit written", Some(attrs))
                        .await;
                }
            }
            Err(e) => {
                all_writes_succeeded = false;
                if first_write_error.is_none() {
                    first_write_error = Some(e.to_string());
                }
                error!(sha = %commit.short_sha, error = %e, "failed to record commit");
                break;
            }
        }
    }

    maybe_advance_last_commit_sha(
        cache,
        orchestration_id,
        &new_commits,
        all_writes_succeeded,
    );

    if let Some(err) = first_write_error {
        if let (Some(t), Some(sid)) = (telemetry, &span_id) {
            t.end_span(
                sid,
                "daemon.sync_commits",
                started_at,
                "error",
                Some("convex_write_failed".to_string()),
                Some(err.clone()),
            )
            .await;
        }
        anyhow::bail!("failed to record commit batch: {}", err);
    }

    // Complete span
    if let (Some(t), Some(sid)) = (telemetry, &span_id) {
        t.end_span(sid, "daemon.sync_commits", started_at, "ok", None, None)
            .await;
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
    telemetry: Option<&DaemonTelemetry>,
) -> Result<()> {
    let started_at = chrono::Utc::now();
    let span_id = telemetry.map(|t| t.start_span("daemon.sync_plan"));
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

    let upsert_result = {
        let mut client_guard = client.lock().await;
        client_guard.upsert_plan(&record).await
    };
    match upsert_result {
        Ok(_) => {
            info!(
                plan = %filename,
                orchestration = %orchestration_id,
                "synced plan"
            );

            // Emit projection.write event
            if let Some(t) = telemetry {
                let attrs = serde_json::json!({
                    "orchestration_id": orchestration_id,
                    "filename": filename,
                })
                .to_string();
                t.emit_event("projection.write", "info", "plan written", Some(attrs))
                    .await;
            }
        }
        Err(e) => {
            error!(plan = %filename, error = %e, "failed to sync plan");
        }
    }

    // Complete span
    if let (Some(t), Some(sid)) = (telemetry, &span_id) {
        t.end_span(sid, "daemon.sync_plan", started_at, "ok", None, None)
            .await;
    }

    Ok(())
}

/// Extract a string field from a `meta.ts` file using regex.
///
/// Looks for patterns like `field: "Value"` or `field: 'Value'`.
fn extract_string_field_from_meta(meta_path: &Path, field: &str) -> Option<String> {
    let content = fs::read_to_string(meta_path).ok()?;
    let pattern = format!(r#"{}\s*:\s*["']([^"']+)["']"#, regex::escape(field));
    let re = Regex::new(&pattern).ok()?;
    re.captures(&content)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

/// Extract a title from a `meta.ts` file.
pub fn extract_title_from_meta(meta_path: &Path) -> Option<String> {
    extract_string_field_from_meta(meta_path, "title")
}

/// Extract a prompt from a design-level `meta.ts` file.
pub fn extract_prompt_from_meta(meta_path: &Path) -> Option<String> {
    extract_string_field_from_meta(meta_path, "prompt")
}

fn title_from_slug(slug: &str) -> String {
    let words: Vec<String> = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => {
                    let mut title = first.to_uppercase().collect::<String>();
                    title.push_str(chars.as_str());
                    title
                }
                None => String::new(),
            }
        })
        .collect();

    if words.is_empty() {
        slug.to_string()
    } else {
        words.join(" ")
    }
}

/// Sync design metadata from the filesystem to Convex.
///
/// Reads the `ui/designs/sets/` directory structure, treating first-level
/// directories as designs and second-level directories as variations.
pub async fn sync_design_metadata(
    client: &Arc<Mutex<TinaConvexClient>>,
    orchestration_id: &str,
    project_id: Option<&str>,
    worktree_path: &Path,
    telemetry: Option<&DaemonTelemetry>,
) -> Result<()> {
    let started_at = chrono::Utc::now();
    let span_id = telemetry.map(|t| t.start_span("daemon.sync_design_metadata"));

    let sets_dir = worktree_path.join("ui").join("designs").join("sets");
    if !sets_dir.exists() {
        if let (Some(t), Some(sid)) = (telemetry, &span_id) {
            t.end_span(
                sid,
                "daemon.sync_design_metadata",
                started_at,
                "ok",
                None,
                None,
            )
            .await;
        }
        return Ok(());
    }

    let Some(project_id) = project_id else {
        warn!(
            orchestration = %orchestration_id,
            "skipping design sync: orchestration has no project_id"
        );
        if let (Some(t), Some(sid)) = (telemetry, &span_id) {
            t.end_span(
                sid,
                "daemon.sync_design_metadata",
                started_at,
                "ok",
                None,
                None,
            )
            .await;
        }
        return Ok(());
    };

    let existing_designs = {
        let mut client_guard = client.lock().await;
        client_guard
            .list_designs(project_id, None)
            .await
            .context("listing designs for metadata sync")?
    };

    let mut design_ids_by_title: HashMap<String, String> = existing_designs
        .into_iter()
        .map(|design| (design.title, design.id))
        .collect();

    let mut design_entries = Vec::new();
    for entry in fs::read_dir(&sets_dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            design_entries.push(entry);
        }
    }
    design_entries.sort_by_key(|entry| entry.file_name());

    for design_entry in design_entries {
        let design_slug = design_entry.file_name().to_string_lossy().to_string();
        let design_dir = design_entry.path();
        let meta_path = design_dir.join("meta.ts");

        let title = if meta_path.exists() {
            extract_title_from_meta(&meta_path).unwrap_or_else(|| title_from_slug(&design_slug))
        } else {
            title_from_slug(&design_slug)
        };
        let prompt = if meta_path.exists() {
            extract_prompt_from_meta(&meta_path)
                .unwrap_or_else(|| format!("Explore visual direction for {}", title))
        } else {
            format!("Explore visual direction for {}", title)
        };

        let design_id = match design_ids_by_title.get(&title) {
            Some(existing_id) => existing_id.clone(),
            None => {
                let create_result = {
                    let mut client_guard = client.lock().await;
                    client_guard.create_design(project_id, &title, &prompt).await
                };
                match create_result {
                    Ok(new_id) => {
                        info!(
                            design = %design_slug,
                            title = %title,
                            orchestration = %orchestration_id,
                            "created design from workbench metadata"
                        );
                        design_ids_by_title.insert(title.clone(), new_id.clone());
                        new_id
                    }
                    Err(e) => {
                        warn!(
                            design = %design_slug,
                            title = %title,
                            orchestration = %orchestration_id,
                            error = %e,
                            "failed to create design from metadata"
                        );
                        continue;
                    }
                }
            }
        };

        let existing_variation_slugs: HashSet<String> = match {
            let mut client_guard = client.lock().await;
            client_guard.list_variations(&design_id).await
        } {
            Ok(variations) => variations.into_iter().map(|variation| variation.slug).collect(),
            Err(e) => {
                warn!(
                    design = %design_slug,
                    design_id = %design_id,
                    orchestration = %orchestration_id,
                    error = %e,
                    "failed to list existing variations"
                );
                HashSet::new()
            }
        };
        let mut seen_variation_slugs = existing_variation_slugs;

        let mut variation_entries = Vec::new();
        for var_entry in fs::read_dir(&design_dir)? {
            let var_entry = var_entry?;
            if var_entry.file_type()?.is_dir() {
                variation_entries.push(var_entry);
            }
        }
        variation_entries.sort_by_key(|entry| entry.file_name());

        for var_entry in variation_entries {
            let var_slug = var_entry.file_name().to_string_lossy().to_string();
            if seen_variation_slugs.contains(&var_slug) {
                continue;
            }

            let variation_meta_path = var_entry.path().join("meta.ts");
            let variation_title = if variation_meta_path.exists() {
                extract_title_from_meta(&variation_meta_path)
                    .unwrap_or_else(|| title_from_slug(&var_slug))
            } else {
                title_from_slug(&var_slug)
            };

            let create_variation_result = {
                let mut client_guard = client.lock().await;
                client_guard
                    .create_variation(&design_id, &var_slug, &variation_title)
                    .await
            };
            match create_variation_result {
                Ok(_) => {
                    seen_variation_slugs.insert(var_slug.clone());
                    info!(
                        design = %design_slug,
                        variation = %var_slug,
                        design_id = %design_id,
                        orchestration = %orchestration_id,
                        "created design variation from workbench metadata"
                    );
                }
                Err(e) => {
                    warn!(
                        design = %design_slug,
                        variation = %var_slug,
                        design_id = %design_id,
                        orchestration = %orchestration_id,
                        error = %e,
                        "failed to create design variation"
                    );
                }
            }
        }
    }

    if let (Some(t), Some(sid)) = (telemetry, &span_id) {
        t.end_span(
            sid,
            "daemon.sync_design_metadata",
            started_at,
            "ok",
            None,
            None,
        )
        .await;
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
                project_id: orch.project_id.clone(),
                feature: orch.feature_name.clone(),
                worktree_path: path_buf,
                branch: orch.branch.clone(),
                current_phase: orch.current_phase.to_string(),
                git_dir_path: None,
                branch_ref_path: None,
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

    fn create_team_dir_with(
        dir: &Path,
        dir_name: &str,
        config_team_name: &str,
        lead_session_id: &str,
        cwd: &str,
    ) {
        let team_dir = dir.join(dir_name);
        fs::create_dir_all(&team_dir).unwrap();
        let config = format!(
            r#"{{
                "name": "{}",
                "description": "Test",
                "createdAt": 1706644800000,
                "leadAgentId": "lead@{}",
                "leadSessionId": "{}",
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
            config_team_name,
            config_team_name,
            lead_session_id,
            config_team_name,
            cwd,
            config_team_name,
            cwd
        );
        fs::write(team_dir.join("config.json"), config).unwrap();
    }

    fn create_team_dir(dir: &Path, name: &str, cwd: &str) {
        create_team_dir_with(dir, name, name, &format!("session-{}", name), cwd);
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
    fn test_load_team_config_with_tmux_pane_id() {
        let temp = TempDir::new().unwrap();
        let teams_dir = temp.path().join("teams");
        let team_dir = teams_dir.join("pane-team");
        fs::create_dir_all(&team_dir).unwrap();
        let config = r#"{
            "name": "pane-team",
            "description": "Test",
            "createdAt": 1706644800000,
            "leadAgentId": "lead@pane-team",
            "leadSessionId": "session-pane",
            "members": [{
                "agentId": "lead@pane-team",
                "name": "team-lead",
                "agentType": "team-lead",
                "model": "claude-opus-4-6",
                "joinedAt": 1706644800000,
                "tmuxPaneId": "%42",
                "cwd": "/path",
                "subscriptions": []
            }, {
                "agentId": "worker@pane-team",
                "name": "worker",
                "agentType": "general-purpose",
                "model": "claude-sonnet-4-5",
                "joinedAt": 1706644800001,
                "tmuxPaneId": null,
                "cwd": "/path",
                "subscriptions": []
            }]
        }"#;
        fs::write(team_dir.join("config.json"), config).unwrap();

        let team = load_team_config(&teams_dir, "pane-team").unwrap();
        assert_eq!(team.members[0].tmux_pane_id, Some("%42".to_string()));
        assert_eq!(team.members[1].tmux_pane_id, None);
    }

    #[test]
    fn test_resolve_local_team_dir_name_uses_convex_local_dir_name() {
        let team = ActiveTeamRecord {
            id: "team_abc".to_string(),
            team_name: "feature-phase-6.5".to_string(),
            orchestration_id: "orch_123".to_string(),
            lead_session_id: "lead-session-123".to_string(),
            local_dir_name: "feature-phase-6-5".to_string(),
            tmux_session_name: Some("tina-feature-phase-6-5".to_string()),
            phase_number: Some("6.5".to_string()),
            parent_team_id: None,
            created_at: 1_706_644_800_000f64,
            orchestration_status: "executing".to_string(),
            feature_name: "feature".to_string(),
        };

        let mut cache = SyncCache::new();
        let resolved = resolve_local_team_dir_name(&team, &mut cache).unwrap();
        assert_eq!(resolved, "feature-phase-6-5");
        assert_eq!(
            cache.team_dir_name_by_id.get("team_abc"),
            Some(&"feature-phase-6-5".to_string())
        );
    }

    #[test]
    fn test_resolve_task_team_dir_uses_convex_local_dir_name() {
        let temp = TempDir::new().unwrap();
        let tasks_dir = temp.path().join("tasks");
        fs::create_dir_all(tasks_dir.join("feature-phase-6-5")).unwrap();

        let team = ActiveTeamRecord {
            id: "team_abc".to_string(),
            team_name: "feature-phase-6.5".to_string(),
            orchestration_id: "orch_123".to_string(),
            lead_session_id: "pending".to_string(),
            local_dir_name: "feature-phase-6-5".to_string(),
            tmux_session_name: Some("tina-feature-phase-6-5".to_string()),
            phase_number: Some("6.5".to_string()),
            parent_team_id: None,
            created_at: 1_706_644_800_000f64,
            orchestration_status: "executing".to_string(),
            feature_name: "feature".to_string(),
        };

        let mut cache = SyncCache::new();
        let (path, dir_name) = resolve_task_team_dir(&tasks_dir, &team, &mut cache).unwrap();
        assert_eq!(dir_name, "feature-phase-6-5");
        assert_eq!(path, tasks_dir.join("feature-phase-6-5"));
    }

    #[test]
    fn test_resolve_local_team_dir_name_errors_when_empty() {
        let team = ActiveTeamRecord {
            id: "team_abc".to_string(),
            team_name: "feature-phase-6.5".to_string(),
            orchestration_id: "orch_123".to_string(),
            lead_session_id: "pending".to_string(),
            local_dir_name: "".to_string(),
            tmux_session_name: Some("tina-feature-phase-6-5".to_string()),
            phase_number: Some("6.5".to_string()),
            parent_team_id: None,
            created_at: 1_706_644_800_000f64,
            orchestration_status: "executing".to_string(),
            feature_name: "feature".to_string(),
        };

        let mut cache = SyncCache::new();
        let err = resolve_local_team_dir_name(&team, &mut cache).unwrap_err();
        assert!(err
            .to_string()
            .contains("empty local_dir_name for team_id=team_abc"));
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
        let key = ("orch-1".to_string(), "1".to_string(), "task-1".to_string());
        let entry = TaskCacheEntry {
            status: "pending".to_string(),
            subject: "Test".to_string(),
            description: "Test description".to_string(),
            owner: None,
            blocked_by: Some("[\"1\"]".to_string()),
            metadata: Some("{\"model\":\"opus\"}".to_string()),
        };

        cache.task_state.insert(key.clone(), entry.clone());

        // Same entry should match
        assert_eq!(cache.task_state.get(&key), Some(&entry));
    }

    #[test]
    fn test_cache_detects_task_change() {
        let mut cache = SyncCache::new();
        let key = ("orch-1".to_string(), "1".to_string(), "task-1".to_string());

        let old = TaskCacheEntry {
            status: "pending".to_string(),
            subject: "Test".to_string(),
            description: "Old description".to_string(),
            owner: None,
            blocked_by: None,
            metadata: None,
        };
        cache.task_state.insert(key.clone(), old);

        let new = TaskCacheEntry {
            status: "in_progress".to_string(),
            subject: "Test".to_string(),
            description: "New description".to_string(),
            owner: Some("worker".to_string()),
            blocked_by: Some("[\"2\"]".to_string()),
            metadata: Some("{\"model\":\"haiku\"}".to_string()),
        };

        // Different entry should not match
        assert_ne!(cache.task_state.get(&key), Some(&new));
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
    fn test_task_cache_key_uses_phase() {
        let key = task_cache_key("orch-1", Some("1.5"), "task-3");
        assert_eq!(
            key,
            (
                "orch-1".to_string(),
                "1.5".to_string(),
                "task-3".to_string()
            )
        );
    }

    #[test]
    fn test_task_cache_key_uses_orchestrator_default() {
        let key = task_cache_key("orch-1", None, "task-3");
        assert_eq!(
            key,
            (
                "orch-1".to_string(),
                ORCHESTRATOR_PHASE_KEY.to_string(),
                "task-3".to_string()
            )
        );
    }

    #[test]
    fn test_find_worktree_by_ref_path() {
        let mut cache = SyncCache::new();
        cache.set_worktrees(vec![WorktreeInfo {
            orchestration_id: "orch1".to_string(),
            project_id: None,
            feature: "test-feature".to_string(),
            worktree_path: PathBuf::from("/project/.worktrees/test"),
            branch: "tina/test-feature".to_string(),
            current_phase: "1".to_string(),
            git_dir_path: Some(PathBuf::from("/project/.git")),
            branch_ref_path: Some(PathBuf::from("/project/.git/refs/heads/tina/test-feature")),
        }]);

        let ref_path = PathBuf::from("/project/.git/refs/heads/tina/test-feature");
        let found = cache.find_worktree_by_ref_path(&ref_path);
        assert!(found.is_some());
        assert_eq!(found.unwrap().feature, "test-feature");
    }

    #[test]
    fn test_find_worktree_by_ref_path_with_git_file_worktree_layout() {
        let mut cache = SyncCache::new();
        cache.set_worktrees(vec![WorktreeInfo {
            orchestration_id: "orch1".to_string(),
            project_id: None,
            feature: "test-feature".to_string(),
            worktree_path: PathBuf::from("/project/.worktrees/test"),
            branch: "tina/test-feature".to_string(),
            current_phase: "1".to_string(),
            git_dir_path: Some(PathBuf::from("/project/.git/worktrees/test")),
            branch_ref_path: Some(PathBuf::from("/project/.git/refs/heads/tina/test-feature")),
        }]);

        // Simulate notify emitting an ancestor path from a nested branch event.
        let parent_ref_dir = PathBuf::from("/project/.git/refs/heads/tina");
        let found = cache.find_worktree_by_ref_path(&parent_ref_dir);
        assert!(found.is_some());
        assert_eq!(found.unwrap().feature, "test-feature");
    }

    #[test]
    fn test_find_worktree_by_plan_path() {
        let mut cache = SyncCache::new();
        cache.set_worktrees(vec![WorktreeInfo {
            orchestration_id: "orch1".to_string(),
            project_id: None,
            feature: "test-feature".to_string(),
            worktree_path: PathBuf::from("/project/.worktrees/test"),
            branch: "tina/test-feature".to_string(),
            current_phase: "1".to_string(),
            git_dir_path: None,
            branch_ref_path: None,
        }]);

        let plan_path =
            PathBuf::from("/project/.worktrees/test/docs/plans/2026-02-10-test-phase-1.md");
        let found = cache.find_worktree_by_plan_path(&plan_path);
        assert!(found.is_some());
        assert_eq!(found.unwrap().feature, "test-feature");
    }

    #[test]
    fn test_find_worktree_by_design_path() {
        let mut cache = SyncCache::new();
        cache.set_worktrees(vec![WorktreeInfo {
            orchestration_id: "orch1".to_string(),
            project_id: None,
            feature: "test-feature".to_string(),
            worktree_path: PathBuf::from("/project/.worktrees/test"),
            branch: "tina/test-feature".to_string(),
            current_phase: "1".to_string(),
            git_dir_path: None,
            branch_ref_path: None,
        }]);

        let design_path = PathBuf::from(
            "/project/.worktrees/test/ui/designs/sets/my-design/meta.ts",
        );
        let found = cache.find_worktree_by_design_path(&design_path);
        assert!(found.is_some());
        assert_eq!(found.unwrap().feature, "test-feature");
    }

    #[test]
    fn test_find_worktree_by_design_path_not_found() {
        let mut cache = SyncCache::new();
        cache.set_worktrees(vec![WorktreeInfo {
            orchestration_id: "orch1".to_string(),
            project_id: None,
            feature: "test-feature".to_string(),
            worktree_path: PathBuf::from("/project/.worktrees/test"),
            branch: "tina/test-feature".to_string(),
            current_phase: "1".to_string(),
            git_dir_path: None,
            branch_ref_path: None,
        }]);

        let design_path = PathBuf::from(
            "/other/.worktrees/other/ui/designs/sets/my-design/meta.ts",
        );
        assert!(cache.find_worktree_by_design_path(&design_path).is_none());
    }

    #[test]
    fn test_extract_title_from_meta_double_quotes() {
        let temp = TempDir::new().unwrap();
        let meta_path = temp.path().join("meta.ts");
        fs::write(
            &meta_path,
            r#"export default { title: "My Cool Design" };"#,
        )
        .unwrap();

        assert_eq!(
            extract_title_from_meta(&meta_path),
            Some("My Cool Design".to_string())
        );
    }

    #[test]
    fn test_extract_title_from_meta_single_quotes() {
        let temp = TempDir::new().unwrap();
        let meta_path = temp.path().join("meta.ts");
        fs::write(
            &meta_path,
            "export default { title: 'Single Quoted Title' };",
        )
        .unwrap();

        assert_eq!(
            extract_title_from_meta(&meta_path),
            Some("Single Quoted Title".to_string())
        );
    }

    #[test]
    fn test_extract_title_from_meta_no_title() {
        let temp = TempDir::new().unwrap();
        let meta_path = temp.path().join("meta.ts");
        fs::write(&meta_path, "export default { description: 'no title here' };").unwrap();

        assert_eq!(extract_title_from_meta(&meta_path), None);
    }

    #[test]
    fn test_extract_title_from_meta_missing_file() {
        let path = Path::new("/nonexistent/meta.ts");
        assert_eq!(extract_title_from_meta(path), None);
    }

    #[test]
    fn test_extract_prompt_from_meta() {
        let temp = TempDir::new().unwrap();
        let meta_path = temp.path().join("meta.ts");
        fs::write(
            &meta_path,
            r#"export default { prompt: "Explore dashboard variants" };"#,
        )
        .unwrap();

        assert_eq!(
            extract_prompt_from_meta(&meta_path),
            Some("Explore dashboard variants".to_string())
        );
    }

    #[test]
    fn test_title_from_slug_humanizes_kebab_case() {
        assert_eq!(title_from_slug("my-design-v2"), "My Design V2");
        assert_eq!(title_from_slug("single"), "Single");
    }

    #[test]
    fn test_find_worktree_not_found() {
        let cache = SyncCache::new();
        let ref_path = PathBuf::from("/nonexistent/path");
        assert!(cache.find_worktree_by_ref_path(&ref_path).is_none());
    }

    #[test]
    fn test_should_emit_skip_event_throttles_within_window() {
        let mut cache = SyncCache::new();
        let now = 1_000_000i64;
        let key = "unchanged_cache:orch:1".to_string();

        assert!(should_emit_skip_event(&mut cache, key.clone(), now));
        assert!(!should_emit_skip_event(&mut cache, key.clone(), now + 10));
        assert!(should_emit_skip_event(
            &mut cache,
            key,
            now + SKIP_EVENT_THROTTLE_SECS + 1
        ));
    }

    #[test]
    fn test_maybe_advance_last_commit_sha_updates_only_on_full_success() {
        let mut cache = SyncCache::new();
        cache
            .last_commit_sha
            .insert("orch-1".to_string(), "oldsha".to_string());

        let commits = vec![
            git::GitCommit {
                sha: "newest".to_string(),
                short_sha: "newest".to_string(),
                subject: "new".to_string(),
                author: "test".to_string(),
                timestamp: "2026-02-13T00:00:00Z".to_string(),
                insertions: 1,
                deletions: 0,
            },
            git::GitCommit {
                sha: "older".to_string(),
                short_sha: "older".to_string(),
                subject: "old".to_string(),
                author: "test".to_string(),
                timestamp: "2026-02-12T00:00:00Z".to_string(),
                insertions: 0,
                deletions: 1,
            },
        ];

        maybe_advance_last_commit_sha(&mut cache, "orch-1", &commits, false);
        assert_eq!(
            cache.last_commit_sha.get("orch-1"),
            Some(&"oldsha".to_string())
        );

        maybe_advance_last_commit_sha(&mut cache, "orch-1", &commits, true);
        assert_eq!(
            cache.last_commit_sha.get("orch-1"),
            Some(&"newest".to_string())
        );
    }
}
