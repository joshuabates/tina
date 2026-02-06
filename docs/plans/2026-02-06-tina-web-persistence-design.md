# tina-web Persistence & Project Organization

## Problem

All orchestration data in tina-web is ephemeral. When Claude CLI cleans up team/task files, orchestrations vanish from the dashboard. There's no history of past orchestrations, no project-level organization, and no way to see what happened after the fact.

Additionally, the orchestration workflow has friction points: design reviews get repeated unnecessarily, orchestrations aren't tracked until worktree setup, and plans get regenerated on resume.

## Goals

1. Persist orchestration history in SQLite so past orchestrations survive cleanup
2. Organize orchestrations by project (git repo)
3. Track tasks and team members granularly (event log, not just snapshots)
4. tina-session becomes a daemon that watches filesystem and writes all state to SQLite
5. tina-web becomes a pure SQLite reader with polling for updates
6. Streamline orchestration workflow: skip reviewed designs, track early, reuse plans

## Success Metrics

- Past orchestrations visible in tina-web after team/task files are cleaned up
- Orchestration detail shows full task history with status progression
- Projects auto-created from git repo root, orchestrations grouped by project
- tina-session daemon starts automatically and persists all state changes
- Design docs with `## Architectural Context` skip re-validation in orchestrate
- Existing plans reused on orchestration resume without re-planning

## Design

### Storage

SQLite database at `~/.local/share/tina/tina.db`.

**Schema:**

```sql
CREATE TABLE projects (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    repo_path   TEXT NOT NULL,
    created_at  TEXT NOT NULL  -- ISO 8601
);

CREATE TABLE orchestrations (
    id                  TEXT PRIMARY KEY,  -- feature_name + started_at timestamp
    project_id          INTEGER NOT NULL REFERENCES projects,
    feature_name        TEXT NOT NULL,
    design_doc_path     TEXT NOT NULL,
    branch              TEXT NOT NULL,
    worktree_path       TEXT,             -- NULL until worktree setup
    total_phases        INTEGER NOT NULL,
    status              TEXT NOT NULL,     -- planning/executing/reviewing/complete/blocked
    started_at          TEXT NOT NULL,
    completed_at        TEXT,
    total_elapsed_mins  INTEGER
);

CREATE TABLE phases (
    id                  INTEGER PRIMARY KEY,
    orchestration_id    TEXT NOT NULL REFERENCES orchestrations,
    phase_number        TEXT NOT NULL,    -- TEXT to support "1.5" remediation phases
    status              TEXT NOT NULL,
    plan_path           TEXT,
    git_range           TEXT,
    planning_mins       INTEGER,
    execution_mins      INTEGER,
    review_mins         INTEGER,
    started_at          TEXT,
    completed_at        TEXT,
    UNIQUE(orchestration_id, phase_number)
);

CREATE TABLE task_events (
    id                  INTEGER PRIMARY KEY,
    orchestration_id    TEXT NOT NULL REFERENCES orchestrations,
    phase_number        TEXT,            -- NULL for orchestrator-level tasks
    task_id             TEXT NOT NULL,
    subject             TEXT NOT NULL,
    description         TEXT,
    status              TEXT NOT NULL,    -- pending/in_progress/completed
    owner               TEXT,
    blocked_by          TEXT,            -- JSON array of task IDs
    metadata            TEXT,            -- JSON
    recorded_at         TEXT NOT NULL
);

CREATE TABLE team_members (
    id                  INTEGER PRIMARY KEY,
    orchestration_id    TEXT NOT NULL REFERENCES orchestrations,
    phase_number        TEXT NOT NULL,
    agent_name          TEXT NOT NULL,
    agent_type          TEXT,
    model               TEXT,
    joined_at           TEXT,
    recorded_at         TEXT NOT NULL
);

CREATE INDEX idx_orchestrations_project ON orchestrations(project_id);
CREATE INDEX idx_phases_orchestration ON phases(orchestration_id);
CREATE INDEX idx_task_events_orchestration ON task_events(orchestration_id);
CREATE INDEX idx_task_events_task ON task_events(orchestration_id, task_id);
CREATE INDEX idx_team_members_orchestration ON team_members(orchestration_id);
```

### Architecture

```
Claude CLI ──writes──> ~/.claude/teams/, ~/.claude/tasks/
                              │
                              │ watches
                              ▼
tina-session daemon ──writes──> tina.db (SQLite)
    also handles:                  │
    - init / state update          │ polls
    - phase-complete               ▼
    - project auto-creation    tina-web (pure reader)
                               - REST API
                               - WebSocket push
                               - React frontend
```

