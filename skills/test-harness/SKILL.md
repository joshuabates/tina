---
name: test-harness
description: Use when testing changes to tina-monitor, tina-session, or orchestration skills to verify correct behavior with controlled scenarios
---

# Test Harness

## Overview

`tina-harness` tests the orchestration pipeline by running controlled scenarios against tina-monitor and tina-session. Use it to verify your changes don't break orchestration.

## When to Use

- After modifying tina-monitor display logic
- After changing tina-session state schemas
- After editing orchestration skills
- Before merging any tina infrastructure changes

## Quick Reference

| Command | Purpose |
|---------|---------|
| `tina-harness validate <path>` | Validate state files against schema |
| `tina-harness run <scenario>` | Run scenario with mock orchestration |
| `tina-harness run <scenario> --full` | Run with real orchestration (slow) |
| `tina-harness run <scenario> --force-baseline` | Force re-run even if baseline exists |
| `tina-harness generate-scenario --phases N --output <dir>` | Generate new scenario |

## Workflow

### 1. Run Existing Scenarios

```bash
cd tina-harness

# Run a specific scenario (fast mode - mock orchestration)
tina-harness run 01-single-phase-feature

# Run all scenarios
for dir in scenarios/*/; do
  tina-harness run "$(basename "$dir")"
done
```

### 2. Interpret Failures

Failures are categorized to help identify the root cause:

| Category | Meaning | What to Fix |
|----------|---------|-------------|
| Setup | Test infrastructure problem | Check test-project, scenario config |
| Orchestration | State files wrong or missing | Fix tina-session or orchestration skills |
| Monitor | tina-monitor misreads valid state | Fix tina-monitor display logic |
| Outcome | Feature not implemented correctly | Fix the implementation |

### 3. Add New Scenarios

When you find a new edge case:

```bash
# Generate from template
tina-harness generate-scenario \
  --phases 2 \
  --include-remediation \
  --output scenarios/05-my-edge-case

# Or create manually
mkdir scenarios/05-my-edge-case
# Add design.md, expected.json, optional setup.patch
```

### 4. Validate State Files

Check if orchestration is producing valid state:

```bash
# Validate a specific orchestration's state
tina-harness validate /path/to/worktree/.claude/tina

# Report mode (show issues but don't fail)
tina-harness validate --report /path/to/state
```

## Baseline Skip Logic

Scenarios track when they last passed in `last-passed.json`. If no relevant files changed since the last pass, the scenario is skipped. Use `--force-baseline` to override.

Relevant files checked:
- `tina-harness/`
- `tina-session/`
- `tina-monitor/`
- `skills/`

## Full vs Mock Mode

**Mock mode (default):** Simulates orchestration state without actually running orchestration. Fast, no API cost.

**Full mode (`--full`):** Invokes real orchestration with haiku model. Slow, has API cost. Use for:
- Final verification before merging
- Debugging state issues that only appear with real orchestration
- Eval runs where accuracy matters

## Scenario Structure

```
scenarios/
  01-single-phase-feature/
    design.md          # Design doc passed to orchestration
    expected.json      # Assertions about outcome
    last-passed.json   # Auto-generated when scenario passes
  03-failing-tests/
    design.md
    expected.json
    setup.patch        # Applied to test-project before run
```

### expected.json Format

```json
{
  "schema_version": 1,
  "assertions": {
    "phases_completed": 1,
    "final_status": "complete",
    "tests_pass": true,
    "setup_tests_failed": false,
    "file_changes": [
      { "path": "src/main.rs", "contains": "verbose" },
      { "path": "src/utils/mod.rs", "exists": true }
    ]
  }
}
```

## Common Mistakes

**Running without building first:**
```bash
cd tina-harness && cargo build --release
```

**Forgetting to run from tina-harness directory:**
```bash
# Wrong - scenarios not found
tina-harness run 01-single-phase-feature

# Right
cd tina-harness && tina-harness run 01-single-phase-feature
```

**Not checking baseline skip:**
If a scenario is skipped but you want to verify it:
```bash
tina-harness run 01-single-phase-feature --force-baseline
```
