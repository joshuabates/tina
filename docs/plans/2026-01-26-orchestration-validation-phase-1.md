# Orchestration Validation Phase 1 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Enhance the phase reviewer to collect metrics and compare actuals to estimates, then modify the orchestrator to consume severity tiers and respond appropriately.

**Architecture:** The phase reviewer (`agents/phase-reviewer.md`) gains a new "Metrics Collection" section that gathers lines of code, test lines, and metric deltas. It compares these to estimates from the plan and outputs a severity tier (pass/warning/stop). The orchestrator (`skills/orchestrate/SKILL.md`) adds logic to consume phase reviewer output and respond with continue/reassess/halt based on severity. The planner (`agents/planner.md`) adds an estimates section to its output format.

**Phase context:** This is Phase 1 of 3. No previous phases. This phase establishes the runtime validation loop that catches problems during execution.

---

### Task 1: Add Estimates Section to Planner Output Format

**Files:**
- Modify: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/planner.md`

**Step 1: Read the current planner agent file**

Read `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/planner.md` to understand the current structure.

**Step 2: Add estimates section to task structure documentation**

After the existing task structure markdown, add a new "Phase Estimates" section that planners must include at the end of each plan file.

Locate the "### Task Structure" section and add the following after the closing triple backticks of the Task Structure code block:

```markdown

### Phase Estimates Section

Every plan file MUST end with a Phase Estimates section. This enables the phase reviewer to compare actual results against expected outcomes.

```markdown
## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~150 | `git diff --stat base..HEAD -- '*.rs' '*.ts' '*.py' | tail -1` |
| Test lines added | ~200 | `git diff --stat base..HEAD -- '*_test.*' '*.test.*' '**/tests/**' | tail -1` |
| Files touched | 5-7 | `git diff --name-only base..HEAD | wc -l` |
| [Metric-specific] | [value] | [command to measure] |

**Target files:**
- `src/path/to/main.rs` - Core implementation
- `src/path/to/helper.rs` - Supporting functions
- `tests/path/to/test.rs` - Test coverage

**ROI expectation:** [For test work: coverage lines per test line. For features: scope delivered vs estimated effort. For refactoring: complexity reduction vs churn.]
```

**Notes:**
- Include metric-specific rows when the design doc specifies measurable goals (coverage %, performance improvement, etc.)
- The "base" in git commands refers to the commit before phase work began
- ROI expectation helps phase reviewer flag low-value work
```

**Step 3: Update the "Remember" section to include estimates**

Find the "## Remember" section at the end of the file and add estimates to the bullet list.

Add after the existing bullet points:

```markdown
- Include Phase Estimates section with measurable targets
```

**Step 4: Verify the changes**

Run: `grep -A 5 "Phase Estimates" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/planner.md`
Expected: Shows the new Phase Estimates section header and table structure

**Step 5: Commit the change**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add agents/planner.md && git commit -m "feat: add Phase Estimates section to planner output format"
```

---

### Task 2: Add Metrics Collection to Phase Reviewer

**Files:**
- Modify: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/phase-reviewer.md`

**Step 1: Read the current phase reviewer**

Read `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/phase-reviewer.md` to understand current structure.

**Step 2: Add Metrics Collection as new section 4**

After the existing "### 3. Reuse + Consistency" section, add a new metrics collection section.

Find the line "### 3. Reuse + Consistency" section and add after its content (before "## Issue Severity"):

```markdown

### 4. Metrics Collection and Estimate Comparison

Collect actual metrics from the phase and compare against plan estimates.

**Step 1:** Read the Phase Estimates section from the plan file

Look for the `## Phase Estimates` section at the end of the plan. Extract:
- Expected impl lines
- Expected test lines
- Expected files touched
- Any metric-specific estimates (coverage, performance, etc.)
- Target files list
- ROI expectation

**Step 2:** Measure actual results using git

