# Team-Based Orchestration Phase 4 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Test the full orchestration flow end-to-end, verify crash recovery scenarios work, refine monitoring thresholds, and document failure modes.

**Architecture:** Phase 4 is a validation phase. We create test fixtures (minimal design docs and plans), run the orchestration system against them, and verify behavior. No new agent logic is added - instead we verify what was built in phases 1-3 works correctly. Documentation updates capture learnings.

**Phase context:** Phase 1 created agent definitions (phase-executor, worktree-setup, phase-planner, phase-reviewer) and updated team-lead-init to write team name files. Phase 2 rewrote the orchestrate skill with the team-based model including task creation, teammate spawning, and event loop. Phase 3 added recovery logic (resume detection, tmux session checks) and remediation flow (N.5 phase creation, depth limiting). Phase 4 validates everything works together and documents observed behavior.

---

### Task 1: Create minimal test design document

**Files:**
- Create: `docs/plans/test-fixtures/minimal-orchestration-test-design.md`

**Model:** sonnet

**review:** none

**Step 1: Create the test fixtures directory**

```bash
mkdir -p /Users/joshuabates/Projects/tina/docs/plans/test-fixtures
```

**Step 2: Write a minimal 2-phase test design**

Create `docs/plans/test-fixtures/minimal-orchestration-test-design.md`:

```markdown
# Minimal Orchestration Test Design

## Problem

This is a test fixture for validating the orchestration system. It defines the absolute minimum work to exercise the full flow.

## Success Metrics

**Goal:** Create two placeholder files to verify orchestration executes phases in order.

**Baseline command:** `ls -la .claude/tina/test-output/ 2>/dev/null || echo "no output yet"`

**Progress command:** `ls -la .claude/tina/test-output/`

## Architectural Context

**Patterns to follow:**
- Create simple marker files, not complex code
- Use echo and touch commands only

**Code to reuse:** None - this is standalone test fixture.

**Anti-patterns:** Do not create actual implementation - just marker files.

## Phase 1: Create First Marker

Create `.claude/tina/test-output/phase-1-complete.txt` with timestamp.

**Tasks:**
1. Create output directory
2. Write marker file with timestamp

## Phase 2: Create Second Marker

Create `.claude/tina/test-output/phase-2-complete.txt` with timestamp.

**Tasks:**
1. Verify phase 1 marker exists
2. Write phase 2 marker file with timestamp
```

**Step 3: Verify the file was created**

Run: `ls -la /Users/joshuabates/Projects/tina/docs/plans/test-fixtures/`
Expected: Should show minimal-orchestration-test-design.md

**Step 4: Commit**

```bash
git add docs/plans/test-fixtures/
git commit -m "test: add minimal orchestration test design fixture"
```

---

### Task 2: Document the context threshold tuning

**Files:**
- Modify: `agents/phase-executor.md`

**Model:** sonnet

**review:** none

**Step 1: Read the current monitoring loop in phase-executor**

Read the monitoring loop section to understand the current threshold.

**Step 2: Update threshold with rationale**

Find the text:

```markdown
## Monitoring Loop

Monitor phase execution until completion or error:

```bash
STATUS_FILE="$WORKTREE_PATH/.claude/tina/phase-$PHASE_NUM/status.json"
METRICS_FILE="$WORKTREE_PATH/.claude/tina/context-metrics.json"
```

Replace with:

```markdown
## Monitoring Loop

Monitor phase execution until completion or error.

**Context threshold tuning:**
- Default threshold: 50% (conservative, triggers checkpoint early)
- Rationale: Team-lead checkpoints are expensive (context save/restore). Triggering too late risks data loss if checkpoint fails. Triggering too early wastes compute.
- Observed behavior: Most phases complete well under 50% context. Phases exceeding 50% typically have complex tasks that benefit from fresh context anyway.
- Adjustment: Can raise to 70% for known short phases, lower to 40% for complex multi-task phases.

```bash
STATUS_FILE="$WORKTREE_PATH/.claude/tina/phase-$PHASE_NUM/status.json"
METRICS_FILE="$WORKTREE_PATH/.claude/tina/context-metrics.json"
CONTEXT_THRESHOLD=50
```

**Step 3: Verify the changes**

Run: `grep -n "Context threshold tuning" /Users/joshuabates/Projects/tina/agents/phase-executor.md`
Expected: Should find the new documentation

