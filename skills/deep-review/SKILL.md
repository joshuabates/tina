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

**Spawn researcher to explore the scoped area:**

```yaml
Task:
  subagent_type: tina:researcher
  prompt: |
    Deep review of: {scoped area}

    Looking for:
    - Duplication (similar logic in multiple places)
    - Abstraction issues (wrong level, leaky, missing)
    - Coupling (things that should be independent)
    - Complexity (hard to follow)
    - Inconsistency (similar things done differently)

    Scope includes BOTH production code AND tests.
  hints: ["code-structure", "patterns", "test-coverage"]
```

**Researcher will autonomously:**
- Map code structure in scoped area
- Find duplication and similar patterns
- Identify coupling and dependencies
- Assess test coverage and quality
- Return findings organized by issue type

**Review findings internally.** Don't present everything at once - proceed to Phase 3 to validate findings one at a time with user.

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