```bash
# Get the base commit (before phase work)
# This should be provided in the git range, e.g., abc123..HEAD means base is abc123

# Impl lines (excluding tests)
git diff --numstat $BASE..HEAD -- '*.rs' '*.ts' '*.py' '*.go' '*.js' | \
  grep -v -E '(_test\.|\.test\.|/tests/)' | \
  awk '{added+=$1; deleted+=$2} END {print "+"added" -"deleted}'

# Test lines
git diff --numstat $BASE..HEAD -- '*_test.*' '*.test.*' '**/tests/**' '**/test_*' | \
  awk '{added+=$1; deleted+=$2} END {print "+"added" -"deleted}'

# Files touched
git diff --name-only $BASE..HEAD | wc -l

# For coverage (if applicable) - run project's coverage command
# For performance (if applicable) - run project's benchmark command
```

**Step 3:** Calculate drift percentage

```
drift_pct = abs(actual - expected) / expected * 100
```

**Step 4:** Determine severity based on drift

| Drift | Severity |
|-------|----------|
| < 30% | Pass |
| 30-50% | Warning |
| > 50% | Stop |

**Step 5:** Check ROI for test work

If this is test-related work and ROI expectation was specified:
```
actual_roi = coverage_lines_added / test_lines_added
```

| ROI | Severity |
|-----|----------|
| >= ROI expectation | Pass |
| 50-100% of expectation | Warning |
| < 50% of expectation | Stop (low-value test work) |

**Flag:** Work that adds many lines but achieves little measurable outcome.
```

**Step 3: Update the Report Format section**

Find the "## Report Format" section and update it to include metrics.

Replace the existing Report Format section with:

```markdown
## Report Format

```markdown
## Phase Review: Phase N

### Pattern Conformance
- [Pattern]: ✅ Followed / ❌ Violated

**Violations:**
1. **[Severity]** `file:line` - [what's wrong] - Fix: [how]

### Integration Verification
**Flow traced:** Entry → ... → Output

**Issues:**
1. **[Severity]** `file:line` - [what's disconnected] - Fix: [how to connect]

### Reuse + Consistency
**Issues:**
1. **[Severity]** `file:line` - [what's wrong] - Fix: [what to use instead]

### Metrics

| Metric | Expected | Actual | Drift |
|--------|----------|--------|-------|
| Impl lines | ~150 | +142 | 5% ✅ |
| Test lines | ~200 | +89 | 55% ❌ |
| Files touched | 5-7 | 4 | 20% ✅ |
| [Custom metric] | [expected] | [actual] | [drift] |

**ROI:** [actual ratio] vs [expected] - ✅ Pass / ⚠️ Warning / ❌ Stop

**Target files verification:**
- ✅ `src/expected/file.rs` - touched as planned
- ❌ `src/other/file.rs` - touched but NOT in plan
- ⚠️ `src/planned/file.rs` - in plan but NOT touched

### Summary
**Status:** Pass / Warning / Stop
**Severity tier:** Based on worst issue across all sections
**Issues:** Critical: N, Important: N, Minor: N, Metric drift: [worst %]

**Recommendation:**
- **Pass:** Continue to next phase
- **Warning:** Review metrics before proceeding, consider replanning remaining phases
- **Stop:** Halt execution, surface to user with full context
```
```

**Step 4: Update the Issue Severity section**

Find the "## Issue Severity" section and expand it to include metrics-based severity.

Replace with:

```markdown
## Issue Severity

### Code Issues
- **Critical:** Won't work at runtime (dead code, not integrated)
- **Important:** Pattern violations, missed reuse
- **Minor:** Style inconsistencies, readability

### Metric Issues
- **Stop:** >50% drift from estimates, or ROI < 50% of expectation
- **Warning:** 30-50% drift, or ROI 50-100% of expectation
- **Pass:** <30% drift, ROI meets expectation

**Final severity** is the WORST of code issues and metric issues.

