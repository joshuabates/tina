# Phase 1: Schema Consolidation and Validation CLI

## Overview

This phase consolidates all orchestration state types into tina-session as the single source of truth, making tina-monitor a consumer of these types. It also creates the tina-harness crate with a `validate` command.

## Current State Analysis

### Duplicate Types

**tina-monitor has TWO locations defining types:**

1. `tina-monitor/src/types.rs` - Root-level types module (414 lines)
   - SessionLookup, OrchestrationStatus, PhaseStatus, TaskStatus
   - PhaseBreakdown, TimingGap, TimingStats, PhaseState, SupervisorState
   - TeamMember, Team, Task, OrchestrationSummary

2. `tina-monitor/src/data/types.rs` - Data module types (172 lines)
   - Team, Agent, Task, TaskStatus
   - OrchestrationStatus, PhaseStatus, PhaseBreakdown, TimingGap, TimingStats
   - PhaseState, SupervisorState, ContextMetrics

**tina-session defines canonical types:**

1. `tina-session/src/state/schema.rs` (244 lines)
   - OrchestrationStatus, PhaseStatus, PhaseBreakdown, PhaseState
   - TimingGap, TimingStats, SupervisorState
   - Has impl blocks for PhaseState, SupervisorState (new, load, save, etc.)

2. `tina-session/src/watch/status.rs` (263 lines)
   - WaitResult, StatusUpdate, TaskFile (simplified version)
   - Streaming status utilities

### Key Differences Between Duplicate Types

| Type | tina-monitor difference | tina-session |
|------|------------------------|--------------|
| Team | Uses `lead_agent_id` | N/A |
| Agent | Has `agent_id`, `agent_type` as Option<String> | N/A |
| Task | Has `active_form`, `metadata` fields | TaskFile is simplified |
| PhaseState | Uses `PartialEq` derive | Has impl blocks |
| SupervisorState | Uses `PartialEq` derive | Has load/save methods |

### Types Only in tina-monitor

- `SessionLookup` - Session file lookup structure
- `TeamMember` vs `Agent` - Different field names/structure
- `ContextMetrics` - Statusline context tracking
- `OrchestrationSummary` - Display-focused summary

### Usage Analysis

Files importing from `crate::data::types`:
- `data/tina_state.rs` - ContextMetrics, SupervisorState
- `data/discovery.rs` - All types via `types::*`
- `data/tasks.rs` - Task, TaskStatus
- `data/teams.rs` - Team
- `entity.rs` - Task
- `layout.rs` - Task
- `panels/tasks.rs` - Task, TaskStatus
- `tui/app.rs` - Team, Task, Agent
- `tui/views/task_inspector.rs` - Task, TaskStatus
- `tui/views/phase_detail.rs` - Agent, Task, TaskStatus
- `overlay/quicklook.rs` - Task

Files importing from `crate::types`:
- `dashboard.rs` - OrchestrationStatus, SupervisorState
- `data/mod.rs` - `types::*` (all types)
- `overlay/fuzzy.rs` - OrchestrationSummary, OrchestrationStatus
- `overlay/quicklook.rs` - TeamMember
- `panel.rs` - TeamMember
- `panels/mod.rs` - TeamMember
- `panels/team.rs` - TeamMember
- `layout.rs` - TeamMember
- `app.rs` - Various conversions between the two type systems

## Implementation Plan

### Step 1: Extend tina-session Schema Module

**Goal:** Add missing types to tina-session that are currently only in tina-monitor.

**Files to modify:**
- `tina-session/src/state/schema.rs` - Add Team, Agent, Task types
- `tina-session/src/state/mod.rs` - Export new types

**Types to add to tina-session:**