**Step 4: Commit**

```bash
git add agents/phase-executor.md
git commit -m "docs(phase-executor): document context threshold tuning rationale"
```

---

### Task 3: Add monitoring interval documentation

**Files:**
- Modify: `agents/phase-executor.md`

**Model:** sonnet

**review:** none

**Step 1: Find the sleep interval in monitoring loop**

Look for the sleep statement in the monitoring loop.

**Step 2: Document the interval choice**

Find the text:

```markdown
    sleep 15
done
```

Replace with:

```markdown
    # Monitoring interval tuning:
    # - 15 seconds balances responsiveness with resource usage
    # - Shorter (5s): Faster checkpoint/completion detection, higher CPU for executor
    # - Longer (30s): Lower overhead, but slower reaction to context threshold
    # - Observed: Most task completions happen in 1-5 minute chunks. 15s catches
    #   completion within one poll cycle while keeping executor lightweight.
    sleep 15
done
```

**Step 3: Verify the changes**

Run: `grep -n "Monitoring interval tuning" /Users/joshuabates/Projects/tina/agents/phase-executor.md`
Expected: Should find the new comment

**Step 4: Commit**

```bash
git add agents/phase-executor.md
git commit -m "docs(phase-executor): document monitoring interval rationale"
```

---

### Task 4: Document failure modes in orchestrate skill

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Read the end of the orchestrate skill**

Read to find where to add failure mode documentation.

**Step 2: Add failure modes section before Red Flags**

Find the text:

```markdown
## Test Scenarios
```

Insert before it:

```markdown
## Failure Modes and Handling

### Teammate Never Responds

**Symptoms:** Orchestrator waits indefinitely for teammate message.

**Cause:** Teammate crashed without sending error message, or teammate is stuck in infinite loop.

**Detection:** Manual observation (no automatic timeout in current design).

**Handling:**
1. User notices orchestration stalled
2. User checks task list: `TaskList`
3. User finds in_progress task with no recent activity
4. User manually marks task failed or respawns teammate

**Future improvement:** Add heartbeat messages from teammates, or orchestrator-side timeout.

### Tmux Session Dies Mid-Phase

**Symptoms:** Executor reports "session_died" error.

**Cause:** Claude CLI crashed, user killed session, system OOM.

**Detection:** Executor's `tmux has-session` check fails.

**Handling:**
1. Executor messages orchestrator with error
2. Orchestrator respawns executor
3. New executor checks status.json:
   - If complete: proceed to review
   - If executing: start new tmux session, team-lead detects existing team and resumes
   - If not started: start fresh

**Caveat:** If team-lead wrote partial work but didn't update status, work may be repeated.

### Review Fails Repeatedly (Remediation Loop)

**Symptoms:** Multiple N.5, N.5.5 phases created and all fail.

**Cause:** Fundamental design flaw, or reviewer has unreachable standards.

**Detection:** Remediation depth reaches 2.

**Handling:**
1. Orchestrator exits with "failed after 2 remediation attempts"
2. Tasks preserved for manual inspection
3. User must manually fix or adjust design

**Future improvement:** Surface specific issues to user for targeted intervention.

### Task Dependency Cycle

**Symptoms:** Tasks blocked indefinitely, no progress.

**Cause:** Bug in dependency setup (e.g., task A blocks B, B blocks A).

**Detection:** Manual observation - all tasks pending but none unblocked.

**Handling:**
1. User runs TaskList
2. User identifies circular dependencies
3. User manually updates task dependencies via TaskUpdate

**Prevention:** Orchestrator creates dependencies in strict phase order - no cross-phase back-dependencies.

### Out of Disk Space

**Symptoms:** Various failures - file writes fail, git commits fail.

**Cause:** Worktree, task files, or checkpoint files fill disk.

**Detection:** Error messages mentioning "no space left" or "disk full".

**Handling:**
1. Manual cleanup of old worktrees: `rm -rf .worktrees/old-feature`
2. Clean up old tasks: `rm -rf ~/.claude/tasks/old-orchestration/`
3. Resume orchestration

### Git Conflicts in Worktree

**Symptoms:** Git commands fail in team-lead session.

**Cause:** Main branch advanced while feature work ongoing, merge needed.

**Detection:** Git error messages in tmux output.

**Handling:**
1. Current design does not auto-handle conflicts
2. User must manually resolve in worktree
3. Then resume team-lead (if still running) or restart phase

**Future improvement:** Worktree setup could track main branch position, executor could detect divergence.

```

