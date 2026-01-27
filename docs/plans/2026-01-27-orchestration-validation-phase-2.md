# Orchestration Validation Phase 2 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Create a design validator that catches fundamentally flawed projects before planning begins by validating measurable success criteria exist, estimates are feasible, and baseline metrics are captured.

**Architecture:** A new agent (`agents/design-validator.md`) is invoked after architect approval but before planning. It reads the design document, checks for a Success Metrics section with quantifiable targets, verifies any phase estimates mathematically sum to the goal, and captures baseline metrics. The orchestrator (`skills/orchestrate/SKILL.md`) adds a validation gate between architect and planner. The brainstorming skill (`skills/brainstorming/SKILL.md`) is updated to mention the design validator step in the post-design workflow.

**Phase context:** Phase 1 added runtime validation (phase reviewer with metrics, orchestrator severity handling). Phase 2 adds pre-planning validation (design validator gates before any code is written). Phase 3 will add plan validation (between planning and execution).

---

### Task 1: Create Design Validator Agent File

**Files:**
- Create: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/design-validator.md`

**Step 1: Write the design validator agent**

Create the new agent file with the following content:

```markdown
---
name: design-validator
description: |
  Validates design documents before planning begins. Checks for measurable success
  criteria, feasibility of estimates, and captures baseline metrics.
  Provide: design doc path. Returns: validated/rejected with severity tier.
model: inherit
---

You are validating a design document before it proceeds to planning.

## Input

You receive:
- Design document path (has Architectural Context section from architect)
- Output file path (where to write the validation report)

## Output

Write your validation report to the specified output file. The report MUST include:
1. All validation checks performed
2. A clear **Status:** line with exactly one of: Pass, Warning, Stop
3. A **Severity tier:** line explaining the basis for the status
4. Baseline metrics captured (if applicable)
5. A **Recommendation:** explaining what should happen next

## Your Job

### 1. Check for Success Metrics Section

Read the design document and look for a `## Success Metrics` section.

**Required elements:**
- **Goal:** A quantifiable target (e.g., "Increase coverage from 60% to 70%", "Reduce latency by 50ms")
- **Baseline command:** How to measure current state
- **Progress command:** How to measure after each phase
- **ROI threshold:** Minimum acceptable return on investment (if applicable)

**Severity:**
- **Stop:** No Success Metrics section, or no quantifiable goal
- **Warning:** Section exists but incomplete (missing baseline/progress commands)
- **Pass:** Complete Success Metrics section with all required elements

### 2. Validate Estimate Feasibility

If the design includes phase estimates (in `## Phase Estimates` table or within phase descriptions):

**Check 1:** Do estimates exist?
- If no estimates: Warning (cannot validate feasibility, but can proceed)

**Check 2:** Do estimates mathematically sum to the goal?
```
total_expected = sum of all phase expected gains
goal = target from Success Metrics

if total_expected < goal:
    Stop - estimates cannot meet goal
if total_expected < goal * 1.2:
    Warning - estimates tight (within 20% of goal)
if total_expected >= goal * 1.2:
    Pass - estimates exceed goal with margin
```

**Check 3:** Are individual estimates plausible?
- Flag any single phase claiming >50% of total goal (concentration risk)
- Flag estimates that seem disconnected from scope description

### 3. Capture Baseline Metrics

If the design includes a baseline command in Success Metrics:

**Step 1:** Run the baseline command
```bash
# Example: cargo llvm-cov --summary-only
# Example: npm run benchmark
```

**Step 2:** Record the result in the validation report

**Step 3:** Write baseline to `.claude/tina/baseline-metrics.json`:
```json
{
  "captured_at": "2026-01-27T10:00:00Z",
  "design_doc": "path/to/design.md",
  "metrics": {
    "metric_name": "current_value",
    "raw_output": "full command output"
  }
}
```

**If baseline command fails:**
- Warning (cannot establish baseline, but can proceed with caution)
- Note the failure in the report

### 4. Validate Design Document Format

Check that the design follows expected structure:

**Required sections:**
- Problem Statement or Overview
- Success Metrics (checked in step 1)
- Phases (at least one `## Phase N` section)
- Architectural Context (added by architect)

**Flag if missing:** Warning for missing non-critical sections, Stop for missing phases

## Severity Tiers

