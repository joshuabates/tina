# Spike Mode Phase 1 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Create the experimenter agent and spike skill, enabling spike plan execution from a spike plan document.

**Architecture:** The spike skill (`/spike <path>`) reads a spike plan markdown file, creates a throwaway worktree for experimentation, spawns a team with experimenter agents for each experiment, collects their findings, and writes a findings document to the main worktree. The experimenter agent is a lightweight agent (sonnet model) purpose-built for exploratory work -- no TDD, no code quality standards, structured output with evidence and proposed design revisions.

**Phase context:** This is the first phase. No previous phases exist.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | ~400 |

---

### Task 1: Create Experimenter Agent Definition

**Files:**
- Create: `agents/experimenter.md`

**Model:** haiku

**review:** spec-only

**Step 1: Write the experimenter agent definition**

Create `agents/experimenter.md` with the following content:

```markdown
---
name: experimenter
description: |
  Runs a single spike experiment in an isolated worktree.
  Writes throwaway code to answer a specific question.
  Reports findings with evidence and proposed design revisions.
model: sonnet
---

# Experimenter

Run a single spike experiment to answer a specific question.

## Reading Your Task

Your spawn prompt contains: `task_id: <id>`

1. Parse task_id from spawn prompt
2. Call TaskGet with that task_id
3. Extract from task.metadata:
   - `question`: The specific question this experiment answers
   - `experiment`: Full experiment description (setup, steps, success criteria)
   - `tbd_section`: Which TBD section in the design doc this resolves
   - `worktree_path`: Path to the throwaway worktree to work in

## Boundaries

**MUST DO:**
- Work exclusively in the provided worktree path
- Answer the specific question assigned with evidence
- Report findings in structured format (see Report Format below)
- Message spike lead when stuck or when experiment raises new questions

**MUST NOT:**
- Follow TDD -- this is throwaway exploratory code
- Follow code quality standards -- speed of learning matters, not code quality
- Modify files outside the worktree
- Merge or push any code
- Ask for confirmation before proceeding -- just run the experiment

**NO CONFIRMATION:** Execute your experiment immediately. Do not ask "should I proceed?" -- just do it.

## Process

### 1. Understand the Experiment

Read your task metadata carefully. You have:
- A **question** to answer (e.g., "Can Redis handle 10k reads/sec?")
- An **experiment** description with setup steps, what to test, and success criteria
- A **TBD section** in the design doc that your findings will resolve

### 2. Run the Experiment

Work in the worktree. Write whatever code you need -- scripts, test harnesses, prototypes, benchmarks. This code is throwaway.

Focus on:
- Getting a clear answer to the question
- Collecting evidence (output, benchmarks, error messages, behavior observations)
- Understanding why things work or don't work

Do NOT focus on:
- Code quality, naming, style
- Test coverage
- Error handling beyond what's needed for the experiment
- Documentation of the code itself

### 3. When Stuck

If you hit a wall or the experiment raises questions you didn't expect:

```
SendMessage({
  type: "message",
  recipient: "spike-lead",
  content: "Stuck on experiment. [Describe what you tried and what's blocking you]. Question: [specific question for the lead]",
  summary: "Experimenter stuck, needs guidance"
})
```

Wait for the lead's response before continuing.

### 4. Report Findings

When the experiment is complete (whether the answer is yes, no, partially, or "the question was wrong"), message the spike lead with your structured findings.

## Report Format

Message the spike lead with findings in this exact format:

```
SendMessage({
  type: "message",
  recipient: "spike-lead",
  content: "EXPERIMENT COMPLETE\n\nQUESTION: [the question]\n\nANSWER: [clear, direct answer]\n\nEVIDENCE:\n[bullet points with specific evidence -- benchmark numbers, test output, error messages, code that worked/didn't]\n\nPROPOSED REVISION for \"[TBD section name]\":\n[concrete text to replace the TBD section in the design doc]\n\nNEW QUESTIONS:\n[any new questions that surfaced during the experiment, or 'None']",
  summary: "Experiment complete with findings"
})
```

Every field is required. If the answer is "it doesn't work," that's a valid and valuable finding -- explain why and what the alternative should be in the proposed revision.

## Communication

- **Report findings:** SendMessage to "spike-lead" with structured format above
- **Ask for help:** SendMessage to "spike-lead" when stuck
- **New questions:** Include in findings report under NEW QUESTIONS

## Shutdown Protocol

When receiving shutdown request from spike lead:
1. Approve immediately -- your experiment is done
2. No state to save -- your code is throwaway
```

