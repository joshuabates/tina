# Test Harness for tina-monitor and Orchestration

## Problem

tina-monitor has issues displaying orchestration state, but it's unclear whether the problem is:
1. tina-monitor reading state incorrectly
2. Orchestration/tina-session writing unexpected state
3. Both

Testing is difficult because there's no controlled way to run orchestrations and verify tina-monitor displays them correctly.

## Solution

Build a test harness system with three components:

1. **Shared state schema** - Formal contract between tina-session (writer) and tina-monitor (reader)
2. **`tina-harness` CLI** - Validates state, generates test state, runs orchestration scenarios
3. **`tina:test-harness` skill** - Teaches orchestration how to use the harness for self-testing

## Components

### State Schema (in tina-session)

A Rust module defining the canonical state structures that both tina-session and tina-monitor code against:

```
tina-session/src/schema/
├── mod.rs
├── supervisor_state.rs   # SupervisorState structure
├── context_metrics.rs    # ContextMetrics structure
├── team.rs               # Team configuration
├── task.rs               # Task file structure
├── phase.rs              # Phase directory layout
└── validation.rs         # Validate directory tree against schema
```

tina-monitor imports these types from tina-session, ensuring both sides use identical structures.

### tina-harness CLI

A Rust binary (in tina-monitor crate or sibling) providing:

**Validation commands:**
```bash
# Validate orchestration state against schema
tina-harness validate /path/to/worktree/.claude/tina

# Report all deviations (non-failing, for diagnosis)
tina-harness validate --report /path/to/state

# Diff actual vs expected state
tina-harness diff /path/to/actual /path/to/expected
```

**Generation commands:**
```bash
# Generate valid state for testing tina-monitor in isolation
tina-harness generate --phases 3 --current 2 --status executing --output /tmp/test-state
```

**Scenario commands:**
```bash
# Run a test scenario (fast mode by default - all haiku)
tina-harness run 01-single-phase-feature

# Run with full models (for evals)
tina-harness run scenario-name --full

# Force baseline verification
tina-harness run scenario-name --force-baseline

# Run all scenarios
tina-harness run-all --parallel 2
```

### Test Codebase

A minimal two-module Rust project for orchestration to operate on:

```
tina-harness/test-project/
├── Cargo.toml
├── src/
│   ├── main.rs       # CLI module - uses core
│   ├── lib.rs
│   └── core/         # Core module - business logic
│       ├── mod.rs
│       └── processor.rs
└── tests/
    └── integration_tests.rs
```

Design characteristics:
- Two modules with clear dependency (cli → core)
- Existing tests pass as baseline
- Small enough to understand, complex enough for multi-phase work
- Obvious extension points for scenarios

### Scenario Library

```
tina-harness/scenarios/
├── 01-single-phase-feature/
│   ├── design.md          # "Add a --verbose flag to CLI"
│   ├── expected.json      # Expected final state, assertions
│   └── last-passed.json   # Commit hash, timestamp (for skip logic)
├── 02-two-phase-refactor/
│   ├── design.md          # "Extract shared logic, update CLI"
│   └── expected.json
├── 03-failing-tests/
│   ├── design.md          # "Fix the broken edge case"
│   ├── setup.patch        # Patch to break something first
│   └── expected.json
└── 04-remediation-needed/
    ├── design.md          # Design triggering review gaps
    └── expected.json      # Expects remediation phase
```

### Scenario Generator

```bash
tina-harness generate-scenario \
  --phases 3 \
  --include-remediation \
  --failure-at-phase 2 \
  --output scenarios/generated/
```

Creates design docs from templates with parameterized complexity.

### tina:test-harness Skill

Teaches orchestration how to use the harness:

1. Select or create scenario matching the work
2. Make changes to tina-monitor, tina-session, or skills
3. Run scenario
4. Interpret failures by category:
   - `setup` → Fix test project or harness config
   - `orchestration` → Fix tina-session or skills
   - `monitor` → Fix tina-monitor
5. Add new scenario if this was a new edge case

## Failure Categories

The harness categorizes failures to pinpoint which component broke:

| Category | Meaning | Example |
|----------|---------|---------|
| `setup` | Test infrastructure problem | Test project won't compile |
| `orchestration` | State files wrong or missing | supervisor-state.json missing required field |
| `monitor` | tina-monitor misreads valid state | Shows phase 1 when state says phase 2 |
| `outcome` | Orchestration completed but wrong result | Feature not implemented correctly (for evals) |

