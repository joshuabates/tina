# Investigation Skills Design

Two new skills for structured investigation: `deep-review` for evaluating code/architecture, and `analytics` for data-driven analysis.

## Background

The brainstorming skill produces great results through:
- One-question-at-a-time dialogue
- Incremental validation (presenting in sections, checking each)
- Structured progression through phases
- Collaborative refinement

These skills apply the same interaction pattern to different domains.

## Skill 1: deep-review

### Purpose

Find refactoring opportunities through deep investigation of your own code.

### When to Use

- Scheduled/periodic review ("time to take stock")
- Before major changes ("understand what's here first")
- Something feels wrong ("this area is fragile/slow/confusing")
- Post-incident ("that bug revealed something, what else is lurking?")

### Scope Types

- **Vertical:** Specific module or area ("review the authentication system")
- **Horizontal:** Concern across codebase ("review error handling everywhere")

### Priority Framework

Findings are prioritized by:

1. **Reduce duplication** - consolidate scattered logic
2. **Enable change** - make future work easier and safer
3. **Improve clarity** - easier to understand and maintain
4. **Performance/reliability** - only when it matters

### What It Looks For

In both production code AND tests:

- **Duplication** - similar logic in multiple places
- **Abstraction issues** - wrong level, leaky, or missing abstractions
- **Coupling problems** - things that should be independent but aren't
- **Complexity hotspots** - functions/modules that are hard to follow
- **Inconsistency** - similar things done different ways

### Process

**Phase 1: Scoping**
- Ask about scope: vertical (specific module/area) or horizontal (concern across codebase)
- Ask what prompted the review (scheduled, pre-change, pain, post-incident)
- Confirm understanding before investigating

**Phase 2: Autonomous Investigation**
- Explore the scoped area using Read, Grep, Glob, and subagents
- For each area examined, look for the issues listed above
- Apply same scrutiny to tests as production code
- Build a list of potential findings internally

**Phase 3: Collaborative Validation**
- When a finding emerges, pause and present it
- Explain what was found, why it matters, and its priority level
- Ask: "Does this resonate? Should I dig deeper here or continue exploring?"
- Incorporate feedback before continuing

**Phase 4: Synthesis**
- After investigation completes, present findings incrementally (200-300 words per section)
- Group by priority tier or by area, whichever makes more sense
- For each finding: what, why it matters, rough scope of fix
- Validate each section before continuing

### Outputs

**Primary: Prioritized findings list**

Each finding includes:
- **What:** Clear description of the issue
- **Where:** Files/modules affected
- **Why it matters:** Impact on duplication, changeability, clarity, or performance
- **Priority tier:** Based on the framework (1-4)
- **Rough scope:** Small, medium, or large refactoring effort

**Secondary: Written document**

Write findings to `docs/reviews/YYYY-MM-DD-<scope>-review.md`

Document structure:
- Scope and context (what was reviewed, why)
- Summary of findings (high-level overview)
- Detailed findings by priority tier
- Recommended next steps

**Optional: Transition to planning**

After presenting findings, ask: "Would you like to design a plan for any of these refactorings?"

If yes, transition to `superpowers:writing-plans` for the selected item(s), or invoke `superpowers:brainstorming` if the refactoring needs more design exploration first.

### Key Principles

- **One finding at a time during validation.** Don't dump a massive list. Present each significant finding, discuss it, then continue.
- **Tests are first-class.** Apply the same scrutiny to test code as production code.
- **Prioritize ruthlessly.** Not everything found is worth fixing. Use the priority framework.
- **Evidence over opinion.** Every finding needs concrete evidence - specific files, line numbers, examples.
- **Scope creep resistance.** If investigation reveals the scope should expand, pause and ask.
- **Actionable over comprehensive.** A review that finds 5 actionable things is better than one that catalogs 50 minor issues.

---

## Skill 2: analytics

### Purpose