**Step 2: Verify the file exists and has correct frontmatter**

Run: `head -7 agents/experimenter.md`
Expected: YAML frontmatter with name: experimenter, description, model: sonnet

**Step 3: Commit**

```bash
git add agents/experimenter.md
git commit -m "feat: add experimenter agent for spike experiments"
```

---

### Task 2: Create Spike Skill -- Plan Parsing and Setup

**Files:**
- Create: `skills/spike/SKILL.md`

This task creates the spike skill file with the frontmatter, overview, and the first half of the workflow (parsing, worktree creation, team/task setup).

**Step 1: Create the spike skill directory**

Run: `mkdir -p skills/spike`

**Step 2: Write the spike skill file**

Create `skills/spike/SKILL.md` with the complete skill definition. The full content follows in step 2's code block.

```markdown
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

```bash
FINDINGS_PATH="docs/plans/$(basename "$SPIKE_PLAN" .md | sed 's/-spike$//; s/$/-spike-findings/')-findings.md"
```

Wait -- simpler: derive from spike plan path.
- Spike plan: `docs/plans/YYYY-MM-DD-<topic>-spike.md`
- Findings: `docs/plans/YYYY-MM-DD-<topic>-spike-findings.md`

Write the findings document with this structure:

```markdown
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
```

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
```

**Step 3: Verify the file exists and has correct frontmatter**

Run: `head -4 skills/spike/SKILL.md`
Expected: YAML frontmatter with name: spike and description

**Step 4: Commit**

```bash
git add skills/spike/SKILL.md
git commit -m "feat: add spike skill for coordinating spike experiments"
```

---

### Task 3: Verify Skill Registration and Agent Discovery

**Files:**
- None (verification only)

**Model:** haiku

**review:** none

**Step 1: Verify agent file is discoverable**

Run: `ls -la agents/experimenter.md`
Expected: File exists with reasonable size (should be ~3-4KB based on content)

**Step 2: Verify skill file is discoverable**

Run: `ls -la skills/spike/SKILL.md`
Expected: File exists with reasonable size (should be ~8-12KB based on content)

**Step 3: Verify frontmatter format matches existing patterns**

Run: `head -4 agents/experimenter.md && echo "---" && head -4 skills/spike/SKILL.md && echo "---" && head -4 agents/phase-executor.md && echo "---" && head -4 skills/orchestrate/SKILL.md`
Expected: All four files have consistent YAML frontmatter format (--- delimiters, name field, description field)

**Step 4: Verify no syntax issues in frontmatter**

Run: `grep -c "^---$" agents/experimenter.md`
Expected: Exactly 2 (opening and closing frontmatter delimiters)

Run: `grep -c "^---$" skills/spike/SKILL.md`
Expected: Exactly 2 (opening and closing frontmatter delimiters)

**Step 5: Final commit (if any fixes needed)**

If any issues were found and fixed:
```bash
git add agents/experimenter.md skills/spike/SKILL.md
git commit -m "fix: correct frontmatter formatting in spike files"
```

If no issues: no commit needed.

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~350 | `git diff --stat base..HEAD -- '*.md' | tail -1` |
| Files touched | 2-3 | `git diff --name-only base..HEAD | wc -l` |
| New files created | 2 | `git diff --name-only --diff-filter=A base..HEAD | wc -l` |

**Target files:**
- `agents/experimenter.md` - Experimenter agent definition (~120 lines)
- `skills/spike/SKILL.md` - Spike skill definition (~300 lines)

**ROI expectation:** These two files enable a complete new workflow (spike exploration) by reusing existing team/task/worktree infrastructure. High leverage -- ~400 lines of markdown configuration unlocks a new capability that prevents wasted orchestration cycles on unresolved design unknowns.
