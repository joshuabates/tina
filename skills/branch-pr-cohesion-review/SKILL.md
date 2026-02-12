---
name: branch-pr-cohesion-review
description: Review feature branches and pull requests for architectural cohesion, drift from agreed design, and high-impact risks. Use when evaluating large or multi-phase initiatives, pre-merge quality gates, cross-cutting refactors, or when a branch may have diverged from plans and contracts.
---

# Branch/PR Cohesion Review

## Overview

Evaluate branches and pull requests with emphasis on architecture integrity rather than style nits.
Prioritize code drift, boundary erosion, contract breaks, and major delivery risk in multi-phase projects.

## Review Contract

- Optimize for major issues; skip low-value nits unless they indicate a systemic problem.
- Anchor findings to intended architecture (plans, ADRs, module boundaries, and prior phase contracts).
- Provide evidence for every finding with concrete files and impact.
- Separate confirmed defects from uncertainties that require follow-up.

## Required Inputs

1. Target branch or PR and base branch.
2. Intended design artifacts (plan docs, architecture notes, ADRs, or prior phase specs).
3. Risk context (upcoming phases, migrations, deadlines).

If any input is missing, state assumptions explicitly before reviewing.

## Workflow

### 1. Establish Baseline

- Compute baseline with `git merge-base <base> HEAD`.
- Summarize intended scope for the current phase in 3-6 bullets.
- List non-negotiable constraints:
  - architectural boundaries and dependency direction
  - API/data contracts and migration expectations
  - reliability, security, and operability requirements

### 2. Map Change Surface

- Inspect scope with:
  - `git diff --name-status <base>...HEAD`
  - `git diff --stat <base>...HEAD`
- Cluster files by architecture area (domain, app/service, infra, UI, tests, tooling).
- Mark hotspots:
  - high-churn files touched repeatedly
  - cross-layer edits bundled together
  - behavior changes without corresponding tests or migration notes

### 3. Run Cohesion Checks

Validate each area against these checks:

1. Architecture alignment:
- Preserve dependency direction.
- Avoid new circular dependencies and hidden coupling.
- Strengthen shared abstractions instead of bypassing them.

2. Phase integrity:
- Keep changes in current phase scope.
- Keep deferred work explicit and bounded.
- Attach removal path/owner to temporary shims.

3. Contract safety:
- Maintain backwards compatibility or document migration.
- Preserve error-handling and observability conventions.
- Keep domain semantics (IDs, state transitions, timestamps) consistent.

4. Test and operability coverage:
- Cover critical behavior changes with focused tests.
- Keep monitoring, alerting, and rollback/flag posture clear for risky changes.

### 4. Rank Findings by Impact

Use these levels:
1. Critical: merge-blocking correctness, reliability, or security risk.
2. High: architecture drift likely to compound in future phases.
3. Medium: meaningful maintainability risk that should be fixed soon.
4. Low: minor cleanup or style.

Default output emphasizes Critical and High findings. Include Medium only when compounding risk exists. Omit Low unless asked.

### 5. Deliver Decision-Oriented Output

Always provide:
- Verdict: `approve`, `approve-with-followups`, or `request-changes`.
- Top findings ordered by impact:
  - what drift/risk exists
  - why it matters now (phase impact)
  - evidence (`path:line`, diff context, or failing scenario)
  - concrete fix direction
- Drift status for architecture, contracts, and coverage.
- Required gates before next phase.

## Output Template

Use this format for large reviews:

```markdown
## Branch/PR Cohesion Review

Base: <base> | Head: <head> | Scope: <phase/epic>

### Verdict
<approve | approve-with-followups | request-changes>

### Critical / High Findings
1. <title>
   - Impact: <why this threatens cohesion or delivery>
   - Evidence: <file:line, commit, scenario>
   - Recommendation: <specific fix>

### Drift Summary
- Architecture boundaries: <healthy | drifting> - <notes>
- Contracts and migrations: <healthy | drifting> - <notes>
- Test and operability coverage: <healthy | drifting> - <notes>

### Phase Risk
- Next-phase blockers: <list or none>
- Safe-to-merge conditions: <required actions>
```

## Red Flags

- Treating large diffs as unreviewable and skipping architecture checks.
- Accepting shortcuts that invert dependency direction.
- Allowing silent contract changes without migration notes.
- Merging phase-spillover work that should be split.
- Reporting many minor comments while missing systemic drift.

## Handoff

Close with the top 1-3 architectural risks and required gates so future reviewers preserve continuity across phases.
