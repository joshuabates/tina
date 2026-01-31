# Phase 2: Data Integration - Implementation Plan

## Overview

Build the DataSource module that reads orchestration data from tina-session files, with fixture loading for testing and file watching for live updates. This phase connects the TUI framework from Phase 1 to real data.

**Line Budget**: ~280 lines total (target ~200 for data + ~80 for tests)

---

## Data Source Architecture

### File Locations

| Data | Path | Format |
|------|------|--------|
| Session lookup | `~/.claude/tina-sessions/{feature}.json` | SessionLookup |
| Supervisor state | `{worktree}/.claude/tina/supervisor-state.json` | SupervisorState |
| Team config | `~/.claude/teams/{team}/config.json` | Team |
| Tasks | `~/.claude/tasks/{team}/{id}.json` | Task (one per file) |

### Schema Alignment

The design doc notes a schema mismatch between tina-monitor types and tina-session types. Phase 2 aligns them:

**tina-session SupervisorState** (authoritative):
```rust
pub struct SupervisorState {
    pub version: u32,
    pub feature: String,
    pub design_doc: PathBuf,
    pub worktree_path: PathBuf,
    pub branch: String,
    pub total_phases: u32,
    pub current_phase: u32,
    pub status: OrchestrationStatus,
    pub orchestration_started_at: DateTime<Utc>,
    pub phases: HashMap<String, PhaseState>,
    pub timing: TimingStats,
}
```

**tina-monitor types.rs** (needs update):
- Rename `design_doc_path` -> `design_doc`
- Rename `branch_name` -> `branch`
- Change `plan_paths: HashMap<u32, PathBuf>` -> `phases: HashMap<String, PhaseState>`
- Add `version`, `feature`, `orchestration_started_at`, `timing`
- Change `status: String` -> `status: OrchestrationStatus`

---

## Tasks

### Task 1: Update Types to Match tina-session Schema [~40 lines]

**File**: `src/types.rs` (new file, replaces parts of `src/data/types.rs`)

Align types with tina-session schema. This is a minimal types file for the rebuild.

```rust
use std::collections::HashMap;
use std::path::PathBuf;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Session lookup from ~/.claude/tina-sessions/{feature}.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLookup {
    pub feature: String,
    pub cwd: PathBuf,
    pub created_at: DateTime<Utc>,
}

/// Orchestration status (from tina-session)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchestrationStatus {
    Planning,
    Executing,
    Reviewing,
    Complete,
    Blocked,
}

/// Phase status (from tina-session)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PhaseStatus {
    Planning,
    Planned,
    Executing,
    Reviewing,
    Complete,
    Blocked,
}

/// State of a single phase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseState {
    pub plan_path: Option<PathBuf>,
    pub status: PhaseStatus,
    pub planning_started_at: Option<DateTime<Utc>>,
    pub execution_started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub duration_mins: Option<i64>,
    pub git_range: Option<String>,
}

/// Supervisor state from {worktree}/.claude/tina/supervisor-state.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupervisorState {
    pub version: u32,
    pub feature: String,
    pub design_doc: PathBuf,
    pub worktree_path: PathBuf,
    pub branch: String,
    pub total_phases: u32,
    pub current_phase: u32,
    pub status: OrchestrationStatus,
    pub orchestration_started_at: DateTime<Utc>,
    #[serde(default)]
    pub phases: HashMap<String, PhaseState>,
}

/// Team member from team config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub name: String,
    #[serde(rename = "agentType")]
    pub agent_type: Option<String>,
    pub model: String,
    #[serde(rename = "tmuxPaneId")]
    pub tmux_pane_id: Option<String>,
    pub cwd: PathBuf,
}

/// Team config from ~/.claude/teams/{team}/config.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "leadAgentId")]
    pub lead_agent_id: String,
    pub members: Vec<TeamMember>,
}

/// Task from ~/.claude/tasks/{team}/{id}.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub subject: String,
    pub description: String,
    pub status: TaskStatus,
    pub owner: Option<String>,
    #[serde(default)]
    pub blocks: Vec<String>,
    #[serde(default, rename = "blockedBy")]
    pub blocked_by: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
}
```