Harness fails fast on first failure, reports category clearly.

## Efficiency

**Baseline Skip Logic:**
- Scenarios store `last-passed.json` with commit hash
- Skip baseline if no relevant files changed since last pass
- Force with `--force-baseline`

**Fast Mode (Default):**
- All orchestration agents use haiku models
- ~2-5 min per phase, minimal API cost
- Full mode (`--full`) for eval accuracy

## Success Metrics

### Phase 1 - Schema and Validation
- [ ] Move Team, Agent, Task, ContextMetrics types to tina-session
- [ ] Consolidate with existing SupervisorState, PhaseState types in tina-session
- [ ] Add validation functions to schema module
- [ ] tina-monitor depends on tina-session, imports all types (delete duplicates)
- [ ] `tina-harness validate` command works on real orchestration output
- [ ] State validation identifies any schema mismatches

### Phase 2 - Fix tina-monitor
- [ ] Run validation against real orchestration state
- [ ] Identify all discrepancies between what orchestration writes and what tina-monitor expects
- [ ] Fix tina-monitor to correctly read and display valid state
- [ ] Fix tina-session/orchestration if state is malformed
- [ ] tina-monitor displays orchestration state correctly (phases, tasks, members, context metrics)

### Phase 3 - Test Codebase and Basic Scenarios
- [ ] Two-module test project created and compiles
- [ ] 2-3 canned scenarios (single-phase, two-phase, failing-tests)
- [ ] `tina-harness run` executes scenario end-to-end in fast mode
- [ ] Failure categorization works (setup/orchestration/monitor)

### Phase 4 - Integration and Skill
- [ ] `tina:test-harness` skill documented
- [ ] Orchestration can invoke harness to test its own changes
- [ ] Baseline skip logic working
- [ ] Scenario generator for basic parameterization

### Future - Eval Foundation
- [ ] Outcome scoring beyond pass/fail
- [ ] Metrics: phases completed, remediation count, time, token usage
- [ ] Comparison across runs

## Architecture Decisions

**Schema in tina-session (not separate crate):**
tina-session is the canonical writer, so types live there. tina-monitor imports them. Avoids a new crate while ensuring shared types.

**Two-module test project (not larger):**
Minimal complexity needed for multi-phase scenarios. Can grow later if needed.

**Fail fast with categories:**
Stop on first failure but clearly identify which layer broke. More useful than collecting all failures when debugging.

**Fast mode default:**
Test runs should be cheap and fast. Full model runs reserved for evals where accuracy matters more than speed.

## Architectural Context

**Patterns to follow:**
- Fixture-based testing with FIXTURE_ROOT placeholder: `tina-monitor/tests/data_integration.rs:26-39`
- Supervisor state schema with serde derive: `tina-session/src/state/schema.rs:141-170`
- Validation tests inline with schema: `tina-session/src/state/schema.rs:214-244`

**Code to reuse:**
- `tina-session/src/state/schema.rs` - SupervisorState, PhaseState, OrchestrationStatus, PhaseStatus, TimingStats already defined
- `tina-monitor/tests/data_integration.rs:26-39` - copy_fixture_with_replacements() for fixture setup
- `tina-session/src/state/mod.rs` - exposes state module publicly via lib.rs

**Integration points:**
- tina-session exports types via `tina_session::state::schema::*`
- tina-monitor would add `tina-session = { path = "../tina-session" }` to Cargo.toml
- Existing `tina-monitor/src/data/types.rs` duplicates many types - replace with imports

**Schema consolidation (Phase 1 scope):**
- Move Team, Agent, Task, ContextMetrics from `tina-monitor/src/data/types.rs:9-58, 166-172` to tina-session
- Consolidate with `TaskFile` at `tina-session/src/watch/status.rs:248-263` (currently simplified version)
- tina-session becomes single source of truth for ALL state types
- tina-monitor imports all types from tina-session, deletes duplicates

**Anti-patterns:**
- Don't duplicate types across crates - see current state in `tina-monitor/src/data/types.rs` vs `tina-session/src/state/schema.rs`
- Don't add CLI-only dependencies to shared schema types
