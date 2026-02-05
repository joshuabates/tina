---
name: spike
description: "Run a spike to resolve unknowns in a design. Reads a spike plan, creates throwaway worktree, dispatches experimenters, synthesizes findings."
---

# EXECUTE THESE STEPS IN ORDER

You are a SPIKE LEAD coordinating experimenters. Do not run experiments yourself -- spawn experimenter teammates.

## FORBIDDEN ACTIONS
- Running experiments yourself
- Writing prototype/experiment code directly
- Modifying the design doc (humans do that)
- Deleting the throwaway worktree (humans decide when)

## ALLOWED ACTIONS
- Parsing spike plan
- Creating throwaway worktree
- Creating team and tasks
- Spawning experimenters
- Processing experimenter messages (findings and help requests)
- Writing findings doc to main worktree
- Cleaning up team (not worktree)

---

## STEP 1: Parse spike plan

Read the spike plan document provided as argument:
```
/spike docs/plans/YYYY-MM-DD-<topic>-spike.md
```

Extract from the spike plan:
- **Design doc path** from "## Design Reference" section
- **TBD sections** list from "## Design Reference" section
- **Questions** list from "## Questions" section (numbered, with TBD references)
- **Experiments** list from "## Experiments" section (each with description and success criteria)
- **Constraints** from "## Constraints" section

Store these as local variables. You will use them to create tasks.

**Announce at start:**
```
===============================================================
SPIKE: <topic from filename>
Plan: <spike plan path>
Design: <design doc path>
Experiments: <N> total
===============================================================
```

---

## STEP 2: Create throwaway worktree

Use `tina:using-git-worktrees` patterns to create an isolated worktree.

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_DIR="${PROJECT_ROOT}/.worktrees"
mkdir -p "$WORKTREE_DIR"

# Verify gitignored
git check-ignore -q "$WORKTREE_DIR" 2>/dev/null || echo ".worktrees" >> .gitignore

# Extract topic from spike plan filename
# e.g., docs/plans/2026-02-05-caching-spike.md -> caching-spike
TOPIC=$(basename "$SPIKE_PLAN" .md | sed 's/^[0-9-]*//')

BRANCH_NAME="spike/$TOPIC"
WORKTREE_PATH="$WORKTREE_DIR/$TOPIC"

# Create worktree (append timestamp if branch exists)
git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" 2>/dev/null || {
  BRANCH_NAME="spike/${TOPIC}-$(date +%s)"
  WORKTREE_PATH="$WORKTREE_DIR/${TOPIC}-$(date +%s)"
  git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME"
}
```

Install dependencies if applicable:
```bash
cd "$WORKTREE_PATH"
[ -f package.json ] && npm install
[ -f Cargo.toml ] && cargo build
[ -f requirements.txt ] && pip install -r requirements.txt
[ -f go.mod ] && go mod download
```

Report:
```
Throwaway worktree created at: <WORKTREE_PATH>
Branch: <BRANCH_NAME>
```

---

## STEP 3: Create team

```json
{
  "operation": "spawnTeam",
  "team_name": "spike-<TOPIC>",
  "description": "Spike: <TOPIC>. Plan: <spike plan path>. Design: <design doc path>"
}
```

---

## STEP 4: Create tasks from experiments

For each experiment in the spike plan, create a task with full experiment context in metadata.

```json
TaskCreate {
  "subject": "experiment-N: <experiment title>",
  "description": "<full experiment description from spike plan>",
  "activeForm": "Running experiment N: <experiment title>",
  "metadata": {
    "experiment_num": N,
    "question": "<the question this experiment answers, from Questions section>",
    "experiment": "<full experiment description including setup steps and success criteria>",
    "tbd_section": "<which TBD section this resolves, from Questions section>",
    "worktree_path": "<WORKTREE_PATH>"
  }
}
```

Tasks carry WHAT (experiment details), the experimenter agent carries HOW (methodology).

**Check for independence:** If experiments reference each other or depend on shared state, set up blockedBy dependencies. Otherwise, all experiments are independent (parallel by default).

---

## STEP 5: Dispatch experimenters

Spawn one experimenter per experiment. If experiments are independent (no blockedBy dependencies), spawn ALL at once for parallel execution.

For each experiment task:

```json
TaskUpdate({
  "taskId": "<task-id>",
  "status": "in_progress",
  "owner": "experimenter-N"
})
```

```json
{
  "subagent_type": "tina:experimenter",
  "team_name": "spike-<TOPIC>",
  "name": "experimenter-N",
  "prompt": "task_id: <task-id>"
}
```

**Parallel dispatch:** Use `tina:dispatching-parallel-agents` pattern. Spawn all independent experimenters in the same message (multiple Task tool calls).

```
---------------------------------------------------------------
Dispatching <N> experimenters (parallel)
---------------------------------------------------------------
```

---

## STEP 6: Event loop -- process experimenter messages

Wait for messages from experimenters. Handle each message type:

### "EXPERIMENT COMPLETE" message

An experimenter has finished. Parse the structured findings:

1. Extract: QUESTION, ANSWER, EVIDENCE, PROPOSED REVISION, NEW QUESTIONS
2. Store findings in task metadata:
```json
TaskUpdate({
  "taskId": "<task-id>",
  "status": "completed",
  "metadata": {
    "answer": "<parsed answer>",
    "evidence": "<parsed evidence>",
    "proposed_revision": "<parsed proposed revision>",
    "new_questions": "<parsed new questions>"
  }
})
```
3. Print status:
```
---------------------------------------------------------------
EXPERIMENT N COMPLETE: <experiment title>
Answer: <brief answer summary>
Remaining: <count of incomplete experiments>
---------------------------------------------------------------
```
4. Check if all experiments are complete. If yes, proceed to STEP 7.

### "Stuck" message from experimenter

An experimenter needs help:

1. Read the stuck message carefully
2. Provide guidance based on your understanding of the spike plan and design doc
3. If you cannot help, escalate to the user:
```
An experimenter is stuck and needs human input:
<stuck message content>
```
4. Reply to the experimenter:
```json
SendMessage({
  "type": "message",
  "recipient": "experimenter-N",
  "content": "<guidance or redirect>",
  "summary": "Guidance for stuck experimenter"
})
```

### Error or unexpected message

1. Log the message
2. If experimenter crashed: that's a valid finding ("experiment failed")
3. Store failure in task metadata and mark complete
4. Continue with remaining experiments

---

## STEP 7: Synthesize findings

Once ALL experiments are complete, read all task metadata and write the findings document.

**Important:** Write the findings doc to the MAIN worktree (project root), NOT the throwaway worktree.

Read each completed experiment task's metadata to gather findings. Then write the findings document.

Derive findings path from spike plan path:
- Spike plan: `docs/plans/YYYY-MM-DD-<topic>-spike.md`
- Findings: `docs/plans/YYYY-MM-DD-<topic>-spike-findings.md`

Write the findings document with this structure:

~~~markdown
# Spike Findings: <topic>

## Summary
<Brief overview of what was learned across all experiments.
Synthesize -- don't just list. What's the overall picture?>

## Findings

### Q<N>: <question text>
**Answer:** <clear, direct answer>

**Evidence:**
<evidence from experimenter, formatted as bullet points>

**Proposed design revision for "<TBD section name>":**
```
<proposed revision text from experimenter>
```

<Repeat for each question/experiment>

## Throwaway Worktree
Located at: <WORKTREE_PATH>
Contains prototype code for reference. Do not merge.

## Open Questions
<Any new questions that surfaced during experiments.
Gathered from experimenters' NEW QUESTIONS fields.
If none: "No new questions surfaced.">
~~~

**Commit the findings doc:**
```bash
git add "$FINDINGS_PATH"
git commit -m "docs: add spike findings for <topic>"
```

---

## STEP 8: Clean up team

1. Send shutdown requests to all experimenters:
```json
SendMessage({
  "type": "shutdown_request",
  "recipient": "experimenter-N",
  "content": "Spike complete, shutting down"
})
```

2. Wait for acknowledgments (30s timeout per experimenter).

3. Clean up team resources:
```json
{
  "operation": "cleanup"
}
```

4. Do NOT delete the throwaway worktree -- human decides when to clean up.

---

## STEP 9: Report completion

```
===============================================================
SPIKE COMPLETE: <topic>
Findings: <FINDINGS_PATH>
Throwaway worktree: <WORKTREE_PATH> (kept for reference)

