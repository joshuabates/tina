# Orchestrator Background Monitoring Design

## Problem

The orchestrator currently blocks the terminal while monitoring phase execution. It runs sleep loops to poll `status.json` and `context-metrics.json`, preventing user interaction. Users cannot give new instructions or ask questions while phases execute.

## Solution

Delegate monitoring to a background haiku subagent. The orchestrator spawns it, remains responsive, and receives signals when action is needed.

## Architecture

```
┌─────────────────────┐
│   Orchestrator      │  ← User's claude-code session, stays responsive
│   (parent)          │
└─────────┬───────────┘
          │ spawns (run_in_background: true)
          ▼
┌─────────────────────┐
│  Monitoring Agent   │  ← Haiku model, polls files every 5 seconds
│  (background)       │
└─────────┬───────────┘
          │ monitors
          ▼
┌─────────────────────┐
│  .tina/phase-N/     │
│  - status.json      │  ← Phase status, task updates
│  - context-metrics  │  ← Context usage %
└─────────────────────┘
```

## Monitoring Agent

### Responsibilities

**Files monitored:**
- `.tina/phase-{N}/status.json` - status field, task updates, errors/blockers
- `.tina/context-metrics.json` - `used_pct` field for context threshold

**Polling:** Check both files every 5 seconds, track previous state to detect changes.

**Events reported to terminal:**
- Status changes: `pending` → `executing` → `complete` / `blocked`
- Task updates: new tasks, task completions
- Errors/blockers with reason
- Context usage at every 10% increment (10%, 20%, 30%, etc.)

**Signals to parent orchestrator:**
- `phase_complete` - phase finished, ready for next
- `phase_blocked` - phase hit a blocker, needs intervention
- `context_threshold` - context usage exceeded 50% threshold
- `session_died` - tmux session died unexpectedly

### Signal Format

```
[UPDATE] status=executing phase=1
[UPDATE] task_completed id=3 subject="Add validation"
[UPDATE] context=40% phase=1
[SIGNAL] phase_complete phase=1
[SIGNAL] phase_blocked phase=1 reason="Missing API credentials"
[SIGNAL] context_threshold phase=1 pct=52
[SIGNAL] session_died phase=1
```

### Lifecycle

**Startup:**
- Receives phase number and paths from orchestrator
- Reads initial state from files
- Begins polling loop

**Polling loop:**
```
while phase not complete/blocked:
    read status.json
    read context-metrics.json

    if status changed:
        output update + signal if needed

    if context crossed 10% boundary:
        output "Context: {pct}%"

    if context >= 50%:
        output "[SIGNAL] context_threshold ..."

    sleep 5 seconds
```

**Termination conditions:**
- Phase status becomes `complete` → output signal, exit
- Phase status becomes `blocked` → output signal, exit
- Tmux session dies unexpectedly → output error signal, exit
- Parent orchestrator stops it (via TaskStop)

## Orchestrator Behavior

### Phase Execution Flow

1. Spawn planning subagent (`tina:planner`) to create implementation plan
2. Receive plan path from planner
3. Start team-lead for phase N in tmux session with plan
4. Spawn monitoring agent via Task tool (`run_in_background: true`, `model: haiku`)
5. End turn - terminal is free for user interaction

### Signal Handling

| Signal | Action |
|--------|--------|
| `phase_complete` | Start next phase + spawn new monitor |
| `phase_blocked` | Surface blocker to user, await guidance |
| `context_threshold` | Checkpoint/clear/rehydrate team-lead |
| `session_died` | Attempt recovery via rehydrate (max 1 attempt) |

### Reading Monitor Output

- Task tool returns `output_file` path when spawning background agent
- Orchestrator does quick `tail` of output file to check for signals
- Check frequency: every 10 seconds
- Non-blocking - just reads what's there

### User Interaction

While monitoring runs in background, user can:
- Ask orchestrator questions about progress
- Give new instructions
- Manually trigger checkpoint/status check
- Stop orchestration

## Context Threshold Handling

**When monitoring agent detects context >= 50%:**

1. Outputs: `[SIGNAL] context_threshold phase=N pct=52`
2. Continues monitoring (doesn't exit - phase isn't done)

**Orchestrator receives signal and:**

1. Sends `/tina:checkpoint` command to team-lead via tmux
2. Team-lead writes `.tina/phase-N/handoff.md` with current state
3. Sends `/clear` to team-lead session (resets context)
4. Sends `/tina:rehydrate` to team-lead
5. Team-lead restores state from handoff, continues work

## Error Handling

**Tmux session dies unexpectedly:**
- Monitor detects via `tmux has-session` check
- Outputs: `[SIGNAL] session_died phase=N`
- Orchestrator attempts recovery via `/tina:rehydrate` in new session
- Max 1 recovery attempt per phase (prevents infinite loops)

**Monitoring agent crashes:**
- Orchestrator notices no recent output from monitor
- Can respawn monitoring agent for same phase
- Monitor reads current state from files (stateless restart)

**Status file missing or corrupt:**
- Monitor outputs warning but continues polling
- Orchestrator surfaces issue if persistent

**Multiple rapid status changes:**
- Monitor reports each change (no debouncing)
- Better to over-report than miss events

## Key Design Decisions

1. **One monitor per phase** - Clean separation, no state carried between phases
2. **Haiku model for monitor** - Cheap, fast, sufficient for file polling
3. **Planning delegated to subagent** - Keeps orchestrator context lean
4. **50% context threshold** - Proactive checkpointing before context fills
5. **Structured signal format** - Easy for orchestrator to parse

## Benefits

- Terminal no longer blocked during monitoring
- User can interact with orchestrator while phases execute
- Automatic progression through phases without manual intervention
- Context management handled proactively
- Orchestrator stays lean by delegating heavy work to subagents

## Architectural Context

**Patterns to follow:**
- Subagent spawning: `agents/planner.md` - existing pattern for delegating work to subagents
- Status file structure: `skills/team-lead-init/SKILL.md:47-70` - status.json format
- Context metrics: `skills/orchestrate/SKILL.md:220-240` - statusline hook writes context-metrics.json

**Code to reuse:**
- `skills/orchestrate/SKILL.md:426-435` - existing context threshold check logic (change to delegate to monitor)
- `skills/checkpoint/SKILL.md` - checkpoint flow when threshold exceeded
- `skills/rehydrate/SKILL.md` - rehydrate flow after context reset

**Integration points:**
- Entry: `skills/orchestrate/SKILL.md` Step 3d-3e (replace inline monitoring with background agent)
- Connects to: team-lead-init (via tmux), checkpoint/rehydrate (via signals)

**Anti-patterns to avoid:**
- Don't use inline bash sleep loops - see `skills/orchestrate/SKILL.md:424` (current blocking approach)
- Don't have orchestrator write status.json - that's team-lead's responsibility

**New agent needed:**
- Create `agents/monitor.md` - haiku agent for phase monitoring
- Prompt: poll status.json + context-metrics.json, output signals
