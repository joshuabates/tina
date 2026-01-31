# Orchestration Reliability & Observability

## Overview

Fixes for systemic failures identified in the tina-monitor orchestration post-mortem. That orchestration produced 12,363 lines of code with 300+ passing tests for a tool that fundamentally doesn't work. This design addresses the root causes: missing data contracts, review theater, lack of enforcement, and poor observability.

## Problem Statement

The current orchestration system has multiple failure modes:

1. **Missing data contracts** - Components built to read data that nothing writes
2. **Mock-only testing** - All tests pass on fake data, fail on reality
3. **Review theater** - Reviewers check "does code exist" not "does code work"
4. **No complexity enforcement** - 3,185-line files pass review unchallenged
5. **Inconsistent infrastructure** - tmux sessions named randomly, Claude sometimes started without permissions flag, wrong skill invoked
6. **Poor cleanup** - Teammates and sessions left running after completion
7. **Slow detection** - Takes too long to notice phase completion
8. **No timing visibility** - Can't tell where 6 hours went

## Goals

1. **Single binary for phase lifecycle** - All tmux/Claude/state operations go through `tina-session`
2. **Enforced data contracts** - Binary manages state file with schema validation
3. **Automated gates** - Tests, warnings, complexity checks must pass before phase completion
4. **Proper cleanup** - Binary handles shutdown and session cleanup
5. **Timing visibility** - Binary tracks all timestamps automatically
6. **Simplified model selection** - Opus or Haiku only, no middle ground

## Non-Goals

- Changing the fundamental orchestration architecture
- Adding new phases or review types
- Modifying the task/team data structures significantly
- Building a separate monitoring system (that's tina-monitor's job, once fixed)

---

## Phase 1: tina-session Binary

**Goal:** Single source of truth for all phase lifecycle operations.

### Problem

Current state has multiple failure modes:
- Sessions named inconsistently (`tina-monitor-phase-1`, `phase-3-execution`, `cd /tesse3exect`)
- Claude started without `--dangerously-skip-permissions`
- Wrong skill command sent or typos in skill name
- Raw JSON manipulation of state files (schema violations, missing fields)
- Manual timing calculations (often wrong or missing)
- Slow polling for phase completion
- Sessions and teammates left running

### Solution

A Rust binary that handles the entire phase lifecycle:

```bash
# ============================================
# PHASE LIFECYCLE
# ============================================

# Start phase execution (does EVERYTHING)
tina-session start \
  --feature auth \
  --phase 1 \
  --cwd /path/to/worktree \
  --plan /path/to/plan.md

# This single command:
# 1. Validates inputs (feature name, phase number, paths exist)
# 2. Creates tmux session: tina-auth-phase-1
# 3. Sets working directory to --cwd
# 4. Starts: claude --dangerously-skip-permissions
# 5. Waits for Claude ready (detects prompt, max 60s timeout)
# 6. Sends: /tina:team-lead-init <plan-path>
# 7. Updates supervisor-state.json (phase started, timestamp)
# 8. Outputs session name for reference

# Wait for phase completion (blocks until done)
tina-session wait \
  --feature auth \
  --phase 1 \
  --timeout 3600  # optional, default no timeout

# Uses file watching (not polling) on status.json
# Returns exit code: 0 = complete, 1 = blocked, 2 = timeout
# Outputs: status and git_range (if complete)

# Stop phase (clean shutdown)
tina-session stop \
  --feature auth \
  --phase 1

# 1. Kills tmux session
# 2. Updates supervisor-state.json (phase stopped, timestamp)

# ============================================
# CONTEXT MANAGEMENT
# ============================================

# Cycle context (checkpoint + restore)
tina-session refresh \
  --feature auth \
  --phase 1

# 1. Sends /checkpoint to tmux session
# 2. Waits for checkpoint acknowledgment
# 3. Sends /tina:rehydrate to restore context
# 4. Waits for ready state

# ============================================
# STATE MANAGEMENT (schema-enforced)
# ============================================

# Initialize orchestration state
tina-session state init \
  --feature auth \
  --design-doc docs/plans/2026-01-30-auth-design.md \
  --cwd /path/to/worktree \
  --branch tina/auth \
  --total-phases 3

# Creates {cwd}/.claude/tina/supervisor-state.json with:
# - Validated schema
# - orchestration_started_at timestamp
# - Empty phases map

# Update phase status
tina-session state update \
  --feature auth \
  --phase 1 \
  --status planning|planned|executing|reviewing|complete|blocked \
  --plan-path /path/to/plan.md  # optional, for planning phase

# Validates status transition (can't go from complete back to planning)
# Auto-records timestamp for transition
# Calculates duration from previous state

# Record phase completion
tina-session state phase-complete \
  --feature auth \
  --phase 1 \
  --git-range abc123..def456

# Records:
# - completed_at timestamp
# - git_range
# - Calculates total phase duration
# - Calculates breakdown (planning/execution/review durations)

# Record blocked state
tina-session state blocked \
  --feature auth \
  --phase 1 \
  --reason "Tests failing: 3 failures in auth_test.rs"

# Query state
tina-session state show --feature auth
tina-session state show --feature auth --phase 1 --format json

# ============================================
# UTILITIES
# ============================================

# Get canonical session name (for scripts that need it)
tina-session name --feature auth --phase 1
# Output: tina-auth-phase-1

# Check if session exists
tina-session exists --feature auth --phase 1
# Exit: 0 if exists, 1 if not

# Send arbitrary command to session (escape hatch)
tina-session send --feature auth --phase 1 --text "/some-command"

# Attach to session (opens in current terminal)
tina-session attach --feature auth --phase 1
```

