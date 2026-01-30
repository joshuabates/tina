# Team-Based Orchestration Design

## Problem

The current orchestrator is a single agent that tries to do everything:
- Validate design docs
- Create worktrees
- Spawn planners
- Start team-leads in tmux
- Monitor phase progress
- Handle checkpoints
- React to phase completion

This leads to several failure modes:
1. **Monitor dies quickly** - Orchestrator spawns a monitor subagent that ends, then orchestrator forgets to check
2. **Context bloat** - Orchestrator accumulates state across all phases, gets worse over time
3. **Tmux command failures** - Orchestrator fumbles send-keys (enter not executing), requires manual intervention
4. **Polling confusion** - Orchestrator either polls itself (bad) or forgets to check (also bad)

## Solution

Make the orchestrator a **team lead** that coordinates **teammates**, not a single agent doing everything. Each phase of work becomes a task assigned to a teammate with a single responsibility.

The orchestrator becomes a simple event-driven coordinator:
1. Create team and tasks with dependencies
2. Spawn teammates as tasks become available
3. React to teammate messages
4. Handle errors and remediation

## Core Model

### Orchestrator as Team Lead

The orchestrator creates a team (e.g., `auth-feature-orchestration`) and populates it with tasks representing all the work:

```
[] validate-design
[] setup-worktree          (blocked by: validate)
[] plan-phase-1            (blocked by: setup-worktree)
[] execute-phase-1         (blocked by: plan-1)
[] review-phase-1          (blocked by: execute-1)
[] plan-phase-2            (blocked by: review-1)
[] execute-phase-2         (blocked by: plan-2)
[] review-phase-2          (blocked by: execute-2)
...
[] review-phase-N          (blocked by: execute-N)
[] finalize                (blocked by: review-N)
```

Dependencies enforce sequencing: each phase's review must pass before the next phase's planning begins.

### Teammate Types

| Agent | Claims | Responsibility |
|-------|--------|----------------|
| `tina:design-validator` | validate-design | Validate design doc, capture baseline metrics |
| `tina:worktree-setup` | setup-worktree | Create worktree, install statusline config, store path in metadata |
| `tina:phase-planner` | plan-phase-N | Run planner agent, validate plan, store plan path in metadata |
| `tina:phase-executor` | execute-phase-N | Start team-lead in tmux, monitor progress, handle checkpoints |
| `tina:phase-reviewer` | review-phase-N | Review completed phase, report pass/fail/gaps |

### Task Metadata as State

Instead of `.claude/tina/supervisor-state.json`, the task list carries all orchestration state:

| Data | Location |
|------|----------|
| Design doc path | Team description or validate task metadata |
| Worktree path | setup-worktree task metadata |
| Plan path | plan-phase-N task metadata |
| Git range | execute-phase-N task metadata |
| Team-lead team name | Written to worktree file by team-lead-init |
| Review findings | review-phase-N task metadata |

### Orchestrator Event Loop

```
On teammate message:
├── "validate complete" → spawn worktree-setup teammate
├── "worktree complete" → spawn planner-1 teammate
├── "plan-N complete" → spawn executor-N teammate
├── "execute-N complete" → spawn reviewer-N teammate
├── "review-N complete (pass)" →
│   ├── if more phases: spawn planner-(N+1) teammate
│   └── if last phase: run /tina:finishing-a-development-branch
├── "review-N complete (gaps)" →
│   ├── create remediation phase N.5 tasks
│   └── update dependencies, spawn planner-N.5
└── "error: X" → handle/retry/escalate
```

## Phase Executor Details

The executor is the most complex teammate. Its job is to start the team-lead and monitor until phase completion.

### Starting Team-Lead in Tmux

```bash
# Create session in worktree
tmux new-session -d -s "feature-phase-1" -c "/path/to/worktree"

# CRITICAL: Split send-keys into two calls (command + Enter separately)
tmux send-keys -t "feature-phase-1" "claude"
tmux send-keys -t "feature-phase-1" Enter

# Wait for Claude ready (poll tmux output for prompt)
# Then send init command
tmux send-keys -t "feature-phase-1" "/tina:team-lead-init {plan-path}"
tmux send-keys -t "feature-phase-1" Enter
```

The two-call pattern for send-keys is required - combining command and Enter in one call fails silently.

### Detecting Claude Ready

Poll tmux output until Claude's prompt appears:
```bash
tmux capture-pane -t "session" -p | grep -q "prompt-indicator"
```

### Team-Lead Team Name Discovery

Team-lead-init writes its team name to:
```
{worktree}/.claude/tina/phase-{N}/team-name.txt
```

Executor reads this to know where to monitor task progress.

### Monitoring Loop

```
while phase not complete:
    1. Check tmux session alive
       - tmux has-session -t "session-name"
       - If dead: escalate to orchestrator

    2. Read team-lead's task files
       - ~/.claude/tasks/{team-lead-team}/*.json
       - Track completion percentage

    3. Check context threshold
       - Read {worktree}/.claude/tina/phase-{N}/context-metrics.json
       - If > 80%: trigger checkpoint sequence

    4. Report progress
       - Message orchestrator on each task completion

    5. Sleep 15 seconds
```

### Checkpoint Sequence

When context threshold exceeded:
```
1. tmux send-keys "/checkpoint"
2. tmux send-keys Enter
3. Poll tmux output for "CHECKPOINT COMPLETE"
4. tmux send-keys "/clear"
5. tmux send-keys Enter
6. Wait briefly
7. tmux send-keys "/rehydrate"
8. tmux send-keys Enter
9. Resume monitoring
```

### Phase Completion