**Test**: Deserialization round-trip tests for each type.

---

### Task 2: Orchestration Summary Type [~20 lines]

**File**: `src/types.rs` (addition)

Add a summary type for the orchestration list/finder.

```rust
/// Summary of an orchestration for display in finder
#[derive(Debug, Clone)]
pub struct OrchestrationSummary {
    pub feature: String,
    pub worktree_path: PathBuf,
    pub status: OrchestrationStatus,
    pub current_phase: u32,
    pub total_phases: u32,
    pub elapsed_mins: i64,
}
```

---

### Task 3: DataSource Core [~80 lines]

**File**: `src/data.rs`

DataSource reads from tina-session files or fixtures.

```rust
use std::fs;
use std::path::{Path, PathBuf};
use anyhow::{Context, Result};
use crate::types::*;

pub struct DataSource {
    /// If set, read from this fixture directory instead of live data
    fixture_path: Option<PathBuf>,
    /// Currently loaded orchestration
    current: Option<Orchestration>,
}

/// Full orchestration data (loaded on demand)
#[derive(Debug, Clone)]
pub struct Orchestration {
    pub state: SupervisorState,
    pub orchestrator_team: Option<Team>,
    pub phase_team: Option<Team>,
    pub tasks: Vec<Task>,
}

impl DataSource {
    /// Create a new data source, optionally loading from fixtures
    pub fn new(fixture_path: Option<PathBuf>) -> Self {
        Self {
            fixture_path,
            current: None,
        }
    }

    /// List all available orchestrations
    pub fn list_orchestrations(&self) -> Result<Vec<OrchestrationSummary>> {
        let sessions_dir = self.sessions_dir();
        if !sessions_dir.exists() {
            return Ok(Vec::new());
        }

        let mut summaries = Vec::new();
        for entry in fs::read_dir(&sessions_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(summary) = self.load_summary(&path) {
                    summaries.push(summary);
                }
            }
        }
        Ok(summaries)
    }

    /// Load full orchestration data for a feature
    pub fn load_orchestration(&mut self, feature: &str) -> Result<&Orchestration> {
        let lookup = self.load_session_lookup(feature)?;
        let state = self.load_supervisor_state(&lookup.cwd)?;

        // Load orchestrator team (feature name is often the team name)
        let orchestrator_team = self.load_team(&state.feature).ok();

        // Load phase team if executing
        let phase_team = if state.status == OrchestrationStatus::Executing {
            let phase_team_name = format!("{}-phase-{}", state.feature, state.current_phase);
            self.load_team(&phase_team_name).ok()
        } else {
            None
        };

        // Load tasks for orchestrator team
        let tasks = orchestrator_team
            .as_ref()
            .map(|t| self.load_tasks(&t.name))
            .transpose()?
            .unwrap_or_default();

        self.current = Some(Orchestration {
            state,
            orchestrator_team,
            phase_team,
            tasks,
        });

        Ok(self.current.as_ref().unwrap())
    }

    /// Get currently loaded orchestration
    pub fn current(&self) -> Option<&Orchestration> {
        self.current.as_ref()
    }

    // Helper methods for file paths
    fn sessions_dir(&self) -> PathBuf {
        self.fixture_path.clone().unwrap_or_else(|| {
            dirs::home_dir()
                .expect("home dir")
                .join(".claude/tina-sessions")
        })
    }

    fn teams_dir(&self) -> PathBuf {
        self.fixture_path
            .as_ref()
            .map(|p| p.join(".claude/teams"))
            .unwrap_or_else(|| {
                dirs::home_dir().expect("home dir").join(".claude/teams")
            })
    }

    fn tasks_dir(&self) -> PathBuf {
        self.fixture_path
            .as_ref()
            .map(|p| p.join(".claude/tasks"))
            .unwrap_or_else(|| {
                dirs::home_dir().expect("home dir").join(".claude/tasks")
            })
    }
}
```