### State File Schema

`{cwd}/.claude/tina/supervisor-state.json`:

```json
{
  "version": 1,
  "feature": "auth-system",
  "design_doc": "docs/plans/2026-01-30-auth-system-design.md",
  "worktree_path": "/Users/josh/projects/app/.worktrees/auth-system",
  "branch": "tina/auth-system",
  "total_phases": 3,
  "current_phase": 2,
  "status": "executing",
  "orchestration_started_at": "2026-01-30T10:00:00Z",
  "phases": {
    "1": {
      "plan_path": "docs/plans/2026-01-30-auth-system-phase-1.md",
      "status": "complete",
      "planning_started_at": "2026-01-30T10:15:00Z",
      "execution_started_at": "2026-01-30T10:23:00Z",
      "review_started_at": "2026-01-30T10:47:00Z",
      "completed_at": "2026-01-30T10:53:00Z",
      "duration_mins": 38,
      "git_range": "abc123..def456",
      "breakdown": {
        "planning_mins": 8,
        "execution_mins": 24,
        "review_mins": 6
      }
    },
    "2": {
      "plan_path": "docs/plans/2026-01-30-auth-system-phase-2.md",
      "status": "executing",
      "planning_started_at": "2026-01-30T10:55:00Z",
      "execution_started_at": "2026-01-30T11:07:00Z",
      "review_started_at": null,
      "completed_at": null,
      "breakdown": {
        "planning_mins": 12,
        "execution_mins": null,
        "review_mins": null
      }
    }
  },
  "timing": {
    "total_elapsed_mins": 72,
    "active_mins": 67,
    "idle_mins": 5,
    "gaps": [
      {
        "after": "phase-1-complete",
        "before": "phase-2-planning",
        "duration_mins": 2,
        "timestamp": "2026-01-30T10:53:00Z"
      }
    ]
  }
}
```

### Schema Validation

The binary enforces:

| Rule | Enforcement |
|------|-------------|
| Valid status values | Only `planning`, `planned`, `executing`, `reviewing`, `complete`, `blocked` |
| Status transitions | Can't skip states (planning → executing requires planned) |
| Required fields | Can't complete phase without git_range |
| Timestamp ordering | completed_at must be after started_at |
| Phase existence | Can't update phase 3 if total_phases is 2 |

Invalid operations return clear errors:
```
Error: Invalid status transition
  Phase 1 is 'planning', cannot transition to 'complete'
  Valid transitions from 'planning': planned, blocked
```

