---
name: tina-orchestration-debugging
description: Diagnose Tina orchestration failures with evidence-first triage across tina-session and tina-daemon runtime state, tmux sessions, Convex control-plane/projection data, telemetry, and local Claude team/debug logs. Use when launches fail, phases stall, actions fail, commits/plans/shutdown events are missing, team status is inconsistent, or when preparing an incident-quality handoff.
---

# Tina Orchestration Debugging

## Overview

Triage Tina orchestration incidents by collecting a reproducible evidence bundle first, then narrowing to the failing boundary (control action, daemon dispatch, projection sync, or UI interpretation).
Prioritize root cause and handoff quality over quick fixes.

## Trigger Examples

Use this skill for requests like:
- "Orchestration launched but phase 2 never starts."
- "Retry/resume failed and I only see a generic error."
- "Commits exist in Convex but the orchestration view shows nothing."
- "Agent shutdowns are not reflected correctly in team status."
- "Build a debug packet for this orchestration incident."

## Required Inputs

Collect these before deep analysis:
- One identifier: `orchestrationId` or `featureName`.
- Symptom and first observed timestamp.
- Environment context (`TINA_ENV` or explicit `--env` usage if known).

If any input is missing, state assumptions explicitly and continue.

## Operational Surfaces

Use these tools directly during triage:
- `tina-session`: check daemon/config status, list orchestrations, and inspect phase sessions.
- `tina-daemon`: run foreground with explicit binary path during reproductions to avoid stale binary ambiguity.
- `tmux`: inspect running team sessions and capture pane output without interrupting workers.
- Convex telemetry: use `telemetry:listEvents` and `telemetry:listSpans` to distinguish projection lag from execution/dispatch failures.

## Workflow

### 1. Capture an Evidence Snapshot

Run the bundled script from repo root:

```bash
skills/tina-orchestration-debugging/scripts/collect_orchestration_snapshot.sh \
  --feature <feature-name>
```

Or with a known orchestration id:

```bash
skills/tina-orchestration-debugging/scripts/collect_orchestration_snapshot.sh \
  --orchestration-id <orchestration-id>
```

The script captures:
- Orchestration detail, timeline, events, tasks, commits, plans.
- Control-plane action history.
- Telemetry events/spans (unless `--skip-telemetry`).
- `tina-session`/`tmux` runtime context plus local team config and lead debug log when discoverable.

### 2. Correlate Across Three Planes

Use the snapshot and references to align:
- Control plane: action request/completion, reason-code clues, policy/action state.
- Projection plane: phases/tasks/team members/commits/plans/event projections.
- Runtime plane: local team config and lead debug log signatures.

Do not propose fixes until a failing boundary is identified.

### 3. Load the Right Deep-Dive Reference

- Read `references/triage-playbook.md` for symptom-specific investigation paths.
- Read `references/query-cookbook.md` for `tina-session`, `tina-daemon`, `tmux`, and manual Convex query commands.

### 4. Produce Root-Cause-Oriented Findings

For each candidate cause, report:
- Evidence: exact file/query output and timestamps.
- Interpretation: why this supports or weakens the hypothesis.
- Confidence: high, medium, or low.
- Next discriminating check when confidence is not high.

### 5. Deliver a Handoff-Ready Outcome

Conclude with:
- Most likely failing boundary.
- Immediate mitigation (if any) and whether it is reversible.
- Follow-up fix path (code area, tests, and verification gate).

## Guardrails

- Prefer evidence over assumptions; avoid patch-first debugging.
- Keep orchestration/task state intact while triaging unless the user explicitly asks to clean up.
- Treat missing projection data and missing UI rendering as separate hypotheses until proven linked.
- Use the same `orchestrationId` across all checks to avoid mixed-run confusion.

## Output Template

Use this format in responses:

```markdown
## Tina Orchestration Triage

### Scope
- Feature: <feature>
- Orchestration: <id>
- Symptom: <one sentence>
- First seen: <timestamp>

### Findings
1. <finding title>
   - Evidence: <query/file path>
   - Interpretation: <what it means>
   - Confidence: <high|medium|low>

### Failing Boundary
- <control plane | daemon dispatch | projection sync | UI mapping | unknown>
- Why: <concise rationale>

### Recommended Next Actions
1. <action>
2. <action>
```
