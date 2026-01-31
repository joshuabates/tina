---
name: worktree-setup
description: |
  Creates isolated git worktree for orchestrated execution.
  Sets up dependencies, statusline, and tina-session.
model: haiku
---

## Reading Your Task

Your spawn prompt contains a task ID. Extract it and get your task details:

```
# Parse task_id from spawn prompt (format: "task_id: <id>")
TASK_ID=$(echo "$SPAWN_PROMPT" | grep -oP 'task_id:\s*\K\S+')

# Get task details
TaskGet with task_id: $TASK_ID
```

**Required parameters from task.metadata:**
- `feature_name`: Feature name (e.g., "tina-monitor-rebuild")
- `design_doc_path`: Path to design document

## Boundaries

**MUST DO:**
- Create worktree in `.worktrees` directory (create if needed)
- Ensure worktree directory is gitignored
- Create unique branch name (append timestamp if exists)
- Install dependencies appropriate to project type
- Initialize tina-session with correct phase count
- Report worktree_path and branch to orchestrator

**MUST NOT DO:**
- Create worktree outside `.worktrees` directory
- Overwrite existing branches without making unique
- Skip dependency installation
- Ask for confirmation before proceeding

**NO CONFIRMATION:** Execute setup immediately. Report completion via Teammate tool when done. Never pause to ask "should I proceed?"

---

# Worktree Setup

Create an isolated workspace for phase execution.

## Input (from spawn prompt)

- `feature_name`: Feature name (e.g., "tina-monitor-rebuild")
- `design_doc_path`: Path to design document

## Steps

### 1. Create Worktree Directory

Use `.worktrees` or `worktrees` if they exist, otherwise create `.worktrees`:

```bash
WORKTREE_DIR="${PWD}/.worktrees"
mkdir -p "$WORKTREE_DIR"
```

Verify it's gitignored:

```bash
git check-ignore -q "$WORKTREE_DIR" || echo ".worktrees" >> .gitignore
```

### 2. Create Branch and Worktree

```bash
BRANCH_NAME="tina/$FEATURE_NAME"
WORKTREE_PATH="$WORKTREE_DIR/$FEATURE_NAME"

git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME"
```

If branch or path exists, append timestamp to make unique.

### 3. Install Dependencies

```bash
cd "$WORKTREE_PATH"
[ -f package.json ] && npm install
[ -f Cargo.toml ] && cargo build
[ -f requirements.txt ] && pip install -r requirements.txt
```

### 4. Create Statusline Config

Create `.claude/tina-write-context.sh` that writes context metrics to `.claude/tina/context-metrics.json`.

Create `.claude/settings.local.json` with statusLine command pointing to the script.

### 5. Initialize tina-session

```bash
TOTAL_PHASES=$(grep -cE "^##+ Phase [0-9]" "$DESIGN_DOC_PATH")

tina-session init \
  --feature "$FEATURE_NAME" \
  --cwd "$WORKTREE_PATH" \
  --design-doc "$DESIGN_DOC_PATH" \
  --branch "$BRANCH_NAME" \
  --total-phases "$TOTAL_PHASES"
```

### 6. Run Baseline Tests (optional)

Run tests to verify worktree is clean. Report warning if they fail but continue.

### 7. Report Completion

Message orchestrator with:
- `worktree_path`: Full path to worktree
- `branch`: Branch name

## Communication

Use Teammate tool with `operation: write` and `target_agent_id: team-lead`.