**ALL code issues must be fixed.** Metric issues inform the orchestrator's decision to continue, reassess, or halt.
```

**Step 5: Update Critical Rules**

Find the "## Critical Rules" section and add metrics-related rules.

Add to the "DO:" list:

```markdown
- Read Phase Estimates section from plan file
- Run measurement commands to get actual metrics
- Calculate drift percentage for each metric
- Include metrics table in report
- Output clear severity tier recommendation
```

Add to the "DON'T:" list:

```markdown
- Skip metrics collection even if estimates are missing (report "no estimates provided")
- Approve with Stop-level metric drift
- Ignore ROI for test-heavy work
```

**Step 6: Verify changes**

Run: `grep -c "Metrics" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/phase-reviewer.md`
Expected: At least 5 occurrences

**Step 7: Commit the change**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add agents/phase-reviewer.md && git commit -m "feat: add metrics collection and estimate comparison to phase reviewer"
```

---

### Task 3: Add Severity-Based Feedback Loop to Orchestrator

**Files:**
- Modify: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`

**Step 1: Read the current orchestrator skill**

Read `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md` to understand current structure.

**Step 2: Add Phase Reviewer Integration section**

Find the section "### Step 3: Phase Loop" and locate subsection "**3e. Monitor Phase Status (Background)**". After the signal handling section for `phase_complete`, add phase reviewer consumption logic.

Add a new subsection "**3e-2. Consume Phase Reviewer Output**" after the existing 3e section:

```markdown

**3e-2. Consume Phase Reviewer Output**

When phase completes, the executing-plans skill dispatches the phase reviewer. The phase reviewer writes its report to `.tina/phase-N/review.md` and outputs a severity tier.

**Read phase reviewer output:**

```bash
REVIEW_FILE="$WORKTREE_PATH/.tina/phase-$PHASE_NUM/review.md"

# Wait for review file (max 5 minutes)
TIMEOUT=300
START=$(date +%s)
while [ ! -f "$REVIEW_FILE" ]; do
  ELAPSED=$(($(date +%s) - START))
  if [ "$ELAPSED" -gt "$TIMEOUT" ]; then
    echo "Phase reviewer timeout - escalating"
    exit 1
  fi
  sleep 5
done

# Extract severity from review
SEVERITY=$(grep -E "^\*\*Status:\*\*" "$REVIEW_FILE" | sed 's/.*\*\*Status:\*\* //' | tr '[:upper:]' '[:lower:]')
METRIC_DRIFT=$(grep -E "^\*\*Severity tier:\*\*" "$REVIEW_FILE" | sed 's/.*drift: //' | sed 's/%.*//')
```

**Handle severity:**

```bash
case "$SEVERITY" in
  "pass")
    echo "Phase $PHASE_NUM passed review"
    # Update cumulative metrics
    tina_update_cumulative_metrics "$PHASE_NUM" "$REVIEW_FILE"
    # Proceed to next phase (existing flow)
    ;;

  "warning")
    echo "Phase $PHASE_NUM passed with warnings"
    # Update cumulative metrics
    tina_update_cumulative_metrics "$PHASE_NUM" "$REVIEW_FILE"

    # Check cumulative drift
    CUMULATIVE_DRIFT=$(tina_get_cumulative_drift)
    if [ "$CUMULATIVE_DRIFT" -gt 50 ]; then
      echo "Cumulative drift exceeds 50% - triggering reassessment"
      tina_trigger_reassessment "$PHASE_NUM"
    else
      echo "Cumulative drift at ${CUMULATIVE_DRIFT}% - proceeding with caution"
      # Proceed to next phase
    fi
    ;;

  "stop")
    echo "Phase $PHASE_NUM failed review - halting"
    # Surface to user with full context
    cat << EOF
=== PHASE REVIEW FAILED ===
Phase: $PHASE_NUM
Severity: STOP

Review summary:
$(cat "$REVIEW_FILE")

Action required: Manual intervention needed before continuing.
Options:
1. Fix issues and re-run phase
2. Adjust estimates in remaining phases
3. Abort orchestration
EOF
    exit 1
    ;;

  *)
    echo "Unknown severity: $SEVERITY - treating as warning"
    # Fall through to warning handling
    ;;
esac
```
```

**Step 3: Add cumulative tracking utilities**

Find the "## State Files" section and add cumulative metrics tracking.

Add a new state file description after the existing ones:

```markdown

