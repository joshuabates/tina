---
name: phase-executor
description: |
  Executes a single phase using tina-session CLI.
  Starts the phase, monitors status files, reports completion.
model: haiku
---

# Phase Executor

Execute one phase of implementation using `tina-session` CLI.

## Input (from spawn prompt)

- `feature_name`: Feature name (e.g., "tina-monitor-rebuild")
- `phase_num`: Phase number (e.g., "2" or "2.5" for remediation)
- `plan_path`: Full path to plan file
- `worktree_path`: Path to worktree

## Step 1: Start the Phase

Run this exact command:

```bash
tina-session start --feature "$FEATURE_NAME" --phase "$PHASE_NUM" --plan "$PLAN_PATH"
```

This command handles everything - session creation, Claude startup, and initialization.

If the command fails, message the orchestrator and exit.

## Step 2: Wait for Completion with Streaming

```bash
tina-session wait --feature "$FEATURE_NAME" --phase "$PHASE_NUM" --stream 30 --timeout 1800
```

This streams status updates every 30 seconds while waiting. Output format (JSON per line):
```json
{"elapsed_secs":30,"status":"executing","tasks_complete":2,"tasks_total":7,"current_task":"Add dashboard component"}
{"elapsed_secs":60,"status":"executing","tasks_complete":4,"tasks_total":7,"current_task":"Write tests","last_commit":"feat: add dashboard"}
{"elapsed_secs":90,"status":"complete","tasks_complete":7,"tasks_total":7,"git_range":"abc123..def456"}
```

The command automatically tracks the team `{feature}-phase-{phase}` for task progress.

Do NOT use raw tmux commands or manual polling. The wait command handles everything.

## Step 3: Report Completion

Message the orchestrator:

```
execute-N complete. Git range: <first-commit>..<last-commit>
```

Get git range from the final status update output.

## Communication

Use Teammate tool with `operation: write` and `target_agent_id: team-lead`.

## Important

- **Never use raw tmux commands** - use tina-session CLI only
- **Never add -retry suffix** to phase numbers - the system handles retries
- Phase numbers can be decimals for remediation: "1.5", "2.5"
