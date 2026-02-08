---
name: run-harness
description: Run a tina-harness scenario using a team (harness-runner + convex-watcher) so the main session stays free
---

# Run Harness (Team Pattern)

## Usage

```
/run-harness <scenario> [--skip-build]
```

## Arguments

- `<scenario>`: Scenario name (e.g., `01-single-phase-feature`)
- `--skip-build`: Skip binary rebuild (default: rebuild first)

## What This Does

1. Rebuilds tina-session and tina-daemon binaries (unless `--skip-build`)
2. Creates two subagent tasks:
   - **harness-runner**: Executes `tina-harness run <scenario> --full --skip-build --verify`
   - **convex-watcher**: Polls Convex every 30s, reports milestones and anomalies
3. Waits for both to complete
4. Reports pass/fail with details

## Workflow

### Step 1: Parse Arguments

Extract `<scenario>` and optional `--skip-build` flag from the invocation.

### Step 2: Load Scenario Config

Read `tina-harness/scenarios/<scenario>/scenario.json` to get the `feature_name`.
Read `tina-harness/scenarios/<scenario>/expected.json` to get expected phase count.

### Step 3: Rebuild Binaries (unless --skip-build)

Run from the project root:
```bash
cd tina-harness && cargo build -p tina-session -p tina-daemon
```

If tina-daemon is running, restart it:
```bash
tina-session daemon stop && sleep 1 && tina-session daemon start
```

### Step 4: Create Subagent Tasks

Use the Task tool to create two tasks:

**Task A: harness-runner**
```
Subject: Run harness scenario <scenario>
Description: |
  Execute tina-harness run <scenario> --full --skip-build --verify \
    --scenarios-dir <abs-path>/tina-harness/scenarios \
    --test-project-dir <abs-path>/tina-harness/test-project

  Report the full stdout/stderr output when complete.
  If the run fails, include the failure details.
```

**Task B: convex-watcher**
```
Subject: Monitor Convex state for <feature_name>
Description: |
  Monitor the orchestration for feature "<feature_name>" in Convex.
  Expected phases: <N> (from expected.json).

  Every 30 seconds, run:
    tina-harness verify <feature_name> --min-phases 1 --min-tasks 1 --min-team-members 1

  Report milestones:
  - "Orchestration appeared in Convex"
  - "Phase N team registered"
  - "N/M tasks completed"

  Report anomalies:
  - "5 minutes elapsed, no orchestration in Convex"
  - "Phase team has no tasks after 2 minutes"

  Stop when:
  - harness-runner task completes (check via TaskList)
  - OR orchestration reaches terminal state (complete/blocked)
  - OR 50 minutes elapsed (safety timeout)
```

### Step 5: Wait and Report

Monitor task completion via TaskList. When harness-runner finishes:
- If PASS: Report success with Convex verification details
- If FAIL: Report failure with categorized failure list
- Include any anomalies the convex-watcher reported

## Important Notes

- The `--skip-build` flag is ALWAYS passed to `tina-harness run` because the skill already handled the rebuild in Step 3. This avoids the subagent redundantly rebuilding.
- The convex-watcher uses `tina-harness verify` which is an existing command -- no new code needed.
- Both subagents run in the same project directory and can access the same tools.