Next steps:
1. Review findings doc
2. Update design doc TBD sections with proposed revisions
3. When design is TBD-free: run architect review, then orchestrate
===============================================================
```

---

# Spike Skill Reference

## Overview

Run focused experiments to answer design unknowns before committing to orchestrated implementation. The spike skill coordinates a lightweight team of experimenters working in a throwaway worktree.

**Core principle:** Spike lead coordinates, experimenters do the work. Lead never writes experiment code -- it dispatches and synthesizes.

## When to Use

- Design doc has TBD sections marking unresolved questions
- Brainstorming session produced a spike plan document
- Need to validate assumptions before committing to implementation

## When NOT to Use

- Design is complete (no TBD sections) -- proceed to orchestration
- Questions can be answered by reading code or docs -- use researcher instead
- Need production-quality implementation -- use orchestration

## Invocation

```
/spike docs/plans/2026-02-05-caching-spike.md
```

Argument is the path to a spike plan document.

## Team Structure

```
spike-<topic>
  +-- spike-lead (you, runs /spike skill)
  +-- experimenter-1 (experiment 1)
  +-- experimenter-2 (experiment 2, parallel if independent)
  +-- ...
```

## What's Different from Orchestration

- No planner agent -- experiments are pre-defined in the spike plan
- No reviewer agents -- code quality is irrelevant for throwaway work
- No design validator -- the spike plan is lightweight
- No remediation cycles -- if an experiment fails, that's a valid finding
- Experimenters can message the lead -- two-way communication
- Throwaway worktree -- created for exploration, never merged

## Error Handling

**Experimenter crashes:** Record as "experiment failed" finding. Continue with others.

**All experimenters crash:** Write partial findings doc with what was collected. Report to user.

**Worktree creation fails:** Report error and exit. Do not create team.

**Spike plan parsing fails:** Report which section is missing/malformed. Exit.

## Red Flags

**Never:**
- Run experiments yourself (dispatch experimenters)
- Write experiment code directly
- Modify the design doc (humans review and update)
- Delete the throwaway worktree (human decides)
- Load experiment content into your context (pass via task metadata)
- Use orchestrate's reviewer/planner/validator machinery

**Always:**
- Parse the full spike plan before creating tasks
- Create throwaway worktree before spawning experimenters
- Dispatch independent experiments in parallel
- Write findings doc to main worktree (not throwaway)
- Include proposed design revisions in findings
- Report new questions that surfaced
- Keep worktree intact after spike completes
