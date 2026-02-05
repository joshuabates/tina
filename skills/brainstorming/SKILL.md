---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---

# Brainstorming Ideas Into Designs

## Overview

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Ask questions one at a time to refine the idea. Once you understand what you're building, present the design in small sections (200-300 words), checking after each section whether it looks right so far.

## Research Flow

Integrate codebase exploration to ask better questions from the start.

**When to research:**
1. **After idea received** - Comprehensive research on the topic area
2. **After concrete mentions** - When an answer mentions specific files, systems, or technologies

**When NOT to research:**
- User is still clarifying the basic idea (too vague to search)
- Answer only contains preferences/opinions, nothing concrete
- Already explored that area in a previous turn

**How to research:**

**For comprehensive research (recommended for new topics):**

```yaml
Skill:
  skill: tina:researcher
  args: |
    Research for brainstorming: {idea description}

    Find:
    - Existing code related to this feature area
    - Similar implementations or patterns in the codebase
    - Integration points and dependencies
    - How similar features are structured

    hints: code-structure, patterns
```

This loads the researcher skill in your session. You then spawn sub-researchers (locator, analyzer, pattern-finder) as Tasks - only one level of nesting.

**For quick targeted research (skip the coordinator):**

```yaml
Task:
  subagent_type: tina:locator
  model: haiku
  prompt: "Find files related to [topic]. Return file paths only."
```

**After research completes:**
1. Review findings
2. Provide brief summary to user (1-2 sentences): "I looked at your auth system - it uses JWT middleware with decorator patterns."
3. Continue with informed questions

**If research finds nothing relevant:** Don't mention it, just proceed with the question.

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

For external research, add hint:
```yaml
hints: ["code-structure", "patterns", "external-docs"]
```

Use judgment based on session context.

## The Process

**Understanding the idea:**
- Ask what they want to brainstorm (no exploration yet)
- Once idea is received, follow Research Flow to explore codebase
- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria
- After answers mentioning concrete things (files, systems, technologies), follow Research Flow again

**Exploring approaches:**
- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why

**Presenting the design:**
- Once you believe you understand what you're building, present the design
- Break it into sections of 200-300 words
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- If the design requires anything from the user before implementation can start (API keys, third-party accounts, service configuration, environment setup), include a `## Prerequisites` section listing each item with what's needed and why
- Be ready to go back and clarify if something doesn't make sense
- When you encounter genuine unknowns during design -- things that can't be resolved through discussion or research alone (performance questions, compatibility unknowns, library evaluations) -- mark them as explicit TBD sections rather than guessing or hand-waving
- TBD sections should state what's unknown and what information is needed to resolve it

## After the Design

**Documentation:**
- Write the validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- Use elements-of-style:writing-clearly-and-concisely skill if available
- Commit the design document to git

**TBD detection:**
- After writing the design doc, scan it for TBD sections
- TBD sections are paragraphs that start with "TBD:" and describe an unknown that needs investigation
- Example: `TBD: Need to determine whether Redis or in-memory caching is appropriate for our access patterns.`
- If NO TBD sections found: proceed to architectural review (current flow, unchanged)
- If TBD sections found: announce them to the user and offer the spike path (see below)

**When TBDs are found:**

Tell the user:

```
This design has [N] open question(s) marked as TBD:
- [TBD section name]: [brief description of the unknown]
- ...

These need to be resolved before implementation. Want to brainstorm a spike plan to run experiments that answer these questions?
```

If the user says yes, continue to "Spike plan authoring" below.
If the user says no or wants to resolve them differently, proceed to architectural review as normal.

**Spike plan authoring:**

When the user wants a spike plan, shift the brainstorming conversation to designing experiments. Stay in the same session -- this is a continuation of brainstorming, not a new skill invocation.

Walk through each TBD section and brainstorm:
1. What specific question does this TBD represent?
2. What experiment would answer it? (setup, steps, success criteria)
3. Are experiments independent or do some depend on others?

Present the spike plan incrementally (same 200-300 word sections, checking after each).

Once the spike plan is agreed upon, write it to `docs/plans/YYYY-MM-DD-<topic>-spike.md` using this structure:

~~~markdown
# Spike: <topic>

## Design Reference
- Design doc: `docs/plans/YYYY-MM-DD-<topic>-design.md`
- TBD sections to resolve:
  - "<section name>" -- <brief description>

## Questions
1. <question text>
   -> Resolves TBD in "<section name>"

## Experiments

### Experiment 1: <title> (answers Q1)
- <setup steps>
- <what to test>
- **Success looks like:** <criteria>

## Prerequisites
<if experiments need external resources (API keys, accounts, services, config), list them here -- omit section if none>
- <what's needed> -- <why and how to verify it's ready>

## Constraints
- Prototype only -- no production quality needed
- Code is throwaway (will not be merged)

## Output
For each question, produce:
1. Answer with evidence (benchmarks, test output, code that worked/didn't)
2. Proposed revision to the specific TBD section in the design doc
~~~

Commit the spike plan:
```bash
git add docs/plans/YYYY-MM-DD-<topic>-spike.md
git commit -m "docs: add spike plan for <topic>"
```

Report both artifacts:
```
Two artifacts created:
1. Design doc: docs/plans/YYYY-MM-DD-<topic>-design.md (has TBD sections)
2. Spike plan: docs/plans/YYYY-MM-DD-<topic>-spike.md (targets those TBDs)

Next step: run /spike docs/plans/YYYY-MM-DD-<topic>-spike.md
```

**Architectural review (when no TBDs or after spike):**
- Use tina:architect to review the design
- Architect explores codebase, asks questions if unclear, adds Architectural Context section
- Architect must approve design before proceeding
- If blocked: address concerns, then re-run architect review

**Design validation (for orchestrated projects):**
- If proceeding to orchestrated execution, design validator runs automatically
- Validator checks: measurable success criteria, estimate feasibility, baseline capture
- Design must have a `## Success Metrics` section with quantifiable goal
- If validation fails, revise design before proceeding

**Implementation (if continuing):**
- Ask: "Ready to set up for implementation?"
- Use tina:using-git-worktrees to create isolated workspace
- Use tina:writing-plans to create detailed implementation plan

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Research Flow** - Follow Research Flow after idea received and after concrete mentions
- **Brief summaries** - Keep research summaries to 1-2 sentences ("I looked at X - found Y")
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design in sections, validate each
- **Be flexible** - Go back and clarify when something doesn't make sense
- **Measurable goals required** - Every design must have quantifiable success criteria
