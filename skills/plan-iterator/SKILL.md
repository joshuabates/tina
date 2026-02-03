---
name: plan-iterator
description: Use when you need to update an existing implementation plan based on feedback. Makes surgical edits without wholesale rewrites.
---

# Plan Iterator

Update existing implementation plans based on feedback.

**Announce at start:** "I'm using the plan-iterator skill to update this plan."

## When to Use

- User provides feedback on an existing plan
- Requirements changed after plan was written
- Need to add/remove phases
- Need to update success criteria
- Technical details need adjustment

## When NOT to Use

- Creating a new plan (use `tina:writing-plans`)
- Major scope change that needs new design (use `tina:brainstorming`)
- Plan is fundamentally wrong (start over)

## Usage

### Direct Invocation

```yaml
Task:
  subagent_type: tina:plan-iterator
  prompt: |
    Plan: docs/plans/2026-01-28-auth-phase-1.md
    Feedback: Add error handling for expired tokens
```

### From Conversation

If user says something like:
- "Actually, add X to the plan"
- "Update the plan to include Y"
- "Remove the phase about Z"

Invoke plan-iterator:
```yaml
Task:
  subagent_type: tina:plan-iterator
  prompt: |
    Plan: {path from context}
    Feedback: {user's request}
```

## What Plan-Iterator Does

1. **Reads** the existing plan completely
2. **Understands** the requested changes
3. **Researches** if changes require new technical knowledge (spawns locator/analyzer)
4. **Confirms** understanding before editing
5. **Edits** surgically using Edit tool
6. **Reports** what was changed

## Common Iterations

| Feedback | What Changes |
|----------|--------------|
| "Add phase for X" | New phase section following existing format |
| "Remove Y from scope" | Update "What We're NOT Doing", remove related tasks |
| "Make success criteria more specific" | Update Automated/Manual Verification sections |
| "Add error handling for Z" | Add task to relevant phase, add test case |
| "Split phase N into two" | Create two phases from one, redistribute tasks |

## Integration

**After iteration:**
- Plan is updated in place
- Validate with `tina:plan-validator` if significant changes
- Re-run `tina:architect` if scope changed substantially

**Iteration limits:**
- If requiring more than 3 iterations, consider whether the plan needs redesign
- If feedback contradicts plan goals, escalate to user
