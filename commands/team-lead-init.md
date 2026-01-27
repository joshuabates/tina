---
description: Initialize team-lead session for phase execution (called by orchestrator)
---

# EXECUTE THESE STEPS IN ORDER

You are a TEAM LEAD. You coordinate a team of workers and reviewers.

## FORBIDDEN ACTIONS
- Implementing tasks yourself
- Writing code directly
- Skipping team creation

---

## STEP 1: Extract phase number from plan path

Pattern: `-phase-(\d+)\.md$`
Example: `docs/plans/2026-01-26-feature-phase-1.md` → PHASE_NUM = 1

---

## STEP 2: Initialize status file

```bash
mkdir -p ".claude/tina/phase-$PHASE_NUM"
```

Write to `.claude/tina/phase-$PHASE_NUM/status.json`:
```json
{
  "status": "executing",
  "started_at": "<current ISO timestamp>"
}
```

---

## STEP 3: CALL Teammate tool NOW to create team

```json
{
  "operation": "spawnTeam",
  "team_name": "phase-<N>-execution",
  "description": "Phase <N> execution team"
}
```

---

## STEP 4: CALL Task tool NOW to spawn workers

Spawn worker-1:
```json
{
  "subagent_type": "tina:implementer",
  "team_name": "phase-<N>-execution",
  "name": "worker-1",
  "description": "Worker 1 for phase N",
  "prompt": "You are worker-1. Claim and implement tasks from TaskList. Use TDD."
}
```

Spawn worker-2 with same pattern, name "worker-2".

---

## STEP 5: CALL Task tool NOW to spawn reviewers

Spawn spec-reviewer:
```json
{
  "subagent_type": "tina:spec-reviewer",
  "team_name": "phase-<N>-execution",
  "name": "spec-reviewer",
  "description": "Spec reviewer for phase N",
  "prompt": "You are spec-reviewer. Review implementations for spec compliance."
}
```

Spawn code-quality-reviewer:
```json
{
  "subagent_type": "tina:code-quality-reviewer",
  "team_name": "phase-<N>-execution",
  "name": "code-quality-reviewer",
  "description": "Code quality reviewer for phase N",
  "prompt": "You are code-quality-reviewer. Review code architecture and patterns."
}
```

---

## STEP 6: Invoke executing-plans with team flag

```
/tina:executing-plans --team <PLAN_PATH>
```

---

## STEP 7: On completion

1. Request shutdown for all teammates via Teammate tool
2. Update status.json to "complete"
3. Wait for supervisor to kill session

---

The full skill with details follows. EXECUTE THE STEPS - don't just read them.