### How Skills Change

**Phase-executor becomes trivial:**

```markdown
## Phase Execution

Execute these commands in order:

1. Start the phase:
   ```bash
   tina-session start \
     --feature "$FEATURE" \
     --phase "$PHASE" \
     --cwd "$WORKTREE_PATH" \
     --plan "$PLAN_PATH"
   ```

2. Wait for completion:
   ```bash
   tina-session wait --feature "$FEATURE" --phase "$PHASE"
   EXIT_CODE=$?
   ```

3. Handle result:
   - Exit 0: Phase complete. Read git_range from state file.
   - Exit 1: Phase blocked. Read reason from state file.
   - Exit 2: Timeout. Escalate to orchestrator.

4. Report to orchestrator:
   ```
   execute-N complete. Git range: <git_range>
   ```
   or
   ```
   execute-N blocked: <reason>
   ```

That's it. All complexity is in tina-session.
```

**Orchestrate skill state management:**

```markdown
## State Initialization

After worktree setup completes, initialize state:

```bash
tina-session state init \
  --feature "$FEATURE" \
  --design-doc "$DESIGN_DOC" \
  --cwd "$WORKTREE_PATH" \
  --branch "$BRANCH" \
  --total-phases "$TOTAL_PHASES"
```

## Phase Transitions

Before spawning planner:
```bash
tina-session state update --feature "$FEATURE" --phase "$N" --status planning
```

After planner reports:
```bash
tina-session state update --feature "$FEATURE" --phase "$N" --status planned --plan-path "$PLAN_PATH"
```

After executor reports complete:
```bash
tina-session state phase-complete --feature "$FEATURE" --phase "$N" --git-range "$GIT_RANGE"
```
```

### Implementation Structure

```
tina-session/
├── Cargo.toml
├── src/
│   ├── main.rs              # CLI parsing (clap)
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── start.rs         # Phase start (tmux + claude + skill)
│   │   ├── wait.rs          # Wait for completion (file watching)
│   │   ├── stop.rs          # Clean shutdown
│   │   ├── refresh.rs       # Context cycling
│   │   └── state.rs         # State management subcommands
│   ├── tmux/
│   │   ├── mod.rs
│   │   ├── session.rs       # Create/kill sessions
│   │   ├── send.rs          # Send keys
│   │   └── detect.rs        # Detect Claude ready
│   ├── state/
│   │   ├── mod.rs
│   │   ├── schema.rs        # State structs + serde
│   │   ├── validate.rs      # Transition validation
│   │   └── timing.rs        # Duration calculations
│   └── watch/
│       ├── mod.rs
│       └── status.rs        # File watching for status.json
└── tests/
    ├── integration/
    │   ├── start_test.rs
    │   ├── state_test.rs
    │   └── wait_test.rs
    └── fixtures/
```

### Dependencies

```toml
[package]
name = "tina-session"
version = "0.1.0"
edition = "2021"

[dependencies]
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
notify = "6"              # File watching
tokio = { version = "1", features = ["full"] }
anyhow = "1"
thiserror = "1"

[dev-dependencies]
tempfile = "3"
assert_cmd = "2"          # CLI testing
predicates = "3"
```

### Deliverables

- `tina-session/Cargo.toml`
- `tina-session/src/` (all modules)
- Integration tests for each command
- Updated `agents/phase-executor.md` (simplified)
- Updated `skills/orchestrate/SKILL.md` (uses tina-session for state)

### Success Criteria

- `tina-session start` creates session, starts Claude, runs skill correctly every time
- `tina-session wait` detects completion within 1 second (file watching)
- `tina-session state` validates all transitions, rejects invalid operations
- Skills reduced to simple tina-session invocations
- All timing data captured automatically

---

## Phase 2: Automated Complexity Gates

**Goal:** Objective, tooling-based enforcement of complexity budgets.

### Problem

12,363 lines passed review because reviewers don't have objective thresholds. A 3,185-line file was approved because "the code looks reasonable."

### Solution