**Cumulative metrics:** `.tina/cumulative-metrics.json`
```json
{
  "phases_completed": 3,
  "total_impl_lines": 450,
  "total_test_lines": 380,
  "total_expected_impl": 500,
  "total_expected_test": 600,
  "cumulative_impl_drift_pct": 10,
  "cumulative_test_drift_pct": 37,
  "phase_metrics": {
    "1": {"impl": 150, "test": 200, "drift": 5},
    "2": {"impl": 180, "test": 100, "drift": 25},
    "3": {"impl": 120, "test": 80, "drift": 45}
  }
}
```
```

**Step 4: Add reassessment handling**

Find the "### Blocked State Handling" section. Before it, add a new "### Reassessment Handling" section:

```markdown

### Reassessment Handling

When cumulative drift exceeds threshold or a phase returns Warning status, the orchestrator can trigger reassessment.

**Reassessment options:**

1. **Continue with caution** - Log warning, proceed to next phase
2. **Replan remaining phases** - Spawn planner with updated context
3. **Escalate to human** - Pause and wait for user decision

**Reassessment logic:**

```bash
tina_trigger_reassessment() {
  local phase_num="$1"
  local cumulative_drift=$(tina_get_cumulative_drift)
  local remaining_phases=$((TOTAL_PHASES - phase_num))

  echo "=== REASSESSMENT TRIGGERED ==="
  echo "Completed: $phase_num / $TOTAL_PHASES phases"
  echo "Cumulative drift: ${cumulative_drift}%"
  echo "Remaining phases: $remaining_phases"

  # Read cumulative metrics
  cat "$WORKTREE_PATH/.tina/cumulative-metrics.json" | jq '.'

  # Decision tree
  if [ "$cumulative_drift" -gt 75 ]; then
    echo "DECISION: Escalate to human (drift too high)"
    echo "Recommendation: Consider aborting or major replanning"
    exit 1
  elif [ "$remaining_phases" -le 1 ]; then
    echo "DECISION: Continue (only 1 phase remaining)"
    echo "Warning: Final phase may not achieve goal"
    # Proceed
  else
    echo "DECISION: Replan remaining phases"
    # Spawn planner with cumulative context
    # Planner receives actual metrics to adjust remaining estimates
    tina_replan_remaining "$phase_num"
  fi
}

tina_replan_remaining() {
  local completed_phase="$1"
  local next_phase=$((completed_phase + 1))

  echo "Spawning planner with updated context for phase $next_phase"

  # The planner receives cumulative metrics so it can adjust estimates
  # This is done by including the metrics file path in the planner prompt
  # Planner prompt includes:
  # - Original design doc
  # - Phase number to plan
  # - Cumulative metrics file path (for context on what's been achieved)
}
```
```

**Step 5: Add cumulative metrics helper functions reference**

Find the "## Integration" section and add reference to metrics tracking:

```markdown

**Metrics tracking:**
- Phase reviewer writes `.tina/phase-N/review.md` with severity and metrics
- Orchestrator updates `.tina/cumulative-metrics.json` after each phase
- Cumulative drift calculated as average of per-phase drifts
- Threshold: 50% cumulative drift triggers reassessment
```

**Step 6: Verify changes**

Run: `grep -c "cumulative" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: At least 5 occurrences

Run: `grep -c "severity" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: At least 3 occurrences

**Step 7: Commit the change**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add skills/orchestrate/SKILL.md && git commit -m "feat: add severity-based feedback loop to orchestrator"
```

---

### Task 4: Update Executing-Plans to Write Phase Review File

