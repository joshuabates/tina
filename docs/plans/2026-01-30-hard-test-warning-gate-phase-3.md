# Phase 3: Hard Test & Warning Gate

## Overview

Implement hard enforcement that phases cannot complete with failing tests or linter warnings. The `tina-session check verify` command already exists with complete multi-language support (Rust, Node.js, Python, Go). This phase integrates it as a mandatory gate in the team-lead-init skill.

## Goal

No phase completion with failing tests or warnings. This is a hard gate, not a soft warning.

## Current State

### Already Implemented (Phase 1)

The `tina-session check verify` command is fully implemented in `/Users/joshuabates/Projects/tina/tina-session/src/commands/check.rs`:

- Auto-detects project type via presence of `Cargo.toml`, `package.json`, `pyproject.toml`, or `go.mod`
- Runs appropriate test command per language:
  - Rust: `cargo test --no-fail-fast`
  - Node.js: `npm test`
  - Python: `pytest`
  - Go: `go test ./...`
- Runs appropriate linter per language:
  - Rust: `cargo clippy -- -D warnings`
  - Node.js: `npm run lint`
  - Python: `flake8 .`
  - Go: `golangci-lint run`
- Returns exit code 0 on pass, 1 on failure
- Outputs clear PASS/FAIL messages

### Not Yet Integrated

The `team-lead-init` skill at `/Users/joshuabates/Projects/tina/skills/team-lead-init/SKILL.md` already has Step 6 (completion gates) documented but the integration is not enforced at the code level - it's guidance in the skill documentation.

## What Needs to Change

### Task 1: Remove Unused Stub in checks/verify.rs

**Model:** haiku

The file `/Users/joshuabates/Projects/tina/tina-session/src/checks/verify.rs` contains a stub function `run_verification` that is never called (the actual implementation is the `verify` function in `commands/check.rs`). This creates confusion about which function to use.

**Actions:**
1. Delete the stub `run_verification` function from `checks/verify.rs`
2. Update `checks/mod.rs` if needed (verify.rs may become empty or contain shared types)
3. Ensure `cargo check` and `cargo test` still pass

**Acceptance criteria:**
- No unused code in checks/verify.rs
- All existing tests pass
- Cargo clippy clean

### Task 2: Add Integration Test for Verify Command

**Model:** haiku

Add an integration test that validates the full `tina-session check verify` command works correctly for a Rust project (since we're in a Rust codebase).

**Actions:**
1. Create integration test in `tina-session/tests/` directory
2. Test should create a temp Rust project with:
   - A passing test case
   - A failing test case (commented out by default)
3. Verify `tina-session check verify` returns 0 for passing project
4. Verify `tina-session check verify` returns 1 when test fails

**Acceptance criteria:**
- Integration test exercises the actual binary
- Test covers both pass and fail cases
- Test is deterministic (no flaky behavior)

### Task 3: Strengthen team-lead-init Gate Documentation

**Model:** haiku

The team-lead-init skill already documents Step 6 with verification gates, but the wording could be clearer about the hard-gate requirement. Update the skill to:

1. Make it unambiguous that this is a BLOCKING gate
2. Add explicit error message format for blocked status
3. Clarify that partial completion is not acceptable

**Actions:**
1. Update Step 6 in `/Users/joshuabates/Projects/tina/skills/team-lead-init/SKILL.md`
2. Add explicit format for blocked status JSON with verification failure reason
3. Add red flag: "Never mark phase complete if verify gate fails"

**Acceptance criteria:**
- Step 6 clearly states this is a hard gate (phase CANNOT complete)
- Blocked status format includes structured error info
- Red flags section updated with verification gate requirement

## Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 200 |

This is a small phase - mostly cleanup and documentation updates with one integration test.

## Dependencies

- Phase 1 complete (tina-session binary exists and `check verify` works)
- Phase 2 complete (complexity gates work)

## Success Criteria

1. No unused stub code in checks/verify.rs
2. Integration test proves verify command works
3. team-lead-init skill unambiguously requires verification gate to pass before phase completion
4. All tests pass
5. Clippy clean

## Verification

After implementation, verify by running:

```bash
# Ensure binary builds
cargo build --release -p tina-session

# Run all tests
cargo test -p tina-session

# Verify clippy clean
cargo clippy -p tina-session -- -D warnings

# Manual verification: command works
./tina-session/target/release/tina-session check verify --cwd /path/to/project
```
