# Orchestration Vision

## The Goal

Move towards an automated development loop where human involvement is only needed for:
1. **Brainstorming** - Interactive design refinement (human-in-the-loop)
2. **Exceptions** - When the system gets stuck or needs decisions

Everything else runs autonomously.

## Key Drivers

### Context Management

The primary driver is context window management. The main conversation should stay lean:
- Pass **file paths**, not file contents
- Delegate heavy work to **subagents** with fresh context
- Orchestrator coordinates but never loads large artifacts

### Composability

Build small, focused components with clean interfaces:
- **Input:** File paths, phase numbers, task identifiers
- **Output:** Result paths, status, what remains
- Each component usable standalone AND by an orchestrator

## The Target Flow

```
Human ←→ Brainstorming (interactive)
              ↓
         Design Doc (saved to disk)
              ↓
    ┌─────────────────────────────────┐
    │     Automated Pipeline          │
    │                                 │
    │  ┌─→ Planner (phase N) ────┐    │
    │  │         ↓               │    │
    │  │   Implementation Plan   │    │
    │  │         ↓               │    │
    │  │   Executor (tasks)      │    │
    │  │         ↓               │    │
    │  │   Phase Complete?       │    │
    │  │     ↓ yes    ↓ no       │    │
    │  │   More     Back to      │    │
    │  │   phases?  executor     │    │
    │  │     ↓ yes               │    │
    │  └──────┘                  │    │
    │                            │    │
    │  Exception? → Surface to   │────┼──→ Human
    │               human        │    │
    └─────────────────────────────────┘
              ↓
         All phases complete
              ↓
         Human reviews result
```

## Human Involvement Model

**Exception-only:** The system runs autonomously but surfaces to human when:
- Stuck on a problem it can't solve
- Needs a decision with multiple valid paths
- Encounters an error it can't recover from
- Blocked by external factors (permissions, unclear requirements)

NOT checkpoint-based (pausing at milestones for approval).

## Phase Loop

Design documents often have multiple phases. The automated loop:

1. **Plan phase N** - Planner subagent reads design doc, writes implementation plan
2. **Execute phase N** - Executor runs through tasks with reviews
3. **Transition** - Mark phase complete, check if more phases remain
4. **Repeat** - If phases remain, plan next phase; otherwise done

Each phase gets fresh context through subagent delegation.

## Current State

Building the composable pieces incrementally:

| Component | Status | Notes |
|-----------|--------|-------|
| `agents/planner` | Done | Opus, phase-aware, paths in/out |
| `agents/implementer` | Exists | Task implementation |
| `agents/spec-reviewer` | Exists | Spec compliance checking |
| `agents/code-quality-reviewer` | Exists | Code quality review |
| `skills/executing-plans` | Exists | Task execution with reviews |
| Orchestrator | Not started | Will coordinate the loop |

## Design Principles

1. **Paths, not content** - Orchestrator never loads large files
2. **Subagents for heavy lifting** - Fresh context per major task
3. **Clean interfaces** - Each component has clear inputs/outputs
4. **Standalone usable** - Everything works without orchestrator
5. **Incremental progress** - Build pieces now, integrate later