#### 2.1 Planner Specifies Complexity Budget

Every plan MUST include:

```markdown
### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max cyclomatic complexity | 10 |
| Max total implementation lines | 2000 |
```

Plans without this section are rejected by plan-validator.

#### 2.2 tina-session Runs Complexity Checks

Add complexity checking to tina-session:

```bash
# Check complexity against budget
tina-session check complexity \
  --cwd /path/to/worktree \
  --max-file-lines 400 \
  --max-total-lines 2000 \
  --max-complexity 10

# Exit 0 if pass, 1 if fail with details
```

Team-lead-init calls this before marking phase complete.

#### 2.3 Language-Specific Checks

tina-session auto-detects language and runs appropriate tools:

| Language | Detection | Line Count | Complexity | Linting |
|----------|-----------|------------|------------|---------|
| Rust | `Cargo.toml` | `tokei` | clippy cognitive_complexity | `cargo clippy -D warnings` |
| TypeScript | `package.json` + `.ts` | `tokei` | `eslint complexity` | `eslint --max-warnings 0` |
| Python | `pyproject.toml` | `tokei` | `radon cc` | `flake8` |
| Go | `go.mod` | `tokei` | `gocyclo` | `golangci-lint` |

### Deliverables

- `tina-session check complexity` command
- Updated `agents/phase-planner.md` requiring Complexity Budget section
- Updated `skills/team-lead-init/SKILL.md` to run complexity check
- Plan validation rejects plans without budget

### Success Criteria

- Plans without complexity budget are rejected
- Phase completion blocked if complexity exceeded
- Clear error messages indicate which files/functions violate

---

## Phase 3: Hard Test & Warning Gate

**Goal:** No phase completion with failing tests or warnings.

### Problem

Phases completed despite test failures and warnings.

### Solution

Add verification gate to tina-session:

```bash
# Run all verification checks
tina-session check verify --cwd /path/to/worktree

# Auto-detects project type and runs:
# - Rust: cargo test && cargo clippy -D warnings
# - TypeScript: npm test && npm run lint
# - Python: pytest && flake8
# - Go: go test ./... && golangci-lint run

# Exit 0 if all pass, 1 if any fail
```

Team-lead-init MUST run this before marking phase complete:

```markdown
## Before Phase Completion

Run verification gate:
```bash
tina-session check verify --cwd "$WORKTREE_PATH"
```

If exit code is non-zero:
- Set phase status to "blocked"
- Reason = output from verification
- Worker must fix before proceeding
```

### Deliverables

- `tina-session check verify` command
- Updated `skills/team-lead-init/SKILL.md` with mandatory gate

### Success Criteria

- Phase cannot complete with failing tests
- Phase cannot complete with linter warnings
- Clear output shows what failed

---

## Phase 4: Strengthened Code-Quality-Reviewer

**Goal:** Reviewer actively checks for over-engineering and simplification opportunities.

### Problem

Code-quality-reviewer approved 3,185-line files and elaborate abstractions. Reviewer checked "does it look reasonable" not "is this necessary."

### Solution

Add explicit mandates to code-quality-reviewer:

```markdown
## Required Checks

### Over-Engineering Detection

For each file reviewed, ask:
1. Could this be split into smaller files? (>300 lines = yes)
2. Are there abstractions that aren't used in multiple places?
3. Are there layers that just pass through to other layers?
4. Could any of this be deleted without losing functionality?

### Complexity Red Flags

Automatic flags requiring justification:
- File > 300 lines
- Function > 40 lines
- More than 3 levels of nesting
- Generic/trait with only one implementation
- Builder pattern for simple structs

### Output Format

Your review MUST include:

#### Simplification Opportunities
- [ ] File X could be merged with Y (both small, related)
- [ ] Function Z is only called once, inline it
- [ ] Trait A has one impl, remove indirection

#### Complexity Violations
| File | Lines | Issue | Recommendation |
|------|-------|-------|----------------|
| app.rs | 3185 | Exceeds 300 line limit | Split into modules |

If you find complexity violations, the review FAILS. Do not approve.
```