| Severity | Condition | Action |
|----------|-----------|--------|
| Stop | No measurable criteria, OR estimates can't meet goal, OR no phases defined | Reject, require revision |
| Warning | Estimates tight (<20% margin), OR baseline capture failed, OR incomplete metrics section | Flag risk, allow proceed |
| Pass | Clear criteria, estimates exceed goal, baseline captured | Continue to planning |

## Report Format

```markdown
## Design Validation Report

### Design Document
**Path:** [design doc path]
**Validated at:** [timestamp]

### Success Metrics Check
**Status:** ✅ Pass / ⚠️ Warning / ❌ Stop

**Goal found:** [Yes/No] - "[quoted goal if found]"
**Baseline command:** [Yes/No]
**Progress command:** [Yes/No]
**ROI threshold:** [Yes/No]

**Issues:**
- [List any issues found]

### Estimate Feasibility Check
**Status:** ✅ Pass / ⚠️ Warning / ❌ Stop

**Phase estimates found:** [Yes/No]
**Total expected gain:** [sum of estimates]
**Goal target:** [from Success Metrics]
**Margin:** [percentage over/under goal]

**Issues:**
- [List any issues found, e.g., "estimates sum to 8% but goal is 10%"]

### Baseline Metrics
**Status:** ✅ Captured / ⚠️ Failed / ⏭️ Skipped

**Command:** `[baseline command]`
**Result:** [captured value or error message]
**Saved to:** `.claude/tina/baseline-metrics.json`

### Document Structure Check
**Status:** ✅ Pass / ⚠️ Warning / ❌ Stop

**Sections found:**
- [x] Problem Statement / Overview
- [x] Success Metrics
- [x] Phases (N found)
- [x] Architectural Context

### Summary
**Status:** Pass / Warning / Stop
**Severity tier:** [Worst of all checks]

**Recommendation:**
- **Pass:** Design validated, proceed to planning
- **Warning:** Design has risks noted above, proceed with caution
- **Stop:** Design must be revised before planning can begin

**If Stop, required changes:**
1. [Specific change needed]
2. [Another change needed]
```

## Critical Rules

**DO:**
- Read the entire design document before making judgments
- Run baseline command if provided (capture actual metrics)
- Calculate exact margin when estimates and goal both exist
- Give specific feedback on what's missing or wrong
- Write baseline metrics to `.claude/tina/baseline-metrics.json`
- Output clear severity tier

**DON'T:**
- Approve designs without measurable success criteria
- Skip baseline capture even if command looks complex
- Give vague feedback ("needs more detail") - be specific
- Assume estimates are reasonable without checking math
- Block designs for stylistic issues (focus on measurability and feasibility)
```

**Step 2: Verify the file was created**

Run: `ls -la /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/design-validator.md`
Expected: File exists with recent timestamp

Run: `head -20 /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/design-validator.md`
Expected: Shows the YAML frontmatter and beginning of the agent definition

**Step 3: Commit the new agent**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add agents/design-validator.md && git commit -m "feat: add design-validator agent for pre-planning validation"
```

---

### Task 2: Add Design Validator Gate to Orchestrator

**Files:**
- Modify: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`

**Step 1: Read the orchestrator to find the insertion point**

The orchestrator currently goes: Parse design doc -> Create worktree -> Initialize state -> Phase loop (spawn planner...).

We need to insert the design validator after worktree creation and before the phase loop. The design validator should run once at the start, not per-phase.

**Step 2: Add Design Validator invocation after Step 2**

Find the section "### Step 2: Initialize or Resume State" in the orchestrator. After the cumulative metrics initialization (added in Phase 1), add a new "### Step 2c: Validate Design" section.

Locate the text `# Initialize cumulative metrics tracking` block that ends with `fi`. After that section, add:

