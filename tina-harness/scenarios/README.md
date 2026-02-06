# Scenarios

Test scenarios for tina-harness orchestration testing.

## Structure

Each scenario is a directory containing:

- `design.md` - Design document passed to orchestration
- `expected.json` - Expected assertions about the outcome
- `setup.patch` (optional) - Patch applied to test-project before orchestration

## Running Scenarios

From the project root with mise:

```bash
mise run harness:run 01-single-phase-feature
mise run harness:run 01-single-phase-feature -- --full
```

Or directly:

```bash
tina-harness run 01-single-phase-feature \
  --scenarios-dir tina-harness/scenarios \
  --test-project-dir tina-harness/test-project

# Run with full orchestration (not just mock)
tina-harness run 01-single-phase-feature --full

# Force re-run even if baseline exists
tina-harness run 01-single-phase-feature --force-baseline
```

## Adding New Scenarios

1. Create a new numbered directory (e.g., `04-my-scenario/`)
2. Write `design.md` with clear phase descriptions
3. Create `expected.json` with assertions
4. Optionally add `setup.patch` if test-project needs modification

## Scenario Numbering

- `01-09`: Basic single-phase scenarios
- `10-19`: Multi-phase scenarios
- `20-29`: Failure/recovery scenarios
- `30+`: Advanced/edge case scenarios
