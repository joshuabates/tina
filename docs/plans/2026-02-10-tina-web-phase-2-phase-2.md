# Phase 2: Data Collection (tina-daemon)

Implements filesystem watchers and sync logic in tina-daemon from `docs/plans/2026-02-10-tina-web-phase-2-design.md`.

## Summary

Add three watchers to tina-daemon:
1. **Team member removal detection** - Cache team state, detect member removals, record shutdown events
2. **Git commit watcher** - Watch `.git/refs/heads/{branch}` in worktrees, sync commits to Convex in real-time
3. **Plan file watcher** - Watch `docs/plans/*.md` in worktrees, sync plan content to Convex on changes

All watchers integrate with existing `DaemonWatcher` pattern and sync via Convex mutations implemented in Phase 1.

## Tasks

### Task 2.1: Team member removal detection

**Model:** opus

**Files:**
- `tina-daemon/src/sync.rs` (existing, modify)
- `tina-daemon/src/sync.rs` (add tests)

**Implementation:**

Add cache structure to track previous team state:

```rust
// Add to sync.rs module-level state or SyncCache struct
struct TeamMemberCache {
    members: HashMap<String, Agent>,  // agent_name -> Agent
    last_synced: SystemTime,
}

// Add to SyncCache or create new cache
struct TeamCache {
    teams: HashMap<String, TeamMemberCache>,  // team_name -> TeamMemberCache
}
```

Update `sync_team_members` function to detect removals:

```rust
pub fn sync_team_members(
    &mut self,
    team_name: &str,
    team_config: &Team,
) -> Result<()> {
    let current_members: HashMap<_, _> = team_config.members
        .iter()
        .map(|m| (m.name.clone(), m.clone()))
        .collect();

    // Get previous state from cache
    let previous_members = self.team_cache
        .teams
        .get(team_name)
        .map(|c| &c.members)
        .cloned()
        .unwrap_or_default();

    // Detect removals (members in previous but not in current)
    for (name, agent) in &previous_members {
        if !current_members.contains_key(name) {
            // Member was removed - record shutdown event
            self.record_shutdown_event(team_name, agent)?;
        }
    }

    // Sync current members to Convex (existing logic)
    for member in &team_config.members {
        self.upsert_team_member(team_name, member)?;
    }

    // Update cache
    self.team_cache.teams.insert(
        team_name.clone(),
        TeamMemberCache {
            members: current_members,
            last_synced: SystemTime::now(),
        },
    );

    Ok(())
}
```

Add shutdown event recording function:

```rust
fn record_shutdown_event(
    &self,
    team_name: &str,
    agent: &Agent,
) -> Result<()> {
    // Get orchestration ID from team name via cache
    let orchestration_id = self.orchestration_cache
        .get_orchestration_id(team_name)
        .ok_or_else(|| anyhow!("No orchestration ID for team {}", team_name))?;

    // Extract phase number from team name (e.g., "feature-orchestration-phase-2" -> "2")
    let phase_number = extract_phase_from_team_name(team_name)?;

    let event = OrchestrationEventRecord {
        orchestration_id: orchestration_id.clone(),
        phase_number,
        event_type: "agent_shutdown".to_string(),
        source: "tina-daemon".to_string(),
        summary: format!("{} shutdown", agent.name),
        detail: Some(serde_json::json!({
            "agent_name": agent.name,
            "agent_type": agent.agent_type,
            "shutdown_detected_at": chrono::Utc::now().to_rfc3339(),
        }).to_string()),
        recorded_at: chrono::Utc::now().to_rfc3339(),
    };

    self.convex_writer.record_event(&event)?;
    info!("Recorded shutdown event for agent {} in team {}", agent.name, team_name);

    Ok(())
}

fn extract_phase_from_team_name(team_name: &str) -> Result<String> {
    // Extract phase from pattern: "{feature}-orchestration-phase-{N}"
    let re = regex::Regex::new(r"-phase-(\d+)$")?;
    let captures = re.captures(team_name)
        .ok_or_else(|| anyhow!("Team name does not match phase pattern: {}", team_name))?;

    Ok(captures[1].to_string())
}
```

**Tests:**

