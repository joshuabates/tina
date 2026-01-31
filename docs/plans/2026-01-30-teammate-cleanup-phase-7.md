# Phase 7: Teammate Cleanup

## Overview

Ensure teammates shut down promptly after task completion. Currently, teammates may be left running after their work is done, consuming resources. This phase updates the team-lead-init skill to make explicit shutdown requirements clearer and ensures no teammates are left running between tasks or after phase completion.

## Goal

1. Clear, explicit shutdown flow after each task
2. Verification that agents have acknowledged shutdown before proceeding
3. No orphaned teammates after orchestration completes
4. Team cleanup at phase end

## Current State

### team-lead-init/SKILL.md

The skill already has:
- Per-task shutdown in Step 5 (requestShutdown for worker and reviewers)
- Phase-end cleanup in Step 6.3 (Teammate cleanup operation)
- Shutdown in the ephemeral model section

**Missing:**
- Wait for shutdown acknowledgment before spawning next task's agents
- Explicit verification that all agents are shut down
- Fallback handling if shutdown is not acknowledged
- Clear separation between "request shutdown" and "verify shutdown complete"

### Teammate Cleanup section in design doc

From the design:
```markdown
## Task Completion Flow

After worker reports task complete:
1. Spawn spec-reviewer (haiku)
2. Spawn code-quality-reviewer (opus)
3. Wait for both reviews to pass
4. **requestShutdown for worker**
5. **requestShutdown for spec-reviewer**
6. **requestShutdown for code-quality-reviewer**
7. Proceed to next task

Do NOT leave teammates running between tasks.
```

## What Needs to Change

### Task 1: Add Shutdown Verification Section

**Model:** haiku

Add a dedicated "Shutdown Verification" section that makes the shutdown flow explicit and emphasizes verification.

**Actions:**
1. Add "Shutdown Verification" section after "Team Shutdown" section
2. Document the two-step process: request → verify
3. Add timeout handling for unresponsive agents
4. Add fallback: if shutdown not acknowledged within timeout, proceed anyway (log warning)

**Content to add:**

```markdown
## Shutdown Verification

Shutdown is a two-step process:

### Step 1: Request Shutdown

For each active agent (worker, spec-reviewer, code-quality-reviewer):

```json
{
  "operation": "requestShutdown",
  "target_agent_id": "<agent-name>",
  "reason": "Task complete"
}
```

### Step 2: Verify Shutdown

After requesting shutdown, monitor for acknowledgment message from each agent:

```json
{
  "type": "shutdown_acknowledged",
  "from": "<agent-name>",
  "requestId": "<request-id>"
}
```

**Timeout:** If acknowledgment not received within 30 seconds:
1. Log warning: "Agent <name> did not acknowledge shutdown within timeout"
2. Proceed anyway (agent process may have already terminated)

**IMPORTANT:** Do NOT spawn agents for the next task until all current agents have acknowledged shutdown OR timed out.
```

**Acceptance criteria:**
- Two-step shutdown process documented
- Timeout handling specified (30 seconds)
- Clear rule: don't spawn next agents until current agents are gone

### Task 2: Update Task Execution Loop in Step 5

**Model:** haiku

Update the task execution loop to be more explicit about shutdown order and verification.

**Actions:**
1. Reorder Step 5 to match the design doc exactly:
   - Worker completes → spawn reviewers → reviews pass → shutdown ALL
2. Add explicit substeps for shutdown verification
3. Add "wait for acknowledgment" between shutdown requests and next task

**Updated Step 5:**

```markdown
## STEP 5: Begin task execution loop

For each task in priority order:

### 5.1 Spawn worker for this task
Get the model from task metadata (via TaskGet), then spawn:
```json
{
  "subagent_type": "tina:implementer",
  "team_name": "<team-name>",
  "name": "worker",
  "model": "<model from task metadata>",
  "prompt": "Implement task: <task subject and description>. Use TDD."
}
```

### 5.2 Wait for worker to complete implementation
Monitor for Teammate messages from worker indicating completion.

### 5.3 Spawn reviewers for this task
- spec-reviewer (haiku): Review implementation against spec
- code-quality-reviewer (opus): Review code quality

### 5.4 Wait for both reviews to pass
Monitor for Teammate messages from reviewers. Both must approve.

### 5.5 Shut down ALL agents for this task

Request shutdown for each agent in order:

1. **Worker:**
   ```json
   {
     "operation": "requestShutdown",
     "target_agent_id": "worker",
     "reason": "Task complete"
   }
   ```

2. **Spec-reviewer:**
   ```json
   {
     "operation": "requestShutdown",
     "target_agent_id": "spec-reviewer",
     "reason": "Review complete"
   }
   ```

3. **Code-quality-reviewer:**
   ```json
   {
     "operation": "requestShutdown",
     "target_agent_id": "code-quality-reviewer",
     "reason": "Review complete"
   }
   ```

**Wait for acknowledgments** from all three before proceeding.
Timeout: 30 seconds per agent. If no acknowledgment, log warning and proceed.

### 5.6 Mark task complete

Update task status to complete via TaskUpdate.

### 5.7 Loop to next task

Only after all agents have been shut down (acknowledged or timed out).
```

