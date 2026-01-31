# Tina Monitor: Orchestration Visibility & Control

## Overview

A terminal-based tool for monitoring, debugging, and controlling Tina orchestrations across multiple projects. Provides real-time visibility into orchestration state, task progress, and agent activity.

## Problem Statement

Current orchestration visibility is fragmented:
- Multiple orchestrations run in separate kitty tabs with no unified view
- State is scattered across files: team configs, task lists, status files, context metrics
- Debugging requires manually navigating directories and parsing JSON
- No way to see cross-project orchestration status at a glance
- Phase executors use file-based signaling that's fragile and hard to inspect

## Goals

1. **Unified visibility**: Single TUI showing all active orchestrations across projects
2. **Real-time monitoring**: Watch task progress, agent activity, context usage
3. **Debugging support**: Inspect tasks, view logs, understand blockers
4. **Operational control**: Navigate to worktrees, attach to tmux sessions
5. **CLI integration**: Provide status commands for skill-based monitoring (replacing file-based signaling)

## Non-Goals

- Replacing the orchestration system itself
- Providing a GUI (terminal-only)
- Managing Claude Code configuration
- Editing plans or designs

---

## Architecture

### System Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           User's Terminal                                │
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│  │ Kitty Tab 1 │     │ Kitty Tab 2 │     │ Kitty Tab 3 │               │
│  │             │     │             │     │             │               │
│  │ Orchestrator│     │ Orchestrator│     │ tina-monitor│◄── NEW        │
│  │ (Project A) │     │ (Project B) │     │ (TUI)       │               │
│  └──────┬──────┘     └──────┬──────┘     └─────────────┘               │
│         │                   │                   │                       │
│         │ spawns            │ spawns            │ reads                 │
│         ▼                   ▼                   ▼                       │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐   │
│  │ tmux        │     │ tmux        │     │ ~/.claude/teams/        │   │
│  │ sessions    │     │ sessions    │     │ ~/.claude/tasks/        │   │
│  │ (agents)    │     │ (agents)    │     │ {cwd}/.claude/tina/     │   │
│  └─────────────┘     └─────────────┘     └─────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Components

```
tina-monitor (Rust binary)
├── CLI Mode: tina-monitor status ...
│   └── Used by phase executors for monitoring
│
└── TUI Mode: tina-monitor (default)
    └── Interactive dashboard for humans
```

### Data Flow

```
~/.claude/teams/{team}/config.json
    │
    ├── name, description, createdAt
    ├── leadSessionId ──────────────────► ~/.claude/tasks/{sessionId}/
    │                                          └── {N}.json (tasks)
    └── members[].cwd ──────────────────► {cwd}/.claude/tina/
                                               ├── supervisor-state.json
                                               ├── context-metrics.json
                                               └── phase-{N}/status.json
```

---

## Data Model

### Orchestration (Derived)

An orchestration is identified by finding teams that have an associated `.claude/tina/supervisor-state.json` in their `cwd`.

```rust
pub struct Orchestration {
    /// Team managing this orchestration (e.g., "auth-feature-orchestration")
    pub team_name: String,

    /// From team config description or design doc filename
    pub title: String,

    /// Working directory (worktree path)
    pub cwd: PathBuf,

    /// From supervisor-state.json
    pub current_phase: u32,
    pub total_phases: u32,
    pub design_doc_path: PathBuf,
    pub plan_paths: HashMap<u32, PathBuf>,

    /// From context-metrics.json (if available)
    pub context_percent: Option<u8>,

    /// Derived from tasks and phase status
    pub status: OrchestrationStatus,

    /// All teams involved (orchestrator + phase execution teams)
    pub teams: Vec<TeamSummary>,

    /// Tasks from orchestrator's task list
    pub tasks: Vec<Task>,
}

pub enum OrchestrationStatus {
    /// Phase status = "executing" OR tasks in_progress
    Executing { phase: u32 },
    /// Phase status = "blocked"
    Blocked { phase: u32, reason: String },
    /// All phases complete
    Complete,
    /// No activity, not complete (stale or paused)
    Idle,
}
```

### Team

```rust
pub struct Team {
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub lead_agent_id: String,
    pub lead_session_id: String,
    pub members: Vec<Agent>,
}

pub struct TeamSummary {
    pub name: String,
    pub member_count: usize,
    pub active_count: usize,
    pub cwd: PathBuf,
}

pub struct Agent {
    pub agent_id: String,
    pub name: String,
    pub agent_type: Option<String>,
    pub model: String,
    pub tmux_pane_id: Option<String>,
    pub cwd: PathBuf,
    pub is_active: bool,
}
```

### Task

```rust
pub struct Task {
    pub id: String,
    pub subject: String,
    pub description: String,
    pub active_form: Option<String>,
    pub status: TaskStatus,
    pub owner: Option<String>,
    pub blocks: Vec<String>,
    pub blocked_by: Vec<String>,
    pub metadata: serde_json::Value,
}

pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
}
```

### Phase Execution Team

When an orchestration spawns phase execution, it creates a separate team. The link is stored in task metadata.

```rust
pub struct PhaseExecution {
    /// From execute-phase-N task metadata
    pub phase_team_name: String,
    pub phase_number: u32,

    /// From phase team's task list
    pub tasks: Vec<Task>,

    /// Derived
    pub status: PhaseStatus,
}

pub enum PhaseStatus {
    Executing {
        tasks_completed: usize,
        tasks_total: usize,
    },
    Blocked {
        reason: String,
    },
    Complete {
        git_range: Option<String>,
    },
}
```