**Files:**
- Modify: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/executing-plans/SKILL.md`

**Step 1: Read current executing-plans skill**

Read `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/executing-plans/SKILL.md` to understand how phase reviewer is invoked.

**Step 2: Add review file output instruction**

Find the "## Phase Review" section near the end of the file. Update the phase reviewer invocation to specify output file.

Replace the existing phase reviewer Task tool example with:

```markdown
After all tasks in a phase complete, dispatch the phase-reviewer:

```
Task tool:
  subagent_type: tina:phase-reviewer
  prompt: |
    Design doc: docs/plans/2026-01-26-feature-design.md
    Plan file: docs/plans/2026-01-26-feature-phase-1.md
    Phase completed: 1
    Git range: abc1234..def5678
    Output file: .tina/phase-1/review.md

    Write your review to the output file. Include metrics comparison and severity tier.
```

Phase reviewer checks:
1. **Pattern conformance** - Code follows Architectural Context patterns
2. **Integration** - Data flow traced from entry to output
3. **Reuse** - Existing utilities used, no duplication
4. **Metrics** - Actual vs expected, drift calculation, severity tier

**If issues found:** Dispatch implementer to fix, then re-dispatch phase-reviewer.

**If approved with Warning:** Log metrics, orchestrator may trigger reassessment.

**If approved with Pass:** Orchestrator proceeds to next phase.

**If Stop:** Orchestrator halts and surfaces issue to user.
```

**Step 3: Update the process diagram**

Find the process diagram in the "## The Process" section. Update the phase reviewer node to show severity output.

In the existing `digraph process`, find the line:
```
"Dispatch phase-reviewer (tina:phase-reviewer)" [shape=box];
```

And update the surrounding flow to include severity handling:

```markdown
    "Phase reviewer outputs severity?" [shape=diamond];
    "Handle Pass - continue" [shape=box];
    "Handle Warning - log, maybe reassess" [shape=box];
    "Handle Stop - halt execution" [shape=box style=filled fillcolor=lightcoral];
```

Add edges:
```markdown
    "Phase reviewer approves?" -> "Phase reviewer outputs severity?" [label="yes"];
    "Phase reviewer outputs severity?" -> "Handle Pass - continue" [label="pass"];
    "Phase reviewer outputs severity?" -> "Handle Warning - log, maybe reassess" [label="warning"];
    "Phase reviewer outputs severity?" -> "Handle Stop - halt execution" [label="stop"];
    "Handle Pass - continue" -> "More phases?";
    "Handle Warning - log, maybe reassess" -> "More phases?";
```

**Step 4: Add plan file to phase reviewer prompt**

The phase reviewer needs the plan file to read the Phase Estimates section. Update the prompt in the Phase Review section.

The key change is adding `Plan file:` to the prompt, which is already shown in Step 2.

**Step 5: Verify changes**

Run: `grep "Output file" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/executing-plans/SKILL.md`
Expected: Shows the new output file parameter

Run: `grep "severity" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/executing-plans/SKILL.md`
Expected: Shows severity-related content

**Step 6: Commit the change**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add skills/executing-plans/SKILL.md && git commit -m "feat: update executing-plans to write phase review file with severity"
```

---

### Task 5: Add Review Output to Phase Reviewer Input Section

**Files:**
- Modify: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/phase-reviewer.md`

**Step 1: Read current phase reviewer input section**

Read `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/phase-reviewer.md` and find the "## Input" section.

**Step 2: Update input to include plan file and output file**

Find the "## Input" section and update it:

```markdown
## Input

You receive:
- Design document path (has Architectural Context section from architect)
- Plan file path (has Phase Estimates section with expected metrics)
- Phase number completed
- Git range (base..HEAD) for the phase
- Output file path (where to write the review)

## Output

