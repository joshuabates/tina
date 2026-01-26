# Supersonic

Personal skills library for Claude Code, forked from [Superpowers](https://github.com/obra/superpowers).

## Skills

**Core Workflow**
- **brainstorming** - Design refinement through questions
- **orchestrate** - Automated pipeline from design to implementation
- **writing-plans** - Break work into detailed tasks
- **executing-plans** - Dispatch subagents per task with two-stage review

**Development**
- **test-driven-development** - RED-GREEN-REFACTOR cycle
- **systematic-debugging** - 4-phase root cause process
- **verification-before-completion** - Verify before claiming done

**Collaboration**
- **dispatching-parallel-agents** - Concurrent subagent workflows
- **requesting-code-review** - Request review against plan
- **receiving-code-review** - Handle review feedback
- **using-git-worktrees** - Isolated development branches
- **finishing-a-development-branch** - Merge/PR decision workflow

**Meta**
- **writing-skills** - Create and test new skills
- **using-superpowers** - Introduction to skills system

## Agents

Subagent types for use with the Task tool:
- **supersonic:implementer** - Implements a single task
- **supersonic:spec-reviewer** - Verifies implementation matches spec
- **supersonic:code-quality-reviewer** - Reviews code quality
- **supersonic:code-reviewer** - Full code review for completed work

## Commands

- `/supersonic:brainstorm` - Start design refinement
- `/supersonic:orchestrate` - Start automated pipeline
- `/supersonic:write-plan` - Create implementation plan
- `/supersonic:execute-plan` - Execute plan with subagents

## License

MIT
