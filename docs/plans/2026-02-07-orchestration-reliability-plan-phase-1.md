# Orchestration Reliability Phase 1: Contract and Metadata Fixes

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Fix contract mismatches between orchestrator, agents, and metadata so the event loop advances without manual task edits.

**Architecture:** Targeted fixes to existing skill/agent definitions and CLI code. No new architecture.

**Phase context:** The orchestration pipeline stalls because agents expect metadata fields and message formats that are never provided. This phase makes handoffs explicit and consistent.

## Task 1: Add output_path to validate-design task metadata

**Files:**
- `skills/orchestrate/SKILL.md`

**Model:** haiku

**Steps:**

1. In the `validate-design` TaskCreate block (around the "Create validate-design task" section), add `output_path` to the metadata:

```markdown
TaskCreate {
  "subject": "validate-design",
  "description": "Validate design document",
  "activeForm": "Validating design document",
  "metadata": {
    "design_doc_path": "<DESIGN_DOC>",
    "worktree_path": "<WORKTREE_PATH>",
    "output_path": "<WORKTREE_PATH>/.claude/tina/validation/design-report.md"
  }
}
```

This appears in two places in SKILL.md:
- The step-by-step task creation section (around "3. Create validate-design task")
- Any other TaskCreate examples for validate-design

2. Also update the Task Metadata Convention table to include `output_path` for validate-design:

```markdown
| `validate-design` | `validation_status: "pass"\|"warning"\|"stop"`, `worktree_path`, `output_path` |
```

**Run:**
```bash
grep -n "output_path" skills/orchestrate/SKILL.md
# Expected: matches at the lines we just edited
```

**review:** spec-only

---

## Task 2: Add plan_path and output_path to review-phase-N task metadata

**Files:**
- `skills/orchestrate/SKILL.md`

**Model:** haiku

**Steps:**

1. In the `review-phase-N` TaskCreate block (around "Create phase tasks"), add `output_path` to the metadata:

```markdown
TaskCreate {
  "subject": "review-phase-<N>",
  "description": "Review completed phase implementation",
  "activeForm": "Reviewing phase <N>",
  "metadata": {
    "phase_num": <N>,
    "design_doc_path": "<DESIGN_DOC>",
    "output_path": "<WORKTREE_PATH>/.claude/tina/phase-<N>/review-report.md"
  }
}
```

Note: `plan_path` and `git_range` are already propagated before spawning the reviewer (see "Before spawning: Update review-phase-N metadata" in the Spawning Teammates section). The `output_path` is the missing field.

2. Update the remediation TaskCreate for `review-phase-N.5` similarly:

```markdown
TaskCreate {
  "subject": "review-phase-${REMEDIATION_PHASE}",
  "description": "Review remediation",
  "activeForm": "Reviewing phase ${REMEDIATION_PHASE} remediation",
  "metadata": {
    "phase_num": "${REMEDIATION_PHASE}",
    "design_doc_path": "<DESIGN_DOC>",
    "output_path": "<WORKTREE_PATH>/.claude/tina/phase-${REMEDIATION_PHASE}/review-report.md"
  }
}
```

3. Update the Task Metadata Convention table to include `output_path` for review-phase-N:

```markdown
| `review-phase-N` | `status: "pass"\|"gaps"`, `issues[]` (if gaps), `output_path` |
```

4. In the "Before spawning" section for the reviewer, add `output_path` to the metadata propagation alongside `worktree_path`, `design_doc_path`, and `git_range`:

```markdown
# Example: Before spawning reviewer, update its task with paths from earlier tasks
WORKTREE_PATH=$(TaskGet { taskId: "validate-design" }).metadata.worktree_path
PLAN_PATH=$(TaskGet { taskId: "plan-phase-$N" }).metadata.plan_path
GIT_RANGE=$(TaskGet { taskId: "execute-phase-$N" }).metadata.git_range

TaskUpdate {
  taskId: "review-phase-$N",
  metadata: {
    worktree_path: WORKTREE_PATH,
    design_doc_path: "<DESIGN_DOC>",
    plan_path: PLAN_PATH,
    git_range: GIT_RANGE,
    output_path: "${WORKTREE_PATH}/.claude/tina/phase-${N}/review-report.md"
  }
}
```

**Run:**
```bash
grep -n "output_path" skills/orchestrate/SKILL.md
# Expected: matches in validate-design and review-phase-N sections
```

**review:** spec-only

---

## Task 3: Define VALIDATION_STATUS completion message in design-validator agent

**Files:**
- `agents/design-validator.md`

**Model:** haiku

**Steps:**

1. Add a "Completion Message Format" section after the "Critical Rules" section (before the end of the file):

```markdown
## Completion Message Format

After writing your validation report to the output file, send a completion message to the orchestrator via Teammate tool.

**Message format:**
```
VALIDATION_STATUS: <Pass|Warning|Stop>
```

**Examples:**
```
VALIDATION_STATUS: Pass
```
```
VALIDATION_STATUS: Warning
```
```
VALIDATION_STATUS: Stop
```

The orchestrator parses this exact format to determine next steps. Do NOT include extra text in the message - just the status line.

Use Teammate tool with `operation: write` and `target_agent_id: team-lead`.
```

**Run:**
```bash
grep -n "VALIDATION_STATUS" agents/design-validator.md
# Expected: matches in the new Completion Message Format section
```

**review:** spec-only

---

## Task 4: Define error message formats in phase-planner and phase-executor agents

**Files:**
- `agents/phase-planner.md`
- `agents/phase-executor.md`