---

## CLI Interface

### Commands

```
tina-monitor [OPTIONS] [COMMAND]

Commands:
  status    Query status of teams, tasks, or orchestrations
  teams     List all teams
  tasks     List tasks for a team
  help      Print help

Options:
  -h, --help     Print help
  -V, --version  Print version

If no command is given, launches the TUI.
```

### status subcommand

Primary interface for skill-based monitoring.

```
tina-monitor status <ENTITY> <NAME> [OPTIONS]

Entities:
  team           Get team status with task summary
  orchestration  Get orchestration status across all phases
  task           Get specific task details

Options:
  --format <FORMAT>    Output format [default: text] [possible: text, json]
  --check <CONDITION>  Exit 0 if condition met, 1 otherwise
                       [possible: complete, blocked, executing]
  --watch              Continuously poll and output updates
  --interval <SECS>    Poll interval for --watch [default: 5]
```

**Examples:**

```bash
# Get team status as JSON (for phase executor)
$ tina-monitor status team auth-feature-phase-1 --format=json
{
  "team_name": "auth-feature-phase-1",
  "session_id": "abc-123",
  "cwd": "/Users/josh/projects/app/.worktrees/auth",
  "status": "executing",
  "tasks": {
    "total": 8,
    "completed": 5,
    "in_progress": 1,
    "pending": 2,
    "blocked": 0
  },
  "blocked_reason": null
}

# Check if team is complete (for scripting)
$ tina-monitor status team auth-feature-phase-1 --check=complete
$ echo $?  # 0 if complete, 1 if not

# Get orchestration overview
$ tina-monitor status orchestration auth-feature-orchestration
Orchestration: auth-feature-orchestration
Design: docs/plans/2026-01-30-auth-feature-design.md
Phase: 2/3 (executing)
Context: 45%

Tasks:
  ✓ validate-design
  ✓ setup-worktree
  ✓ plan-phase-1
  ✓ execute-phase-1
  ✓ review-phase-1
  ✓ plan-phase-2
  ▶ execute-phase-2 (auth-feature-phase-2: 5/8 tasks)
  ○ review-phase-2
  ○ plan-phase-3
  ○ execute-phase-3
  ○ review-phase-3
  ○ finalize
```

### teams subcommand

```
tina-monitor teams [OPTIONS]

Options:
  --format <FORMAT>    Output format [default: text] [possible: text, json]
  --filter <TYPE>      Filter by type [possible: orchestration, phase, all]
```

**Example:**

```bash
$ tina-monitor teams
TEAM                          CWD                                    MEMBERS  STATUS
auth-feature-orchestration    ~/projects/app/.worktrees/auth         3        executing
auth-feature-phase-2          ~/projects/app/.worktrees/auth         4        executing
api-refactor-orchestration    ~/projects/backend/.worktrees/api      2        blocked
```

### tasks subcommand

```
tina-monitor tasks <TEAM_NAME> [OPTIONS]

Options:
  --format <FORMAT>    Output format [default: text] [possible: text, json]
  --status <STATUS>    Filter by status [possible: pending, in_progress, completed]
```

**Example:**

```bash
$ tina-monitor tasks auth-feature-phase-2
ID  STATUS       OWNER    SUBJECT
1   completed    worker   Create auth middleware
2   completed    worker   Add JWT validation
3   completed    worker   Implement login endpoint
4   completed    worker   Implement logout endpoint
5   completed    worker   Add session management
6   in_progress  worker   Add password reset flow
7   pending      -        Add email verification
8   pending      -        Write integration tests
```

---

## TUI Interface

### Layout

