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
  subagent_type: tina:planner
  prompt: |
    Design doc: docs/plans/2026-01-24-feature-design.md
    Plan phase: 1
```

Planner returns the plan path and phases remaining.

## Execution Handoff

After planner completes:

**"Plan saved to `<path>`. Ready to execute?"**

- If yes: Use `tina:executing-plans`
- If multi-phase: Note which phases remain
