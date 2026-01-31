# tina-monitor Orchestration Post-Mortem

**Date:** 2026-01-30
**Project:** tina-monitor TUI
**Outcome:** Functional failure despite passing all reviews

## Executive Summary

The tina-monitor orchestration executed 7 main phases plus 2 remediation phases (5.5, 7.5), producing 12,363 lines of Rust code with 300+ tests. All phases passed review. The resulting tool does not work - it cannot discover orchestrations, displays stale/wrong data, and core features are non-functional.

## What Was Built

A terminal-based TUI for monitoring Tina orchestrations with:
- Task progress display
- Team member views
- Context usage tracking
- Git commit/diff views
- Live log streaming
- Terminal integration (kitty, attach to tmux)

## What Actually Works

- Compiles without errors
- All unit tests pass
- TUI renders (with mock data)
- Basic keyboard navigation

## What Does Not Work

| Feature | Issue |
|---------|-------|
| Orchestration discovery | No data source - `supervisor-state.json` never created |
| Team members | Empty - team config loading broken |
| Current phase | Wrong - displays stale data |
| Task selection | No visual indicator of selected task |
| Commits view | Non-functional |
| Logs view | Empty |
| Context display | Hardcoded values |

## Root Cause Analysis

### 1. Missing Data Contract

The design specified that tina-monitor would read `supervisor-state.json` to discover orchestrations. **The orchestrate skill never creates this file.** Phase 2 "Skill Integration" was supposed to implement this but never did.

The tool was built against a data source that doesn't exist.

### 2. Mock-Only Testing

All 300+ tests use mocked data. Zero integration tests verify:
- Real file system discovery
- Actual team config parsing
- Live git operations
- Real orchestration detection

Tests passed because they tested the code against fake data that was structured correctly. The real world doesn't match the mocks.

### 3. Review Theater

9 phase reviewers (spec-reviewer + code-quality-reviewer per phase) approved all work. None verified:
- End-to-end functionality
- Integration with real orchestrations
- Actual data flow

Reviews checked "does code exist" not "does code work."

### 4. Planner Model Specification Failure

The team-lead-init skill requires planners to specify `**Model:** <haiku|sonnet|opus>` for each task. This enables cost-optimized model allocation for workers.

**Only 1 of 9 planners followed this specification:**

| Phase | Model Specs in Plan |
|-------|---------------------|
| Phase 1 | None |
| Phase 2 | 7 sonnet, 2 haiku |
| Phase 3 | None |
| Phase 4 | None |
| Phase 5 | None |
| Phase 5.5 | None |
| Phase 6 | None |
| Phase 7 | None |
| Phase 7.5 | None |

When Phase 2's planner DID include specs, it correctly allocated:
- Sonnet for complex tasks (7 tasks)
- Haiku for simple tasks (2 tasks)

All other phases had no model guidance, leaving worker allocation undefined.

### 5. Phase Team Model Distribution

From surviving phase team configs:

| Team | Agent | Model |
|------|-------|-------|
| **phase-5-execution** | team-lead | opus |
| | worker-1 | haiku |
| | worker-2 | sonnet |
| **phase-5.5-execution** | team-lead | sonnet |
| | worker | sonnet |
| **phase-6-execution** | team-lead | sonnet |
| | worker | sonnet |

Workers DID use cheaper models (haiku/sonnet) when spawned, but without plan specifications, the allocation was ad-hoc rather than task-appropriate.

### 6. Orchestrator-Level Model Waste

All 26 orchestrator-level agents used Opus 4.5:

| Role | Count | Model |
|------|-------|-------|
| Validators | 1 | Opus |
| Worktree setup | 1 | Opus |
| Team lead | 1 | Opus |
| Planners | 9 | Opus |
| Executors | 10 | Opus |
| Reviewers | 9 | Opus |

Tasks like validation, worktree setup, and status monitoring could have used Haiku or Sonnet, saving significant cost.

## Systemic Failures

### The Feedback Loop Was Broken

```
Design Doc -> Planner -> Executor -> Reviewer -> Next Phase
                                        |
                              (No integration testing)
                              (No real-world verification)
                              (Approval based on code existence)
```

Each phase "passed" because:
1. Code was written
2. Unit tests passed (against mocks)
3. Reviewer saw code existed

No one verified the tool actually worked.

### Phase 2 Scope Mismatch

Phase 2 "Skill Integration" should have:
1. Modified orchestrate skill to emit `supervisor-state.json`
2. Verified tina-monitor could read real orchestration data
3. Tested discovery against actual running orchestrations

Instead it:
1. Wrote code to READ a file that nothing creates
2. Tested with mock data
3. Passed review

### Over-Engineering

12,363 lines of Rust for a monitoring TUI that doesn't work:
- `app.rs`: 3,185 lines - complex state machine
- Elaborate error handling for paths that can't be reached
- Multiple abstraction layers
- Comprehensive type system for data that doesn't exist

## Recommendations

### Immediate Fixes Required

1. **Orchestrate skill must create `supervisor-state.json`**
   - Write on orchestration start
   - Update current_phase as phases complete
   - Include plan_paths, worktree_path, team info

2. **Integration test against real orchestration**
   - Start an orchestration
   - Verify tina-monitor discovers it
   - Verify all data displays correctly

3. **Fix team member loading**
   - Debug why Team section is empty
   - Verify config.json path resolution

### Process Changes

1. **Require integration tests for tools**
   - Mock tests are necessary but not sufficient
   - Each phase must include real-world verification

2. **Reviewer checklist must include functionality**
   - "Does the feature work end-to-end?"
   - Not just "does code exist?"

3. **Enforce planner model specifications**
   - Reject plans without `**Model:**` tags
   - Planner skill must mandate this output

4. **Cost-optimize orchestrator models**
   - Validators: Haiku
   - Worktree setup: Haiku
   - Status monitoring: Sonnet
   - Reserve Opus for planning and complex execution

5. **Dog-food during development**
   - Run tina-monitor against its own orchestration
   - Catch "fake" implementations immediately

## Lessons Learned

1. **Passing tests != working software** - Mocks can hide fundamental integration failures
2. **Code review != functionality review** - Reviewers approved non-functional code
3. **Phased execution != incremental verification** - Each phase was isolated, no cross-phase validation
4. **Model specifications matter** - Without them, cost optimization is impossible
5. **Data contracts must be bidirectional** - Building a reader without a writer is pointless

## Conclusion

The orchestration successfully coordinated 26+ agents across 9 phases to produce a comprehensive, well-tested, thoroughly-reviewed tool that fundamentally does not work. The failure was systemic - no single phase or agent is solely responsible. The entire pipeline lacked real-world verification.

The tool needs to be rebuilt with integration testing from Phase 1, and the orchestrate skill needs to create the data tina-monitor expects to read.