**tina-session daemon** is the single writer to SQLite. It:
- Watches `~/.claude/teams/` and `~/.claude/tasks/` for file changes
- Upserts task events and team members on every detected change
- Handles lifecycle commands (init, state update, phase-complete) which also write to SQLite
- Auto-creates projects by resolving git repo root from worktree path

**tina-web** is a pure reader. It:
- Polls SQLite on a 1-2 second interval for changes
- Serves REST API and pushes WebSocket updates when data changes
- No longer watches the filesystem directly

**tina-data** re-exports query functions:
- Wraps tina-session's `db` module for tina-web consumption (same pattern as type re-exports)
- No new SQLite code — just re-exports

### Project Auto-Association

When an orchestration is initialized, tina-session:
1. Takes the `cwd` argument (worktree path)
2. Runs `git -C <cwd> rev-parse --show-toplevel` to find repo root
3. Looks up project by `repo_path` in SQLite
4. If not found, creates project with `name` = repo directory basename
5. Associates orchestration with project

tina-web provides an "Add Project" form for renaming or pre-registering projects, but it's not a required step.

### Daemon Lifecycle

- `tina-session daemon start` - starts background process, creates PID file at `~/.local/share/tina/daemon.pid`
- `tina-session daemon stop` - sends SIGTERM, removes PID file
- `tina-session daemon status` - checks if running
- `tina-session init` auto-starts daemon if not running
- Daemon stays running across multiple orchestrations
- Daemon watches for file changes and handles graceful shutdown on SIGTERM

### What tina-web Shows

**Dashboard (project-level):**
- List of projects, each showing recent orchestrations
- Quick stats: total orchestrations, success rate, average duration

**Orchestration list (per project):**
- All orchestrations (live and historical), sorted by date
- Status badge, phase progress, duration, feature name, branch

**Orchestration detail:**
- Worktree path (displayed, copyable)
- Branch name
- Timeline view of phases with timing breakdown
- Git range per phase
- Tasks with full detail: description, status history, owner, blocking relationships, metadata
- Team members per phase

**Task detail:**
- Full description
- Status progression (event log: when it moved pending -> in_progress -> completed)
- Owner (which agent)
- Blocking relationships
- Metadata (rendered as key-value pairs)

### Workflow Improvements

**Skip design review if already reviewed:**
The architect skill adds `## Architectural Context` to design docs on approval. The orchestrate skill's `validate-design` step checks for this section. If present, auto-complete the validate-design task with `validation_status: "pre-approved"` and proceed directly to worktree setup.

**Early orchestration tracking:**
Today `tina-session init` runs during the `setup-worktree` step. Move it earlier: as soon as `orchestrate` starts (after parsing the design doc), call `tina-session init` (or a `find-or-create` variant) to create the orchestration record in SQLite immediately. The worktree_path field starts as NULL and gets populated during setup-worktree. This means orchestrations appear in tina-web from the moment they begin, not after worktree setup.

**Reuse existing plans:**
The `plan-phase-N` step checks if a plan file already exists at `{worktree}/.claude/tina/phase-{N}/plan.md`. If it does, skip planning: auto-complete the plan task with the existing plan path. This prevents redundant work on resume, re-run, or when plans were created manually.

## Architectural Context

**Crate dependency graph (current):**
```
tina-session (foundation, no tina deps)
    ↑ depends on
tina-data (re-exports tina-session types, adds discovery)
    ↑ depends on
tina-web (consumer)
```

