# tina-session Implementation Plan

## Overview

Build the `tina-session` binary - the core infrastructure for orchestration reliability. This binary handles all phase lifecycle operations: tmux session management, Claude startup, state management, and validation checks.

## Design Decisions (from brainstorming)

1. **Separate crate** - `tina-session/` standalone binary
2. **Lookup file** - `~/.claude/tina-sessions/{feature}.json` maps feature → cwd, created by `init`
3. **Claude ready detection** - Poll for `>` prompt or "bypass permissions" text, 60s timeout with fallback
4. **Path resolution** - Resolve to absolute paths, validate files exist before proceeding
5. **Wait output** - JSON to stdout + exit codes (0=complete, 1=blocked, 2=timeout)
6. **No restart command** - `stop` + `start` handles resume gracefully

## Command Reference

```
tina-session init      # Create lookup file + supervisor-state.json
tina-session start     # Create tmux, start Claude, send skill (handles resume)
tina-session wait      # File-watch until complete/blocked, return JSON
tina-session stop      # Kill tmux session, update state

tina-session state update         # Update phase status
tina-session state phase-complete # Record completion + git range
tina-session state blocked        # Record blocked state
tina-session state show           # Display current state

tina-session check complexity     # Run complexity checks
tina-session check verify         # Run tests + linter
tina-session check plan           # Validate plan file

tina-session name      # Get canonical session name
tina-session exists    # Check if session exists (exit code)
tina-session send      # Send arbitrary text to session
tina-session attach    # Attach to session in current terminal
tina-session list      # List active orchestrations
tina-session cleanup   # Remove lookup file when done
```

## File Structure

```
tina-session/
├── Cargo.toml
├── src/
│   ├── main.rs                 # CLI entry point (clap)
│   ├── lib.rs                  # Library exports
│   ├── error.rs                # Custom error types
│   │
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── init.rs             # Create lookup + state files
│   │   ├── start.rs            # Start phase execution
│   │   ├── wait.rs             # Wait for completion
│   │   ├── stop.rs             # Stop and cleanup
│   │   ├── state.rs            # State subcommands
│   │   ├── check.rs            # Validation subcommands
│   │   ├── name.rs             # Get session name
│   │   ├── exists.rs           # Check session exists
│   │   ├── send.rs             # Send text to session
│   │   ├── attach.rs           # Attach to session
│   │   ├── list.rs             # List orchestrations
│   │   └── cleanup.rs          # Remove lookup file
│   │
│   ├── session/
│   │   ├── mod.rs
│   │   ├── lookup.rs           # Read/write ~/.claude/tina-sessions/
│   │   └── naming.rs           # Canonical session naming
│   │
│   ├── state/
│   │   ├── mod.rs
│   │   ├── schema.rs           # SupervisorState struct + phases
│   │   ├── transitions.rs      # Status transition validation
│   │   └── timing.rs           # Duration calculations
│   │
│   ├── tmux/
│   │   ├── mod.rs
│   │   ├── session.rs          # Create/kill/list sessions
│   │   ├── send.rs             # Send keys to pane
│   │   └── capture.rs          # Capture pane output
│   │
│   ├── claude/
│   │   ├── mod.rs
│   │   └── ready.rs            # Detect Claude ready state
│   │
│   ├── checks/
│   │   ├── mod.rs
│   │   ├── complexity.rs       # Line count, cyclomatic complexity
│   │   ├── verify.rs           # Tests + linter
│   │   └── plan.rs             # Plan validation
│   │
│   └── watch/
│       ├── mod.rs
│       └── status.rs           # File watching for status.json
│
└── tests/
    ├── integration/
    │   ├── init_test.rs
    │   ├── state_test.rs
    │   ├── naming_test.rs
    │   └── transitions_test.rs
    └── fixtures/
        └── sample_state.json
```

## Implementation Tasks

### Task 1: Project Scaffolding
**Model:** haiku

**Files:**
- `tina-session/Cargo.toml`
- `tina-session/src/main.rs` (CLI structure with clap)
- `tina-session/src/lib.rs`
- `tina-session/src/error.rs`

**Steps:**
1. Create Cargo.toml with dependencies
2. Define CLI structure with all commands/subcommands
3. Create error types
4. Verify `cargo build` works

**Run:** `cargo build`
**Output:** Compiles successfully

---