Add unit tests in `tina-daemon/src/sync.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_member_removal_detection() {
        // Setup: cache with 3 members
        let previous = vec![
            Agent { name: "planner".into(), agent_type: "tina:planner".into() },
            Agent { name: "executor-1".into(), agent_type: "tina:executor".into() },
            Agent { name: "executor-2".into(), agent_type: "tina:executor".into() },
        ];

        // Current: only 2 members (executor-2 removed)
        let current = vec![
            Agent { name: "planner".into(), agent_type: "tina:planner".into() },
            Agent { name: "executor-1".into(), agent_type: "tina:executor".into() },
        ];

        // Expected: executor-2 shutdown event recorded
        // ... test implementation
    }

    #[test]
    fn test_no_false_positives_on_first_sync() {
        // First sync with empty cache should not trigger shutdown events
        // ... test implementation
    }

    #[test]
    fn test_extract_phase_from_team_name() {
        assert_eq!(extract_phase_from_team_name("my-feature-orchestration-phase-1").unwrap(), "1");
        assert_eq!(extract_phase_from_team_name("multi-word-orchestration-phase-12").unwrap(), "12");
        assert!(extract_phase_from_team_name("no-phase-suffix").is_err());
    }
}
```

**Validation:**
- Tests pass for member removal detection
- No false positives on first sync (empty cache)
- Phase extraction regex works for valid team names
- Shutdown events written to Convex with correct structure

**Dependencies:** Phase 1 Task 1.4 (shutdown event schema)

**Blocker for:** Phase 3 Task 3.1 (UI shutdown display)

### Task 2.2: Git commit watcher

**Model:** opus

**Files:**
- `tina-daemon/src/watcher.rs` (modify existing DaemonWatcher)
- `tina-daemon/src/git.rs` (new module)
- `tina-daemon/src/sync.rs` (add commit sync function)

**Implementation:**

**Step 1: Worktree discovery**

Add worktree discovery to daemon startup:

```rust
// In tina-daemon/src/main.rs or sync.rs
async fn discover_worktrees(&self) -> Result<Vec<WorktreeInfo>> {
    // Query Convex for active orchestrations (status != Complete)
    let orchestrations = self.convex_client
        .query("orchestrations:listActive", json!({}))
        .await?;

    let mut worktrees = Vec::new();
    for orch in orchestrations {
        // Get supervisor state to extract worktree_path and branch
        let feature = orch["feature"].as_str().unwrap();
        let state = self.convex_client
            .query("supervisorStates:getSupervisorState", json!({
                "feature": feature
            }))
            .await?;

        if let Some(state) = state {
            let worktree_path = state["worktree_path"].as_str().unwrap();
            let branch = state["branch"].as_str().unwrap();
            let orchestration_id = orch["_id"].as_str().unwrap();

            worktrees.push(WorktreeInfo {
                orchestration_id: orchestration_id.into(),
                feature: feature.into(),
                worktree_path: PathBuf::from(worktree_path),
                branch: branch.into(),
            });
        }
    }

    Ok(worktrees)
}
```

**Step 2: Git ref watcher**

Create new `tina-daemon/src/git.rs`:

