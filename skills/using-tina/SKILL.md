---
name: using-tina
description: Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions
---

# You Have TINA

TINA is your orchestration and workflow system. It coordinates multi-phase implementations, enforces development discipline, and prevents the chaos of undisciplined action.

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

This is not negotiable. This is not optional. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## Your Skills

**Orchestration** - For complex multi-phase work:
- `orchestrate` - Fully automated execution from design doc to implementation
- `team-lead-init` - Initialize team-based execution
- `dispatching-parallel-agents` - Coordinate parallel independent tasks
- `rehydrate` - Restore session state after interruption
- `checkpoint` - Save context at thresholds

**Process** - HOW to approach work:
- `brainstorming` - Explore fuzzy requirements before implementation
- `quick-plan` - Lightweight planning for clear-scope tasks (research, present once, execute)
- `systematic-debugging` - Find root causes, not symptoms
- `test-driven-development` - Tests first, always
- `automated-refactoring` - Use ast-grep/fastmod for renames, transforms, migrations across 5+ files. NEVER manually Edit the same pattern across many files.

**Code Quality** - Verification and review:
- `requesting-code-review` - Get your work reviewed
- `receiving-code-review` - Process feedback correctly
- `deep-review` - Self-review for refactoring opportunities
- `verification-before-completion` - Prove it works before claiming done

**Planning & Execution**:
- `writing-plans` - Create implementation plans from specs
- `executing-plans` - Execute plans systematically
- `architect` - Validate design documents

**Git Workflow**:
- `using-git-worktrees` - Isolated feature work
- `finishing-a-development-branch` - Merge, PR, or cleanup

**Meta**:
- `analytics` - Investigate patterns in code or data
- `writing-skills` - Create new skills

## How to Access Skills

Use the `Skill` tool. When you invoke a skill, its content is loaded and presented to you—follow it directly. Never use the Read tool on skill files.

## The Rule

**Invoke relevant skills BEFORE any response or action.** Even a 1% chance a skill might apply means invoke it to check.

## Skill Priority

1. **Orchestration first** - If the task has multiple phases or needs coordination, use `orchestrate` or `team-lead-init`
2. **Process skills second** - `brainstorming`, `systematic-debugging`, `test-driven-development` determine HOW to approach work
3. **Implementation skills third** - Domain-specific guidance for execution

"Build feature X from this design" → `orchestrate`
"Let's add X" (vague) → `brainstorming` first
"Add X to the Y system" (clear scope) → `quick-plan` first
"Fix this bug" → `systematic-debugging` first
"Rename X across the codebase" → `automated-refactoring` first
About to Edit the same change in 5+ files → `automated-refactoring` IMMEDIATELY
"I'm done" → `verification-before-completion` first

## Red Flags

These thoughts mean STOP—you're rationalizing:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "I know what that means" | Knowing the concept ≠ using the skill. Invoke it. |
| "I'll just Edit each file" | If it's the same change in 5+ files, use `automated-refactoring`. |

## Skill Types

**Rigid** (TDD, debugging, verification): Follow exactly. Don't adapt away discipline.

**Flexible** (brainstorming, analytics): Adapt principles to context.

The skill itself tells you which.