```markdown

### Step 2c: Validate Design

Before starting phases, validate the design document meets requirements for measurable success.

**Skip if resuming:** Only run on fresh orchestration (current_phase == 0).

```bash
if [ "$CURRENT_PHASE" -eq 0 ]; then
  echo "Validating design document..."

  # Create validation output directory
  mkdir -p "$WORKTREE_PATH/.claude/tina/validation"

  # Spawn design validator
  # Task tool parameters:
  #   subagent_type: "tina:design-validator"
  #   model: "opus"
  #   prompt: |
  #     Design doc: $DESIGN_DOC
  #     Output file: $WORKTREE_PATH/.claude/tina/validation/design-report.md
  #
  #     Validate this design and write your report to the output file.
  #     Return ONLY: VALIDATION_STATUS: Pass/Warning/Stop

  # Parse validation status
  VALIDATION_STATUS=$(echo "$VALIDATOR_OUTPUT" | grep "^VALIDATION_STATUS:" | cut -d' ' -f2)

  case "$VALIDATION_STATUS" in
    "Pass")
      echo "Design validated successfully"
      ;;

    "Warning")
      echo "Design validated with warnings - proceeding with caution"
      echo "See: $WORKTREE_PATH/.claude/tina/validation/design-report.md"
      ;;

    "Stop")
      echo "Design validation FAILED"
      echo ""
      cat "$WORKTREE_PATH/.claude/tina/validation/design-report.md"
      echo ""
      echo "Design must be revised before orchestration can proceed."
      echo "Review the report above and update the design document."
      exit 1
      ;;

    *)
      echo "Unknown validation status: $VALIDATION_STATUS - treating as warning"
      ;;
  esac
fi
```

**Step 3: Update the process flow diagram**

Find the `digraph orchestrate` diagram in the "## The Process" section. Update it to include the design validator step.

Find the line:
```
"Initialize .claude/tina/supervisor-state.json" -> "More phases?";
```

Replace it with:
```
"Initialize .claude/tina/supervisor-state.json" -> "Validate design (tina:design-validator)";
"Validate design (tina:design-validator)" [shape=box];
"Design valid?" [shape=diamond];
"Validate design (tina:design-validator)" -> "Design valid?";
"Design valid?" -> "More phases?" [label="pass/warning"];
"Design valid?" -> "Report failure and exit" [label="stop"];
"Report failure and exit" [shape=box style=filled fillcolor=lightcoral];
```

**Step 4: Update the Integration section**

Find the "## Integration" section. Add the design validator to the "Spawns" list.

Add to the "**Spawns:**" list:
```markdown
- `tina:design-validator` - Validates design before planning (once at start)
```

**Step 5: Add state file for baseline metrics**

Find the "## State Files" section. Add the baseline metrics file description after the existing state files.

Add:
```markdown

**Baseline metrics:** `.claude/tina/baseline-metrics.json`
```json
{
  "captured_at": "2026-01-26T10:00:00Z",
  "design_doc": "docs/plans/2026-01-26-feature-design.md",
  "metrics": {
    "coverage": "62.5%",
    "raw_output": "Lines: 62.5% (1250/2000)"
  }
}
```

Written by design validator during validation. Used by phase reviewer to compare progress against baseline.
```

**Step 6: Verify changes**

Run: `grep -c "design-validator" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: At least 3 occurrences

Run: `grep "Validate design" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: Shows the new step in the flow

**Step 7: Commit the change**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add skills/orchestrate/SKILL.md && git commit -m "feat: add design validator gate to orchestrator"
```

---

### Task 3: Update Brainstorming Skill to Mention Design Validator

**Files:**
- Modify: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/brainstorming/SKILL.md`

**Step 1: Read the current brainstorming skill**

Read `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/brainstorming/SKILL.md` to find where to add the design validator mention.

**Step 2: Update the "After the Design" section**

Find the "## After the Design" section. Update the workflow to include design validation between architect review and implementation.

Replace the current "## After the Design" section with:

```markdown
## After the Design

**Documentation:**
- Write the validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- Use elements-of-style:writing-clearly-and-concisely skill if available
- Commit the design document to git

**Architectural review:**
- Use tina:architect to review the design
- Architect explores codebase, asks questions if unclear, adds Architectural Context section
- Architect must approve design before proceeding
- If blocked: address concerns, then re-run architect review

**Design validation (for orchestrated projects):**
- If proceeding to orchestrated execution, design validator runs automatically
- Validator checks: measurable success criteria, estimate feasibility, baseline capture
- Design must have a `## Success Metrics` section with quantifiable goal
- If validation fails, revise design before proceeding

**Implementation (if continuing):**
- Ask: "Ready to set up for implementation?"
- Use tina:using-git-worktrees to create isolated workspace
- Use tina:writing-plans to create detailed implementation plan
```

**Step 3: Add Success Metrics guidance to Key Principles**

Find the "## Key Principles" section and add a bullet point about measurable goals.

Add after the existing bullets:

```markdown
- **Measurable goals required** - Every design must have quantifiable success criteria
```

**Step 4: Verify changes**

Run: `grep "Design validation" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/brainstorming/SKILL.md`
Expected: Shows the new design validation section

Run: `grep "Success Metrics" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/brainstorming/SKILL.md`
Expected: Shows reference to Success Metrics section

**Step 5: Commit the change**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add skills/brainstorming/SKILL.md && git commit -m "docs: update brainstorming skill to mention design validator step"
```