---

### Task 4: DataSource File Loading [~40 lines]

**File**: `src/data.rs` (addition)

Add the private helper methods for loading individual files.

```rust
impl DataSource {
    fn load_session_lookup(&self, feature: &str) -> Result<SessionLookup> {
        let path = self.sessions_dir().join(format!("{}.json", feature));
        let contents = fs::read_to_string(&path)
            .with_context(|| format!("reading session lookup: {}", path.display()))?;
        serde_json::from_str(&contents)
            .with_context(|| format!("parsing session lookup: {}", path.display()))
    }

    fn load_supervisor_state(&self, worktree: &Path) -> Result<SupervisorState> {
        let path = worktree.join(".claude/tina/supervisor-state.json");
        let contents = fs::read_to_string(&path)
            .with_context(|| format!("reading supervisor state: {}", path.display()))?;
        serde_json::from_str(&contents)
            .with_context(|| format!("parsing supervisor state: {}", path.display()))
    }

    fn load_team(&self, name: &str) -> Result<Team> {
        let path = self.teams_dir().join(name).join("config.json");
        let contents = fs::read_to_string(&path)
            .with_context(|| format!("reading team config: {}", path.display()))?;
        serde_json::from_str(&contents)
            .with_context(|| format!("parsing team config: {}", path.display()))
    }

    fn load_tasks(&self, team_name: &str) -> Result<Vec<Task>> {
        let dir = self.tasks_dir().join(team_name);
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let mut tasks = Vec::new();
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                let contents = fs::read_to_string(&path)?;
                if let Ok(task) = serde_json::from_str::<Task>(&contents) {
                    tasks.push(task);
                }
            }
        }
        // Sort by id numerically
        tasks.sort_by(|a, b| {
            a.id.parse::<u32>().unwrap_or(0).cmp(&b.id.parse::<u32>().unwrap_or(0))
        });
        Ok(tasks)
    }

    fn load_summary(&self, lookup_path: &Path) -> Result<OrchestrationSummary> {
        let contents = fs::read_to_string(lookup_path)?;
        let lookup: SessionLookup = serde_json::from_str(&contents)?;
        let state = self.load_supervisor_state(&lookup.cwd)?;

        let elapsed_mins = (chrono::Utc::now() - state.orchestration_started_at)
            .num_minutes();

        Ok(OrchestrationSummary {
            feature: state.feature.clone(),
            worktree_path: state.worktree_path.clone(),
            status: state.status,
            current_phase: state.current_phase,
            total_phases: state.total_phases,
            elapsed_mins,
        })
    }
}
```

---

### Task 5: File Watcher Integration [~40 lines]

**File**: `src/data.rs` (addition)

Adapt the existing watcher pattern for the rebuild.

```rust
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::mpsc::{channel, Receiver, TryRecvError};
use std::time::Duration;

pub struct DataWatcher {
    _watcher: RecommendedWatcher,
    receiver: Receiver<()>,
}

impl DataWatcher {
    /// Create a watcher for orchestration data changes
    pub fn new(worktree: Option<&Path>) -> Result<Self> {
        let (tx, rx) = channel();

        let mut watcher = RecommendedWatcher::new(
            move |_| { let _ = tx.send(()); },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )?;

        let home = dirs::home_dir().expect("home dir");

        // Watch sessions directory
        let sessions_dir = home.join(".claude/tina-sessions");
        if sessions_dir.exists() {
            watcher.watch(&sessions_dir, RecursiveMode::NonRecursive)?;
        }

        // Watch teams and tasks
        let teams_dir = home.join(".claude/teams");
        if teams_dir.exists() {
            watcher.watch(&teams_dir, RecursiveMode::Recursive)?;
        }
        let tasks_dir = home.join(".claude/tasks");
        if tasks_dir.exists() {
            watcher.watch(&tasks_dir, RecursiveMode::Recursive)?;
        }

        // Watch worktree supervisor state if provided
        if let Some(wt) = worktree {
            let state_dir = wt.join(".claude/tina");
            if state_dir.exists() {
                watcher.watch(&state_dir, RecursiveMode::NonRecursive)?;
            }
        }

        Ok(Self { _watcher: watcher, receiver: rx })
    }

    /// Check if any files have changed (non-blocking)
    pub fn has_changes(&self) -> bool {
        // Drain all pending events and return true if any
        let mut changed = false;
        loop {
            match self.receiver.try_recv() {
                Ok(()) => changed = true,
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => break,
            }
        }
        changed
    }
}
```

