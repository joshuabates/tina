# Review Detector and Architect Guardrails Design

## Overview

This design adds per-run review policy controls to orchestration state and upgrades existing review agents to block codebase drift earlier. It does not introduce a new review system. Instead, it strengthens current implementer/spec/quality/phase review loops with explicit detector gates and architect consultation rules.

## Decisions

- Policy is per-run and stored in Convex-backed supervisor state.
- Detector findings are hard-blocking by default.
- Architect consultation mode is `manual_plus_auto` (ask when uncertain, auto-trigger for high-risk changes).
- Detector scope defaults to `whole_repo_pattern_index`.
- Test cheating enforcement defaults to `strict_baseline`.
- Overrides are rare fallback only after fix attempts.
- Enforcement runs at both task and phase levels.

## Review Policy Model

Added `review_policy` to supervisor state with fields:

- `hard_block_detectors`
- `enforcement` (`task_and_phase|task_only|phase_only`)
- `detector_scope` (`whole_repo_pattern_index|touched_area_only|architectural_allowlist_only`)
- `architect_mode` (`manual_only|manual_plus_auto|disabled`)
- `test_integrity_profile` (`strict_baseline|max_strict|minimal`)
- `allow_rare_override`
- `require_fix_first`

`review_policy` is persisted in Convex via `supervisorStates.stateJson`, and mirrored to `<worktree>/.claude/tina/supervisor-state.json` for teammate/runtime access.

## Runtime Flow

1. `tina-session init` creates state with default review policy.
2. Per-run flags on `init` can override policy fields.
3. Implementer and reviewer agents load `review_policy` before work.
4. Task-level reviewers run detector gates:
   - `test_integrity` (spec reviewer)
   - `reuse_drift`, `architecture_drift` (quality reviewer)
5. Phase reviewer reruns detector gates at phase scope.
6. Failures are fix-first loops; rare overrides require explicit reason.

## Detector Definitions

- `test_integrity`: no focused/skipped tests, no assertion-free tests, no mocking the unit under test, no assertionless snapshot churn.
- `reuse_drift`: fail on avoidable duplication where reusable code exists.
- `architecture_drift`: fail on one-off architecture when established patterns/interfaces exist.

## Whole-Repo Pattern Index

Added utility:

- `scripts/build-pattern-index.sh`

This generates a lightweight repository pattern index and is referenced by reviewers when `detector_scope = whole_repo_pattern_index`.

## Why This Is Low Ceremony

- No parallel governance path.
- No new orchestration role required.
- Existing task and phase review loops remain unchanged structurally.
- Changes are policy-driven and tunable per run.

## Next Steps

- Add explicit review policy context propagation in orchestration/team spawn prompts.
- Persist detector outcomes and override reasons as structured orchestration events.
- Add harness scenarios that assert detector-driven remediation behavior.