---

### Task 4: Add Success Metrics Section Format to Design Document

**Files:**
- Modify: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/docs/plans/2026-01-26-orchestration-validation-design.md`

**Step 1: Add Success Metrics section to the design document**

The design document already has a "Design document format changes" subsection in the Architectural Context that specifies the format. We should add an actual Success Metrics section to the design doc itself as an example.

Read the design doc and find a location after "## Open Questions" and before "## Architectural Context" (or at the end if no Architectural Context).

Add the following section:

```markdown

## Success Metrics

**Goal:** Reduce wasted implementation effort by catching infeasible designs before planning begins. Target: 0 projects proceeding to implementation with mathematically infeasible goals.

**Baseline command:**
```bash
# No automated baseline for this meta-goal - tracked by manual review of orchestration outcomes
echo "N/A - qualitative improvement"
```

**Progress command:**
```bash
# Check that design validator blocked infeasible designs
ls -la .claude/tina/validation/design-report.md 2>/dev/null && grep "Status:" .claude/tina/validation/design-report.md
```

**ROI threshold:** N/A (infrastructure work - ROI measured by subsequent project success rates)

**Phase estimates:**
| Phase | Expected Deliverable | Target Files |
|-------|---------------------|--------------|
| 1 | Phase reviewer metrics + orchestrator feedback loop | agents/phase-reviewer.md, skills/orchestrate/SKILL.md, agents/planner.md |
| 2 | Design validator agent + orchestrator gate | agents/design-validator.md, skills/orchestrate/SKILL.md, skills/brainstorming/SKILL.md |
| 3 | Plan validator agent + orchestrator gate | agents/plan-validator.md, skills/orchestrate/SKILL.md |
```

**Step 2: Verify changes**

Run: `grep "## Success Metrics" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/docs/plans/2026-01-26-orchestration-validation-design.md`
Expected: Shows the new Success Metrics section

**Step 3: Commit the change**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add docs/plans/2026-01-26-orchestration-validation-design.md && git commit -m "docs: add Success Metrics section to orchestration-validation design"
```

---

### Task 5: Add Design Validator Output Parsing to Orchestrator

**Files:**
- Modify: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`

**Step 1: Add design validator to the Model Policy table**

Find the "## Model Policy" section with the model table. Add the design validator to the table.

Find the table row for "**Planner**" and add before it:

```markdown
| **Design Validator** | opus | Analyzes design feasibility, runs baseline commands - needs reasoning |
```

**Step 2: Add validation state tracking to supervisor state**

Find the "**Supervisor state:** `.claude/tina/supervisor-state.json`" section with the JSON example. Update the JSON to include validation status.

Find the `"recovery_attempts": {}` line in the JSON and add after it:

```json
  "design_validated": false,
  "validation_status": null,
```

Update the field descriptions section below the JSON. Add:

```markdown
- `design_validated`: Whether design validation has run (true after Step 2c completes)
- `validation_status`: Result of design validation (pass/warning/stop, null if not run)
```

**Step 3: Update state initialization to include validation fields**

Find the `cat > .claude/tina/supervisor-state.json << EOF` block in Step 2. Add the validation fields to the initial state.

The JSON should include:
```json
  "design_validated": false,
  "validation_status": null,
```

Add these after the `"recovery_attempts": {}` line.

**Step 4: Update Step 2c to save validation status**

In the Step 2c validation section (added in Task 2), update the case statement to save the validation status to supervisor state.

After each status case, add state update:

```bash
  case "$VALIDATION_STATUS" in
    "Pass")
      echo "Design validated successfully"
      tmp_file=$(mktemp)
      jq '.design_validated = true | .validation_status = "pass"' .claude/tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .claude/tina/supervisor-state.json
      ;;

    "Warning")
      echo "Design validated with warnings - proceeding with caution"
      echo "See: $WORKTREE_PATH/.claude/tina/validation/design-report.md"
      tmp_file=$(mktemp)
      jq '.design_validated = true | .validation_status = "warning"' .claude/tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .claude/tina/supervisor-state.json
      ;;

    "Stop")
      echo "Design validation FAILED"
      tmp_file=$(mktemp)
      jq '.design_validated = true | .validation_status = "stop"' .claude/tina/supervisor-state.json > "$tmp_file" && mv "$tmp_file" .claude/tina/supervisor-state.json
      echo ""
      cat "$WORKTREE_PATH/.claude/tina/validation/design-report.md"
      echo ""
      echo "Design must be revised before orchestration can proceed."
      echo "Review the report above and update the design document."
      exit 1
      ;;
