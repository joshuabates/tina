# Phase 4: Integration and Skill Implementation Plan

## Overview

Phase 4 completes the test harness by adding the integration layer that allows orchestration to test its own changes.

## Success Criteria (from design)

- [x] `tina:test-harness` skill documented
- [x] Orchestration can invoke harness to test its own changes
- [x] Baseline skip logic working
- [x] Scenario generator for basic parameterization

## Implementation Summary

### 1. Baseline Skip Logic

**Files changed:**
- `tina-harness/src/scenario/types.rs` - Added `LastPassed` struct
- `tina-harness/src/scenario/loader.rs` - Added `load_last_passed()` and `save_last_passed()`
- `tina-harness/src/scenario/mod.rs` - Exported new functions
- `tina-harness/src/commands/run.rs` - Added `should_skip_baseline()` and `get_current_git_hash()`

**Behavior:**
- Scenarios store `last-passed.json` with commit hash and timestamp when they pass
- Before running, harness checks if baseline can be skipped:
  - Same commit as last pass: skip
  - No relevant file changes since last pass: skip
  - Otherwise: run
- `--force-baseline` flag overrides skip logic
- Relevant directories: `tina-harness/`, `tina-session/`, `tina-monitor/`, `skills/`

### 2. Full Orchestration Mode

**Files changed:**
- `tina-harness/src/commands/run.rs` - Implemented `run_full_orchestration()`

**Behavior:**
- `--full` flag triggers real orchestration instead of mock
- Writes design.md to work directory
- Initializes git repo (required for orchestration)
- Invokes `claude --print -p "/tina:orchestrate <design-path>"`
- Uses `CLAUDE_CODE_MODEL=haiku` for fast mode
- Parses result from `supervisor-state.json`

### 3. Scenario Generator

**Files added:**
- `tina-harness/src/commands/generate.rs` - New command module

**CLI:**
```bash
tina-harness generate-scenario \
  --phases N \
  --include-remediation \
  --failure-at-phase M \
  --output <dir>
```

**Generates:**
- `design.md` - Phase-appropriate design document
- `expected.json` - Assertions matching the configuration
- `setup.patch` - (if failure scenario) Patch that breaks tests

### 4. Test Harness Skill

**Files added:**
- `skills/test-harness/SKILL.md`

**Content:**
- Quick reference table for commands
- Workflow for running scenarios and interpreting failures
- Explanation of baseline skip logic
- Full vs mock mode guidance
- Scenario structure documentation
- Common mistakes section

## Dependency Added

- `chrono` (0.4 with serde feature) for timestamp handling in `LastPassed`

## Tests Added

- `test_last_passed_serialize` / `test_last_passed_deserialize` - LastPassed serde
- `test_load_last_passed_missing` / `test_load_last_passed_exists` - Loader functions
- `test_save_last_passed` - Save function
- `test_generate_single_phase` - Single phase generation
- `test_generate_multi_phase` - Multi-phase generation
- `test_generate_with_failure` - Failure scenario generation
- `test_generate_with_remediation` - Remediation flag

## Test Results

All 31 tests pass (26 lib + 5 integration).