```
┌─ tina-monitor ──────────────────────────────────────────────────────────┐
│ Orchestrations                                                     [?]  │
├─────────────────────────────────────────────────────────────────────────┤
│ ▶ auth-feature         ~/projects/app       2/3  ████████░░  ctx:45%   │
│   api-refactor         ~/projects/backend   1/2  ████░░░░░░  BLOCKED   │
│   perf-benchmark       ~/projects/tina      3/3  ██████████  complete  │
├─────────────────────────────────────────────────────────────────────────┤
│ auth-feature > Phase 2 (executing)                                      │
│ ┌─ Tasks ─────────────────────────────┐ ┌─ Team ────────────────────┐  │
│ │ ✓ 1. Create auth middleware         │ │ ● team-lead    opus  exec │  │
│ │ ✓ 2. Add JWT validation             │ │ ● worker       son.  busy │  │
│ │ ✓ 3. Implement login endpoint       │ │ ○ spec-rev     son.  idle │  │
│ │ ✓ 4. Implement logout endpoint      │ │ ○ quality-rev  son.  idle │  │
│ │ ✓ 5. Add session management         │ │                           │  │
│ │ ▶ 6. Add password reset flow        │ │ ctx: 45% ████████░░░░░░░ │  │
│ │ ○ 7. Add email verification         │ │                           │  │
│ │ ○ 8. Write integration tests        │ └───────────────────────────┘  │
│ └─────────────────────────────────────┘                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ j/k:nav  enter:expand  t:tasks  m:members  l:logs  g:goto  a:attach    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Views

#### 1. Orchestration List (default)

Top-level view showing all active orchestrations.

| Column | Source |
|--------|--------|
| Name | Team name (minus `-orchestration` suffix) |
| Path | Shortened `cwd` from team config |
| Phase | `current_phase/total_phases` from supervisor-state |
| Progress | Visual bar based on completed tasks |
| Context | `used_pct` from context-metrics.json |
| Status | Derived from tasks and phase status |

#### 2. Phase Detail

Expanded view when an orchestration is selected.

**Left pane: Tasks**
- Shows tasks from phase execution team
- Status indicators: ✓ completed, ▶ in_progress, ○ pending, ✗ blocked

**Right pane: Team**
- Active agents with model and status
- Context usage bar

#### 3. Task Inspector (modal)

Full task details when a task is selected.

```
┌─ Task: Add password reset flow ─────────────────────────────────────────┐
│                                                                         │
│ Status: in_progress                                                     │
│ Owner: worker                                                           │
│                                                                         │
│ Description:                                                            │
│ Implement password reset functionality:                                 │
│ 1. Add POST /auth/forgot-password endpoint                              │
│ 2. Generate secure reset tokens                                         │
│ 3. Send reset email (mock for now)                                      │
│ 4. Add POST /auth/reset-password endpoint                               │
│ 5. Write tests for both endpoints                                       │
│                                                                         │
│ Blocked by: (none)                                                      │
│ Blocks: 7, 8                                                            │
│                                                                         │
│ Metadata:                                                               │
│   model: sonnet                                                         │
│   review: full                                                          │
│                                                                         │
│                                                         [ESC] Close     │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 4. Agent Logs (modal)

Live output from a tmux pane.

```
┌─ Logs: worker (auth-feature-phase-2) ───────────────────────────────────┐
│                                                                         │
│ I'll implement the password reset flow using TDD.                       │
│                                                                         │
│ First, let me write the failing test for the forgot-password endpoint.  │
│                                                                         │
│ [Read] spec/requests/auth/password_reset_spec.rb                        │
│ [Write] spec/requests/auth/password_reset_spec.rb                       │
│                                                                         │
│ Now running the test to confirm it fails:                               │
│                                                                         │
│ [Bash] bundle exec rspec spec/requests/auth/password_reset_spec.rb      │
│ F                                                                       │
│                                                                         │
│ Good, the test fails as expected. Now implementing the endpoint...      │
│ █                                                                       │
│                                                                         │
│                                    [f] Follow  [ESC] Close  [a] Attach  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `j` / `k` | List | Navigate up/down |
| `Enter` | Orchestration list | Expand/collapse orchestration details |
| `Enter` | Task list | Open task inspector |
| `t` | Phase detail | Focus task list |
| `m` | Phase detail | Focus team members |
| `l` | Agent selected | View agent logs (live) |
| `g` | Orchestration selected | Open terminal at cwd |
| `a` | Agent selected | Attach to tmux pane (new kitty tab) |
| `p` | Orchestration selected | View plan (rendered markdown) |
| `c` | Orchestration selected | View git commits for current phase |
| `d` | Orchestration selected | View git diff stats for current phase |
| `s` | Agent selected | Send text to agent (with confirmation) |
| `r` | Any | Force refresh |
| `?` | Any | Show help |
| `q` | Any | Quit (or close modal) |
| `Esc` | Modal | Close modal |

### Refresh Strategy

- **File watching** with `notify` crate on:
  - `~/.claude/teams/` (team creation/deletion)
  - `~/.claude/tasks/` (task updates)

- **Polling** (every 5s) for:
  - `{cwd}/.claude/tina/context-metrics.json` (per orchestration)
  - Tmux pane output (when log view is open)

- **On-demand** refresh with `r` key

### Git Visibility

Show git activity for the current phase.

#### Commits View (`c` key)

```
┌─ Commits: auth-feature phase 2 (abc123..def456) ────────────────────────┐
│                                                                         │
│ def456 feat: add password reset endpoint                                │
│ 789abc test: add password reset tests                                   │
│ 456def feat: add forgot-password endpoint                               │
│ 123ghi refactor: extract token generation                               │
│ abc123 feat: add session management                                     │
│                                                                         │
│ 5 commits, +342 -28 lines                                               │
│                                                                         │
│                                                             [ESC] Close │
└─────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
```bash
cd <worktree_path>
git log --oneline <git_range>
git diff --shortstat <git_range>
```

The `git_range` comes from `execute-phase-N` task metadata.

#### Diff Stats View (`d` key)

```
┌─ Changes: auth-feature phase 2 ─────────────────────────────────────────┐
│                                                                         │
│ src/auth/password-reset.ts       | 156 ++++++++++++++++++              │
│ src/auth/forgot-password.ts      |  89 ++++++++++                      │
│ src/auth/tokens.ts               |  45 +++++--                         │
│ spec/auth/password-reset.spec.ts | 112 ++++++++++++++++               │
│ spec/auth/forgot-password.spec.ts|  78 ++++++++++                      │
│                                                                         │
│ 5 files changed, 342 insertions(+), 28 deletions(-)                     │
│                                                                         │
│                                              [Enter] Full diff  [ESC]   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
```bash
cd <worktree_path>
git diff --stat <git_range>
```

### Agent Output (Live Logs)

View real-time output from an agent's tmux pane.

#### Log Capture

```bash
# Get last 100 lines
tmux capture-pane -t <pane_id> -p -S -100