---

### Task 6: Create Test Fixture [~20 lines of JSON]

**Directory**: `tests/fixtures/sample-orchestration/`

Create a complete fixture directory structure for testing.

```
tests/fixtures/sample-orchestration/
├── .claude/
│   ├── tina-sessions/
│   │   └── test-feature.json
│   ├── teams/
│   │   └── test-feature/
│   │       └── config.json
│   └── tasks/
│       └── test-feature/
│           ├── 1.json
│           └── 2.json
└── worktree/
    └── .claude/
        └── tina/
            └── supervisor-state.json
```

**tests/fixtures/sample-orchestration/.claude/tina-sessions/test-feature.json**:
```json
{
  "feature": "test-feature",
  "cwd": "FIXTURE_ROOT/worktree",
  "created_at": "2026-01-30T10:00:00Z"
}
```

**tests/fixtures/sample-orchestration/worktree/.claude/tina/supervisor-state.json**:
```json
{
  "version": 1,
  "feature": "test-feature",
  "design_doc": "docs/design.md",
  "worktree_path": "FIXTURE_ROOT/worktree",
  "branch": "tina/test-feature",
  "total_phases": 3,
  "current_phase": 2,
  "status": "executing",
  "orchestration_started_at": "2026-01-30T10:00:00Z",
  "phases": {
    "1": {
      "plan_path": "docs/plans/phase-1.md",
      "status": "complete",
      "completed_at": "2026-01-30T11:00:00Z",
      "duration_mins": 60
    },
    "2": {
      "plan_path": "docs/plans/phase-2.md",
      "status": "executing",
      "execution_started_at": "2026-01-30T11:30:00Z"
    }
  }
}
```

**Note**: Fixture paths use `FIXTURE_ROOT` placeholder that tests replace with actual temp path.

---

### Task 7: Integration Tests [~40 lines]

**File**: `tests/data_integration.rs`

```rust
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;
use tina_monitor::data::DataSource;
use tina_monitor::types::*;

fn setup_fixture() -> (TempDir, PathBuf) {
    let temp = TempDir::new().unwrap();
    let fixture_src = PathBuf::from("tests/fixtures/sample-orchestration");

    // Copy fixture to temp, replacing FIXTURE_ROOT placeholders
    copy_fixture_with_replacements(&fixture_src, temp.path());

    (temp, temp.path().to_path_buf())
}

#[test]
fn test_list_orchestrations() {
    let (_temp, fixture_path) = setup_fixture();
    let ds = DataSource::new(Some(fixture_path));

    let orchestrations = ds.list_orchestrations().unwrap();
    assert_eq!(orchestrations.len(), 1);
    assert_eq!(orchestrations[0].feature, "test-feature");
}

#[test]
fn test_load_orchestration() {
    let (_temp, fixture_path) = setup_fixture();
    let mut ds = DataSource::new(Some(fixture_path));

    let orch = ds.load_orchestration("test-feature").unwrap();
    assert_eq!(orch.state.feature, "test-feature");
    assert_eq!(orch.state.current_phase, 2);
    assert_eq!(orch.state.status, OrchestrationStatus::Executing);
}

#[test]
fn test_load_team() {
    let (_temp, fixture_path) = setup_fixture();
    let mut ds = DataSource::new(Some(fixture_path));

    let orch = ds.load_orchestration("test-feature").unwrap();
    let team = orch.orchestrator_team.as_ref().unwrap();
    assert_eq!(team.name, "test-feature");
    assert!(!team.members.is_empty());
}

#[test]
fn test_load_tasks() {
    let (_temp, fixture_path) = setup_fixture();
    let mut ds = DataSource::new(Some(fixture_path));

    let orch = ds.load_orchestration("test-feature").unwrap();
    assert_eq!(orch.tasks.len(), 2);
    assert_eq!(orch.tasks[0].id, "1");
}

fn copy_fixture_with_replacements(src: &Path, dest: &Path) {
    // Implementation: recursively copy files, replacing FIXTURE_ROOT
    // with actual dest path in JSON files
}
```

