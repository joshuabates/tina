# Orchestration Validation Framework

## Problem Statement

The Rust coverage project completed all 8 phases but achieved only 4% coverage gain (vs 10% goal) while adding 15,000 lines of test code. The orchestration system had no mechanism to:

1. Validate that a design could feasibly achieve its stated goal
2. Verify that plans actually targeted what the design specified
3. Measure whether phases achieved their stated estimates
4. Respond to drift during execution

This design introduces validation gates at each stage of the pipeline.

## Success Criteria

- Designs with mathematically infeasible goals are rejected before planning
- Plans that drift from design priorities are flagged before execution
- Phase completion includes actual metrics compared to estimates
- Orchestrator responds to drift (continue/replan/stop based on severity)
- Framework generalizes to any project type with measurable goals

## Design

### New Components

#### Design Validator

Runs after architect approval, before planning begins.

**Validates:**

1. **Measurable success criteria exist** - Design must specify quantifiable targets. Reject vague goals like "improve performance" without specific metrics.

2. **Feasibility sanity check** - If design includes estimates, verify they sum to the goal. Flag immediately if estimates mathematically cannot meet the goal.

3. **Baseline metrics captured** - Record current state of relevant metrics before work begins. Cannot validate improvement without knowing the starting point.

**Severity tiers:**

| Severity | Condition | Action |
|----------|-----------|--------|
| Hard stop | No measurable criteria, or estimates can't meet goal | Reject, require revision |
| Warning | Estimates tight (within 20% of goal) | Flag risk, allow proceed |
| Pass | Clear criteria, estimates exceed goal | Continue to planning |

**Output:** Validated design with explicit success criteria and baseline metrics, or rejection with specific reasons.

#### Plan Validator

Runs after planner generates phase plans, before execution begins.

**Validates:**

1. **Target alignment** - Plans touch what design specifies. Cross-reference plan targets against design priorities.

2. **Coverage of design scope** - All phases together cover full scope. Flag if design identifies 10 targets but plans only address 4.

3. **Estimate plausibility** - Per-phase estimates are mathematically reasonable. Flag claims that don't survive basic arithmetic.

4. **ROI sanity check** - For applicable work, estimate output vs effort ratio. Reject plans below threshold (e.g., < 0.3 coverage lines per test line for test work).

**Severity tiers:**

| Severity | Condition | Action |
|----------|-----------|--------|
| Hard stop | Plans don't cover scope, or estimates can't meet goal | Reject, require replanning |
| Warning | Some drift from priorities, or marginal ROI | Flag concerns, allow proceed |
| Pass | Plans align with design, estimates plausible | Continue to execution |

**Output:** Validated plans ready for execution, or rejection with specific gaps identified.

#### Phase Reviewer

Runs after each phase completes, before orchestrator proceeds to next phase.

**Validates:**

1. **Metrics collection** - Gather actual stats: lines of implementation code, lines of test code, relevant metric deltas (coverage, performance, etc.).

2. **Target verification** - Phase touched files it claimed it would. Diff actual changes against plan targets. Flag work in unexpected locations.

3. **Estimate vs actual** - Compare actual metrics to phase estimates. Calculate drift percentage.

4. **Architectural review** - Check for over-engineering, unnecessary abstractions, bloat, or pattern violations. Catches "94 lines to test 7 lines of wrapper code."

**Severity tiers:**

| Severity | Condition | Action |
|----------|-----------|--------|
| Hard stop | >50% estimate miss, or architectural violations | Halt execution, surface to user |
| Warning | 30-50% estimate miss | Reassess, consider replanning |
| Pass | <30% drift | Log metrics, continue |

**Output:** Phase report with actual metrics, drift analysis, and pass/warn/stop recommendation.

### Orchestrator Enhancements

The orchestrator consumes phase reviewer output and responds based on severity.

**On hard stop:**
- Halt execution immediately
- Surface issue to user with full context (what failed, why, expected vs actual)
- Do not proceed without human intervention

**On warning + reassess:**
- Pause before next phase
- Analyze cumulative progress (e.g., "After 4 phases, gained 2% toward 10% goal")
- Options:
  - Replan remaining phases with actual metrics fed back to planner
  - Continue with caution, flag at next checkpoint
  - Escalate to human for decision

**On continue:**
- Log metrics for cumulative tracking
- Proceed to next phase

**Cumulative tracking:**
- Maintain running totals across phases
- Individual phases passing can still trigger warning if cumulative drift exceeds threshold
- Example: 4 phases each miss by 25% = acceptable individually, but 100% cumulative miss triggers reassessment

### Changes to Existing Components

**Planner:**
- Must output estimated metrics per phase (not just task lists)
- Estimates must include: expected metric delta, files/targets affected, effort estimate

**Implementer:**
- Must report actual metrics on completion
- Output includes: lines changed (impl vs test), files touched, measured metric delta

**Design document format:**
- Must include measurable success criteria section
- Must specify how to measure baseline and progress
- Must define acceptable ROI threshold for this project type

## Full Pipeline Flow

```
1. DESIGN PHASE
   User provides goal/idea
   → Brainstorming (explore requirements)
   → Design document created
   → Architect Review (architectural soundness)
   → Design Validator (feasibility, metrics, baseline) ← NEW

2. PLANNING PHASE
   → Planner generates phase plans with estimates
   → Plan Validator (alignment, scope, ROI) ← NEW

3. EXECUTION PHASE (per phase)
   → Implementer executes phase
   → Phase Reviewer (metrics, targets, architecture) ← NEW
   → Orchestrator Decision:
       - Pass → next phase
       - Warning → reassess, possibly replan
       - Stop → halt, surface to user

4. COMPLETION
   → Final validation against original success criteria
   → Summary report with all phase metrics
```

## Generalization

The framework is metric-agnostic. Validators check that measurable criteria exist, estimates add up, and actuals match estimates. Specific metrics vary by project:

| Project Type | Baseline Metric | Phase Metrics | ROI Check |
|--------------|-----------------|---------------|-----------|
| Coverage boost | Current % | Lines covered vs test lines | Coverage per test line |
| Performance | Current latency/throughput | Measured improvement | Improvement per code change |
| Feature work | Feature count | Endpoints/components added | Scope delivered vs estimated |
| Refactoring | Complexity/coupling scores | Reduction achieved | Improvement vs churn |
| Bug fixing | Bug count | Bugs fixed, regressions | Fix rate vs code touched |

The design document specifies which metrics apply and how to measure them.

## Implementation Priority

1. **Phase Reviewer + Orchestrator feedback** - Highest immediate value, catches problems during execution
2. **Design Validator** - Catches fundamentally flawed projects before they start
3. **Plan Validator** - Catches drift between design and plans

## Open Questions

- What commands/tools measure each metric type? (coverage tools, benchmarks, etc.)
- Should cumulative drift thresholds be configurable per project?
- How does replanning work mechanically? Does planner receive the full phase history?
- Should there be a "circuit breaker" that stops after N consecutive warnings?