Write your review to the specified output file. The review MUST include:
1. All sections (Pattern Conformance, Integration, Reuse, Metrics)
2. A clear **Status:** line with exactly one of: Pass, Warning, Stop
3. A **Severity tier:** line explaining the basis for the status
4. A **Recommendation:** explaining what should happen next
```

**Step 3: Verify changes**

Run: `grep "Plan file" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/phase-reviewer.md`
Expected: Shows the plan file in input section

Run: `grep "Output file" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/phase-reviewer.md`
Expected: Shows the output file parameter

**Step 4: Commit the change**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add agents/phase-reviewer.md && git commit -m "feat: add plan file and output file to phase reviewer inputs"
```

---

### Task 6: Add Cumulative Metrics Initialization to Orchestrator

**Files:**
- Modify: `/Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`

**Step 1: Read orchestrator state initialization**

Read the orchestrator skill and find "### Step 2: Initialize or Resume State".

**Step 2: Add cumulative metrics initialization**

After the supervisor-state.json initialization, add cumulative metrics initialization:

Find the `cat > .tina/supervisor-state.json` block and add after its `fi`:

```markdown

# Initialize cumulative metrics tracking
if [ ! -f ".tina/cumulative-metrics.json" ]; then
  cat > .tina/cumulative-metrics.json << EOF
{
  "phases_completed": 0,
  "total_impl_lines": 0,
  "total_test_lines": 0,
  "total_expected_impl": 0,
  "total_expected_test": 0,
  "cumulative_impl_drift_pct": 0,
  "cumulative_test_drift_pct": 0,
  "phase_metrics": {}
}
EOF
fi
```

**Step 3: Add helper function for updating cumulative metrics**

Add after the reassessment handling section:

```markdown

### Cumulative Metrics Helpers

**Update cumulative metrics after phase completion:**

```bash
tina_update_cumulative_metrics() {
  local phase_num="$1"
  local review_file="$2"
  local metrics_file="$WORKTREE_PATH/.tina/cumulative-metrics.json"

  # Extract metrics from review file
  # The review file has a metrics table we need to parse
  local impl_actual=$(grep "Impl lines" "$review_file" | sed 's/.*| +\([0-9]*\).*/\1/' | head -1)
  local test_actual=$(grep "Test lines" "$review_file" | sed 's/.*| +\([0-9]*\).*/\1/' | head -1)
  local impl_expected=$(grep "Impl lines" "$review_file" | sed 's/.*| ~\([0-9]*\).*/\1/' | head -1)
  local test_expected=$(grep "Test lines" "$review_file" | sed 's/.*| ~\([0-9]*\).*/\1/' | head -1)
  local drift=$(grep "Metric drift:" "$review_file" | sed 's/.*drift: \([0-9]*\)%.*/\1/' | head -1)

  # Default to 0 if parsing fails
  impl_actual=${impl_actual:-0}
  test_actual=${test_actual:-0}
  impl_expected=${impl_expected:-0}
  test_expected=${test_expected:-0}
  drift=${drift:-0}

  # Update cumulative metrics
  local tmp_file=$(mktemp)
  jq --arg phase "$phase_num" \
     --argjson impl "$impl_actual" \
     --argjson test "$test_actual" \
     --argjson exp_impl "$impl_expected" \
     --argjson exp_test "$test_expected" \
     --argjson drift "$drift" '
    .phases_completed += 1 |
    .total_impl_lines += $impl |
    .total_test_lines += $test |
    .total_expected_impl += $exp_impl |
    .total_expected_test += $exp_test |
    .phase_metrics[$phase] = {impl: $impl, test: $test, drift: $drift} |
    .cumulative_impl_drift_pct = (if .total_expected_impl > 0 then (((.total_expected_impl - .total_impl_lines) | fabs) / .total_expected_impl * 100 | floor) else 0 end) |
    .cumulative_test_drift_pct = (if .total_expected_test > 0 then (((.total_expected_test - .total_test_lines) | fabs) / .total_expected_test * 100 | floor) else 0 end)
  ' "$metrics_file" > "$tmp_file" && mv "$tmp_file" "$metrics_file"
}