**Model:** haiku

**Steps:**

1. In `agents/phase-planner.md`, update the Error Handling section to include explicit error message format. Replace the existing "Design doc not found" / "Phase section not found" entries with messages that use the standard format:

```markdown
## Error Handling

When an error occurs, report it to the orchestrator before exiting.

**Error message format:**
```
plan-phase-N error: <reason>
```

Use Teammate tool with `operation: write` and `target_agent_id: team-lead`.

**Specific errors:**

**Design doc not found:**
```
plan-phase-N error: design doc not found at <path>
```

**Phase section not found:**
```
plan-phase-N error: phase N section not found in design doc (available: <list>)
```

**Codebase exploration fails:**
- Continue with available information
- Note gaps in plan
- Report warning in completion message (not an error)
```

2. In `agents/phase-executor.md`, add an Error Handling section after the Communication section:

```markdown
## Error Handling

When an error occurs, report it to the orchestrator before exiting.

**Error message format:**
```
execute-N error: <reason>
```

Use Teammate tool with `operation: write` and `target_agent_id: team-lead`.

**Specific errors:**

**tina-session start fails:**
```
execute-N error: session start failed: <error output>
```

**tina-session wait times out:**
```
execute-N error: timeout after <seconds>s
```

**Session dies during execution:**
```
execute-N error: session_died
```
```

**Run:**
```bash
grep -n "error:" agents/phase-planner.md agents/phase-executor.md
# Expected: matches for the new error format definitions
```

**review:** spec-only

---

## Task 5: Pass team_name and worktree_path into team-lead invocation in start.rs

**Files:**
- `tina-session/src/commands/start.rs`

**Model:** opus

**Steps:**

1. Update the skill command construction to include `team_name` and `worktree_path` in the prompt sent to Claude in the tmux session. Currently (line 117):

```rust
let skill_cmd = format!("/tina:team-lead-init {}", plan_abs.display());
```

Change to pass team_name (derived from feature + phase) and worktree_path:

```rust
let worktree_path = &lookup.worktree_path;
let team_name = format!("{}-phase-{}", feature, phase);
let skill_cmd = format!(
    "/tina:team-lead-init team_name: {} plan_path: {}",
    team_name,
    plan_abs.display()
);
```

2. The `SessionLookup` struct must have `worktree_path`. Check if it does - if not, we need to derive it. Looking at the current code, `lookup.cwd` is loaded from SessionLookup. The worktree path should be available from the session lookup or from the supervisor state. Use the worktree_path from `state`:

```rust
let state = SupervisorState::load(cwd)?;
// state.worktree_path is available
```

The worktree_path is already in state (loaded on line 53). Use it in the skill command if the team-lead-init needs it.

Note: Review `team-lead-init/SKILL.md` - it expects `team_name` and `plan_path` in the prompt (lines 20-27). The current code only passes the plan path. Adding `team_name` fixes the contract.

**Run:**
```bash
cd /Users/joshua/Projects/tina && cargo check -p tina-session
# Expected: compiles without errors
```

```bash
cd /Users/joshua/Projects/tina && cargo test -p tina-session
# Expected: all tests pass
```

**review:** full

---

## Task 6: Fix plan reuse checks to match planner output path

**Files:**
- `skills/orchestrate/SKILL.md`

**Model:** haiku

**Steps:**

The plan reuse check currently looks at:
```
{WORKTREE_PATH}/.claude/tina/phase-${N}/plan.md
```

But the planner writes plans to:
```
docs/plans/YYYY-MM-DD-<feature>-phase-N.md
```

These paths never match, so plan reuse never triggers.

1. Update ALL plan reuse checks in SKILL.md to check the `plan_path` from task metadata instead of a hardcoded path. There are three locations:

**Location 1 - After validator completes (around "Check for existing plan file"):**

Change from:
```markdown
Check for existing plan file at `{WORKTREE_PATH}/.claude/tina/phase-1/plan.md`
```

To:
```markdown
Check if plan-phase-1 task already has a `plan_path` in its metadata:
```
plan_task = TaskGet { taskId: "plan-phase-1" }
if plan_task.metadata.plan_path exists:
    # Plan already written - skip planning
    TaskUpdate: plan-phase-1, status: completed
    Print: "Reusing existing plan for phase 1."
    # Proceed to spawning executor
else:
    # Check for plan file at the expected planner output location
    PLAN_FILE=$(ls docs/plans/*-${FEATURE_NAME}-phase-1.md 2>/dev/null | head -1)
    if PLAN_FILE exists:
        TaskUpdate: plan-phase-1, status: completed, metadata: { plan_path: "$PLAN_FILE" }
        Print: "Found existing plan for phase 1."
        # Proceed to spawning executor
    else:
        # Spawn planner as normal
    fi
fi
```

**Location 2 - Phase planner spawn section (around "plan reuse check"):**

Same pattern: check metadata first, then check `docs/plans/*-phase-N.md` glob.

**Location 3 - After reviewer passes (around "Check for existing plan before spawning planner"):**

Same pattern for phase N+1.

**Run:**
```bash
grep -n "plan reuse\|existing plan\|\.claude/tina/phase.*plan" skills/orchestrate/SKILL.md
# Expected: no more references to .claude/tina/phase-N/plan.md
```

**review:** spec-only

---

## Phase Estimates

| Metric | Expected |
|--------|----------|
| Impl lines (SKILL.md edits) | ~80 |
| Impl lines (agent .md edits) | ~60 |
| Impl lines (start.rs) | ~10 |
| Files touched | 5 |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 500 |
