---
name: checkpoint
description: Use when context threshold is exceeded and supervisor signals checkpoint needed, or when .tina/checkpoint-needed exists
---

# Checkpoint

## Overview

Coordinates graceful shutdown of a team execution session and captures handoff state. Ensures context can be restored in a fresh session.

**Core principle:** Capture enough state that a new supervisor can resume without re-reading all context. Team composition, task progress, and review tracking.

## When to Use

- Supervisor detects context threshold exceeded
- File `.tina/checkpoint-needed` exists
- Manual `/checkpoint` invocation

## When NOT to Use

- Mid-task execution (finish current task first)
- When team is blocked (resolve block or escalate first)
- Normal phase completion (that's handled by team-lead-init)

## The Process

```dot
digraph checkpoint {
    rankdir=TB;

    "Receive /checkpoint signal" [shape=box];
    "Request team shutdown" [shape=box];
    "All teammates exited?" [shape=diamond];
    "Wait (max 30s)" [shape=box];
    "Force terminate stragglers" [shape=box];
    "Capture TaskList state" [shape=box];
    "Write handoff.md" [shape=box];
    "Output CHECKPOINT COMPLETE" [shape=box style=filled fillcolor=lightgreen];

    "Receive /checkpoint signal" -> "Request team shutdown";
    "Request team shutdown" -> "All teammates exited?";
    "All teammates exited?" -> "Capture TaskList state" [label="yes"];
    "All teammates exited?" -> "Wait (max 30s)" [label="no"];
    "Wait (max 30s)" -> "All teammates exited?";
    "Wait (max 30s)" -> "Force terminate stragglers" [label="timeout"];
    "Force terminate stragglers" -> "Capture TaskList state";
    "Capture TaskList state" -> "Write handoff.md";
    "Write handoff.md" -> "Output CHECKPOINT COMPLETE";
}
```

## Implementation Details

### Step 1: Request Team Shutdown

```
Teammate.requestShutdown({
  team: "phase-N-execution"
})
```

This signals all teammates to finish current work and exit gracefully.

### Step 2: Wait for Teammates

Poll teammate status for up to 30 seconds:

```bash
TIMEOUT=30
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  ACTIVE=$(Teammate.getActiveCount({ team: "phase-N-execution" }))
  if [ "$ACTIVE" -eq 0 ]; then
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

# Force terminate any remaining
if [ "$ACTIVE" -gt 0 ]; then
  Teammate.forceTerminate({ team: "phase-N-execution" })
fi
```

### Step 3: Capture Task State

Call `TaskList` to get current task states:

```
tasks = TaskList()
```

Record for each task:
- ID, subject, status
- Owner (which worker had it)
- blockedBy relationships

### Step 4: Write handoff.md

Create `.tina/phase-N/handoff.md`:

```markdown
# Phase N Checkpoint Handoff

## Timestamp
2026-01-26T10:30:00Z

## Reason
Context threshold exceeded

## Team Composition
- worker-1: supersonic:implementer
- worker-2: supersonic:implementer
- spec-reviewer: supersonic:spec-reviewer
- code-quality-reviewer: supersonic:code-quality-reviewer

## Task States
| ID | Subject | Status | Owner |
|----|---------|--------|-------|
| 1 | Implement feature A | completed | worker-1 |
| 2 | Implement feature B | in_progress | worker-2 |
| 3 | Add tests for A | pending | - |

## Review Tracking
- Task 1: spec-review passed, code-quality passed
- Task 2: not yet reviewed

## Resumption Notes
- Task 2 was in progress - worker had read the spec but not started coding
- Task 3 blocked by Task 1 (now unblocked)
```

### Step 5: Signal Completion

Output exactly:

```
CHECKPOINT COMPLETE
```

Supervisor watches for this signal to confirm checkpoint succeeded.

## State Files

**Handoff file:** `.tina/phase-N/handoff.md`

Contains everything needed to resume:
- Team composition (roles and agent types)
- Task states with ownership
- Review tracking (what passed/failed)
- Resumption notes (context about in-progress work)

## Error Handling

**Teammate won't exit:**
- Wait 30 seconds maximum
- Force terminate after timeout
- Log which teammates required force termination

**TaskList fails:**
- Retry once
- If still fails, write handoff.md with error note
- Still output CHECKPOINT COMPLETE (partial handoff better than none)

**Cannot write handoff.md:**
- Output error to console
- Do NOT output CHECKPOINT COMPLETE
- Supervisor will detect failure and escalate

## Integration

**Invoked by:**
- Supervisor when context threshold exceeded
- Manual user invocation via `/checkpoint`

**Uses:**
- `Teammate.requestShutdown` - Graceful team shutdown
- `Teammate.forceTerminate` - Timeout fallback
- `TaskList` - Capture current task states

**State files:**
- `.tina/phase-N/handoff.md` - Handoff state for resumption
- `.tina/checkpoint-needed` - Signal file (deleted after checkpoint)

**Paired with:**
- `supersonic:rehydrate` - Reads handoff.md to restore context

## Red Flags

**Never:**
- Skip team shutdown (leaves orphaned workers)
- Checkpoint mid-task (wait for task boundary)
- Forget CHECKPOINT COMPLETE signal
- Write handoff.md without task states

**Always:**
- Wait for graceful shutdown before capturing state
- Include review tracking in handoff
- Force terminate after timeout (don't hang forever)
- Delete `.tina/checkpoint-needed` after successful checkpoint
