# Orchestration System Test Suite

A comprehensive test suite for validating the TINA orchestration system, covering happy paths, error handling, recovery, and edge cases.

## Background

This test suite was developed after running the initial `orchestration-test-design.md` which successfully validated the happy path. That test revealed gaps in coverage that this suite addresses.

## Test Categories

### Category 1: Happy Path (Validated)

The basic orchestration flow has been validated:
- Design validation passes
- Worktree creation succeeds
- Phase planning completes
- Phase execution via tmux works
- Phase review passes
- Finalization with merge/PR/discard options

**Status:** Covered by `orchestration-test-design.md`

### Category 2: Remediation Flow (Not Yet Tested)

Test that review failures trigger remediation phases correctly.

### Category 3: Recovery Flow (Not Yet Tested)

Test crash recovery and session resumption.

### Category 4: Teammate Lifecycle (Not Yet Tested)

Test proper cleanup of team members after orchestration completes.

---

## Test 1: Remediation Trigger

### Purpose
Validate that when a phase review reports gaps, the orchestrator correctly creates remediation tasks (N.5 phases).

### Design

Create a minimal project where Phase 1 intentionally omits a requirement, forcing the reviewer to report gaps.

**Project:** `remediation-test` - A simple config validator

**Phase 1 Scope:**
- Create `validate(config)` function
- **Intentionally omit:** Input sanitization (required by design)

**Phase 1 Success Criteria (as stated in design):**
- Function validates config structure
- Function sanitizes input before validation
- Tests pass

**Expected Behavior:**
1. Phase 1 executes, creates `validate()` without sanitization
2. Reviewer reports: `review-1 complete (gaps): missing input sanitization`
3. Orchestrator creates:
   - `plan-phase-1.5`
   - `execute-phase-1.5`
   - `review-phase-1.5`
4. Dependencies updated: `plan-phase-2` blocked by `review-phase-1.5`
5. Remediation planner receives issues list
6. Remediation executes and adds sanitization
7. Remediation review passes
8. Orchestration continues to Phase 2

### Verification Checklist
- [ ] Reviewer correctly identifies missing requirement
- [ ] Orchestrator parses gaps from review message
- [ ] Remediation tasks created with correct names
- [ ] Dependencies properly updated
- [ ] Remediation planner receives issue context
- [ ] Remediation execution addresses specific gap
- [ ] Post-remediation review verifies fix

---

## Test 2: Remediation Limit

### Purpose
Validate that after 2 remediation cycles, orchestration exits with error rather than creating infinite remediation loops.

### Design

Create a project with an impossible requirement that will always fail review.

**Project:** `remediation-limit-test` - Impossible validation

**Phase 1 Scope:**
- Create a function

**Phase 1 Success Criteria (impossible):**
- Function must return both true AND false simultaneously
- (This is logically impossible, ensuring review always fails)

**Expected Behavior:**
1. Phase 1 executes
2. Review 1 fails: `review-1 complete (gaps): cannot return both true and false`
3. Remediation 1.5 executes
4. Review 1.5 fails: same gap
5. Remediation 1.5.5 executes
6. Review 1.5.5 fails: same gap
7. Orchestrator exits with error:
   ```
   ERROR: Phase 1 has failed review after 2 remediation attempts
   Manual intervention required.
   ```
8. Tasks preserved for inspection

### Verification Checklist
- [ ] First remediation (1.5) created and executed
- [ ] Second remediation (1.5.5) created and executed
- [ ] Third remediation NOT created (limit reached)
- [ ] Orchestrator exits with clear error message
- [ ] Task list preserved (not cleaned up)
- [ ] User can inspect state for debugging

---

## Test 3: Crash Recovery - Mid-Planning

### Purpose
Validate orchestrator can resume from existing team after crash during planning phase.

### Design

Use a normal multi-phase project. Simulate crash by killing orchestrator during plan-phase-1.

**Steps:**
1. Start orchestration
2. Wait for `plan-phase-1` to be in_progress
3. Kill orchestrator (Ctrl+C)
4. Restart: `/tina:orchestrate <same-design-doc>`

**Expected Behavior:**
1. Orchestrator detects existing team: `~/.claude/teams/<name>.json`
2. Reads task list, finds `plan-phase-1` in_progress
3. Respawns planner-1 teammate
4. Orchestration continues normally

### Verification Checklist
- [ ] Existing team detected (no "spawnTeam" call)
- [ ] Task list correctly shows in_progress task
- [ ] Planner respawned (not duplicated)
- [ ] Orchestration completes successfully

---

## Test 4: Crash Recovery - Mid-Execution

### Purpose
Validate recovery when orchestrator crashes while phase executor is running in tmux.

### Design

Simulate crash during execute-phase-1.

**Steps:**
1. Start orchestration
2. Wait for `execute-phase-1` to be in_progress (tmux session running)
3. Kill orchestrator only (NOT the tmux session)
4. Restart orchestration

