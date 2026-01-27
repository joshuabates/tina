# Brainstorming Research Integration Phase 2 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Update the brainstorming skill to integrate codebase research using the researcher subagent.

**Architecture:** The brainstorming skill spawns haiku researcher subagents at key points in the flow. After receiving user's idea and after answers mentioning concrete things (files, systems, technologies), it spawns `tina:researcher` to gather raw codebase data, then synthesizes findings into brief summaries before asking the next question.

**Phase context:** Phase 1 created `agents/researcher.md` - the haiku-based raw codebase exploration agent that returns curated code snippets without interpretation.

---

### Task 1: Add Research Section to Brainstorming Skill

**Files:**
- Modify: `/Users/joshua/Projects/tina/.worktrees/brainstorming-research/skills/brainstorming/SKILL.md`

**Model:** sonnet

**Step 1: Add Research Flow section after Overview**

Insert the following after the Overview section (after line 9, before "## The Process"):

```markdown
## Research Flow

Integrate codebase exploration to ask better questions from the start.

**When to research:**
1. **After idea received** - Quick codebase scan for directly related files/patterns
2. **After concrete mentions** - When an answer mentions specific files, systems, or technologies

**When NOT to research:**
- User is still clarifying the basic idea (too vague to search)
- Answer only contains preferences/opinions, nothing concrete
- Already explored that area in a previous turn

**How to research:**

Spawn researcher subagent:
```
Task tool:
  subagent_type: tina:researcher
  model: haiku
  prompt: "Find files related to [topic]. Return relevant file paths and code snippets."
```

**After receiving results:**
1. Review the raw findings
2. Do additional targeted exploration if needed (Read files, Grep patterns)
3. Synthesize understanding internally
4. Provide brief summary to user (1-2 sentences): "I looked at your auth system - it uses JWT middleware."
5. Continue with informed question

**If subagent finds nothing relevant:** Don't mention it, just proceed with the question.
```

**Step 2: Verify file is valid markdown**

Run: `head -50 /Users/joshua/Projects/tina/.worktrees/brainstorming-research/skills/brainstorming/SKILL.md`
Expected: Shows Overview and new Research Flow section

**Step 3: Commit**

```bash
git -C /Users/joshua/Projects/tina/.worktrees/brainstorming-research add skills/brainstorming/SKILL.md
git -C /Users/joshua/Projects/tina/.worktrees/brainstorming-research commit -m "feat(brainstorming): add research flow section"
```

---

### Task 2: Update The Process Section with Research Steps

**Files:**
- Modify: `/Users/joshua/Projects/tina/.worktrees/brainstorming-research/skills/brainstorming/SKILL.md`

**Model:** sonnet

**Step 1: Update "Understanding the idea" subsection**

Find and replace the "Understanding the idea" bullet list. The current text:
```markdown
**Understanding the idea:**
- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria
- Explore codebase only when needed to understand constraints or existing patterns
```

Replace with:
```markdown
**Understanding the idea:**
- Ask what they want to brainstorm (no exploration yet)
- Once idea is received, spawn `tina:researcher` for quick codebase scan of related files
- Provide brief summary of findings before first question
- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria
- After answers mentioning concrete things (files, systems, technologies): spawn researcher, brief summary, then next question
```

**Step 2: Verify the update looks correct**

Run: `grep -A 10 "Understanding the idea" /Users/joshua/Projects/tina/.worktrees/brainstorming-research/skills/brainstorming/SKILL.md`
Expected: Shows updated bullet list with researcher spawn steps

**Step 3: Commit**

```bash
git -C /Users/joshua/Projects/tina/.worktrees/brainstorming-research add skills/brainstorming/SKILL.md
git -C /Users/joshua/Projects/tina/.worktrees/brainstorming-research commit -m "feat(brainstorming): integrate researcher into question flow"
```

---

### Task 3: Add External Research Triggers Section

**Files:**
- Modify: `/Users/joshua/Projects/tina/.worktrees/brainstorming-research/skills/brainstorming/SKILL.md`