```rust
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct GitCommit {
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub author: String,
    pub timestamp: String,
    pub insertions: u32,
    pub deletions: u32,
}

pub fn get_new_commits(
    repo_path: &Path,
    branch: &str,
    since_sha: Option<&str>,
) -> Result<Vec<GitCommit>> {
    let range = match since_sha {
        Some(sha) => format!("{}..HEAD", sha),
        None => "HEAD~10..HEAD".to_string(), // First sync: last 10 commits
    };

    // Run: git log <range> --numstat --format=%H|%h|%s|%an <%ae>|%aI
    let output = Command::new("git")
        .current_dir(repo_path)
        .args([
            "log",
            &range,
            "--numstat",
            "--format=%H|%h|%s|%an <%ae>|%aI",
        ])
        .output()
        .context("Failed to run git log")?;

    if !output.status.success() {
        anyhow::bail!(
            "git log failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let stdout = String::from_utf8(output.stdout)?;
    parse_git_log_output(&stdout)
}

fn parse_git_log_output(output: &str) -> Result<Vec<GitCommit>> {
    let mut commits = Vec::new();
    let mut lines = output.lines();

    while let Some(header_line) = lines.next() {
        if header_line.trim().is_empty() {
            continue;
        }

        // Parse header: SHA|shortSHA|subject|author|timestamp
        let parts: Vec<&str> = header_line.split('|').collect();
        if parts.len() != 5 {
            continue; // Skip malformed lines
        }

        let sha = parts[0].to_string();
        let short_sha = parts[1].to_string();
        let subject = parts[2].to_string();
        let author = parts[3].to_string();
        let timestamp = parts[4].to_string();

        // Parse numstat lines until empty line or next commit
        let mut insertions = 0u32;
        let mut deletions = 0u32;

        loop {
            let line = lines.next();
            if line.is_none() || line.unwrap().trim().is_empty() {
                break;
            }

            let stat_line = line.unwrap();
            let parts: Vec<&str> = stat_line.split_whitespace().collect();
            if parts.len() >= 2 {
                // Format: <insertions> <deletions> <filename>
                insertions += parts[0].parse::<u32>().unwrap_or(0);
                deletions += parts[1].parse::<u32>().unwrap_or(0);
            }
        }

        commits.push(GitCommit {
            sha,
            short_sha,
            subject,
            author,
            timestamp,
            insertions,
            deletions,
        });
    }

    Ok(commits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_git_log_output() {
        let output = r#"abc123|abc1234|feat: add feature|John Doe <john@example.com>|2026-02-10T10:00:00Z
3       1       src/main.rs
2       0       README.md

def456|def4567|fix: bug fix|Jane Smith <jane@example.com>|2026-02-10T11:00:00Z
5       2       src/lib.rs
"#;
        let commits = parse_git_log_output(output).unwrap();
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].sha, "abc123");
        assert_eq!(commits[0].insertions, 5);
        assert_eq!(commits[0].deletions, 1);
    }
}
```

**Step 3: Integrate watcher**

Modify `tina-daemon/src/watcher.rs` to watch git refs:

```rust
// Add to DaemonWatcher struct
pub fn watch_git_refs(&mut self, worktrees: Vec<WorktreeInfo>) -> Result<()> {
    for worktree in worktrees {
        let ref_path = worktree.worktree_path
            .join(".git/refs/heads")
            .join(&worktree.branch);

        if ref_path.exists() {
            self.watcher.watch(&ref_path, RecursiveMode::NonRecursive)?;
            info!("Watching git ref: {}", ref_path.display());

            // Store worktree info for event handling
            self.worktree_map.insert(ref_path.clone(), worktree);
        }
    }

    Ok(())
}
```

**Step 4: Sync function**

Add to `tina-daemon/src/sync.rs`:

```rust
pub async fn sync_commits(
    &mut self,
    worktree: &WorktreeInfo,
) -> Result<()> {
    // Get last known SHA for this orchestration+branch
    let last_sha = self.git_cache
        .get(&worktree.orchestration_id)
        .map(|s| s.as_str());

    // Parse new commits
    let new_commits = git::get_new_commits(
        &worktree.worktree_path,
        &worktree.branch,
        last_sha,
    )?;

    if new_commits.is_empty() {
        return Ok(());
    }

    // Get current phase from supervisor state
    let phase = self.get_current_phase(&worktree.feature)?;

    // Record each commit to Convex
    for commit in &new_commits {
        self.convex_writer.record_commit(
            &worktree.orchestration_id,
            &phase,
            commit,
        ).await?;
    }

    // Update cache with latest SHA
    if let Some(latest) = new_commits.first() {
        self.git_cache.insert(
            worktree.orchestration_id.clone(),
            latest.sha.clone(),
        );
    }

    info!(
        "Synced {} commits for orchestration {}",
        new_commits.len(),
        worktree.orchestration_id
    );

    Ok(())
}

fn get_current_phase(&self, feature: &str) -> Result<String> {
    // Query supervisor state for current_phase
    // ... implementation
}
```

