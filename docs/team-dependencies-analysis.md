# Team Dependencies Analysis

**Date:** 2026-01-26
**Context:** Supersonic plugin currently uses teams/swarms (Claude Sneakpeak only). Exploring options for supporting regular Claude Code.

## Current State

The plugin is built around team-based execution, which requires Claude Sneakpeak. Key components with team dependencies:

### Skills with Team Dependencies

- **orchestrate** - Spawns team-lead-init in tmux for multi-phase execution
- **team-lead-init** - Uses `Teammate.spawnTeam()`, `Teammate.spawn()`, `Teammate.requestShutdown()`
- **executing-plans** (with --team flag) - Expects team to exist, coordinates via team messages

### Agents with Team Dependencies

All three execution agents have "Team Mode Behavior" sections:

- **implementer** - Uses `Teammate.write()` to notify reviewers, manages own review loop
- **spec-reviewer** - Uses `Teammate.write()`, `TaskCreate`, `TaskUpdate` to communicate with workers
- **code-quality-reviewer** - Uses `Teammate.write()`, `TaskCreate`, `TaskUpdate` to communicate with workers

## Execution Model Differences

### Pre-Team Mode (Task tool with subagents)

**Coordination:**
- Controller spawns subagents in parallel using Task tool
- Each subagent returns results when done
- Controller waits for results and coordinates next steps
- No direct communication between subagents

**Review loop:**
- Implementer spawned → implements → reports back (dies)
- executing-plans examines result, spawns spec-reviewer → reports back (dies)
- If issues: executing-plans spawns implementer AGAIN with fix instructions
- Controller manages entire loop with fresh subagent spawns

**State:**
- Subagents are stateless - each spawn is fresh context
- Controller maintains all state
- Sequential handoffs through controller

### Team Mode (Teammate tool)

**Coordination:**
- team-lead spawns team using Teammate tool
- Teammates stay alive, communicate directly via messages
- Shared TaskList for task coordination
- More autonomous/distributed control

**Review loop:**
- Implementer implements → notifies both reviewers directly
- Reviewers respond directly to implementer
- If issues: reviewers create fix tasks, assign to implementer
- Implementer fixes → re-notifies reviewers
- Loop managed by participants, not controller

**State:**
- Teammates are stateful - stay alive across review iterations
- Each teammate maintains context
- Direct peer-to-peer messaging

## Options Explored

### Option A: Conditional Agent Behavior

Agents detect runtime environment and switch behavior:
```
if (CLAUDE_CODE_AGENT_ID env var exists) {
  // Team mode behavior
} else {
  // Subagent mode behavior
}
```

**Pros:**
- Single codebase
- Runtime adaptation

**Cons:**
- Adds cognitive overhead to every agent prompt
- "If teammate do X, else do Y" throughout instructions
- Potentially degrades performance with longer, conditional prompts
- Harder to reason about agent behavior

### Option B: Duplicate Execution Paths

Maintain separate skills/agents for each mode:
- `executing-plans` vs `executing-plans-sequential`
- `agents/implementer.md` vs `agents/implementer-team.md`

**Pros:**
- Clean separation, no conditionals
- Optimized prompts for each mode

**Cons:**
- Maintenance nightmare - duplicate code drifts out of sync
- Twice the testing surface
- Twice the bugs

### Option C: Runtime Detection in Controller

`executing-plans` detects Teammate tool availability and switches coordination:
```
if (Teammate tool available) {
  // Spawn team, use message-based coordination
} else {
  // Spawn subagents, use controller coordination
}
```

**Pros:**
- Complexity isolated to one place (executing-plans)
- Agents keep existing "Team Mode" sections (minimal overhead)
- Single agent codebase

**Cons:**
- Agents still have unused "Team Mode" sections when spawned as subagents
- Unclear if unused sections degrade subagent performance
- Controller logic more complex

### Option D: Graceful Degradation

Core skills (test-driven-development, systematic-debugging, writing-plans) work everywhere.
Advanced orchestration (orchestrate, team-lead-init) explicitly requires Sneakpeak.

**Pros:**
- Clear feature boundaries
- No dual-mode complexity
- Most skills still usable

**Cons:**
- No automated multi-phase execution on regular Claude Code
- Users on regular Claude Code get reduced functionality

### Option E: Wait and See

Don't implement dual-mode support now. Wait for:
1. Evidence that teams actually improve quality/speed vs subagents
2. Teams to ship in regular Claude Code
3. User reports of issues with team-only approach

**Pros:**
- Avoids premature complexity
- May become unnecessary if teams ship broadly
- Can validate teams actually work better first

**Cons:**
- Current users on regular Claude Code can't use the plugin
- If teams don't ship soon, longer without regular Claude Code support

## Key Technical Challenge

The implementer review loop is the hardest part to abstract:

**Pre-team:** Stateless subagent, controller manages loop (spawn → review → spawn again)
**Team mode:** Stateful teammate, manages own loop (notify → fix → re-notify)

This creates cognitive burden if agents need to handle both modes.

## Decision

**No action at this time.** Wait for:
- Testing to validate teams > controller-managed subagents
- Teams general availability timeline
- User feedback on team-only approach

If teams underperform or don't ship to regular Claude Code, revisit dual-mode support with fresh context.

## Open Questions

1. Do unused "Team Mode Behavior" sections in agent prompts degrade subagent performance?
2. Is parallel team coordination actually better than controller-managed parallel subagents?
3. What's the timeline for teams shipping to regular Claude Code?
4. Would it make sense to test both approaches with same task to measure quality/speed differences?