```

**Step 5: Add resumption check for validation**

In the "### Step 2: Initialize or Resume State" section, where resumption is handled, add a check for validation status.

After the `CURRENT_PHASE=$(jq -r '.current_phase' .claude/tina/supervisor-state.json)` line, add:

```bash
  # Check validation status on resume
  DESIGN_VALIDATED=$(jq -r '.design_validated // false' .claude/tina/supervisor-state.json)
  if [ "$DESIGN_VALIDATED" = "false" ]; then
    echo "Design not validated yet - will validate before proceeding"
    # Validation will run in Step 2c
  fi
```

**Step 6: Verify changes**

Run: `grep "design_validated" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: Multiple occurrences showing state tracking

Run: `grep "Design Validator" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: Shows in Model Policy table

**Step 7: Commit the change**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add skills/orchestrate/SKILL.md && git commit -m "feat: add design validator state tracking and model policy"
```

---

### Task 6: Final Verification

**Step 1: Verify all modified and created files**

Run:
```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && ls -la agents/design-validator.md skills/orchestrate/SKILL.md skills/brainstorming/SKILL.md docs/plans/2026-01-26-orchestration-validation-design.md
```

Expected: All four files exist with recent modification times

**Step 2: Verify design-validator agent content**

Run: `grep -c "Success Metrics" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/design-validator.md`
Expected: At least 5 occurrences

Run: `grep -c "severity" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/design-validator.md`
Expected: At least 3 occurrences

**Step 3: Verify orchestrator integration**

Run: `grep -c "design-validator" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: At least 5 occurrences

Run: `grep "Step 2c" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: Shows the new validation step

**Step 4: Verify brainstorming update**

Run: `grep "Design validation" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/brainstorming/SKILL.md`
Expected: Shows the new section about design validation

**Step 5: Verify design doc has Success Metrics**

Run: `grep "## Success Metrics" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/docs/plans/2026-01-26-orchestration-validation-design.md`
Expected: Shows the Success Metrics section header

**Step 6: Verify git history**

Run: `cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git log --oneline -10`

Expected commits (most recent first):
- feat: add design validator state tracking and model policy
- docs: add Success Metrics section to orchestration-validation design
- docs: update brainstorming skill to mention design validator step
- feat: add design validator gate to orchestrator
- feat: add design-validator agent for pre-planning validation

**Step 7: Report completion**

```
Phase 2 complete!

Files created:
- agents/design-validator.md - New agent for pre-planning validation

Files modified:
- skills/orchestrate/SKILL.md - Added design validator gate (Step 2c), state tracking, model policy
- skills/brainstorming/SKILL.md - Updated to mention design validation workflow
- docs/plans/2026-01-26-orchestration-validation-design.md - Added Success Metrics section as example

Key capabilities added:
1. Design validator agent checks for measurable success criteria
2. Design validator verifies estimate feasibility (estimates must sum to goal)
3. Design validator captures baseline metrics before work begins
4. Orchestrator gates on design validation before spawning planner
5. Validation status tracked in supervisor state for resumption
6. Brainstorming workflow updated to guide users toward measurable designs

Next phase: Phase 3 - Plan Validator (catches drift between design and plans)
```

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~250 | `git diff --stat HEAD~5..HEAD -- '*.md' | tail -1` |
| Test lines added | 0 | N/A (documentation/agent definition phase) |
| Files touched | 4 | `git diff --name-only HEAD~5..HEAD | wc -l` |

**Target files:**
- `agents/design-validator.md` - New agent (create)
- `skills/orchestrate/SKILL.md` - Add validation gate
- `skills/brainstorming/SKILL.md` - Update workflow documentation
- `docs/plans/2026-01-26-orchestration-validation-design.md` - Add Success Metrics example

**ROI expectation:** N/A (infrastructure work - ROI measured by catching infeasible projects before wasted planning/implementation effort)
