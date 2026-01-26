# TINA

**Teams Iterating, Not Accumulating**

A development workflow system for Claude Code with an orchestration layer that manages context across multi-phase projects. Based on [Superpowers](https://github.com/anthropics/superpowers) with added automation: TINA spawns workers in isolated tmux sessions, monitors progress, pre-emptively checkpoints to prevent phase contexts from growing, and recovers from failures.

<p align="center">
  <img src="assets/tina.png" alt="Tina" width="200">
</p>

## Why TINA?

The Superpowers workflow (brainstorm → design → plan → implement/review) works well for single-phase projects. But complex work requires multiple phases, and Claude's context window becomes the bottleneck.

TINA's orchestration layer solves this:
- **Fresh context per phase** - Workers run in tmux with clean context
- **Pre-emptive checkpoints** - Saves state within phases to prevent individual phase contexts from growing
- **Failure recovery** - Detects crashed sessions, diagnoses issues, attempts recovery
- **Resumable** - Pick up where you left off after interruptions

## The Workflow

### Phase 1: Design (Interactive)
```
You ←→ /tina:brainstorm
         One question at a time, refining ideas
              ↓
         Design Doc (.md saved to docs/plans/)
              ↓
         Architect Review
         Validates design before implementation
```

### Phase 2: Implementation (Automated)
```
/tina:orchestrate docs/plans/your-design.md

For each phase in design doc:

  1. Planner → Implementation plan with tasks

  2. Team-lead spawns in tmux session
     ├─ Spawns implementer agents for tasks
     ├─ Each task: implement → spec review → code review
     ├─ Pre-emptive checkpoints (context management)
     └─ Crash recovery if workers fail

  3. Phase reviewer validates completed phase
     Checks against design doc + integration

All phases complete:

  4. /tina:finishing-a-development-branch
     Choose: merge to main, create PR, or manual finish
```

**Manual mode:** Run individual skills yourself (`/tina:write-plan`, `/tina:execute-plan`, etc.)
**Automated mode:** `/tina:orchestrate` runs the full pipeline

> **Note:** Automated mode requires [claude-sneakpeek](https://github.com/mikekelly/claude-sneakpeek) for team-based execution. A non-team mode is planned for the future.

## Skills

### Orchestration
- **orchestrate** - Automated pipeline from design doc to implementation
- **team-lead-init** - Initializes team-lead in tmux session for phase execution
- **checkpoint** - Pre-emptively saves phase state to prevent context growth
- **rehydrate** - Restores state after context clear

### Design & Planning
- **brainstorming** - Refine ideas into designs through one-question-at-a-time dialogue
- **architect** - Reviews design docs before implementation
- **writing-plans** - Creates detailed implementation plans from specs

### Execution
- **executing-plans** - Runs through plan tasks with implement/review cycles
- **test-driven-development** - RED-GREEN-REFACTOR cycle enforcement
- **dispatching-parallel-agents** - Concurrent subagent workflows

### Quality
- **verification-before-completion** - Verify before claiming done
- **requesting-code-review** - Request review against plan
- **receiving-code-review** - Handle review feedback with rigor
- **deep-review** - Find refactoring opportunities through investigation
- **analytics** - Data-driven analysis and investigation

### Git & Workflow
- **using-git-worktrees** - Isolated development branches
- **finishing-a-development-branch** - Merge/PR decision workflow
- **systematic-debugging** - 4-phase root cause process

### Meta
- **writing-skills** - Create and test new skills
- **using-tina** - Introduction to the skills system

## Agents

Subagent types for the Task tool:

- **tina:planner** - Creates implementation plans for a design doc phase
- **tina:implementer** - Implements a single task from a plan
- **tina:spec-reviewer** - Verifies implementation matches spec
- **tina:code-quality-reviewer** - Reviews architecture, patterns, maintainability
- **tina:code-reviewer** - Full review for completed work
- **tina:phase-reviewer** - Validates completed phase against design

## Installation

First, add the TINA marketplace:

```bash
claude plugins add-marketplace https://raw.githubusercontent.com/joshuabates/tina/refs/heads/main/marketplace.json
```

Then install TINA:

```bash
claude plugins add tina
```

Requires:
- Claude Code CLI
- [claude-sneakpeek](https://github.com/mikekelly/claude-sneakpeek) (for automated orchestration mode)

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/tina:brainstorm` | Start interactive design refinement |
| `/tina:orchestrate <design-doc>` | Run automated pipeline on a design |
| `/tina:write-plan` | Create implementation plan manually |
| `/tina:execute-plan` | Execute plan with subagents |

### Typical Flow

1. **Brainstorm** - `/tina:brainstorm` to refine your idea into a design doc
2. **Architect review** - Design gets validated before implementation
3. **Orchestrate** - `/tina:orchestrate docs/plans/my-design.md` runs everything else

Or run steps manually if you prefer more control.

## Credits

Based on [Superpowers](https://github.com/anthropics/superpowers) by Jesse Vincent. TINA extends the brainstorm → design → plan → implement workflow with an orchestration layer for multi-phase projects.

## License

MIT