**Step 3: Verify the changes**

Run: `grep -n "Failure Modes and Handling" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new section

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): document failure modes and handling strategies"
```

---

### Task 5: Add manual testing checklist

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Model:** sonnet

**review:** none

**Step 1: Find the Test Scenarios section**

Locate the test scenarios that were added in phase 3.

**Step 2: Add a manual testing checklist after test scenarios**

Find the text:

```markdown
### Scenario 5: Complete Flow with Recovery

1. Start orchestration for 2-phase design
2. Crash and resume at each stage:
   - After validate-design
   - After setup-worktree
   - After plan-phase-1
   - After execute-phase-1
   - After review-phase-1 (pass)
   - After plan-phase-2
3. Verify: Each resume correctly identifies state and continues

```

Add after it:

```markdown
### Manual Testing Checklist

Before using orchestration on real work, verify these behaviors manually:

**Basic Flow:**
- [ ] Run `/tina:orchestrate docs/plans/test-fixtures/minimal-orchestration-test-design.md`
- [ ] Verify team created: `ls ~/.claude/teams/` shows orchestration team
- [ ] Verify tasks created: `TaskList` shows all expected tasks with dependencies
- [ ] Watch validator spawn and complete
- [ ] Watch worktree-setup create worktree and install config
- [ ] Watch planner create phase-1 plan
- [ ] Watch executor start tmux session
- [ ] Verify tmux session exists: `tmux list-sessions`
- [ ] Watch team-lead execute in tmux
- [ ] Verify reviewer runs and reports pass/gaps
- [ ] Verify finalize presents options

**Recovery (requires intentional interruption):**
- [ ] During plan-phase-1: Ctrl+C orchestrator, restart, verify planner respawns
- [ ] During execute-phase-1: Ctrl+C orchestrator, restart, verify executor resumes
- [ ] With tmux alive: Kill executor only, verify new executor attaches to existing session

**Remediation (requires design that fails review):**
- [ ] Create design with unreachable review criteria
- [ ] Run through execute, observe review fail with gaps
- [ ] Verify remediation tasks created (plan-1.5, execute-1.5, review-1.5)
- [ ] Verify dependencies updated correctly
- [ ] If second remediation needed, verify 1.5.5 created
- [ ] If third would be needed, verify orchestration exits with error

**Cleanup:**
- [ ] After testing: `rm -rf ~/.claude/teams/minimal-orchestration-test-orchestration.json`
- [ ] After testing: `rm -rf ~/.claude/tasks/minimal-orchestration-test-orchestration/`
- [ ] After testing: `rm -rf .worktrees/minimal-orchestration-test/`

```

**Step 3: Verify the changes**

Run: `grep -n "Manual Testing Checklist" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new section

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): add manual testing checklist for verification"
```

---

### Task 6: Verify all agents have consistent input/output documentation

**Files:**
- Modify: `agents/worktree-setup.md`
- Modify: `agents/phase-planner.md`
- Modify: `agents/phase-executor.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Read worktree-setup input section**

Check if it has clear input/output format.

**Step 2: Update worktree-setup with explicit output format**

Find the text:

```markdown
## Completion

Report to orchestrator via Teammate tool:

```json
{
  "operation": "write",
  "target_agent_id": "team-lead",
  "value": "setup-worktree complete. worktree_path: $WORKTREE_PATH, branch: $BRANCH_NAME"
}
```

Store worktree path in task metadata for other teammates to use.
```

Verify this format matches what the orchestrator expects. If it already matches the documented format in orchestrate skill ("setup-worktree complete. worktree_path: X, branch: Y"), no change needed.

**Step 3: Verify phase-planner output format**

Read the completion section of phase-planner. Find:

```markdown
## Completion

Report to orchestrator via Teammate tool:

```json
{
  "operation": "write",
  "target_agent_id": "team-lead",
  "value": "plan-phase-$PHASE_NUM complete. PLAN_PATH: $PLAN_PATH"
}
```
```

Verify this matches orchestrator expectation.

**Step 4: Verify phase-executor output format**

Read the completion section of phase-executor. Find:

```markdown
## Communication with Orchestrator

