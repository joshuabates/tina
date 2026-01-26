![Tina](assets/tina.png)

# TINA

**Teams Iterating, Not Accumulating**

A development workflow system for Claude Code with an orchestration layer that manages context across multi-phase projects. Based on [Superpowers](https://github.com/anthropics/superpowers) with added automation: TINA spawns workers in isolated tmux sessions, monitors progress, handles checkpoints when context fills up, and recovers from failures.

## Why TINA?

The Superpowers workflow (brainstorm → design → plan → implement/review) works well for single-phase projects. But complex work requires multiple phases, and Claude's context window becomes the bottleneck.

TINA's orchestration layer solves this:
- **Fresh context per phase** - Workers run in tmux with clean context
- **Automatic checkpoints** - Saves state when context fills, rehydrates after clearing
- **Failure recovery** - Detects crashed sessions, diagnoses issues, attempts recovery
- **Resumable** - Pick up where you left off after interruptions

## The Workflow

```
You ←→ Brainstorming (interactive)
            ↓
       Design Doc (saved to disk)
            ↓
       Architect Review (validates design)
            ↓
  ┌─────────────────────────────────────┐
  │         Orchestration Layer         │
  │                                     │
  │   For each phase:                   │
  │     1. Planner creates implementation plan
  │     2. Team-lead spawns in tmux     │
  │     3. Workers implement + review   │
  │     4. Phase reviewer validates     │
  │                                     │
  │   Context full? → Checkpoint → Clear → Rehydrate
  │   Worker crashed? → Diagnose → Recover
  │   All phases done? → Finish workflow │
  └─────────────────────────────────────┘
            ↓
       Merge / PR
```

**Manual mode:** Run each step yourself with individual skills.
**Automated mode:** Hand off a design doc to `/tina:orchestrate` and let it run.

> **Note:** Automated mode requires [claude-sneakpeek](https://github.com/mikekelly/claude-sneakpeek) for team-based execution. A non-team mode is planned for the future.

## Skills

### Orchestration
- **orchestrate** - Automated pipeline from design doc to implementation
- **team-lead-init** - Initializes team-lead in tmux session for phase execution
- **checkpoint** - Saves state to disk when context fills up
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

## Usage

### Quick Start

```bash
# Install the plugin
claude plugins add /path/to/tina

# Start with brainstorming
/tina:brainstorm
```

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

## Installation

```bash
claude plugins add /path/to/tina
```

Requires:
- Claude Code CLI
- [claude-sneakpeek](https://github.com/mikekelly/claude-sneakpeek) (for automated orchestration mode)

## Credits

Based on [Superpowers](https://github.com/anthropics/superpowers) by Jesse Vincent. TINA extends the brainstorm → design → plan → implement workflow with an orchestration layer for multi-phase projects.

## License

MIT