# For live tailing, poll every 500ms and diff
```

#### Log View (`l` key)

```
┌─ Logs: worker (auth-feature-phase-2) ───────────────────────────────────┐
│                                                                         │
│ I'll implement the password reset flow using TDD.                       │
│                                                                         │
│ First, let me write the failing test for the forgot-password endpoint.  │
│                                                                         │
│ [Read] spec/requests/auth/password_reset_spec.rb                        │
│ [Write] spec/requests/auth/password_reset_spec.rb                       │
│                                                                         │
│ Now running the test to confirm it fails:                               │
│                                                                         │
│ [Bash] bundle exec rspec spec/requests/auth/password_reset_spec.rb      │
│ F                                                                       │
│                                                                         │
│ Good, the test fails as expected. Now implementing the endpoint...      │
│ █                                                                       │
│                                                                         │
│                        [f] Follow (auto-scroll)  [ESC] Close  [a] Attach│
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Scroll through history with `j`/`k` or arrow keys
- `f` toggles follow mode (auto-scroll to bottom)
- `a` attaches to the pane in a new terminal

### Sending Text to Agents

Inject text into an agent's tmux pane. Useful for:
- Sending `/checkpoint` to force checkpoint
- Sending `/clear` to reset context
- Sending instructions or nudges

#### Send Dialog (`s` key)

```
┌─ Send to: worker (auth-feature-phase-2) ────────────────────────────────┐
│                                                                         │
│ Enter text to send (will be followed by Enter):                         │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ /checkpoint                                                         │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ⚠ This will interrupt the agent's current operation.                    │
│                                                                         │
│ Quick actions:                                                          │
│   [1] /checkpoint                                                       │
│   [2] /clear                                                            │
│                                                                         │
│                                           [Enter] Send  [ESC] Cancel    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**
```bash
tmux send-keys -t <pane_id> "<text>" Enter
```

**Safety considerations:**
- Require confirmation before sending
- Show warning about interruption
- Log all sent commands (for debugging)
- Consider a "safe mode" that only allows known commands

### Terminal Integration

How the TUI opens external terminals for attach and goto operations.

#### Kitty Integration (Preferred)

If running in kitty with remote control enabled:

```bash
# Open new tab at worktree
kitty @ launch --type=tab --cwd=<worktree_path>

# Open new tab attached to tmux session
kitty @ launch --type=tab tmux attach -t <session_name>

# Or attach to specific pane
kitty @ launch --type=tab tmux select-pane -t <pane_id> \; attach
```

**Detection:**
```bash
# Check if kitty remote control is available
kitty @ ls &>/dev/null && echo "kitty available"
```

#### Fallback: Print Command

If kitty isn't available or remote control is disabled:

```
┌─ Attach to: worker ─────────────────────────────────────────────────────┐
│                                                                         │
│ Run this command in a new terminal:                                     │
│                                                                         │
│   tmux attach -t tina-auth-feature-phase-2                              │
│                                                                         │
│ Or select a specific pane:                                              │
│                                                                         │
│   tmux select-pane -t %16 && tmux attach                                │
│                                                                         │
│                                               [y] Copy to clipboard     │
│                                               [ESC] Close               │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Configuration

Allow users to configure their preferred terminal:

```toml
# ~/.config/tina-monitor/config.toml

[terminal]
# Options: "kitty", "iterm", "terminal", "print"
handler = "kitty"

# For iTerm2
# handler = "iterm"
# iterm_profile = "Default"

[attach]
# Open in new tab (default) or new window
new_window = false
```

**iTerm2 support (future):**
```bash
osascript -e 'tell application "iTerm2"
  tell current window
    create tab with default profile
    tell current session
      write text "tmux attach -t <session>"
    end tell
  end tell
end tell'
```

---

## Skill Changes

### 1. orchestrate/SKILL.md

**Change:** Pass `phase_team_name` to phase executor.

```diff
 **Phase executor spawn:**

 When: plan-phase-N complete
 Prerequisites: Need worktree_path (from setup-worktree metadata), plan_path (from plan-phase-N metadata)
+
+Derive phase team name:
+```
+PHASE_TEAM_NAME="${FEATURE_NAME}-phase-${N}"
+```

 ```json
 {
   "subagent_type": "tina:phase-executor",
   "team_name": "<TEAM_NAME>",
   "name": "executor-<N>",
-  "prompt": "phase_num: <N>\nworktree_path: <WORKTREE_PATH>\nplan_path: <PLAN_PATH>\nfeature_name: <FEATURE_NAME>\n\nStart team-lead in tmux and monitor until phase completes.\nReport: execute-<N> complete. Git range: <BASE>..<HEAD>"
+  "prompt": "phase_num: <N>\nworktree_path: <WORKTREE_PATH>\nplan_path: <PLAN_PATH>\nfeature_name: <FEATURE_NAME>\nphase_team_name: <PHASE_TEAM_NAME>\n\nStart team-lead in tmux and monitor until phase completes.\nReport: execute-<N> complete. Git range: <BASE>..<HEAD>"
 }
 ```
 Then: Mark execute-phase-N as in_progress
+
+Store phase team name in task metadata:
+```json
+TaskUpdate {
+  "taskId": "execute-phase-N",
+  "metadata": {
+    "phase_team_name": "<PHASE_TEAM_NAME>"
+  }
+}
+```
```

