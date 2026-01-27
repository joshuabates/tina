# Brainstorming Research Integration

## Problem

The brainstorming skill asks questions without enough context, only starting to ask relevant questions later in the process after gathering more information organically. We want more proactive research to inform better questions from the start.

## Solution

Integrate codebase exploration and external research into the brainstorming flow using subagents for raw research and the main model for synthesis.

## Research Flow

1. **Initial prompt** - Ask what they want to brainstorm (no exploration yet)
2. **Idea received** - Quick codebase scan for directly related files/patterns
3. **Brief summary** - "I looked at X - found Y" before first question
4. **Ongoing** - When an answer mentions something concrete (file, system, tech), research it before the next question with a brief summary
5. **External research** - Based on session context (see triggers below)

### Trigger Criteria for Ongoing Research

Research is triggered by concrete mentions:
- Specific file or module names
- System names (auth, payments, notifications)
- Technology mentions (Redis, PostgreSQL, WebSockets)

NOT triggered by:
- Abstract concepts or preferences
- Things already explored in previous turns

## Research Implementation

### Subagent Role (haiku)

- Raw exploration: find files, read contents, search patterns
- Curate: filter out noise, return what's relevant to the question
- Return actual code/data, not summaries
- No interpretation or recommendations

Example prompts:
- "Find files related to [idea]. Read the most relevant ones. Return relevant file paths and code snippets."
- "Find how [concrete thing] works. Return the relevant code, skip boilerplate."

### Main Model Role (opus)

- Receives curated raw data from subagent
- May do additional targeted exploration based on findings
- Synthesizes understanding internally
- Produces brief summary for user ("I looked at your auth system - it uses JWT middleware")
- Formulates informed question

## Edge Cases and Boundaries

### When NOT to Research Codebase

- User is still clarifying the basic idea (too vague)
- Answer only contains preferences/opinions, nothing concrete
- Already explored that area in a previous turn

### Research Scope Limits

- Initial scan: ~5-10 most relevant files max
- Ongoing research: focused on the specific thing mentioned

### If Subagent Finds Nothing Relevant

Don't mention it, just proceed with the question.

### External Research Triggers

**Yes - do external research:**
- Exploring options ("what are my choices for X")
- Checking if something is supported
- Comparing approaches
- Free-form research sessions

**No - skip external research:**
- Concrete implementation work where approach is decided
- User has a specific solution in mind ("I want to build X using Y")

Use judgment based on session context.

## Skill Structure Changes

### Current Flow

1. Ask what to brainstorm
2. Ask questions one at a time
3. Propose approaches
4. Present design in sections
5. Write doc, architect review, etc.

### Modified Flow

1. Ask what to brainstorm
2. **[NEW]** Spawn haiku subagent for quick codebase scan
3. **[NEW]** Review findings, maybe explore more, brief summary to user
4. Ask questions one at a time
   - **[NEW]** After answers mentioning concrete things: spawn subagent, review, brief summary
5. Propose approaches (informed by accumulated context)
6. Present design in sections
7. Write doc, architect review, etc.

## Changes Required

Update the brainstorming skill file to:
- Add guidance on when to spawn research subagents
- Add example prompts for subagents (curate, don't summarize)
- Clarify the curate-not-summarize expectation
- Add guidance on brief summaries to user
- Document external research triggers

## Success Metrics

- Brainstorming questions are relevant from the first substantive question (after initial exploration)
- Research summaries are brief (1-2 sentences) and informative
- No unnecessary research on abstract/preference-only answers
- External research only happens in exploratory contexts

## Architectural Context

**Patterns to follow:**
- Subagent delegation: `skills/orchestrate/SKILL.md:95-110` - uses Task tool with `model: "haiku"` for background work
- Writing-plans delegation: `skills/writing-plans/SKILL.md:15-20` - simple subagent dispatch pattern

**Code to reuse:**
- `skills/brainstorming/SKILL.md` - existing skill to modify (single file change)

**Integration:**
- Entry: User invokes `/brainstorming` or skill triggers on creative work
- Subagents: Task tool with `model: "haiku"` and `subagent_type: "Explore"` for codebase research
- External: WebSearch/WebFetch for external research (main model, not delegated)

**Anti-patterns:**
- Don't use Explore agent for raw data fetch - it tries to answer questions, not return raw data
- Use explicit haiku prompts with "return code/data, don't summarize" instructions instead

**Implementation notes:**
- Haiku subagents via Task tool with `model: "haiku"`, `subagent_type: "general-purpose"`
- Prompt must explicitly request curated raw data, not analysis
- Main model (opus) handles synthesis and user-facing summaries