---

## File Structure After Phase 2

```
tina-monitor/
├── src/
│   ├── main.rs           # ~60 lines (Phase 1 + fixture arg)
│   ├── app.rs            # ~80 lines (Phase 1)
│   ├── panel.rs          # ~60 lines (Phase 1)
│   ├── layout.rs         # ~100 lines (Phase 1)
│   ├── panels/
│   │   ├── mod.rs        # ~10 lines
│   │   ├── team.rs       # ~25 lines (Phase 1)
│   │   ├── tasks.rs      # ~25 lines (Phase 1)
│   │   └── commits.rs    # ~25 lines (Phase 1)
│   ├── types.rs          # ~80 lines (NEW)
│   └── data.rs           # ~160 lines (NEW)
└── tests/
    ├── fixtures/
    │   └── sample-orchestration/
    │       └── ... (fixture files)
    ├── integration.rs    # ~40 lines (Phase 1)
    └── data_integration.rs # ~60 lines (NEW)
```

**Phase 2 Additions**: ~280 lines
**Running Total**: ~685 lines (within budget)

---

## Dependencies

Add to existing Cargo.toml:
```toml
[dependencies]
chrono = { version = "0.4", features = ["serde"] }
notify = "7"

[dev-dependencies]
tempfile = "3"
```

---

## Existing Code to Reuse

From `tina-monitor/src/data/`:
- **watcher.rs**: FileWatcher pattern is reusable, simplified for rebuild
- **types.rs**: Team/Agent/Task structs are correct, just need schema alignment

From `tina-session/src/`:
- **state/schema.rs**: Authoritative SupervisorState schema (copy types, don't import)
- **session/lookup.rs**: SessionLookup struct (copy, don't import)

**Do NOT reuse**:
- `src/data/discovery.rs` - tied to old architecture
- `src/data/tina_state.rs` - uses wrong schema

---

## Success Criteria

1. `DataSource::new(None)` reads from `~/.claude/tina-sessions/`
2. `DataSource::new(Some(path))` reads from fixture directory
3. `list_orchestrations()` returns summaries from all sessions
4. `load_orchestration(feature)` loads full state + team + tasks
5. `DataWatcher::has_changes()` detects file modifications
6. All fixture-based tests pass
7. Types match tina-session schema exactly
8. Total new lines < 300

---

## Not in This Phase

- Connecting DataSource to panels (Phase 3)
- Git commit loading (Phase 3)
- Fuzzy finder overlay (Phase 4)
- Real-time panel refresh (Phase 3)

---

## Verification Commands

```bash
# Build
cargo build -p tina-monitor

# Run tests
cargo test -p tina-monitor

# Manual verification - load fixture
cargo run -p tina-monitor -- --fixture tests/fixtures/sample-orchestration/

# Manual verification - live data (if orchestration exists)
cargo run -p tina-monitor
```

---

## Integration with Phase 1

Phase 2 does NOT modify Phase 1 code except:
1. Add `--fixture` CLI arg handling in `main.rs` (already stubbed)
2. Create `DataSource` in `App::new()` but don't use it yet

The panels continue showing placeholder data. Phase 3 connects panels to DataSource.