Answer questions, investigate hunches, and understand patterns through hands-on data analysis.

### When to Use

- Specific question ("Why did error rates spike yesterday?")
- Vague hunch ("Something feels off with user signups")
- Understanding goal ("I need to understand our API usage patterns")

### Data Sources

- **Code:** Structure, dependencies, git history, complexity metrics
- **Structured data:** CSV, JSON, databases
- **Logs and metrics:** Application logs, system metrics
- **Live systems:** Convex, ActiveRecord, SQL, APIs

### Investigation Modes

- **Hypothesis-driven:** Question → data → answer with evidence
- **Exploration-driven:** Data/goal → patterns → insights

### Process

**Phase 1: Understanding Intent**
- Clarify what they're trying to learn (if not already clear)
- Identify data source (only ask if not obvious from context)
- Determine mode: hypothesis-driven or exploration-driven

**Phase 2: Orientation**
- Autonomously explore structure (schema, tables, columns, file format)
- Ask about domain meaning only when necessary for correct interpretation
- Form an investigation plan internally

**Phase 3: Active Investigation**
- Write and execute queries, scripts, or analysis code
- For code analysis: use git history, dependency graphs, complexity metrics
- For data: run SQL, parse files, call APIs as needed
- Build understanding incrementally

**Phase 4: Incremental Presentation**
- Present findings in chunks: show the data, then offer interpretation
- After each chunk, check: "Does this answer your question, or should I dig deeper?"
- Adjust direction based on feedback
- Continue until the question is answered or goal is achieved

**Phase 5: Synthesis**
- Summarize answers with supporting evidence
- Write report document if findings warrant it

### Outputs

**Primary: Answers with evidence**

Each answer includes:
- **The answer:** Direct response to the question or insight discovered
- **Supporting evidence:** The data/queries that back it up
- **Confidence level:** How certain, and what caveats apply
- **Related findings:** Anything interesting discovered along the way

**Secondary: Written report**

When findings warrant documentation, write to `docs/analytics/YYYY-MM-DD-<topic>.md`

Report structure:
- Question/goal (what we set out to learn)
- Summary (key findings in 2-3 sentences)
- Methodology (what data sources, what approach)
- Detailed findings with evidence
- Conclusions and any recommended actions

Include the actual queries/scripts used so analysis is reproducible.

### Key Principles

- **Show your work.** Always present the data alongside interpretation. Let the user see what you saw.
- **Interpret, don't just dump.** Raw data without context is noise. Explain what the data means.
- **Ask about meaning, not structure.** You can read a schema. You can't know that "status=3" means "canceled by admin" without asking.
- **Validate direction early.** After initial findings, check if you're on the right track.
- **Reproducibility matters.** Include queries and scripts in output so analysis can be re-run.
- **Know when to stop.** Answer the question, then stop. Don't keep digging for thoroughness.
- **Anomalies deserve attention.** If something unexpected shows up, surface it even if it wasn't the original question.

---

## Shared Interaction Pattern

Both skills share:

- **One question at a time** - keeps focus, prevents overwhelm
- **Autonomous work with collaborative checkpoints** - do the heavy lifting, pause when findings emerge
- **Incremental presentation** - present in sections, validate each before continuing
- **Evidence-based findings** - concrete data, not opinions or feelings
- **Written documentation** - capture findings for future reference

---

## Implementation Notes

These are two independent skills. They share an interaction pattern but have distinct purposes:

- `deep-review` is **evaluative** - rendering judgment about code quality
- `analytics` is **investigative** - discovering facts and patterns

Each skill has its own SKILL.md with the full process. The shared pattern is simple enough to implement independently in each.

### File Locations

- `skills/deep-review/SKILL.md`
- `skills/analytics/SKILL.md`

### Dependencies

Both skills may invoke:
- `superpowers:brainstorming` - if design exploration is needed
- `superpowers:writing-plans` - if implementation planning is needed