**SQLite ownership:** tina-session owns the database (it's the writer). New module `tina-session/src/db/` handles connection management, migrations, and all writes. tina-data re-exports query functions for tina-web to use (same pattern as type re-exports today).

**Patterns to follow:**
- CLI subcommands: Nested clap enums at `tina-session/src/main.rs:15-197` — add `Daemon { Start, Stop, Status }` variant
- File watching: mpsc channel pattern at `tina-monitor/src/watcher.rs:7-83` — reuse for daemon's watcher
- State save/load: `tina-session/src/state/schema.rs:319-332` — same `serde_json` + `fs::write` pattern, parallel SQLite writes
- Schema versioning: Version field pattern at `schema.rs:254` — use SQLite `PRAGMA user_version` for migrations
- Command dispatch: Match-based routing at `main.rs:318-455` — add daemon match arm

**Code to reuse:**
- `tina-data/src/discovery.rs:182-237` — orchestration loading logic, adapt for daemon's file-change-to-SQLite-write path
- `tina-monitor/src/watcher.rs` — `DataWatcher` struct with `has_changes()` non-blocking drain
- `tina-data/src/teams.rs:42-61` — `list_teams_in()` for scanning team directories
- `tina-data/src/tasks.rs:28-54` — `load_tasks_in()` for reading task JSON files
- `tina-web/src/state.rs:53-60` — `reload()` pattern (broadcast on change) for WebSocket push

**Anti-patterns:**
- Don't put SQLite in tina-data — creates circular dependency (tina-data depends on tina-session, tina-session would need tina-data)
- Don't have multiple writers to SQLite — single daemon writer avoids WAL contention
- Don't watch `~/.claude/tina-sessions/` in daemon — session lookup files are managed by CLI commands, not file changes

**Integration:**
- Entry: `tina-session daemon start` launches watcher loop + SQLite writer
- CLI commands (`init`, `state update`, `phase-complete`) write to SQLite directly (daemon not required for these)
- tina-web polls SQLite via tina-data query re-exports
- Existing `tina-web/src/lib.rs:70-102` file watcher gets replaced by SQLite polling
- `tina-data/src/discovery.rs` stays for backward compatibility but tina-web switches to SQLite reads

**Status: Approved**

## Phase 1: SQLite Foundation in tina-session

Add `rusqlite` to tina-session. New module `src/db/`:
- `mod.rs` — connection management: `open_or_create()` at `~/.local/share/tina/tina.db`, `PRAGMA user_version` for migrations
- `migrations.rs` — schema creation (all tables, indexes), version-gated migration functions
- `projects.rs` — CRUD: `find_or_create_by_repo_path()`, `list()`, `rename()`
- `orchestrations.rs` — CRUD: `insert()`, `update_status()`, `update_worktree_path()`, `find_by_feature()`, `list_by_project()`
- `phases.rs` — CRUD: `upsert()` (insert or update by orchestration_id + phase_number), `list_by_orchestration()`
- `task_events.rs` — `insert_event()`, `latest_per_task()`, `history_for_task()`
- `team_members.rs` — `upsert()`, `list_by_orchestration()`
- `queries.rs` — compound queries: orchestration detail with phases/tasks/members joined

tina-data re-exports: add `pub mod db` that wraps tina-session's database query functions for tina-web consumption.

## Phase 2: tina-session Daemon & File Watching

New `src/daemon/` module:
- `mod.rs` — daemon lifecycle: `start()` (fork + PID file), `stop()` (SIGTERM), `status()` (PID check)
- `watcher.rs` — watches `~/.claude/teams/` and `~/.claude/tasks/`, uses mpsc channel pattern from tina-monitor
- `sync.rs` — on file change: scan affected team/task dirs, diff against SQLite, upsert task_events and team_members

New `Daemon` subcommand in clap CLI:
- `tina-session daemon start` — start background process
- `tina-session daemon stop` — graceful shutdown
- `tina-session daemon status` — check if running

Update existing commands to write SQLite:
- `init` — creates orchestration record in SQLite, auto-creates project from git repo root, accepts optional `--worktree-path` (NULL if omitted)
- `state update` — upserts phase record in SQLite
- `phase-complete` — updates phase and orchestration records in SQLite
- `init` auto-starts daemon if not running

## Phase 3: tina-web Reads from SQLite

Switch tina-web from filesystem discovery to SQLite:
- Drop file watcher (`lib.rs:70-102` removed)
- Add SQLite polling: `AppState` holds connection, polls every 1-2 seconds for row changes (compare max `recorded_at` or `rowid`)
- Update existing API endpoints to query SQLite instead of in-memory cache
- New endpoints:
  - `GET /api/projects` — list projects with orchestration counts
  - `GET /api/projects/{id}/orchestrations` — orchestration history for project
  - `GET /api/orchestrations/{id}/tasks/{task_id}/events` — task event history
  - `PUT /api/projects/{id}` — rename project
  - `POST /api/projects` — pre-register project
- WebSocket push on detected changes (same broadcast pattern, triggered by poll detecting new data)

## Phase 4: Frontend Updates

Update React frontend:
- Project list / project selector on dashboard
- Orchestration history list per project with stats (total, success rate, avg duration)
- Updated orchestration detail: worktree path (copyable), task details with status progression timeline, team members per phase
- Task detail view: full description, event log with timestamps, owner, blocking graph, metadata as key-value
- "Add Project" form for renaming/pre-registering

## Phase 5: Orchestration Workflow Improvements

Update skills to leverage new infrastructure:
- Modify orchestrate skill: check for `## Architectural Context` section in design doc, skip validate-design if present (auto-complete with `validation_status: "pre-approved"`)
- Modify orchestrate skill: call `tina-session init` at orchestration start (before worktree setup), with `--worktree-path` omitted
- Modify `setup-worktree` agent: after creating worktree, call `tina-session state update` to set worktree_path on the orchestration record
- Modify plan-phase-N logic: check for existing plan file at `{worktree}/.claude/tina/phase-{N}/plan.md`, skip planning if present
- Update tina-session `init` to support optional `--worktree-path` for early tracking