tina_get_cumulative_drift() {
  local metrics_file="$WORKTREE_PATH/.tina/cumulative-metrics.json"
  local impl_drift=$(jq -r '.cumulative_impl_drift_pct // 0' "$metrics_file")
  local test_drift=$(jq -r '.cumulative_test_drift_pct // 0' "$metrics_file")

  # Return the worse of the two
  if [ "$impl_drift" -gt "$test_drift" ]; then
    echo "$impl_drift"
  else
    echo "$test_drift"
  fi
}
```
```

**Step 4: Verify changes**

Run: `grep "tina_update_cumulative_metrics" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: Shows the helper function definition

Run: `grep "cumulative-metrics.json" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: Multiple occurrences showing initialization and usage

**Step 5: Commit the change**

```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git add skills/orchestrate/SKILL.md && git commit -m "feat: add cumulative metrics tracking to orchestrator"
```

---

### Task 7: Final Verification and Phase Completion

**Step 1: Verify all modified files**

Run:
```bash
cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && ls -la agents/planner.md agents/phase-reviewer.md skills/orchestrate/SKILL.md skills/executing-plans/SKILL.md
```

Expected: All four files exist with recent modification times

**Step 2: Verify key content in planner**

Run: `grep -c "Phase Estimates" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/planner.md`
Expected: At least 2 occurrences

**Step 3: Verify key content in phase reviewer**

Run: `grep -c "Metrics" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/phase-reviewer.md`
Expected: At least 5 occurrences

Run: `grep -c "severity" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/agents/phase-reviewer.md`
Expected: At least 3 occurrences

**Step 4: Verify key content in orchestrator**

Run: `grep -c "cumulative" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: At least 10 occurrences

Run: `grep -c "Warning\|Stop\|Pass" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/orchestrate/SKILL.md`
Expected: At least 6 occurrences

**Step 5: Verify key content in executing-plans**

Run: `grep "Output file" /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation/skills/executing-plans/SKILL.md`
Expected: Shows the output file parameter in phase reviewer prompt

**Step 6: Verify git history**

Run: `cd /Users/joshua/Projects/supersonic/.worktrees/orchestration-validation && git log --oneline -10`

Expected commits (most recent first):
- feat: add cumulative metrics tracking to orchestrator
- feat: add plan file and output file to phase reviewer inputs
- feat: update executing-plans to write phase review file with severity
- feat: add severity-based feedback loop to orchestrator
- feat: add metrics collection and estimate comparison to phase reviewer
- feat: add Phase Estimates section to planner output format

**Step 7: Report completion**

```
Phase 1 complete!

Files modified:
- agents/planner.md - Added Phase Estimates section to output format
- agents/phase-reviewer.md - Added metrics collection, estimate comparison, severity tiers
- skills/orchestrate/SKILL.md - Added severity-based feedback loop, cumulative tracking
- skills/executing-plans/SKILL.md - Updated phase reviewer invocation with output file

Key capabilities added:
1. Planner now outputs measurable estimates per phase
2. Phase reviewer collects actual metrics and compares to estimates
3. Phase reviewer outputs severity tier (Pass/Warning/Stop)
4. Orchestrator consumes severity and responds appropriately
5. Cumulative metrics tracked across phases
6. Reassessment triggered when cumulative drift exceeds threshold

Next phase: Phase 2 - Design Validator (catches fundamentally flawed projects before they start)
```

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~200 | `git diff --stat base..HEAD -- '*.md' | tail -1` |
| Test lines added | 0 | N/A (documentation-only phase) |
| Files touched | 4 | `git diff --name-only base..HEAD | wc -l` |

**Target files:**
- `agents/planner.md` - Add Phase Estimates section
- `agents/phase-reviewer.md` - Add metrics collection and severity output
- `skills/orchestrate/SKILL.md` - Add severity consumption and cumulative tracking
- `skills/executing-plans/SKILL.md` - Update phase reviewer invocation

**ROI expectation:** N/A (infrastructure/documentation work, ROI measured by subsequent phases using these capabilities)
