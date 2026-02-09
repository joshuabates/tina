# Orchestration Async Phase 3: Plan Dependencies and Staleness Validation

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Make dependency and baseline information mandatory in plans, and add staleness validation to the plan-validator agent.

**Architecture:** Updates to two agent definition files (markdown). No Rust code changes.

**Phase context:** Phases 1 and 2 added parallel consensus review and plan-ahead during review. Phase 3 makes plan metadata (dependencies and baselines) mandatory so that Phase 4's DAG scheduler can parse them, and adds a staleness check so plan-ahead plans can be validated before reuse.

## Tasks

### Task 1: Add Depends-on and Plan Baseline requirements to phase-planner

**Files:**
- Modify: `agents/phase-planner.md`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Add two new requirements to the phase-planner agent:

1. Every task in the plan MUST include a `**Depends on:**` field listing task numbers it depends on, or "none" for independent tasks.
2. The plan header MUST include a `**Plan Baseline:** <git sha>` line recording the commit at plan creation time.

#### Step 1: Add Depends-on to Required Fields per Task

In the "Required Fields per Task" section (line ~204), add `**Depends on:**` to the bullet list of required fields.

Edit `agents/phase-planner.md`, in the "Required Fields per Task" section, add after the `**review:**` bullet:

```markdown
- `**Depends on:**` - Task numbers this depends on, or "none"
```

#### Step 2: Add Plan Baseline requirement to plan header

In the "Write the Implementation Plan" section (around line ~95), add a requirement for the plan header to include a baseline git sha.

After the line about creating a plan file at `docs/plans/YYYY-MM-DD-<feature>-phase-N.md`, add:

```markdown
**Plan header requirements:**

Every plan MUST begin with:
```
**Plan Baseline:** <output of `git rev-parse HEAD`>
```

This records the repository state when the plan was created. The plan-validator uses this to detect staleness.
```

#### Step 3: Add Depends-on to Task Model Selection format

In the "Task Model Selection" section (line ~133), update the task format example to include `**Depends on:**`.

Update the format block to:

```markdown
### Task N: <description>

**Files:**
- ...

**Model:** <haiku|opus>

**review:** <spec-only|full>

**Depends on:** <task numbers or "none">
```

#### Step 4: Add lint rules for depends-on and plan-baseline

In the "Lint Rules" table (line ~212), add two new error-severity rules:

| Rule | Check | Severity |
|------|-------|----------|
| depends-on | Every task has `**Depends on:**` line | error |
| plan-baseline | Plan contains `**Plan Baseline:**` header | error |

Also update the Lint Output example table to include these two new rules.

Run:
```bash
grep -c "depends-on\|plan-baseline" agents/phase-planner.md
```

Expected:
```
4
```
(Two in the lint rules table, two in the lint output example)

### Task 2: Add staleness check to plan-validator

**Files:**
- Modify: `agents/plan-validator.md`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Add a new "Check Plan Staleness" section to the plan-validator agent between the existing checks and the Severity Tiers section. This check parses the Plan Baseline sha from the plan file, computes changed files via `git diff`, cross-references with plan target files, and emits Pass/Warning/Stop.

#### Step 1: Add Check 5 - Plan Staleness

Insert a new section `### 5. Check Plan Staleness` after section 4 (ROI Check, ending around line 167) and before the "Severity Tiers" section (line 168).

Content to insert:

```markdown
### 5. Check Plan Staleness

Validate that the plan is still current relative to repository changes since it was created.

**Step 1:** Extract Plan Baseline from plan file

Look for a `**Plan Baseline:**` line in the plan header. Extract the git sha value.

If no Plan Baseline is found:
- Emit Warning: "Plan has no baseline sha, cannot check staleness"
- Skip remaining staleness steps

**Step 2:** Compute changed files since baseline

```
changed_files = git diff --name-only <baseline_sha>..HEAD
```

If the baseline sha is not a valid commit (e.g., force-pushed away):
- Emit Warning: "Baseline sha not found in repository history"
- Skip remaining staleness steps

**Step 3:** Extract plan target files

Collect all file paths from `**Files:**` sections across all tasks in the plan. Normalize paths (strip leading `./` or workspace prefix if present).

**Step 4:** Compute overlap and emit verdict

```
overlap = changed_files ∩ plan_target_files
overlap_ratio = len(overlap) / len(plan_target_files)

if overlap_ratio == 0:
    Pass - no plan targets changed since baseline
elif overlap_ratio <= 0.3:
    Warning - some plan targets changed: [list overlap files]
else:
    Stop - >30% of plan targets changed: [list overlap files]
```

**Severity:**
- **Pass:** No plan target files changed since baseline
- **Warning:** Some target files changed (up to 30%)
- **Stop:** More than 30% of plan target files changed since baseline
```

#### Step 2: Update Severity Tiers table

Update the Severity Tiers table to include staleness:

Change the existing table to:

| Severity | Condition | Action |
|----------|-----------|--------|
| Stop | Plans don't cover scope, OR estimates implausible, OR ROI unacceptable, OR >30% plan targets changed | Reject, require replanning |
| Warning | Some drift from priorities, OR marginal ROI, OR estimates on edge, OR some plan targets changed | Flag concerns, allow proceed |
| Pass | Plans align with design, estimates plausible, ROI acceptable, plan targets unchanged | Continue to execution |

#### Step 3: Add Staleness Check to Report Format

In the Report Format section, add a new subsection between "ROI Check" and "Summary":

```markdown
### Staleness Check
**Status:** Pass / Warning / Stop / N/A

**Plan Baseline:** [sha or "not found"]
**Changed files since baseline:** [count]
**Plan target files:** [count]
**Overlap:** [count] ([percentage]%)

**Changed plan targets:**
- [list of overlapping files, or "none"]
```

#### Step 4: Update Critical Rules

Add to the DO list:
- Check plan baseline and compute staleness when baseline sha is present

Add to the DON'T list:
- Skip staleness check when Plan Baseline is present in the plan

Run:
```bash
grep -c "staleness\|Staleness\|baseline" agents/plan-validator.md
```

Expected:
```
12
```
(Multiple mentions across the new section, severity table, report format, and critical rules)

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 200 |

## Phase Estimates

| Metric | Value |
|--------|-------|
| Impl lines | ~80 (markdown additions) |
| Test lines | 0 (agent definitions, no code tests) |
| Files touched | 2 |
| Tasks | 2 |

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