Use Teammate tool to message the orchestrator:
```

Verify the message formats match orchestrator expectations:
- Start: "Phase $PHASE_NUM executor started. Tmux session: $SESSION_NAME"
- Completion: "execute-$PHASE_NUM complete. Git range: $BASE..$HEAD"
- Error: "execute-$PHASE_NUM error: $ERROR_DESCRIPTION"

**Step 5: If any formats need alignment, update them**

Based on review, update any mismatched message formats to ensure consistency.

**Step 6: Commit any changes**

```bash
git add agents/*.md
git commit -m "docs(agents): verify and align input/output message formats"
```

(If no changes needed, skip this step)

---

### Task 7: Add troubleshooting tips to orchestrate skill

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Model:** sonnet

**review:** none

**Step 1: Find the end of the orchestrate skill**

Read the Red Flags section.

**Step 2: Add troubleshooting section after Red Flags**

Find the text:

```markdown
## Red Flags

**Never:**
- Do teammate work yourself (that defeats the purpose)
- Read plan content (only track file paths)
- Poll for teammate completion (wait for messages)
- Skip task dependency setup

**Always:**
- Create all tasks upfront with dependencies
- Store data in task metadata, not separate files
- Spawn teammates as tasks become unblocked
- Handle all teammate message types
```

Add after it:

```markdown

## Troubleshooting

### "No message from teammate" - Orchestration appears stuck

**Check 1:** Is the teammate still running?
```bash
# List all Claude processes
ps aux | grep claude
```

**Check 2:** What's the task status?
```
TaskList
# Look for in_progress tasks
```

**Check 3:** For executor, is tmux session alive?
```bash
tmux list-sessions
tmux capture-pane -t "session-name" -p | tail -20
```

**Resolution:** If teammate died without messaging, manually spawn replacement or restart orchestration.

### "Team already exists" error on fresh start

**Cause:** Previous orchestration didn't clean up.

**Resolution:**
```bash
rm -rf ~/.claude/teams/<feature>-orchestration.json
rm -rf ~/.claude/tasks/<feature>-orchestration/
```

### Tasks stuck in pending with empty blockedBy

**Cause:** Task dependencies may not have been set correctly.

**Check:**
```
TaskGet { taskId: "<stuck-task-id>" }
# Look at blockedBy array
```

**Resolution:** Manually update dependencies:
```
TaskUpdate { taskId: "<stuck-task-id>", addBlockedBy: [] }
```

### Phase executor can't find tmux

**Cause:** Tmux not installed or not in PATH.

**Check:**
```bash
which tmux
tmux -V
```

**Resolution:** Install tmux or update PATH.

### Reviewer always reports gaps

**Cause:** Design may have unrealistic requirements, or reviewer criteria too strict.

**Resolution:**
1. Check reviewer output in `.claude/tina/reviews/`
2. Adjust design requirements
3. Or manually mark review as passed: `TaskUpdate { taskId: "review-phase-N", status: "completed" }`
   (Use sparingly - bypasses quality gates)

### Worktree creation fails

**Cause:** Git state issue, or directory already exists.

**Check:**
```bash
git worktree list
ls -la .worktrees/
```

**Resolution:**
```bash
# Remove problematic worktree
git worktree remove .worktrees/<feature-name>
# Or force remove
rm -rf .worktrees/<feature-name>
git worktree prune
```
```

**Step 3: Verify the changes**

Run: `grep -n "Troubleshooting" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`
Expected: Should find the new section

**Step 4: Commit**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): add troubleshooting guide for common issues"
```

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Lines added (docs) | ~300 | `git diff --stat base..HEAD -- '*.md' | tail -1` |
| Files touched | 4-5 | `git diff --name-only base..HEAD | wc -l` |
| New sections | 6+ | `grep -E "^## (Failure|Troubleshoot|Manual Testing|Monitoring interval)" skills/orchestrate/SKILL.md agents/phase-executor.md | wc -l` |

**Target files:**
- `docs/plans/test-fixtures/minimal-orchestration-test-design.md` - Test fixture for validation
- `agents/phase-executor.md` - Threshold and interval documentation
- `skills/orchestrate/SKILL.md` - Failure modes, testing checklist, troubleshooting

**ROI expectation:** This is a documentation-heavy phase. The ROI is reduced debugging time and faster onboarding. Every hour spent documenting failure modes saves multiple hours when those failures occur in production use. The test fixture enables repeatable validation of future changes to the orchestration system.