```rust
// Team configuration (from Claude Code's teammate tool)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "leadAgentId")]
    pub lead_agent_id: String,
    #[serde(rename = "leadSessionId")]
    pub lead_session_id: String,
    pub members: Vec<Agent>,
}

// Agent in a team
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub name: String,
    #[serde(rename = "agentType")]
    pub agent_type: Option<String>,
    pub model: String,
    #[serde(rename = "joinedAt")]
    pub joined_at: i64,
    #[serde(rename = "tmuxPaneId")]
    pub tmux_pane_id: Option<String>,
    pub cwd: PathBuf,
    #[serde(default)]
    pub subscriptions: Vec<String>,
}

// Task in the task system
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Task {
    pub id: String,
    pub subject: String,
    pub description: String,
    #[serde(rename = "activeForm")]
    pub active_form: Option<String>,
    pub status: TaskStatus,
    pub owner: Option<String>,
    #[serde(default)]
    pub blocks: Vec<String>,
    #[serde(default, rename = "blockedBy")]
    pub blocked_by: Vec<String>,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
}

// Context metrics from statusline
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMetrics {
    pub used_pct: u8,
    pub tokens: u64,
    pub max: u64,
    pub timestamp: DateTime<Utc>,
}

// Session lookup (stored in ~/.claude/tina-sessions/)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionLookup {
    pub feature: String,
    pub cwd: PathBuf,
    pub created_at: DateTime<Utc>,
}
```

**Tests to add:**
- Serialization/deserialization tests for each new type
- Compatibility tests with existing fixture data

### Step 2: Add Validation Module to tina-session

**Goal:** Create validation functions for verifying state files against schema.

**File to create:** `tina-session/src/state/validation.rs`

```rust
pub struct ValidationError {
    pub path: PathBuf,
    pub field: String,
    pub message: String,
}

pub struct ValidationResult {
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationError>,
}

impl ValidationResult {
    pub fn is_valid(&self) -> bool { self.errors.is_empty() }
}

// Validate supervisor-state.json
pub fn validate_supervisor_state(path: &Path) -> ValidationResult;

// Validate team config.json
pub fn validate_team(path: &Path) -> ValidationResult;

// Validate task .json file
pub fn validate_task(path: &Path) -> ValidationResult;

// Validate entire .claude/tina directory structure
pub fn validate_tina_directory(path: &Path) -> ValidationResult;
```

**Validation checks:**
- File exists and is valid JSON
- Required fields present
- Field types correct
- Enum values valid
- Path fields resolve to existing files (warning only)
- Timestamp fields parseable
- Phase numbers within range

### Step 3: Create tina-harness Crate

**Goal:** New sibling crate with `validate` CLI command.

**Directory structure:**
```
tina-harness/
├── Cargo.toml
└── src/
    ├── main.rs       # CLI entry point
    ├── lib.rs        # Library exports
    └── commands/
        ├── mod.rs
        └── validate.rs
```

**Cargo.toml:**
```toml
[package]
name = "tina-harness"
version = "0.1.0"
edition = "2021"
description = "Test harness for tina orchestration and monitor"

[dependencies]
tina-session = { path = "../tina-session" }
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
thiserror = "1"
```

**CLI interface:**
```bash
# Validate orchestration state
tina-harness validate /path/to/worktree/.claude/tina

# Report mode (non-failing, for diagnosis)
tina-harness validate --report /path/to/state
```

### Step 4: Update tina-monitor Dependencies

**Goal:** Make tina-monitor depend on tina-session for types.

**Files to modify:**
- `tina-monitor/Cargo.toml` - Add tina-session dependency

```toml
[dependencies]
tina-session = { path = "../tina-session" }
```

### Step 5: Replace tina-monitor Type Imports

**Goal:** Replace local type definitions with imports from tina-session.

**Strategy:**
1. Keep `tina-monitor/src/types.rs` but change it to re-export from tina-session
2. Delete `tina-monitor/src/data/types.rs` entirely
3. Update all imports to use `crate::types::*`

**Modified `tina-monitor/src/types.rs`:**
```rust
//! Type definitions for tina-monitor
//!
//! Re-exports canonical types from tina-session.

// Re-export all schema types from tina-session
pub use tina_session::state::schema::{
    Agent, ContextMetrics, OrchestrationStatus, PhaseBreakdown,
    PhaseState, PhaseStatus, SessionLookup, SupervisorState,
    Task, TaskStatus, Team, TimingGap, TimingStats,
};

// TeamMember is a simplified view of Agent for display purposes
pub type TeamMember = Agent;

// OrchestrationSummary stays local (display-only type)
#[derive(Debug, Clone)]
pub struct OrchestrationSummary {
    pub feature: String,
    pub worktree_path: std::path::PathBuf,
    pub status: OrchestrationStatus,
    pub current_phase: u32,
    pub total_phases: u32,
    pub elapsed_mins: i64,
}
```