**Acceptance criteria:**
- Step 5 has clear substeps 5.1-5.7
- Shutdown happens after reviews pass
- All three agents shut down before next task
- Wait for acknowledgment is explicit

### Task 3: Update Red Flags Section

**Model:** haiku

Add teammate cleanup violations to the Red Flags section.

**Actions:**
1. Add "Never" entries for cleanup violations
2. Add "Always" entries for cleanup requirements

**Content to add to Red Flags:**

```markdown
## Red Flags

**Never:**
...existing entries...
- Spawn agents for next task before current agents are shut down
- Skip shutdown verification (always wait for acknowledgment or timeout)
- Leave teammates running after phase completes
- Proceed without requesting shutdown for ALL active agents

**Always:**
...existing entries...
- Request shutdown for worker, spec-reviewer, and code-quality-reviewer after each task
- Wait for shutdown acknowledgment (or 30s timeout) before next task
- Run team cleanup at phase end
- Log warning if agent doesn't acknowledge shutdown
```

**Acceptance criteria:**
- 4 new "Never" entries related to cleanup
- 4 new "Always" entries related to cleanup
- Clear expectations for per-task and phase-end cleanup

### Task 4: Add Phase Completion Checklist

**Model:** haiku

Add a checklist in Step 6.3 that explicitly verifies all cleanup is done before marking phase complete.

**Actions:**
1. Add a "Completion Checklist" subsection in Step 6.3
2. Include verification that no active teammates remain
3. Include team cleanup operation

**Content to add:**

```markdown
### 6.3 Complete phase

**Completion Checklist - verify ALL before setting status = complete:**

1. [ ] All tasks marked complete
2. [ ] No active workers (last task's agents shut down and acknowledged)
3. [ ] No active reviewers
4. [ ] Verification gate passed (Step 6.1)
5. [ ] Complexity gate passed (Step 6.2)
6. [ ] Team cleanup completed:
   ```json
   {
     "operation": "cleanup"
   }
   ```

**Only after ALL items verified:**

Update status.json:
```json
{
  "status": "complete",
  "started_at": "<original timestamp>",
  "completed_at": "<current ISO timestamp>"
}
```

Wait for supervisor to detect completion and kill session.
```

**Acceptance criteria:**
- 6-item completion checklist
- Cleanup operation included
- Clear "only after ALL items" gate

### Task 5: Update Error Handling for Shutdown Failures

**Model:** haiku

Add handling for shutdown failures in the Error Handling section.

**Actions:**
1. Add "Shutdown fails" scenario
2. Document retry behavior
3. Document escalation if retry fails

**Content to add to Error Handling:**

```markdown
**Shutdown request not acknowledged:**
- Wait 30 seconds for acknowledgment
- Log warning: "Agent <name> did not acknowledge shutdown"
- Proceed to next task (agent may have already terminated)

**Cleanup operation fails:**
- Retry cleanup once
- If still fails: Log error but proceed (status can still be marked complete)
- Include cleanup failure in completion notes
```

**Acceptance criteria:**
- Shutdown timeout handling documented
- Cleanup retry behavior documented
- Failure doesn't block phase completion (logged but not fatal)

## Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 150 |

This is a documentation-only phase. One file changed:
- `skills/team-lead-init/SKILL.md` - Add ~100 lines of clarification

## Dependencies

- None (documentation-only change)
- Does not require Phases 1-6 completion

## Files Changed

- `skills/team-lead-init/SKILL.md` - Strengthen cleanup requirements

## Success Criteria

1. Shutdown Verification section exists with two-step process
2. Step 5 has explicit substeps 5.1-5.7 with shutdown verification
3. Red Flags section includes cleanup violations
4. Completion checklist in Step 6.3 with 6 items
5. Error handling includes shutdown failure scenarios
6. 30-second timeout for shutdown acknowledgment documented
7. Team cleanup operation explicit in completion flow

## Verification

After implementation, verify by:

1. Read updated `skills/team-lead-init/SKILL.md`
   - Confirm Shutdown Verification section exists
   - Confirm Step 5 has substeps with explicit shutdown flow
   - Confirm Red Flags includes cleanup entries
   - Confirm Step 6.3 has completion checklist
   - Confirm Error Handling includes shutdown failures

2. Verify file remains under 400 lines
3. Verify shutdown acknowledgment waiting is clear in task loop
4. Verify team cleanup is part of completion checklist