**Change:** Phase executor uses CLI for monitoring instead of status.json.

Add new section:

```markdown
### Phase Executor Monitoring

The phase executor monitors the phase execution team using `tina-monitor` CLI:

```bash
PHASE_TEAM_NAME="$1"  # from prompt

# Wait for team to be created
while ! tina-monitor status team "$PHASE_TEAM_NAME" --format=json &>/dev/null; do
  sleep 2
done

# Monitor until complete or blocked
while true; do
  STATUS=$(tina-monitor status team "$PHASE_TEAM_NAME" --format=json)
  TEAM_STATUS=$(echo "$STATUS" | jq -r '.status')

  case "$TEAM_STATUS" in
    complete)
      GIT_RANGE=$(echo "$STATUS" | jq -r '.metadata.git_range // empty')
      # Report completion to orchestrator
      break
      ;;
    blocked)
      REASON=$(echo "$STATUS" | jq -r '.blocked_reason')
      # Report blocked status to orchestrator
      break
      ;;
    *)
      sleep 10
      ;;
  esac
done
```

**Fallback:** If `tina-monitor` is not installed, fall back to reading `.claude/tina/phase-N/status.json` directly.
```

### 2. team-lead-init/SKILL.md

**Change:** Accept team name from invocation.

```diff
 ## STEP 1: Extract phase number from plan path

 Pattern: `-phase-(\d+)\.md$`
 Example: `docs/plans/2026-01-26-feature-phase-1.md` → PHASE_NUM = 1

+Also extract from invocation prompt:
+- `team_name`: The team name to use (provided by executor)
+- `plan_path`: Path to the phase plan
+
+Example prompt:
+```
+team_name: auth-feature-phase-1
+plan_path: docs/plans/2026-01-30-auth-feature-phase-1.md
+```
```

```diff
 ## STEP 3: CALL Teammate tool NOW to create team

 ```json
 {
   "operation": "spawnTeam",
-  "team_name": "phase-<N>-execution",
+  "team_name": "<team_name from invocation>",
   "description": "Phase <N> execution team"
 }
 ```
+
+**IMPORTANT:** Use the team_name provided in the invocation. Do NOT generate your own name.
```

```diff
-## STEP 3b: Write team name to file for executor discovery
-
-After team creation succeeds, write the team name to a file that the phase executor can discover:
-
-```bash
-TEAM_NAME="phase-$PHASE_NUM-execution"
-TEAM_NAME_FILE=".claude/tina/phase-$PHASE_NUM/team-name.txt"
-echo "$TEAM_NAME" > "$TEAM_NAME_FILE"
-```
-
-This enables the phase executor (from the orchestrator's team) to monitor the team-lead's task progress.
+## STEP 3b: REMOVED
+
+Team name file is no longer needed. The executor already knows the team name since it provided it in the invocation.
```

### 3. Task Metadata Convention

Add to orchestrate/SKILL.md:

```markdown
## Task Metadata Convention

Orchestration tasks store metadata for monitoring and recovery:

| Task | Required Metadata |
|------|-------------------|
| `validate-design` | `validation_status: "pass"\|"warning"\|"stop"` |
| `setup-worktree` | `worktree_path`, `branch_name` |
| `plan-phase-N` | `plan_path` |
| `execute-phase-N` | `phase_team_name`, `started_at` |
| `execute-phase-N` (on complete) | `git_range`, `completed_at` |
| `review-phase-N` | `status: "pass"\|"gaps"`, `issues[]` (if gaps) |

The `phase_team_name` field links the orchestrator's task to the phase execution team. This enables:
- TUI to show nested task progress
- CLI to query phase status
- Recovery to find the right team
```

---

## File Structure

```
tina-monitor/
├── Cargo.toml
├── README.md
├── src/
│   ├── main.rs              # Entry point, CLI parsing
│   │
│   ├── cli/
│   │   ├── mod.rs
│   │   ├── status.rs        # status subcommand
│   │   ├── teams.rs         # teams subcommand
│   │   └── tasks.rs         # tasks subcommand
│   │
│   ├── tui/
│   │   ├── mod.rs           # TUI app setup
│   │   ├── app.rs           # App state, event handling
│   │   ├── ui.rs            # Main render function
│   │   ├── views/
│   │   │   ├── mod.rs
│   │   │   ├── orchestration_list.rs
│   │   │   ├── phase_detail.rs
│   │   │   ├── task_inspector.rs
│   │   │   ├── log_viewer.rs
│   │   │   ├── commits_view.rs
│   │   │   ├── diff_view.rs
│   │   │   └── send_dialog.rs
│   │   └── widgets/
│   │       ├── mod.rs
│   │       ├── progress_bar.rs
│   │       └── status_indicator.rs
│   │
│   ├── data/
│   │   ├── mod.rs           # Re-exports
│   │   ├── discovery.rs     # Find orchestrations, teams
│   │   ├── teams.rs         # Parse team configs
│   │   ├── tasks.rs         # Parse task files
│   │   ├── tina_state.rs    # Parse supervisor-state, context-metrics
│   │   └── watcher.rs       # File watching with notify
│   │
│   ├── git/
│   │   ├── mod.rs
│   │   ├── commits.rs       # Parse git log output
│   │   └── diff.rs          # Parse git diff output
│   │
│   ├── tmux/
│   │   ├── mod.rs
│   │   ├── capture.rs       # Capture pane output
│   │   └── send.rs          # Send keys to pane
│   │
│   ├── terminal/
│   │   ├── mod.rs
│   │   ├── kitty.rs         # Kitty remote control
│   │   ├── iterm.rs         # iTerm2 AppleScript (future)
│   │   └── fallback.rs      # Print command fallback
│   │
│   └── config.rs            # Config file handling
│
└── tests/
    ├── cli_tests.rs
    └── fixtures/
        ├── teams/
        └── tasks/
```

