# Fix Worktree Path Bug in Phase Executor

## The Bug

Phase executor works in main project directory instead of isolated worktree, polluting main with feature work.

## Root Cause

`tina-session start` doesn't know about worktree paths. The command signature is:
```bash
tina-session start --feature X --phase N --plan /path/to/plan
```

No `--cwd` argument exists. The tmux session starts wherever the command is run (main project dir).

## The Fix

Add `--cwd` argument to `tina-session start` and have phase-executor pass the worktree path.

### Step 1: Update `tina-session start` Command

**File:** `tina-session/src/commands/start.rs`

**Change:**
```rust
#[derive(Parser)]
pub struct StartArgs {
    #[arg(long)]
    feature: String,

    #[arg(long)]
    phase: String,

    #[arg(long)]
    plan: String,

    // ADD THIS:
    #[arg(long)]
    cwd: Option<String>,

    #[arg(long)]
    install_deps: bool,

    #[arg(long)]
    parent_team_id: Option<String>,
}
```

**In the handler:** Before spawning tmux, cd to the cwd if provided:
```rust
let working_dir = if let Some(cwd) = &args.cwd {
    PathBuf::from(cwd)
} else {
    std::env::current_dir()?
};

// Use working_dir when spawning tmux session
// Pass it to the Claude CLI working directory
```

### Step 2: Update Phase Executor Agent

**File:** `agents/phase-executor.md`

**Find this line:**
```bash
tina-session start --feature "$FEATURE_NAME" --phase "$PHASE_NUM" --plan "$PLAN_PATH" \
  ${PARENT_TEAM_ID:+--parent-team-id "$PARENT_TEAM_ID"}
```

**Change to:**
```bash
tina-session start \
  --feature "$FEATURE_NAME" \
  --phase "$PHASE_NUM" \
  --plan "$PLAN_PATH" \
  --cwd "$WORKTREE_PATH" \
  ${PARENT_TEAM_ID:+--parent-team-id "$PARENT_TEAM_ID"}
```

**Add to the "Read task metadata" section:**
```bash
WORKTREE_PATH=$(echo "$TASK_JSON" | jq -r '.metadata.worktree_path')
```

### Step 3: Rebuild and Test

```bash
# Rebuild binary
cargo build -p tina-session

# Restart daemon (if it caches anything)
tina-session daemon stop
tina-session daemon start

# Test with harness
mise run harness:run 01-single-phase-feature -- --full
```

### Step 4: Verify Fix

After test run:
```bash
# Check that work happened in worktree, not main
git status  # Should be clean
ls .worktrees/test-feature/convex/  # Should have new files
cd .worktrees/test-feature && git log  # Should have commits
```

## Alternative Fix (If Above Doesn't Work)

If `tina-session start` can't easily change working directory for the tmux session, then:

**Option:** Make `tina-session start` cd to the worktree before spawning tmux:
```rust
std::env::set_current_dir(&working_dir)?;
// Then spawn tmux
```

This changes the process CWD before tmux creation, so tmux inherits the correct directory.

## Files to Change

1. `tina-session/src/commands/start.rs` - Add `--cwd` arg, use it
2. `agents/phase-executor.md` - Pass `--cwd "$WORKTREE_PATH"` to start command
3. Rebuild binary, test

## Why This Happened

`supervisor-state.json` was removed. Old design: `tina-session start` would read state file to find worktree. New design: no state file, but no replacement mechanism added for worktree path propagation.

The worktree path exists in task metadata but never reaches the tmux session's working directory.