### Task 2: Session Naming & Lookup
**Model:** haiku

**Files:**
- `tina-session/src/session/mod.rs`
- `tina-session/src/session/naming.rs`
- `tina-session/src/session/lookup.rs`
- `tina-session/tests/integration/naming_test.rs`

**Steps:**
1. Implement `session_name(feature, phase) -> String` returning `tina-{feature}-phase-{phase}`
2. Implement lookup file read/write at `~/.claude/tina-sessions/{feature}.json`
3. Write tests for naming conventions
4. Write tests for lookup file operations

**Run:** `cargo test session`
**Output:** All naming and lookup tests pass

---

### Task 3: State Schema & Transitions
**Model:** haiku

**Files:**
- `tina-session/src/state/mod.rs`
- `tina-session/src/state/schema.rs`
- `tina-session/src/state/transitions.rs`
- `tina-session/src/state/timing.rs`
- `tina-session/tests/integration/state_test.rs`
- `tina-session/tests/integration/transitions_test.rs`

**Steps:**
1. Define `SupervisorState` struct matching design doc schema
2. Define `PhaseState` struct with all timestamp fields
3. Implement status transition validation (planning → planned → executing → reviewing → complete)
4. Implement timing calculations (duration between timestamps)
5. Write tests for valid/invalid transitions
6. Write tests for timing calculations

**Run:** `cargo test state`
**Output:** All state and transition tests pass

---

### Task 4: Init Command
**Model:** haiku

**Files:**
- `tina-session/src/commands/init.rs`
- `tina-session/tests/integration/init_test.rs`

**Steps:**
1. Parse args: --feature, --cwd, --design-doc, --branch, --total-phases
2. Validate --cwd exists and is a directory
3. Validate --design-doc exists
4. Create lookup file at `~/.claude/tina-sessions/{feature}.json`
5. Create supervisor-state.json at `{cwd}/.claude/tina/supervisor-state.json`
6. Write tests with temp directories

**Run:** `cargo test init`
**Output:** Init creates both files correctly

---

### Task 5: Tmux Operations
**Model:** haiku

**Files:**
- `tina-session/src/tmux/mod.rs`
- `tina-session/src/tmux/session.rs`
- `tina-session/src/tmux/send.rs`
- `tina-session/src/tmux/capture.rs`

**Steps:**
1. Implement `create_session(name, cwd, command)` - creates detached session
2. Implement `kill_session(name)` - kills session if exists
3. Implement `session_exists(name) -> bool`
4. Implement `send_keys(name, text)` - sends text + Enter
5. Implement `capture_pane(name) -> String` - captures recent output
6. All functions shell out to tmux binary

**Run:** Manual test (requires tmux)
**Output:** Can create session, send keys, capture output, kill session

---

### Task 6: Claude Ready Detection
**Model:** haiku

**Files:**
- `tina-session/src/claude/mod.rs`
- `tina-session/src/claude/ready.rs`

**Steps:**
1. Implement `wait_for_ready(session_name, timeout_secs)`
2. Poll `capture_pane` every 500ms
3. Look for line starting with `>` OR containing "bypass permissions"
4. Return Ok(()) when found, Err on timeout
5. Default timeout: 60 seconds

**Run:** Manual test with real Claude session
**Output:** Correctly detects when Claude is ready

---

### Task 7: Start Command
**Model:** opus

**Files:**
- `tina-session/src/commands/start.rs`

**Steps:**
1. Parse args: --feature, --phase, --plan
2. Read lookup file to get cwd
3. Resolve --plan to absolute path, validate exists
4. Generate session name
5. Check if session already exists (resume case)
6. If not exists: create tmux session with `claude --dangerously-skip-permissions`
7. Wait for Claude ready
8. Send `/tina:team-lead-init {plan_path}`
9. Update supervisor-state.json (phase executing, timestamp)
10. Output session name

**Run:** Manual test with real orchestration
**Output:** Creates session, starts Claude, sends skill command

---

### Task 8: File Watching for Wait
**Model:** haiku

**Files:**
- `tina-session/src/watch/mod.rs`
- `tina-session/src/watch/status.rs`

**Steps:**
1. Implement `watch_status(path, timeout) -> WaitResult`
2. Use notify crate for file system events
3. On change: read status.json, check if complete or blocked
4. Return WaitResult { status, git_range, reason }
5. Handle timeout case