### Configuration File

Location: `~/.config/tina-monitor/config.toml`

```toml
[terminal]
# How to open new terminals: "kitty", "iterm", "print"
handler = "kitty"

[tui]
# Refresh interval in seconds
refresh_interval = 5

# Log poll interval in milliseconds (when log view is open)
log_poll_interval = 500

[safety]
# Require confirmation before sending to agents
confirm_send = true

# Only allow these commands without extra confirmation
safe_commands = ["/checkpoint", "/clear", "/help"]

[logging]
# Log all sent commands to this file
command_log = "~/.local/share/tina-monitor/commands.log"
```

### Dependencies

```toml
[package]
name = "tina-monitor"
version = "0.1.0"
edition = "2021"

[dependencies]
# TUI
ratatui = "0.28"
crossterm = "0.28"

# CLI
clap = { version = "4", features = ["derive"] }

# Data
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }

# Config
toml = "0.8"

# File watching
notify = "6"

# Async runtime (for file watching)
tokio = { version = "1", features = ["full"] }

# Process execution (git, tmux)
which = "6"  # Find executables

# Clipboard (for copy command)
arboard = "3"

# Utilities
anyhow = "1"
thiserror = "1"
dirs = "5"
shellexpand = "3"  # Expand ~ in paths

[dev-dependencies]
tempfile = "3"
```

---

## Phase 1: Core Data Model & CLI

**Goal:** Working `tina-monitor status` command for phase executor integration.

### Deliverables

1. **Rust project scaffolding**
   - `tina-monitor/Cargo.toml` with all dependencies
   - `tina-monitor/src/main.rs` with clap CLI setup
   - Basic project structure matching File Structure section

2. **Data parsing module** (`src/data/`)
   - `teams.rs`: Parse `~/.claude/teams/{name}/config.json`
   - `tasks.rs`: Parse `~/.claude/tasks/{sessionId}/{N}.json`
   - `tina_state.rs`: Parse `supervisor-state.json` and `context-metrics.json`
   - `discovery.rs`: Find all teams, identify orchestrations

3. **CLI status command** (`src/cli/`)
   - `tina-monitor status team <name> [--format=json|text]`
   - `tina-monitor status orchestration <name> [--format=json|text]`
   - `--check=complete|blocked|executing` flag with exit codes

4. **Unit tests**
   - Test fixtures in `tests/fixtures/`
   - Parsing tests for all data types
   - CLI argument parsing tests

### Success Criteria

- `tina-monitor status team <name>` returns correct JSON matching spec
- `tina-monitor status team <name> --check=complete` exits 0 when complete, 1 otherwise
- Can parse real data from `~/.claude/teams/` and `~/.claude/tasks/`
- All tests pass

### Files to Create/Modify

- CREATE: `tina-monitor/Cargo.toml`
- CREATE: `tina-monitor/src/main.rs`
- CREATE: `tina-monitor/src/cli/mod.rs`
- CREATE: `tina-monitor/src/cli/status.rs`
- CREATE: `tina-monitor/src/data/mod.rs`
- CREATE: `tina-monitor/src/data/teams.rs`
- CREATE: `tina-monitor/src/data/tasks.rs`
- CREATE: `tina-monitor/src/data/tina_state.rs`
- CREATE: `tina-monitor/src/data/discovery.rs`
- CREATE: `tina-monitor/tests/cli_tests.rs`
- CREATE: `tina-monitor/tests/fixtures/` (sample data)

---

## Phase 2: Skill Integration

**Goal:** Phase executor uses CLI instead of status files.

### Deliverables

1. **Update orchestrate skill**
   - Pass `phase_team_name` in executor spawn prompt
   - Store `phase_team_name` in `execute-phase-N` task metadata
   - Document CLI-based monitoring loop

2. **Update team-lead-init skill**
   - Accept `team_name` from invocation prompt
   - Remove `team-name.txt` file creation
   - Use provided team name instead of generating one

3. **Integration test**
   - Run real orchestration with CLI monitoring
   - Verify phase completion detected correctly

### Success Criteria

- Orchestration completes successfully using CLI-based monitoring
- No `team-name.txt` files created
- Phase executor correctly detects completion/blocked status
- Existing orchestration functionality unchanged (no regressions)

### Files to Create/Modify

- MODIFY: `skills/orchestrate/SKILL.md`
- MODIFY: `skills/team-lead-init/SKILL.md`

---

## Phase 3: Basic TUI

**Goal:** Interactive orchestration list with real-time status.

### Deliverables

1. **TUI application structure** (`src/tui/`)
   - `app.rs`: App state, event loop
   - `ui.rs`: Main render function
   - Crossterm terminal setup/cleanup