**Tests:**

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_get_new_commits_with_range() {
        // Create test git repo with commits
        // Call get_new_commits with since_sha
        // Verify correct commits returned
    }

    #[test]
    fn test_commit_deduplication() {
        // Sync same SHA twice
        // Verify only one record created
    }
}
```

**Validation:**
- Git log parsing handles various commit formats
- Commit stats (insertions/deletions) calculated correctly
- Deduplication via `by_sha` index prevents duplicates
- Watcher triggers sync on ref file changes

**Dependencies:** Phase 1 Task 1.2 (commits Convex functions)

**Blocker for:** Phase 3 Task 3.2 (UI commit display)

### Task 2.3: Plan file watcher

**Model:** opus

**Files:**
- `tina-daemon/src/watcher.rs` (modify existing DaemonWatcher)
- `tina-daemon/src/sync.rs` (add plan sync function)

**Implementation:**

**Step 1: Plan directory watcher**

Add to `tina-daemon/src/watcher.rs`:

```rust
pub fn watch_plan_directories(&mut self, worktrees: Vec<WorktreeInfo>) -> Result<()> {
    for worktree in worktrees {
        let plans_dir = worktree.worktree_path.join("docs/plans");

        if plans_dir.exists() {
            self.watcher.watch(&plans_dir, RecursiveMode::NonRecursive)?;
            info!("Watching plans directory: {}", plans_dir.display());

            // Store worktree info for event handling
            self.plan_dir_map.insert(plans_dir, worktree);
        }
    }

    Ok(())
}
```

**Step 2: Plan sync function**

Add to `tina-daemon/src/sync.rs`:

```rust
pub async fn sync_plan(
    &mut self,
    worktree: &WorktreeInfo,
    plan_path: &Path,
) -> Result<()> {
    // Read plan file content
    let content = tokio::fs::read_to_string(plan_path)
        .await
        .context("Failed to read plan file")?;

    // Extract phase number from filename
    // Pattern: YYYY-MM-DD-{feature}-phase-{N}.md
    let filename = plan_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("Invalid plan filename"))?;

    let phase_number = extract_phase_from_plan_filename(filename)?;

    // Upsert to Convex
    self.convex_writer.upsert_plan(
        &worktree.orchestration_id,
        &phase_number,
        plan_path.to_str().unwrap(),
        &content,
    ).await?;

    info!(
        "Synced plan {} for orchestration {}",
        filename,
        worktree.orchestration_id
    );

    Ok(())
}