**Expected Behavior:**
1. Orchestrator detects existing team
2. Finds `execute-phase-1` in_progress
3. Respawns executor-1
4. New executor detects existing tmux session
5. Executor attaches/monitors existing session (doesn't start new one)
6. If phase already complete, proceeds to review
7. If phase in progress, monitors until complete

### Verification Checklist
- [ ] Existing tmux session preserved
- [ ] Executor attaches to existing session (not creates new)
- [ ] No duplicate work performed
- [ ] Orchestration completes successfully

---

## Test 5: Teammate Lifecycle Cleanup

### Purpose
Validate that teammates properly deregister after completing their work, enabling clean team cleanup.

### Current Issue
Teammates send idle notifications but remain registered as team members. `cleanup()` fails because it requires no active members.

### Expected Behavior (After Fix)
1. Teammate completes work
2. Teammate sends completion message
3. Teammate deregisters from team
4. After all tasks complete, `cleanup()` succeeds

### Alternative: Force Cleanup
If teammates don't auto-deregister, `cleanup()` should support a `force` option when:
- All tasks are completed
- No teammates have pending work

### Verification Checklist
- [ ] Teammates deregister after going idle, OR
- [ ] `cleanup(force=true)` works when all tasks complete
- [ ] Team files removed: `~/.claude/teams/<name>.json`
- [ ] Task files removed: `~/.claude/tasks/<name>/`

---

## Test 6: Fresh Plan Creation

### Purpose
Validate that phase planners can create plans from scratch when no existing plan exists.

### Background
In the initial test, all planners found existing plan files. This masked potential issues with plan generation.

### Design

Create a design document with NO corresponding phase plan files.

**Steps:**
1. Create design doc: `fresh-planning-test-design.md`
2. Ensure NO phase plan files exist
3. Run orchestration
4. Verify planner creates plan from scratch

### Verification Checklist
- [ ] Planner detects no existing plan
- [ ] Planner creates new plan file
- [ ] Plan follows correct format (tasks, estimates, dependencies)
- [ ] Plan saved to expected location
- [ ] Executor receives and uses created plan

---

## Test 7: Worktree Conflict Handling

### Purpose
Validate behavior when worktree creation encounters issues.

### Scenarios

**7a: Worktree already exists**
- Previous orchestration left worktree behind
- Expected: Detect and reuse OR clean and recreate

**7b: Branch already exists**
- Branch name collision from previous attempt
- Expected: Use unique branch name OR reuse existing

**7c: Directory path conflict**
- Target worktree path already occupied
- Expected: Choose alternative path OR report error clearly

### Verification Checklist
- [ ] Existing worktree detected
- [ ] Clear decision: reuse or recreate
- [ ] No orphaned worktrees after completion
- [ ] Error messages are actionable

---

## Test 8: Parallel Phase Execution (Future)

### Purpose
Validate that independent phases can execute in parallel.

### Prerequisite
Design doc format must support declaring phases as independent.

### Design

```markdown
## Phase 1: Module A
(independent)

## Phase 2: Module B
(independent, can run parallel with Phase 1)

## Phase 3: Integration
(depends on Phase 1, Phase 2)
```

### Expected Behavior
1. Phases 1 and 2 spawn executors simultaneously
2. Both execute in parallel tmux sessions
3. Phase 3 waits for both to complete
4. Dependencies correctly gate Phase 3

### Verification Checklist
- [ ] Parallel phases detected from design
- [ ] Multiple executors spawned concurrently
- [ ] Independent tmux sessions
- [ ] Correct synchronization at dependent phase
- [ ] Reviews can also run in parallel

---

## Test Execution Template

For each test, record:

```markdown
## Test N: <Name>

**Date:** YYYY-MM-DD
**Result:** Pass / Fail / Partial

**Execution Log:**
1. Step taken...
2. Observed behavior...
3. ...

**Issues Found:**
- Issue 1: Description
- Issue 2: Description

**Remediation Needed:**
- [ ] Fix for issue 1
- [ ] Fix for issue 2
```

---

## Implementation Priority

| Test | Priority | Complexity | Validates |
|------|----------|------------|-----------|
| Test 1: Remediation Trigger | High | Medium | Core error handling |
| Test 2: Remediation Limit | High | Low | Safety guardrail |
| Test 3: Crash Recovery - Planning | High | Medium | Reliability |
| Test 4: Crash Recovery - Execution | High | High | Reliability |
| Test 5: Teammate Cleanup | Medium | Low | Resource management |
| Test 6: Fresh Plan Creation | Medium | Low | Plan generation |
| Test 7: Worktree Conflicts | Medium | Medium | Edge cases |
| Test 8: Parallel Execution | Low | High | Performance (future) |

## Running the Tests

Each test should be run in isolation:

```bash
# Clear any existing state
rm -rf ~/.claude/teams/*-test-orchestration
rm -rf ~/.claude/tasks/*-test-orchestration
rm -rf .worktrees/*-test

# Run specific test
/tina:orchestrate docs/plans/<test-design>.md

# Observe and record results
```

## Success Criteria for Test Suite

The orchestration system is considered robust when:

1. **All high-priority tests pass** - Core flows work correctly
2. **Remediation limits enforced** - No infinite loops possible
3. **Crash recovery works** - Can resume from any state
4. **Clean shutdown** - No orphaned resources after completion
5. **Clear error messages** - All failures are actionable
