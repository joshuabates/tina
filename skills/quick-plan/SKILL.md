---
name: quick-plan
description: "Lightweight planning for smaller tasks. Deep research, minimal back-and-forth. Use instead of brainstorming when scope is clear."
---

# Quick Plan

## Overview

Research thoroughly, present once, get approval, execute. For tasks where the scope is reasonably clear but you need to understand the codebase before acting.

**Use quick-plan when:**
- Scope is defined (not exploratory)
- Single feature or focused change
- You could start immediately but want to validate approach first

**Use brainstorming instead when:**
- Requirements are fuzzy
- Multiple competing approaches need discussion
- Large architectural decisions

## Process

### 1. Research Phase (Silent)

Spawn researcher to understand the landscape:

```yaml
Task:
  subagent_type: tina:researcher
  prompt: |
    Research for planning: {feature/task description}

    Find:
    - Files that will need changes
    - Similar implementations to follow as patterns
    - Integration points and dependencies
    - Test files that will need updates
  hints: ["code-structure", "patterns"]
```

Wait for researcher to complete. Synthesize findings internally.

### 2. Present Plan (One Shot)

Present the complete plan in a single message:

```markdown
## Quick Plan: [Feature Name]

**Goal:** [One sentence]

**Approach:** [2-3 sentences on how you'll implement it]

**Key Files:**
- `path/to/main.ts` - [what changes]
- `path/to/test.ts` - [test coverage]

**Steps:**
1. [First concrete action]
2. [Second action]
3. [Third action]
...

**What I'm NOT doing:** [Scope boundaries]

**Risks/Assumptions:** [If any]
```

Keep it concise. No need for extensive justification if the approach is straightforward.

### 3. Get Approval

End with: **"Does this approach work, or should I adjust?"**

One round of feedback is normal. If the user wants significant changes, incorporate them and present again. If they want to explore alternatives, switch to brainstorming.

### 4. Execute

Once approved:
- Commit the plan to `docs/plans/YYYY-MM-DD-<topic>-plan.md` (optional for small tasks)
- Start implementation using TDD
- No need for formal orchestration unless the plan has 5+ tasks

## Key Differences from Brainstorming

| Aspect | Quick Plan | Brainstorming |
|--------|------------|---------------|
| Research | Same depth | Same depth |
| Questions | 0-1 rounds | Many rounds |
| Design sections | One shot | Incremental validation |
| Architect review | Skip | Required |
| Output | Lightweight plan | Full design doc |
| Best for | Clear scope | Fuzzy scope |

## Anti-Patterns

- **Over-planning small tasks** - If it's 1-2 file changes, just do it
- **Skipping research** - The value is in understanding before acting
- **Multiple Q&A rounds** - That's brainstorming; switch if needed
- **Detailed design docs** - Keep it actionable, not comprehensive
