---
name: deep-review
description: Use when evaluating your own code/architecture to find refactoring opportunities - scheduled reviews, before major changes, when something feels wrong, or post-incident investigation
---

# Deep Code Review

Find refactoring opportunities through structured investigation of your own code.

**Core principle:** Autonomous exploration with collaborative checkpoints when findings emerge.

**Announce at start:** "I'm using the deep-review skill to investigate this codebase."

## Phase 1: Scoping

**Ask ONE question at a time.** Don't overwhelm with multiple questions.

1. **What's the scope?**
   - Vertical: specific module/area ("review the authentication system")
   - Horizontal: concern across codebase ("review error handling everywhere")

2. **What prompted this?**
   - Scheduled/periodic
   - Before major changes
   - Something feels wrong
   - Post-incident

Confirm understanding before proceeding to investigation.

## Phase 2: Autonomous Investigation

Explore the scoped area using Read, Grep, Glob, and subagents (Task tool with Explore).

**Look for these issues in BOTH production code AND tests:**

| Issue | What to Look For |
|-------|------------------|
| **Duplication** | Similar logic in multiple places, copy-paste patterns |
| **Abstraction issues** | Wrong level, leaky, or missing abstractions |
| **Coupling** | Things that should be independent but aren't |
| **Complexity** | Functions/modules hard to follow |
| **Inconsistency** | Similar things done different ways |

Build findings internally. Don't present everything at once.

## Phase 3: Collaborative Validation

**When a significant finding emerges, pause and present it.**

For each finding:
1. What was found (concrete evidence - files, lines, examples)
2. Why it matters
3. Priority level (see framework below)
4. Ask: "Does this resonate? Dig deeper or continue?"

Incorporate feedback before continuing. If user says it's not important, move on.

## Phase 4: Synthesis

**Present findings incrementally.** 200-300 words per section.

Group by priority tier or area - whichever fits this review better.

For each finding:
- **What:** Clear description
- **Where:** Files/modules affected
- **Why:** Impact on duplication, changeability, clarity, or performance
- **Priority:** 1-4 based on framework
- **Scope:** Small, medium, or large effort

**Validate each section** before continuing to the next.

## Priority Framework

1. **Reduce duplication** - consolidate scattered logic (highest value)
2. **Enable change** - make future work easier and safer
3. **Improve clarity** - easier to understand and maintain
4. **Performance/reliability** - only when it matters

## Outputs

**After validation, write findings to:** `docs/reviews/YYYY-MM-DD-<scope>-review.md`

Document structure:
- Scope and context
- Summary of findings
- Detailed findings by priority
- Recommended next steps

Commit to git.

**Optional transition:**
Ask: "Would you like to design a plan for any of these refactorings?"
- If design needed → `tina:brainstorming`
- If ready to plan → `tina:writing-plans`

## Red Flags

If you catch yourself:
- **Diving in without scoping** → Stop. Ask about scope first.
- **Dumping all findings at once** → Present one at a time, validate each.
- **Listing without evidence** → Add file paths, line numbers, examples.
- **Including everything found** → Prioritize ruthlessly.
- **Expanding scope silently** → Pause and ask.
- **Skipping tests** → Tests are first-class. Same scrutiny.
- **Equal-weighting everything** → Use the priority framework.

## Key Principles

- **One finding at a time** during validation
- **Tests are first-class** - same scrutiny as production code
- **Evidence over opinion** - files, lines, examples
- **Actionable over comprehensive** - 5 actionable beats 50 minor
- **Scope creep resistance** - ask before expanding