### Deliverables

- Updated `agents/code-quality-reviewer.md` with new mandates
- Checklist template for reviewer output
- Examples of good vs over-engineered code

### Success Criteria

- Reviewer flags files over 300 lines
- Reviewer identifies unnecessary abstractions
- Review fails if complexity violations found

---

## Phase 5: Model Simplification

**Goal:** Binary choice between Opus and Haiku. No middle ground.

### Problem

Three model options creates decision paralysis. 8 of 9 planners didn't specify models at all.

### Solution

#### 5.1 Two Models Only

| Model | Use For |
|-------|---------|
| **Opus** | Planning, architecture, complex reasoning, judgment calls |
| **Haiku** | Straightforward execution, simple transforms, validation, status checks |

Remove all sonnet references from documentation.

#### 5.2 Mandatory Model Specification

Plans MUST specify model per task:

```markdown
### Task 1: Create auth middleware
**Model:** haiku
...

### Task 2: Design token refresh strategy
**Model:** opus
...
```

#### 5.3 Plan Validation

tina-session validates plans:

```bash
tina-session check plan --path /path/to/plan.md

# Validates:
# - Every task has **Model:** specified
# - Model is either "opus" or "haiku" (not sonnet)
# - Complexity Budget section exists
```

#### 5.4 Default Model by Role

| Role | Default Model | Rationale |
|------|---------------|-----------|
| Orchestrator | opus | Coordinates complex decisions |
| Design validator | haiku | Straightforward checks |
| Worktree setup | haiku | Simple provisioning |
| Phase planner | opus | Architecture decisions |
| Phase executor | haiku | tmux management, monitoring |
| Phase reviewer | opus | Deep analysis, judgment |
| Spec reviewer | haiku | Checklist verification |
| Code quality reviewer | opus | Judgment on over-engineering |
| Implementer | per-task | Specified in plan |

### Deliverables

- Updated all skill/agent docs to remove sonnet references
- `tina-session check plan` command
- Default model table in orchestrate skill

### Success Criteria

- All plans specify model per task
- No sonnet usage anywhere
- Plan validation catches missing/invalid models

---

## Phase 6: Integration Verification

**Goal:** Reviewers verify code actually works, not just that it exists.

### Problem

Reviewers approved code that couldn't possibly work because preconditions weren't met.

### Solution

#### 6.1 Spec Reviewer Checks Preconditions

Add to spec-reviewer:

```markdown
## Precondition Verification

Before approving implementation, verify:

1. **Data sources exist** - If code reads a file/API/database, verify the writer exists
2. **Dependencies available** - If code imports a module, verify it's implemented
3. **Integration points connected** - If code is called by X, verify X actually calls it

### Example Failures

- Reading from file that nothing writes → FAIL
- Implementing interface that nothing uses → FAIL
- Handler that's never registered → FAIL
- Test mocking a system that doesn't exist → FAIL

If preconditions are not met, the review FAILS.
```

#### 6.2 Phase Reviewer Runs Code

Add to phase-reviewer:

```markdown
## Functional Verification

You MUST run the implemented code, not just read it.

### For CLI tools:
```bash
./target/release/tool --help
./target/release/tool <typical-args>
```

### For libraries:
```bash
cargo test
cargo run --example basic  # if exists
```

### For services:
```bash
cargo run &
PID=$!
curl http://localhost:8080/health
kill $PID
```

If you cannot run the code successfully, the review FAILS.
```

### Deliverables

- Updated `agents/spec-reviewer.md` with precondition checks
- Updated `agents/phase-reviewer.md` with functional verification

### Success Criteria

- Spec reviewer catches "reader without writer" issues
- Phase reviewer actually executes code
- Non-functional code fails review

---

## Phase 7: Teammate Cleanup

**Goal:** Teammates shut down promptly after task completion.

### Problem

Teammates left running after their work is done, consuming resources.

### Solution

Team-lead-init explicitly shuts down workers after each task:

```markdown
## Task Completion Flow

After worker reports task complete:
1. Spawn spec-reviewer (haiku)
2. Spawn code-quality-reviewer (opus)
3. Wait for both reviews to pass
4. **requestShutdown for worker**
5. **requestShutdown for spec-reviewer**
6. **requestShutdown for code-quality-reviewer**
7. Proceed to next task

Do NOT leave teammates running between tasks.
```

### Deliverables

- Updated `skills/team-lead-init/SKILL.md` with explicit shutdown requirements

### Success Criteria

- No teammates left running after task completion
- Each task gets fresh worker (fresh context)

---

## Phased Implementation

| Phase | Focus | Size |
|-------|-------|------|
| 1 | tina-session binary (lifecycle + state) | Large |
| 2 | Automated complexity gates | Medium |
| 3 | Hard test/warning gate | Small |
| 4 | Strengthened code-quality-reviewer | Small |
| 5 | Model simplification | Small |
| 6 | Integration verification | Small |
| 7 | Teammate cleanup | Small |

Dependencies:
- Phase 1 is foundational - all other phases depend on tina-session existing
- Phases 2-7 can be done in parallel after Phase 1

---

## Success Metrics

### Quantitative

| Metric | Current | Target |
|--------|---------|--------|
| Max file size (lines) | 3185 | 400 |
| Test failures at phase complete | Allowed | 0 |
| Orphaned teammates after orchestration | Common | 0 |
| Orphaned tmux sessions | Common | 0 |
| Phase completion detection time | 10s polling | <1s |
| Plans with model specs | 11% (1/9) | 100% |
| Consistent session naming | ~50% | 100% |

### Qualitative

- Post-orchestration timing summary available automatically
- Clear visibility into where time went
- Reviewers catch integration issues before they compound
- Complexity growth caught early via automated checks
- Skills are simple invocations of tina-session, not complex scripts

---

## Appendix: tina-session Command Reference

```
tina-session - Phase lifecycle management for Tina orchestrations

USAGE:
    tina-session <COMMAND>

COMMANDS:
    start       Start phase execution (tmux + claude + skill)
    wait        Wait for phase completion (file watching)
    stop        Stop phase and cleanup session
    refresh     Cycle context (checkpoint + restore)

    state       State management subcommands
      init      Initialize orchestration state
      update    Update phase status
      phase-complete  Record phase completion
      blocked   Record blocked state
      show      Display current state

    check       Validation subcommands
      complexity  Check complexity against budget
      verify      Run test/lint verification
      plan        Validate plan file

    name        Get canonical session name
    exists      Check if session exists
    send        Send command to session
    attach      Attach to session

EXAMPLES:
    # Full phase lifecycle
    tina-session start --feature auth --phase 1 --cwd /path --plan /path/plan.md
    tina-session wait --feature auth --phase 1
    tina-session stop --feature auth --phase 1

    # State management
    tina-session state init --feature auth --design-doc /path --cwd /path --total-phases 3
    tina-session state update --feature auth --phase 1 --status executing
    tina-session state phase-complete --feature auth --phase 1 --git-range abc..def

    # Validation
    tina-session check complexity --cwd /path --max-file-lines 400
    tina-session check verify --cwd /path
    tina-session check plan --path /path/plan.md
```

---

## Appendix: File Locations

| File | Purpose |
|------|---------|
| `tina-session/` | Binary for all phase lifecycle operations |
| `{worktree}/.claude/tina/supervisor-state.json` | Orchestration state + timing (managed by tina-session) |
| `{worktree}/.claude/tina/phase-N/status.json` | Phase execution status (written by team-lead-init) |
| `skills/orchestrate/SKILL.md` | Updated to use tina-session for state |
| `skills/team-lead-init/SKILL.md` | Updated with gates and cleanup |
| `agents/phase-executor.md` | Simplified to use tina-session |
| `agents/phase-planner.md` | Updated with complexity budget + model requirements |
| `agents/phase-reviewer.md` | Updated with functional verification |
| `agents/spec-reviewer.md` | Updated with precondition checks |
| `agents/code-quality-reviewer.md` | Updated with over-engineering detection |