2. **Orchestration list view**
   - Show all orchestrations with name, path, phase, progress, status
   - Progress bar widget
   - Status indicator widget

3. **Keyboard navigation**
   - `j`/`k` or arrow keys to navigate
   - `q` to quit
   - `r` to refresh

4. **File watching**
   - Watch `~/.claude/teams/` for changes
   - Watch `~/.claude/tasks/` for changes
   - Auto-refresh on file changes

### Success Criteria

- TUI launches and shows all active orchestrations
- Status updates automatically when files change
- Can navigate list with keyboard
- Clean exit on `q`

### Files to Create/Modify

- CREATE: `tina-monitor/src/tui/mod.rs`
- CREATE: `tina-monitor/src/tui/app.rs`
- CREATE: `tina-monitor/src/tui/ui.rs`
- CREATE: `tina-monitor/src/tui/views/mod.rs`
- CREATE: `tina-monitor/src/tui/views/orchestration_list.rs`
- CREATE: `tina-monitor/src/tui/widgets/mod.rs`
- CREATE: `tina-monitor/src/tui/widgets/progress_bar.rs`
- CREATE: `tina-monitor/src/tui/widgets/status_indicator.rs`
- CREATE: `tina-monitor/src/data/watcher.rs`
- MODIFY: `tina-monitor/src/main.rs` (add TUI mode)

---

## Phase 4: TUI Detail Views

**Goal:** Drill-down views for debugging orchestrations.

### Deliverables

1. **Phase detail view**
   - Split pane: tasks on left, team members on right
   - Task status indicators
   - Agent status and model info
   - Context usage bar

2. **Task inspector modal**
   - Full task description
   - Blocked by / blocks relationships
   - Metadata display

3. **Log viewer modal**
   - Capture tmux pane output
   - Scrollable history
   - Basic display (no follow mode yet)

4. **Navigation**
   - `Enter` to expand/collapse
   - `t` to focus tasks, `m` to focus members
   - `Esc` to close modals
   - `?` for help modal

### Success Criteria

- Can drill down from orchestration → phase tasks
- Can view full task details in modal
- Can view agent output (static capture)
- Navigation feels natural

### Files to Create/Modify

- CREATE: `tina-monitor/src/tui/views/phase_detail.rs`
- CREATE: `tina-monitor/src/tui/views/task_inspector.rs`
- CREATE: `tina-monitor/src/tui/views/log_viewer.rs`
- CREATE: `tina-monitor/src/tmux/mod.rs`
- CREATE: `tina-monitor/src/tmux/capture.rs`
- MODIFY: `tina-monitor/src/tui/app.rs` (add view state machine)

---

## Phase 5: TUI Actions

**Goal:** Operational control from TUI.

### Deliverables

1. **Terminal integration** (`src/terminal/`)
   - Kitty remote control support
   - Fallback: print command + clipboard
   - Terminal handler detection

2. **Goto action** (`g` key)
   - Open new terminal tab at worktree cwd
   - Works with kitty, falls back gracefully

3. **Attach action** (`a` key)
   - Open new terminal tab attached to tmux pane
   - Show command if kitty not available

4. **Plan viewer** (`p` key)
   - Render plan markdown in modal
   - Scrollable content

5. **Config file support**
   - `~/.config/tina-monitor/config.toml`
   - Terminal handler preference
   - Refresh intervals

### Success Criteria

- Can jump to worktree from TUI (new kitty tab)
- Can attach to tmux session (new kitty tab)
- Can view plan markdown
- Falls back gracefully when kitty not available

### Files to Create/Modify

- CREATE: `tina-monitor/src/terminal/mod.rs`
- CREATE: `tina-monitor/src/terminal/kitty.rs`
- CREATE: `tina-monitor/src/terminal/fallback.rs`
- CREATE: `tina-monitor/src/config.rs`
- MODIFY: `tina-monitor/src/tui/app.rs` (add action handlers)

---

## Phase 6: Git & Live Logs

**Goal:** Deep visibility into agent work.

### Deliverables

1. **Git module** (`src/git/`)
   - Parse `git log --oneline` output
   - Parse `git diff --stat` output
   - Execute git commands in worktree context

2. **Commits view** (`c` key)
   - Show commits in git range for current phase
   - Summary stats (commit count, lines changed)

3. **Diff stats view** (`d` key)
   - Show changed files with +/- stats
   - Option to view full diff

4. **Live log viewer improvements**
   - Poll tmux pane every 500ms
   - Follow mode (`f` key) for auto-scroll
   - Configurable poll interval

### Success Criteria

- Can see commits made during current phase
- Can see which files changed and by how much
- Log viewer updates in real-time with follow mode

### Files to Create/Modify

- CREATE: `tina-monitor/src/git/mod.rs`
- CREATE: `tina-monitor/src/git/commits.rs`
- CREATE: `tina-monitor/src/git/diff.rs`
- CREATE: `tina-monitor/src/tui/views/commits_view.rs`
- CREATE: `tina-monitor/src/tui/views/diff_view.rs`
- MODIFY: `tina-monitor/src/tui/views/log_viewer.rs` (add follow mode)

---

## Phase 7: Agent Interaction

**Goal:** Ability to send commands to running agents.

### Deliverables