**Files requiring import updates:**
1. `src/data/mod.rs` - Change `use crate::types::*` (already correct)
2. `src/data/discovery.rs` - Change `use crate::data::types::*` to `use crate::types::*`
3. `src/data/tina_state.rs` - Update imports
4. `src/data/tasks.rs` - Update imports
5. `src/data/teams.rs` - Update imports
6. `src/entity.rs` - Update imports
7. `src/layout.rs` - Update imports
8. `src/panels/tasks.rs` - Update imports
9. `src/tui/app.rs` - Update imports, remove conversion functions
10. `src/tui/views/task_inspector.rs` - Update imports
11. `src/tui/views/phase_detail.rs` - Update imports
12. `src/overlay/quicklook.rs` - Update imports
13. `src/app.rs` - Remove conversion functions between type systems
14. `src/dashboard.rs` - Update imports

### Step 6: Update tina-monitor Data Module

**Goal:** Remove duplicate type definitions.

**Files to delete:**
- `tina-monitor/src/data/types.rs`

**Files to modify:**
- `tina-monitor/src/data/mod.rs` - Remove `pub mod types;` line

### Step 7: Verify and Test

**Goal:** Ensure all tests pass and validate against real state.

**Commands:**
```bash
# Build and test tina-session
cd tina-session && cargo test

# Build and test tina-monitor
cd tina-monitor && cargo test

# Build tina-harness
cd tina-harness && cargo build

# Validate real orchestration state (if available)
tina-harness validate ~/.claude/tina-sessions/*/
```

## Task Breakdown

| # | Task | Files | Est. Lines |
|---|------|-------|-----------|
| 1 | Add Team, Agent, Task, TaskStatus, ContextMetrics, SessionLookup to tina-session schema | tina-session/src/state/schema.rs | +150 |
| 2 | Export new types from state module | tina-session/src/state/mod.rs | +5 |
| 3 | Create validation module with validate functions | tina-session/src/state/validation.rs | +200 |
| 4 | Export validation module | tina-session/src/state/mod.rs, lib.rs | +2 |
| 5 | Create tina-harness crate structure | tina-harness/Cargo.toml, src/*.rs | +150 |
| 6 | Implement validate command | tina-harness/src/commands/validate.rs | +100 |
| 7 | Add tina-session dependency to tina-monitor | tina-monitor/Cargo.toml | +1 |
| 8 | Update tina-monitor/src/types.rs to re-export | tina-monitor/src/types.rs | -350, +30 |
| 9 | Delete tina-monitor/src/data/types.rs | tina-monitor/src/data/types.rs | -172 |
| 10 | Update data/mod.rs imports | tina-monitor/src/data/mod.rs | +1, -1 |
| 11 | Update all import statements in tina-monitor | 14 files | ~50 changes |
| 12 | Remove type conversion functions | tina-monitor/src/app.rs | -30 |
| 13 | Run tests and fix any issues | - | varies |

## Success Criteria

- [ ] Team, Agent, Task, ContextMetrics types defined in tina-session
- [ ] SessionLookup type defined in tina-session
- [ ] Validation module added to tina-session with validate_* functions
- [ ] tina-harness crate created with `validate` command
- [ ] tina-monitor depends on tina-session, imports all types
- [ ] tina-monitor/src/data/types.rs deleted
- [ ] No duplicate type definitions remain
- [ ] `cargo test` passes in both crates
- [ ] `tina-harness validate` works on real orchestration output
- [ ] State validation identifies any schema mismatches

## Risks and Mitigations

**Risk:** serde field name differences (camelCase vs snake_case)
- Mitigation: Use `#[serde(rename = "...")]` attributes consistently

**Risk:** Breaking existing tests that use fixture data
- Mitigation: Run tests after each step, update fixtures if needed

**Risk:** tina-monitor tests may have hardcoded JSON with different field names
- Mitigation: Update test fixtures to match canonical schema

## Dependencies

- Phase 2 will use validate command to diagnose monitor/session mismatches
- Phase 3 will add test codebase and scenarios to tina-harness