fn extract_phase_from_plan_filename(filename: &str) -> Result<String> {
    // Extract phase from pattern: YYYY-MM-DD-{feature}-phase-{N}.md
    let re = regex::Regex::new(r"-phase-(\d+)\.md$")?;
    let captures = re.captures(filename)
        .ok_or_else(|| anyhow!("Filename does not match phase pattern: {}", filename))?;

    Ok(captures[1].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_plan_sync_updates_content() {
        // Mock: upsert plan with content1
        // Mock: upsert same plan with content2
        // Verify: second call updates content, not creates duplicate
    }
}
```

**Step 3: Event handler integration**

Update event handler in `tina-daemon/src/watcher.rs`:

```rust
fn handle_fs_event(&mut self, event: notify::Event) -> Result<()> {
    match event.kind {
        EventKind::Create(_) | EventKind::Modify(_) => {
            for path in &event.paths {
                if path.extension() == Some(OsStr::new("md")) {
                    // Plan file changed
                    if let Some(worktree) = self.plan_dir_map.get(path.parent().unwrap()) {
                        self.sync_plan(worktree, path)?;
                    }
                } else if path.file_name() == Some(OsStr::new("HEAD")) {
                    // Git ref changed
                    if let Some(worktree) = self.worktree_map.get(path) {
                        self.sync_commits(worktree)?;
                    }
                }
                // ... existing team/task logic
            }
        }
        _ => {}
    }
    Ok(())
}
```

**Tests:**

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_plan_file_watcher_triggers_sync() {
        // Setup watcher on test plans directory
        // Create new plan file
        // Verify sync_plan called with correct args
    }

    #[test]
    fn test_plan_content_update_detected() {
        // Create plan file
        // Modify plan file content
        // Verify upsertPlan mutation called
    }
}
```

**Validation:**
- Plan directory watcher detects new/modified `.md` files
- Phase extraction regex handles standard filename patterns
- Upsert logic correctly creates or updates plan records
- Content synced to Convex within 3 seconds of file save

**Dependencies:** Phase 1 Task 1.3 (plans Convex functions)

**Blocker for:** Phase 3 Task 3.3 (UI plan viewer)

## Integration

All tasks modify tina-daemon only. No Convex changes (uses Phase 1 functions). No UI changes.

**Modified files:**
- `tina-daemon/src/main.rs` - Add worktree discovery at startup
- `tina-daemon/src/watcher.rs` - Add git ref and plan directory watchers
- `tina-daemon/src/sync.rs` - Add member removal detection, commit sync, plan sync
- `tina-daemon/src/git.rs` - New module for git operations

**New dependencies:**
- `regex` (for phase extraction)
- `chrono` (for timestamps, may already be present)

## Testing Strategy

**Unit tests:**
- Run `cargo test -p tina-daemon`
- All new functions have test coverage
- Mock filesystem and git operations where appropriate

**Integration tests:**
- Use test fixtures in `tina-daemon/tests/`
- Create mock git repos with commits
- Simulate team config changes (member removals)
- Write test plan files and verify sync

**Manual verification:**
- Start tina-daemon with `tina-session daemon start`
- Run orchestration in parallel
- Check Convex dashboard for:
  - Shutdown events when agents removed from team
  - Commits appearing in real-time during execution
  - Plans synced after file saves
- Verify logs show watcher activity

**Exit criteria:**
- All unit tests pass
- Integration tests pass with mock fixtures
- Manual test confirms real-time sync (< 5s latency for commits, < 3s for plans)
- No errors in daemon logs during orchestration

## Estimated Time

- Task 2.1: 60 min (team removal detection + tests)
- Task 2.2: 90 min (git commit watcher + parser + tests)
- Task 2.3: 60 min (plan file watcher + sync + tests)

**Total: ~3.5 hours**

## Success Criteria

1. Team member removals detected and shutdown events recorded
2. Git commits synced to Convex within 5 seconds of commit
3. Plan files synced to Convex within 3 seconds of save
4. All unit tests pass (`cargo test -p tina-daemon`)
5. Integration tests pass with mock fixtures
6. No false positives (e.g., first sync doesn't trigger shutdowns)
7. Deduplication works (same commit SHA doesn't create duplicates)
8. Phase attribution correct (commits and plans linked to current phase)

## Dependencies

This phase depends on:
- **Phase 1 Task 1.2:** `commits.ts` functions (recordCommit, listCommits)
- **Phase 1 Task 1.3:** `plans.ts` functions (upsertPlan, getPlan)
- **Phase 1 Task 1.4:** `events.ts` shutdown event support

This phase is a prerequisite for:
- **Phase 3 Task 3.1:** UI shutdown status display
- **Phase 3 Task 3.2:** UI commit display
- **Phase 3 Task 3.3:** UI plan viewer

No work can proceed in Phase 3 until this phase completes.

## Rollback Plan

If issues arise:

1. **Watcher issues:**
   - Disable specific watcher (comment out in main.rs)
   - Continue with other watchers
   - Debug and fix in isolation

2. **Sync issues:**
   - Revert sync.rs changes
   - Fall back to Phase 1 (manual data entry via Convex dashboard)
   - Fix sync logic offline

3. **Performance issues:**
   - Add rate limiting to sync functions
   - Batch multiple commits/plans per sync cycle
   - Increase debounce delay for filesystem events

All changes are additive - existing team/task sync unaffected.

## Notes

**Key design decisions:**

- Worktree discovery via Convex (not filesystem scanning) ensures daemon only watches active orchestrations
- Git ref watching (not polling) provides real-time commit detection with minimal overhead
- Phase attribution uses current_phase from supervisor state at time of event
- Cache-based member removal detection avoids false positives on daemon restart

**Edge cases handled:**

- Daemon restart: Cache rehydrated from Convex, no duplicate shutdown events
- Force push: Deduplication via SHA prevents duplicate commit records
- Rebase: New SHAs recorded, old SHAs remain (history preserved)
- Plan file delete: No sync triggered (only create/modify events)
- Malformed filenames: Regex extraction fails gracefully, logs warning

**Performance considerations:**

- Git log limited to range `last_sha..HEAD` (not full history)
- Plan sync only on file change (not periodic polling)
- Shutdown detection only on team config change (not periodic polling)
- All sync operations async/await (non-blocking)

**Future enhancements:**

- Bidirectional plan sync (Convex → filesystem)
- Commit diff storage in Convex (currently metadata only)
- Batch sync for multiple commits in single push
- Conflict resolution for concurrent plan edits
