# Orchestrated Automation Design

## Overview

Automates the development pipeline from design document to implementation using a three-tier architecture: Supervisor, Team-Leads, and Workers/Reviewers. The system manages context aggressively through automatic checkpointing, enabling unlimited work within context constraints.

## Architecture

### Three-Tier Hierarchy

**Supervisor** - Claude Code skill that orchestrates the entire pipeline. Runs in user's foreground session. Maintains zero context about plan content or code - only tracks file paths, phase numbers, and process state. Spawns and monitors team-leads in background tmux sessions.

**Team-Leads** - Claude Code sessions running in detached tmux. Each manages one phase of work. Spawns a team of workers and reviewers using the Teammate tool. Coordinates task execution through enhanced executing-plans skill. Maintains resettable state in `.tina/phase-N/`.

**Workers & Reviewers** - Team members spawned by team-lead. Workers execute implementation tasks, reviewers validate spec compliance and code quality. Communicate via Teammate messages and task list.

### Key Innovation

Aggressive context management through automatic checkpointing. The statusline script writes context metrics to `.tina/context-metrics.json` and creates `.tina/checkpoint-needed` when thresholds are crossed. Supervisor detects this, sends `/checkpoint` to team-lead via tmux, team-lead coordinates team shutdown and writes state to handoff, then Supervisor clears and rehydrates the session with `/rehydrate`.

### Flow

```
User runs /supersonic:orchestrate <design-doc-path>
    ↓
Supervisor parses phases from design doc
    ↓
For each phase:
    Spawn planner → Generate plan
    Spawn team-lead with plan path
    Team-lead executes with team
    Monitor and checkpoint as needed
    Phase completes
    ↓
All phases done
    ↓
Trigger finishing-a-development-branch workflow
```

## Supervisor Behavior

### Invocation

`/supersonic:orchestrate <design-doc-path>`

### Initialization

1. Read design doc to count phases (parse `## Phase N` sections)
2. Create `.tina/supervisor-state.json` with: design doc path, total phases, current phase = 0, active tmux sessions = []
3. If resuming (state file exists), reconstruct from existing state + active tmux sessions

### Phase Loop

For each phase N (1 to total):

**1. Spawn Planner**
- Use Task tool to spawn `supersonic:planner` with design doc path + phase number
- Wait for plan file path (e.g., `docs/plans/2026-01-26-myfeature/phase-N-plan.md`)

**2. Spawn Team-Lead**
- Create tmux session: `tmux new-session -d -s supersonic-phase-N "cd $PROJECT && claude --prompt 'Run /team-lead-init <plan-path>'"`

**3. Update State**
- Write to supervisor-state.json: current phase, tmux session name, plan path

**4. Monitor Loop**
Poll every 5-10 seconds:
- Read `.tina/context-metrics.json` to check context usage
- Check for `.tina/checkpoint-needed` signal file
- Read `.tina/phase-N/status.json` for completion/blocked status

**5. Handle Checkpoint**
If checkpoint-needed exists:
- Send: `tmux send-keys -t supersonic-phase-N "/checkpoint" Enter`
- Wait for handoff written (`.tina/phase-N/handoff.md` exists/updated)
- Send: `tmux send-keys -t supersonic-phase-N "/clear" Enter`
- Send: `tmux send-keys -t supersonic-phase-N "/rehydrate" Enter`
- Delete checkpoint-needed signal file

**6. Handle Blocked**
If status.json shows `{status: "blocked", reason: "..."}`:
- Spawn helper agent (Task tool, specialized debugging agent) with context: phase N, blocker reason, handoff path
- Helper writes diagnostic report to `.tina/phase-N/diagnostic.md`
- If helper can't resolve: escalate to human with diagnostic report

**7. Phase Complete**
When status.json shows `{status: "complete"}`:
- Kill tmux session: `tmux kill-session -t supersonic-phase-N`
- Move to next phase

### Completion

When all phases done, invoke `finishing-a-development-branch` skill to handle merge/PR workflow.

### Resumption

If Supervisor interrupted (Ctrl+C, crash):
- Can be restarted with same design doc path
- Reads supervisor-state.json to reconstruct current phase
- Detects existing tmux sessions and reconnects monitoring
- Continues from current phase

## Team-Lead Behavior

### Initialization

`/team-lead-init <plan-path>` skill:

1. Read plan file to understand: tasks, dependencies, team composition recommendations
2. Create `.tina/phase-N/status.json` with `{status: "executing", started_at: timestamp}`
3. Present team composition recommendations, decide final team structure
4. Invoke enhanced `executing-plans` skill with plan path + team composition

### Enhanced executing-plans

**1. Spawn Team**
Use Teammate tool to create swarm:
- `spawnTeam` with team name (e.g., `phase-1-execution`)
- Spawn workers (e.g., 3x `supersonic:implementer` teammates)
- Spawn dedicated reviewers (1x spec-reviewer, 1x code-quality-reviewer teammates)