**Model:** sonnet

**Step 1: Add External Research section before Key Principles**

Insert the following before the "## Key Principles" section:

```markdown
## External Research

Use WebSearch for external research based on session context.

**Do external research when:**
- Exploring options ("what are my choices for X")
- Checking if something is supported
- Comparing approaches
- Free-form research sessions

**Skip external research when:**
- Concrete implementation work where approach is decided
- User has a specific solution in mind ("I want to build X using Y")

Use judgment based on session context.
```

**Step 2: Verify the section was added**

Run: `grep -B 2 -A 12 "External Research" /Users/joshua/Projects/tina/.worktrees/brainstorming-research/skills/brainstorming/SKILL.md`
Expected: Shows the new External Research section

**Step 3: Commit**

```bash
git -C /Users/joshua/Projects/tina/.worktrees/brainstorming-research add skills/brainstorming/SKILL.md
git -C /Users/joshua/Projects/tina/.worktrees/brainstorming-research commit -m "feat(brainstorming): add external research triggers guidance"
```

---

### Task 4: Add Research Key Principle

**Files:**
- Modify: `/Users/joshua/Projects/tina/.worktrees/brainstorming-research/skills/brainstorming/SKILL.md`

**Model:** haiku

**Step 1: Add research principle to Key Principles section**

Find the Key Principles section and add after "One question at a time":

```markdown
- **Research before questions** - Spawn researcher after idea received and after concrete mentions
- **Brief summaries** - Keep research summaries to 1-2 sentences ("I looked at X - found Y")
```

**Step 2: Verify the update**

Run: `grep -A 15 "Key Principles" /Users/joshua/Projects/tina/.worktrees/brainstorming-research/skills/brainstorming/SKILL.md`
Expected: Shows Key Principles with new research bullets

**Step 3: Commit**

```bash
git -C /Users/joshua/Projects/tina/.worktrees/brainstorming-research add skills/brainstorming/SKILL.md
git -C /Users/joshua/Projects/tina/.worktrees/brainstorming-research commit -m "feat(brainstorming): add research key principles"
```

---

### Task 5: Final Verification and Squash Commits

**Files:**
- Review: `/Users/joshua/Projects/tina/.worktrees/brainstorming-research/skills/brainstorming/SKILL.md`

**Step 1: Read the complete updated file**

Run: `cat /Users/joshua/Projects/tina/.worktrees/brainstorming-research/skills/brainstorming/SKILL.md`
Expected: Complete skill with all new sections integrated properly

**Step 2: Verify the skill structure is coherent**

Check that:
- Research Flow section appears after Overview
- Understanding the idea includes researcher spawn steps
- External Research section appears before Key Principles
- Key Principles includes research bullets
- No duplicate or conflicting guidance

**Step 3: Squash commits into single feature commit**

```bash
git -C /Users/joshua/Projects/tina/.worktrees/brainstorming-research reset --soft HEAD~4
git -C /Users/joshua/Projects/tina/.worktrees/brainstorming-research commit -m "feat(brainstorming): integrate codebase research into brainstorming flow

- Add Research Flow section with subagent spawn guidance
- Update Understanding the idea with research steps
- Add External Research triggers section
- Add research key principles

Research improves question quality by exploring codebase context before
asking questions. Uses tina:researcher (haiku) for raw data, main model
for synthesis and brief user-facing summaries."
```

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Lines added | ~50 | `git diff --stat HEAD~1 -- skills/brainstorming/SKILL.md` |
| Sections added | 2 | `grep -c "^## " skills/brainstorming/SKILL.md` (before vs after) |
| Files touched | 1 | `git diff --name-only HEAD~1` |

**Target files:**
- `skills/brainstorming/SKILL.md` - Updated skill with research integration

**ROI expectation:** Low implementation effort (documentation-only changes) for significant improvement in brainstorming question relevance. The researcher subagent (Phase 1) does the heavy lifting; this phase just teaches the brainstorming skill when and how to use it.
