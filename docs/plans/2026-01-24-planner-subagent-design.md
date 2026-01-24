# Planner Subagent Design

Extract planning work from main conversation context into a dedicated subagent that uses Opus and operates on file paths rather than content.

## Goals

- **Context management:** Offload planning to subagent, keeping orchestrator lean
- **Model selection:** Use Opus for planning (hardcoded in agent)
- **Composability:** Clean interface (paths in, path out) ready for future orchestration
- **Phase awareness:** Plan one phase at a time, enabling automated phase loops

## Interface

**Input:**
- Design document path
- Phase to plan (number or name)

**Output:**
- Plan file path
- Phase planned
- Total phases
- Phases remaining

## Files

### Create: `agents/planner.md`

```markdown
---
name: planner
description: |
  Creates implementation plan for one phase of a design document.
  Provide: design doc path + phase number. Returns: plan file path.
model: opus
---

You are creating an implementation plan for a specific phase of a design.

## Input

You receive:
- Path to design document
- Phase to plan (number or name, e.g., "1" or "Phase 1: Core Setup")

## Your Job

1. Read the design document at the given path
2. Locate the specified phase section
3. Explore the codebase to understand existing patterns
4. Write implementation plan for ONLY that phase
5. Save to `docs/plans/YYYY-MM-DD-<feature>-phase-N.md`
6. Commit with message: `docs: add phase N implementation plan for <feature>`
7. Report back (see below)

## Report Format

When complete, report:
- **Plan path:** `docs/plans/2026-01-24-auth-phase-2.md`
- **Phase planned:** 2 - Core Auth Service
- **Total phases:** 4
- **Phases remaining:** 2 (phases 3, 4)

## Planning Methodology

Assume the implementer has zero context and questionable taste. Document everything: which files to touch, complete code, exact commands, expected output.

### Task Granularity

Each step is one action (2-5 minutes):
- "Write the failing test" - step
- "Run it to verify failure" - step
- "Implement minimal code" - step
- "Run tests to verify pass" - step
- "Commit" - step

### Plan Header

```markdown
# <Feature> Phase N Implementation Plan

> **For Claude:** Use supersonic:executing-plans to implement this plan.

**Goal:** [One sentence]

**Architecture:** [2-3 sentences]

**Phase context:** [What previous phases accomplished, if any]

---
```

### Task Structure

```markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Step 1: Write the failing test**
[Complete code]

**Step 2: Run test to verify failure**
Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

**Step 3: Write minimal implementation**
[Complete code]

**Step 4: Run test to verify pass**
Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

**Step 5: Commit**
`git commit -m "feat: add specific feature"`
```

## Remember

- Exact file paths always
- Complete code (not "add validation")
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits
- Plan ONLY the specified phase
```

### Replace: `skills/writing-plans/SKILL.md`

```markdown
---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Create implementation plans from design documents by delegating to the planner subagent.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

## Usage

Dispatch the planner subagent:

```
Task tool:
  subagent_type: supersonic:planner
  prompt: |
    Design doc: docs/plans/2026-01-24-feature-design.md
    Plan phase: 1
```

Planner returns the plan path and phases remaining.

## Execution Handoff

After planner completes:

**"Plan saved to `<path>`. Ready to execute?"**

- If yes: Use `supersonic:executing-plans`
- If multi-phase: Note which phases remain
```

## What Stays Unchanged

- `skills/executing-plans/` - already uses subagents
- `skills/brainstorming/` - still calls writing-plans (which now delegates)
- `agents/implementer.md`, `agents/spec-reviewer.md`, etc. - no changes

## Future Orchestration

An orchestrator can call the planner subagent directly:

```
Task tool:
  subagent_type: supersonic:planner
  model: opus  (already set in agent definition)
  prompt: |
    Design doc: /path/to/design.md
    Plan phase: 2
```

The orchestrator receives the plan path, updates state (e.g., `phase_plan` in `.phase-state.json`), and proceeds to execution - without ever loading the design doc or plan content into its own context.

## Phases

Single phase implementation:
1. Create `agents/planner.md`
2. Replace `skills/writing-plans/SKILL.md`