**2. Create Tasks**
Use TaskCreate to build task list from plan

**3. Assign Tasks**
Team-lead explicitly assigns tasks to workers using TaskUpdate (set owner field)

**4. Monitor Progress**
Watch for:
- Worker messages: "Task X complete, please review @spec-reviewer"
- Create review task, assign to appropriate reviewer
- Reviewer messages: create fix-issue task if problems found, assign back to worker
- Review pass: task truly complete

**5. Phase Review**
When all tasks completed AND all review tasks completed:
- Invoke `supersonic:phase-reviewer` agent with design doc path, phase number, git range
- If approved: write `.tina/phase-N/status.json`: `{status: "complete", phase_review: "passed"}`
- If issues found: create fix tasks, assign to workers, re-review after fixes
- If rejected 3 times: mark blocked, escalate to human

**6. Idle**
Team-lead session waits for shutdown after phase complete

### Checkpoint Protocol

`/checkpoint` skill:

1. Request shutdown of all teammates (workers + reviewers) via Teammate tool `requestShutdown`
2. Wait for all teammates to approve shutdown and exit
3. Write `.tina/phase-N/handoff.md` containing:
   - Current task list state (what's done, what remains)
   - Team composition used
   - Any blockers or notes for resumption
4. Acknowledge checkpoint complete (output "CHECKPOINT COMPLETE")

### Rehydration Protocol

`/rehydrate` skill:

1. Read `.tina/phase-N/handoff.md`
2. Read original plan file
3. Respawn team with same composition
4. Restore task list state
5. Resume execution from where it left off

## Worker & Reviewer Behavior

### Workers (supersonic:implementer teammates)

1. Receive explicit task assignment from team-lead via TaskUpdate (owner field set)
2. Execute task using existing implementer logic:
   - Read task details
   - Implement code changes
   - Run basic verification
3. Mark task as `in_progress` when starting, keep it there during review
4. When work done, send message to reviewers: `Teammate.write(target="spec-reviewer", value="Task X complete, please review")`
5. If receive fix-issue task assignment from reviewer:
   - Fix the issues
   - Notify reviewer again when fixed
6. When reviews pass, mark original task as `completed`
7. Check TaskList for next available task, notify team-lead if idle

### Spec Reviewer (dedicated teammate)

1. Wait for worker notification messages
2. When notified of completed work:
   - Read task specification from plan
   - Review implementation against spec
   - If issues found: create fix-issue task via TaskCreate, assign to original worker via TaskUpdate, message worker
   - If passes: create review-passed task and mark completed (for tracking), message worker "Review passed"
3. Continue monitoring for more review requests

### Code Quality Reviewer (dedicated teammate)

1. Same notification-based workflow as spec reviewer
2. Review for: code quality, patterns, maintainability (not spec compliance)
3. Create fix-issue tasks if problems found
4. Both reviewers must pass before task truly complete

### Review Sequencing

Workers notify both reviewers simultaneously. Task only marked `completed` when both spec-reviewer and code-quality-reviewer have passed (or all fix-issue tasks resolved).

## Artifact Structure

### Directory Layout

```
.tina/
├── supervisor-state.json          # Supervisor resumption state
├── context-metrics.json           # Written by statusline script
├── checkpoint-needed              # Signal file for checkpointing
├── phase-1/
│   ├── status.json                # {status: "executing|blocked|complete"}
│   ├── handoff.md                 # Checkpoint/rehydration state
│   └── diagnostic.md              # Helper agent analysis (if blocked)
├── phase-2/
│   ├── status.json
│   ├── handoff.md
│   └── diagnostic.md
└── ...

docs/plans/
└── 2026-01-26-myfeature/
    ├── design.md                  # Original design doc (## Phase 1, ## Phase 2)
    ├── phase-1-plan.md            # Generated by planner
    ├── phase-2-plan.md
    └── ...
```

### Key File Formats

**`.tina/supervisor-state.json`:**
```json
{
  "design_doc_path": "docs/plans/2026-01-26-myfeature/design.md",
  "total_phases": 3,
  "current_phase": 2,
  "active_tmux_session": "supersonic-phase-2",
  "plan_paths": {
    "1": "docs/plans/2026-01-26-myfeature/phase-1-plan.md",
    "2": "docs/plans/2026-01-26-myfeature/phase-2-plan.md"
  }
}
```

**`.tina/phase-N/status.json`:**
```json
{
  "status": "executing",
  "started_at": "2026-01-26T10:00:00Z",
  "reason": "waiting for external API credentials",
  "phase_review": "passed"
}
```

**`.tina/phase-N/handoff.md`:**
```markdown
# Phase N Handoff

## Team Composition
- 3 workers: worker-1, worker-2, worker-3
- 1 spec-reviewer
- 1 code-quality-reviewer

## Task State
- Completed: tasks 1, 2, 3
- In Progress: task 4 (assigned to worker-1, in review)
- Pending: tasks 5, 6, 7

## Notes
- Task 4 waiting on spec-reviewer feedback
- Tasks 5-7 blocked on task 4 completion
```

## Skills & Agents

### New Skills

**IMPORTANT:** Use `supersonic:writing-skills` skill for creating all new skills. Follow TDD approach: baseline test → write skill → verify compliance.

**1. `skills/orchestrate`** - Supervisor skill
- Invoked via `/supersonic:orchestrate <design-doc-path>`
- Implements supervisor behavior
- Uses Bash tool for tmux operations, polling, file monitoring

**2. `skills/team-lead-init`** - Team-lead initialization
- Invoked via `/team-lead-init <plan-path>`
- Reads plan, decides team composition
- Launches enhanced executing-plans

**3. `skills/checkpoint`** - Team-lead checkpoint protocol
- Invoked via `/checkpoint` (sent by supervisor)
- Coordinates team shutdown, writes handoff

**4. `skills/rehydrate`** - Team-lead rehydration protocol
- Invoked via `/rehydrate` (sent by supervisor after clear)
- Reads handoff, respawns team, resumes execution

### Skills to Enhance

**5. `skills/executing-plans`** - Make team-aware
- Accept team composition from team-lead-init
- Use Teammate tool to spawn team (spawnTeam, spawn workers/reviewers)
- Explicit task assignment via TaskUpdate
- Handle worker/reviewer messages
- Invoke phase-reviewer at end
- Support checkpoint/rehydrate interruption

### Existing Agents (no changes)

- `supersonic:planner` - Already phase-aware, generates plans
- `supersonic:implementer` - Workers use this
- `supersonic:spec-reviewer` - Already exists
- `supersonic:code-quality-reviewer` - Already exists
- `supersonic:phase-reviewer` - Already exists

### New Agent

**6. `supersonic:helper`** - Diagnostic agent for blocked team-leads
- Spawned by supervisor when team-lead blocked
- Reads handoff, status, logs
- Writes diagnostic report
- Recommends resolution or escalation

## Error Handling & Edge Cases

### Supervisor Errors

**Design doc has no phases:**
- Error immediately, tell user design doc must have `## Phase N` sections

**Planner fails:**
- Retry once
- If still fails: escalate to human with planner error output

**Team-lead tmux session dies unexpectedly:**
- Supervisor detects via `tmux has-session -t supersonic-phase-N` returning error
- Check if phase was complete (status.json shows complete) - if yes, continue to next phase
- If not complete: attempt resume by respawning team-lead with `/rehydrate` immediately
- If respawn fails: escalate to human

**Checkpoint timeout:**
- Team-lead doesn't write handoff within 5 minutes
- Force kill tmux session, mark phase as blocked
- Escalate to human with partial state

### Team-Lead Errors

**Worker refuses shutdown during checkpoint:**
- Team-lead waits for timeout (30s)
- Force cleanup, write handoff with best-effort state
- Note unclean shutdown in handoff

**Reviewer stuck/not responding:**
- Team-lead timeout after 10 minutes of no reviewer response
- Spawn replacement reviewer, reassign pending reviews
- Note issue in handoff

**Phase-reviewer rejects phase:**
- Team-lead creates fix tasks from phase-reviewer feedback
- Assigns to workers, continues execution
- Re-invokes phase-reviewer after fixes
- If phase-reviewer rejects 3 times: mark blocked, escalate to human

**Cannot spawn team:**
- Retry spawn once
- If still fails: mark phase blocked, write diagnostic to status.json
- Supervisor escalates to human

### Worker/Reviewer Errors

**Worker crashes mid-task:**
- Task stays in_progress with owner set
- Team-lead detects idle worker (no messages, no task updates for 15 minutes)
- Unassigns task (clear owner), assigns to different worker

**Infinite review loop:**
- Task bounces between worker and reviewer
- After 3 fix-issue cycles, team-lead intervenes
- Messages both to understand issue
- Creates escalation task, marks blocked if unresolvable

## Implementation Approach

## Phase 1: Foundation

- Create `.tina/` structure and state management
- Implement `orchestrate` skill basic loop (no checkpointing yet)
- Implement `team-lead-init` skill
- Test: single phase execution without teams (existing Task-based flow)

## Phase 2: Team-Based Execution

- Enhance `executing-plans` to use Teammate tool
- Implement worker/reviewer message-based coordination
- Implement phase-reviewer integration
- Test: single phase with team execution

## Phase 3: Checkpoint/Rehydrate

- Implement `checkpoint` skill
- Implement `rehydrate` skill
- Integrate with existing statusline monitoring
- Test: checkpoint mid-phase, verify clean restoration

## Phase 4: Multi-Phase & Error Handling

- Implement phase loop in orchestrate
- Implement helper agent spawning for blocked states
- Add all error handling and edge cases
- Test: multi-phase design doc execution

## Phase 5: Resumption & Polish

- Implement supervisor resumption from supervisor-state.json
- Add orphaned session detection/cleanup
- Integrate `finishing-a-development-branch` at completion
- End-to-end testing

### Testing Strategy

**Unit:** Each skill tested standalone with mock inputs

**Integration:** Test pairs (orchestrate + team-lead-init, team-lead + executing-plans)

**System:** Full pipeline with 2-3 phase test design docs

**Resilience:** Interrupt at various points, verify resumption

**Context:** Force checkpoint by reducing threshold, verify clean reset

### Backward Compatibility

- All existing skills remain usable standalone
- `/supersonic:brainstorm` continues to work as-is
- Users can still manually run `/supersonic:write-plan` and `/supersonic:execute-plan`
- Orchestrate is purely additive - opt-in automation

### Configuration

Environment variables for tuning:
- `TINA_THRESHOLD` - Context % for checkpoint (default: 70)
- `TINA_POLL_INTERVAL` - Supervisor polling seconds (default: 10)
- `TINA_CHECKPOINT_TIMEOUT` - Max checkpoint wait (default: 300s)
- `TINA_REVIEW_TIMEOUT` - Max reviewer response wait (default: 600s)

## Success Criteria

1. User can run `/supersonic:orchestrate <design-doc-path>` and system executes all phases automatically
2. Context never exceeds threshold - automatic checkpointing keeps it bounded
3. System recovers gracefully from interruption - Supervisor can be restarted and resumes
4. Blocked states escalate to human with diagnostic information
5. All phases complete and finishing-a-development-branch workflow triggers
6. Existing manual workflows remain functional

## Architectural Context

**Patterns to follow:**
- Skill invocation structure: `skills/executing-plans/SKILL.md:1-20` (YAML frontmatter + workflow description)
- Agent definition format: `agents/planner.md:1-15` (YAML frontmatter with name, description, model)
- Subagent spawning: `skills/writing-plans/SKILL.md:17-24` (Task tool with subagent_type + prompt)
- Sequential task execution: `skills/executing-plans/SKILL.md:30-100` (dispatch → wait → review → next)
- Phase counting from design doc: Parse `## Phase N` markdown sections
- Git operations: `skills/finishing-a-development-branch/SKILL.md:50-80` (verify tests, then action)

**Code to reuse:**
- `~/.claude/scripts/tina-statusline.sh` - Already writes `.tina/context-metrics.json` and creates `.tina/checkpoint-needed` signal
- `skills/brainstorming/SKILL.md:41-47` - Pattern for invoking architect skill after design
- `skills/executing-plans/SKILL.md:70-85` - Phase-reviewer invocation after all tasks complete
- `skills/finishing-a-development-branch/SKILL.md` - Complete workflow for merge/PR after all phases
- `agents/planner.md` - Existing phase-aware planner (takes design doc + phase number)
- `agents/implementer.md` - Worker agent (ask questions before work, self-review after)
- `agents/phase-reviewer.md` - Existing phase verification (takes design doc + phase + git range)

**Anti-patterns:**
- Don't parse plan content in supervisor (violates "paths not content" principle) - see `docs/architecture/orchestration-vision.md:82-88`
- Don't use sequential Task calls when Teammate tool enables parallelism
- Don't spawn multiple implementers in parallel without coordination - see `skills/executing-plans/SKILL.md:200-210`
- Don't skip test verification before merge/PR - see `skills/finishing-a-development-branch/SKILL.md:20-35`

**Integration:**
- Entry: User invokes `/supersonic:orchestrate <design-doc-path>` in their current session
- Connects to: Spawns planner agents → spawns team-lead in tmux → team-lead uses Teammate tool → invokes finishing-a-development-branch at end
- State files: All state in `.tina/` directory (already created, contains `context-metrics.json`)
- Skill registration: Add to `.claude-plugin/plugin.json` keywords and document in README.md

**New patterns this introduces:**
- Tmux session management for long-running team-leads
- Checkpoint/rehydrate protocol via slash commands
- Supervisor polling `.tina/` files instead of reading content
- Team-based execution via Teammate tool (first use in this codebase)
- Phase subdirectories in `.tina/phase-N/` for isolation

## Implementation Status

- [x] Phase 1: Foundation
- [x] Phase 2: Team-Based Execution
- [x] Phase 3: Checkpoint/Rehydrate
- [x] Phase 4: Multi-Phase & Error Handling
- [ ] Phase 5: Resumption & Polish