When all team-lead tasks complete:
1. Capture git range (first..last commit of phase)
2. Store in execute task metadata
3. Mark execute task complete
4. Message orchestrator: "execute-{phase} complete"

## Worktree Setup Details

The worktree-setup teammate:
1. Creates worktree at `.worktrees/{feature-name}`
2. Verifies directory is in `.gitignore`
3. Creates branch `feature/{feature-name}`
4. Installs statusline config at `{worktree}/.claude/settings.local.json`
5. Creates `.claude/tina/` directory structure
6. Stores worktree path in task metadata
7. Marks task complete

## Review and Remediation

### Normal Flow

Reviewer examines the completed phase:
- Checks implementation against design doc
- Verifies tests pass
- Reviews code quality

If all good: marks review task complete with `{status: "pass"}`

### Remediation Flow

If reviewer finds gaps:
1. Reviewer marks task complete with `{status: "gaps", issues: [...]}`
2. Reviewer messages orchestrator: "Review found gaps: X, Y, Z"
3. Orchestrator creates remediation phase:
   - plan-phase-1.5
   - execute-phase-1.5
   - review-phase-1.5
4. Updates dependencies: review-1 → plan-1.5 → ... → plan-2
5. Spawns planner-1.5
6. Normal flow continues

Remediation gets full plan/execute/review treatment, not ad-hoc fixes.

## File Conventions

### Worktree Files

```
{worktree}/.claude/
├── settings.local.json           # Statusline config (installed by worktree-setup)
├── tina-write-context.sh         # Statusline script (installed by worktree-setup)
└── tina/
    └── phase-{N}/
        ├── team-name.txt         # Written by team-lead-init
        └── context-metrics.json  # Written by statusline script
```

### Task Files

```
~/.claude/tasks/{orchestration-team}/
├── validate-design.json
├── setup-worktree.json
├── plan-phase-1.json
├── execute-phase-1.json
├── review-phase-1.json
└── ...

~/.claude/tasks/{team-lead-team}/
├── task-1.json
├── task-2.json
└── ...
```

## Recovery

### Task List as Source of Truth

The orchestration team's task list is the complete recovery mechanism. No separate supervisor-state.json needed.

### Orchestrator Crash

1. User restarts, runs `/tina:orchestrate design.md` again
2. Orchestrator finds existing team with matching design doc
3. Reads task list, finds incomplete tasks
4. Resumes from current state:
   - If mid-phase: respawn executor
   - If between phases: spawn next teammate

### Executor Crash

1. Orchestrator notices no messages for extended period
2. Orchestrator respawns executor for same task
3. Executor checks: does tmux session exist?
   - If yes: resume monitoring
   - If no: start fresh

### Team-Lead Crash

1. Executor detects tmux session died
2. Executor messages orchestrator: "tmux session died"
3. Orchestrator decides: restart phase or escalate to user

## Changes from Current Implementation

### What Changes

| Aspect | Current | New |
|--------|---------|-----|
| Orchestrator role | Does everything | Coordinates teammates |
| Monitoring | Subagent that dies + orchestrator polls | Executor teammate's dedicated job |
| State storage | `.claude/tina/supervisor-state.json` | Task list + task metadata |
| Phase execution | Orchestrator starts tmux directly | Executor teammate handles tmux |
| Planning | Orchestrator spawns planner subagent | Planner teammate claims task |
| Context management | Orchestrator accumulates context | Orchestrator only sees messages |

### What Stays the Same

- Team-lead runs in tmux for each phase
- Team-lead uses executing-plans skill
- Checkpoint/rehydrate for team-lead context management
- Phase reviewer validates completed phases
- Worktree isolation for feature work

### New Agent Definitions Needed

- `agents/phase-planner.md` - Planner teammate (wraps existing planner agent)
- `agents/phase-executor.md` - Executor teammate (new)
- `agents/worktree-setup.md` - Worktree setup teammate (new)

### Skills to Modify

- `skills/orchestrate/SKILL.md` - Complete rewrite for team model
- `skills/team-lead-init/SKILL.md` - Write team name to worktree file

### Skills Unchanged

- `skills/executing-plans/SKILL.md` - Team-lead behavior unchanged
- `skills/checkpoint/SKILL.md` - Unchanged
- `skills/rehydrate/SKILL.md` - Unchanged
- `skills/finishing-a-development-branch/SKILL.md` - Unchanged

## Success Metrics

1. **Orchestrator context stays minimal** - Only sees teammate messages, not implementation details
2. **Phases complete without manual intervention** - No more hitting Enter in tmux manually
3. **Monitoring is reliable** - Executor teammate's single job is to monitor
4. **Recovery works** - Can resume from any crash by reading task list
5. **Remediation is clean** - Review gaps create proper remediation phases

## Phases

### Phase 1: Core Infrastructure

- Create `agents/phase-executor.md` with tmux handling and monitoring loop
- Create `agents/worktree-setup.md` with worktree creation and config installation
- Create `agents/phase-planner.md` wrapping existing planner
- Update `skills/team-lead-init/SKILL.md` to write team name file

### Phase 2: Orchestrate Skill Rewrite

- Rewrite `skills/orchestrate/SKILL.md` for team-based model
- Implement task creation with dependencies
- Implement teammate spawning on task unblock
- Implement message handling event loop

### Phase 3: Recovery and Remediation

- Implement orchestrator resume from existing task list
- Implement executor resume with existing tmux session
- Implement remediation phase creation on review gaps

### Phase 4: Testing and Refinement

- Test full flow end-to-end
- Test crash recovery scenarios
- Refine monitoring intervals and thresholds
- Document failure modes and handling