**Run:** `cargo test watch` (with temp files)
**Output:** Detects file changes correctly

---

### Task 9: Wait Command
**Model:** haiku

**Files:**
- `tina-session/src/commands/wait.rs`

**Steps:**
1. Parse args: --feature, --phase, --timeout (optional)
2. Read lookup file to get cwd
3. Construct status.json path: `{cwd}/.claude/tina/phase-{N}/status.json`
4. Call watch_status with file watching
5. On complete: output JSON `{"status": "complete", "git_range": "..."}`
6. On blocked: output JSON `{"status": "blocked", "reason": "..."}`
7. Exit codes: 0=complete, 1=blocked, 2=timeout

**Run:** Manual test with status file changes
**Output:** Correctly detects and reports completion/blocked

---

### Task 10: Stop Command
**Model:** haiku

**Files:**
- `tina-session/src/commands/stop.rs`

**Steps:**
1. Parse args: --feature, --phase
2. Generate session name
3. Kill tmux session
4. Update supervisor-state.json if needed
5. Output confirmation

**Run:** Manual test
**Output:** Kills session cleanly

---

### Task 11: State Subcommands
**Model:** haiku

**Files:**
- `tina-session/src/commands/state.rs`

**Steps:**
1. Implement `state update --feature --phase --status [--plan-path]`
2. Implement `state phase-complete --feature --phase --git-range`
3. Implement `state blocked --feature --phase --reason`
4. Implement `state show --feature [--phase] [--format json|text]`
5. All commands validate transitions and update timestamps

**Run:** `cargo test state_commands`
**Output:** All state commands work correctly

---

### Task 12: Utility Commands
**Model:** haiku

**Files:**
- `tina-session/src/commands/name.rs`
- `tina-session/src/commands/exists.rs`
- `tina-session/src/commands/send.rs`
- `tina-session/src/commands/attach.rs`
- `tina-session/src/commands/list.rs`
- `tina-session/src/commands/cleanup.rs`

**Steps:**
1. `name --feature --phase` - output session name
2. `exists --feature --phase` - exit 0 if exists, 1 if not
3. `send --feature --phase --text` - send arbitrary text
4. `attach --feature --phase` - exec into tmux attach
5. `list` - list all lookup files with status
6. `cleanup --feature` - remove lookup file

**Run:** Manual tests
**Output:** All utility commands work

---

### Task 13: Check Commands
**Model:** opus

**Files:**
- `tina-session/src/checks/mod.rs`
- `tina-session/src/checks/complexity.rs`
- `tina-session/src/checks/verify.rs`
- `tina-session/src/checks/plan.rs`
- `tina-session/src/commands/check.rs`

**Steps:**
1. `check complexity --cwd --max-file-lines --max-total-lines`
   - Run tokei for line counts
   - Check against limits
   - Report violations
2. `check verify --cwd`
   - Detect project type (Cargo.toml, package.json, etc.)
   - Run appropriate test + lint commands
   - Report pass/fail
3. `check plan --path`
   - Parse markdown for `**Model:**` tags
   - Verify every task has model specified
   - Verify model is opus or haiku
   - Verify Complexity Budget section exists

**Run:** Test against real projects
**Output:** All checks detect violations correctly

---

### Task 14: Integration Testing
**Model:** haiku

**Files:**
- Additional integration tests

**Steps:**
1. Test full workflow: init → start → wait → stop
2. Test resume: start on existing phase
3. Test error cases: missing files, invalid transitions
4. Document any manual testing steps

**Run:** `cargo test --test integration`
**Output:** All integration tests pass

---

## Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 300 |
| Max function length | 40 lines |
| Max total implementation lines | 2000 |

## Dependencies

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
notify = "6"
tokio = { version = "1", features = ["full"] }
anyhow = "1"
thiserror = "1"
dirs = "5"

[dev-dependencies]
tempfile = "3"
assert_cmd = "2"
predicates = "3"
```

## Success Criteria

1. `tina-session init` creates lookup file and supervisor-state.json
2. `tina-session start` creates tmux, starts Claude correctly, sends skill
3. `tina-session wait` detects completion within 1 second via file watching
4. `tina-session state` validates all transitions, rejects invalid operations
5. All commands use lookup file - no need to pass --cwd after init
6. Clear error messages for all failure cases
7. All tests pass
8. Total code under 2000 lines