1. **Send keys module** (`src/tmux/send.rs`)
   - Send text to tmux pane
   - Command logging

2. **Send dialog** (`s` key)
   - Text input field
   - Quick action buttons (1: /checkpoint, 2: /clear)
   - Warning about interruption
   - Confirmation before send

3. **Command logging**
   - Log all sent commands to file
   - Include timestamp, target, command

4. **Safety configuration**
   - `confirm_send` config option
   - `safe_commands` list for quick actions

### Success Criteria

- Can send `/checkpoint` to any agent
- All sent commands are logged
- Confirmation required before send (configurable)
- Quick actions work

### Files to Create/Modify

- CREATE: `tina-monitor/src/tmux/send.rs`
- CREATE: `tina-monitor/src/tui/views/send_dialog.rs`
- MODIFY: `tina-monitor/src/config.rs` (add safety settings)
- MODIFY: `tina-monitor/src/tui/app.rs` (add send action)

---

## Testing Strategy

### Unit Tests

- Data parsing with fixture files
- Status derivation logic
- CLI argument parsing

### Integration Tests

- End-to-end CLI commands with temp directories
- File watching triggers refresh

### Manual Testing

- Run alongside real orchestration
- Verify TUI updates in real-time
- Test all keybindings

### Test Fixtures

Create sample data in `tests/fixtures/`:

```
fixtures/
├── teams/
│   ├── auth-feature-orchestration/
│   │   └── config.json
│   └── auth-feature-phase-1/
│       └── config.json
├── tasks/
│   ├── session-abc/
│   │   ├── 1.json
│   │   ├── 2.json
│   │   └── 3.json
│   └── session-def/
│       └── 1.json
└── worktrees/
    └── auth-feature/
        └── .claude/
            └── tina/
                ├── supervisor-state.json
                ├── context-metrics.json
                └── phase-1/
                    └── status.json
```

---

## Open Questions

1. **Installation:** How should users install `tina-monitor`? Cargo install? Homebrew? Binary releases?

2. **Cleanup integration:** Should the TUI offer to clean up stale teams? Or leave that manual?

3. **Multi-machine:** If orchestrations run on different machines (rare), how do we handle that? Out of scope for v1?

4. **Backwards compatibility:** How long do we support status.json fallback before removing it?

5. **Agent output persistence:** Should we save captured agent output to files for post-mortem analysis? Could get large.

6. **Inbox messages:** Should the TUI show messages in agent inboxes? Could help debug communication issues.

7. **tmux session management:** Should we offer to kill stale tmux sessions? Or just show their state?

8. **Search/filter:** Should orchestration list be filterable by status, project, or text search?

9. **Notifications:** Should the TUI send system notifications on completion/blocking? (macOS notification center)

---

## Success Metrics

1. **Visibility:** Can see all orchestrations in one place
2. **Debugging:** Time to diagnose a blocked orchestration reduced by 50%
3. **Reliability:** Phase executor monitoring works without file-based signaling
4. **Adoption:** Used daily during orchestration work

---

## Appendix: Example Data Files

### Team Config (`~/.claude/teams/auth-feature-phase-1/config.json`)

```json
{
  "name": "auth-feature-phase-1",
  "description": "Phase 1 execution team",
  "createdAt": 1738234800000,
  "leadAgentId": "team-lead@auth-feature-phase-1",
  "leadSessionId": "abc-123-def-456",
  "members": [
    {
      "agentId": "team-lead@auth-feature-phase-1",
      "name": "team-lead",
      "agentType": "team-lead",
      "model": "claude-opus-4-5-20251101",
      "joinedAt": 1738234800000,
      "tmuxPaneId": "%15",
      "cwd": "/Users/josh/projects/app/.worktrees/auth-feature",
      "isActive": true
    },
    {
      "agentId": "worker@auth-feature-phase-1",
      "name": "worker",
      "model": "sonnet",
      "joinedAt": 1738234850000,
      "tmuxPaneId": "%16",
      "cwd": "/Users/josh/projects/app/.worktrees/auth-feature",
      "isActive": true
    }
  ]
}
```

### Task File (`~/.claude/tasks/abc-123-def-456/1.json`)

```json
{
  "id": "1",
  "subject": "Create auth middleware",
  "description": "Create Express middleware for JWT authentication...",
  "activeForm": "Creating auth middleware",
  "status": "completed",
  "blocks": ["2", "3"],
  "blockedBy": [],
  "metadata": {
    "task_number": 1,
    "model": "sonnet",
    "review": "full"
  }
}
```

### Supervisor State (`{cwd}/.claude/tina/supervisor-state.json`)

```json
{
  "design_doc_path": "/Users/josh/projects/app/docs/plans/2026-01-30-auth-feature-design.md",
  "worktree_path": "/Users/josh/projects/app/.worktrees/auth-feature",
  "branch_name": "tina/auth-feature",
  "total_phases": 3,
  "current_phase": 2,
  "plan_paths": {
    "1": "docs/plans/2026-01-30-auth-feature-phase-1.md",
    "2": "docs/plans/2026-01-30-auth-feature-phase-2.md"
  },
  "status": "executing"
}
```

### Context Metrics (`{cwd}/.claude/tina/context-metrics.json`)

```json
{
  "used_pct": 45,
  "tokens": 90000,
  "max": 200000,
  "timestamp": "2026-01-30T15:30:00Z"
}
```
