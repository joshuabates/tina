# Investigation Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use tina:executing-plans to implement this plan task-by-task.

**Goal:** Create two new skills (`deep-review` and `analytics`) that apply the brainstorming interaction pattern to code review and data analysis.

**Architecture:** Two independent SKILL.md files following existing skill conventions. Each skill is self-contained with its own phases, principles, and outputs.

**Tech Stack:** Markdown skill files following the YAML frontmatter + markdown body pattern used by existing skills.

---

## Task 1: Create deep-review Skill Directory and SKILL.md

**Files:**
- Create: `skills/deep-review/SKILL.md`

**Step 1: Create the skill directory**

```bash
mkdir -p skills/deep-review
```

**Step 2: Write the SKILL.md file**

Create `skills/deep-review/SKILL.md` with the following content:

```markdown
---
name: deep-review
description: Use when evaluating your own code/architecture to find refactoring opportunities. Works through collaborative investigation with autonomous exploration and checkpoints when findings emerge.
---

# Deep Code Review

## Overview

Find refactoring opportunities through deep investigation of your own code. Works through collaborative investigation - autonomous exploration with checkpoints when findings emerge.

**Announce at start:** "I'm using the deep-review skill to investigate this codebase."

## When to Use

- Scheduled/periodic review ("time to take stock")
- Before major changes ("understand what's here first")
- Something feels wrong ("this area is fragile/slow/confusing")
- Post-incident ("that bug revealed something, what else is lurking?")

## Phase 1: Scoping

**Start by clarifying scope:**

Ask ONE question at a time:

1. **Scope type:**
   - Vertical: specific module/area ("review the authentication system")
   - Horizontal: concern across codebase ("review error handling everywhere")

2. **What prompted this review?** (helps focus investigation)
   - Scheduled/periodic
   - Pre-change preparation
   - Something feels wrong
   - Post-incident

Confirm understanding before proceeding.

## Phase 2: Autonomous Investigation

**Explore the scoped area systematically:**

Use Read, Grep, Glob, and subagents (Task tool with Explore) to examine the code.

**Look for these issues in both production code AND tests:**

| Issue | What to Look For |
|-------|------------------|
| **Duplication** | Similar logic in multiple places, copy-paste patterns |
| **Abstraction issues** | Wrong level, leaky, or missing abstractions |
| **Coupling problems** | Things that should be independent but aren't |
| **Complexity hotspots** | Functions/modules that are hard to follow |
| **Inconsistency** | Similar things done different ways |

Build a list of potential findings internally. Don't dump everything at once.

## Phase 3: Collaborative Validation

**When a finding emerges, pause and present it:**

For each significant finding:
1. Explain what was found
2. Show concrete evidence (files, line numbers, examples)
3. Explain why it matters
4. State the priority level (see Priority Framework below)
5. Ask: "Does this resonate? Should I dig deeper here or continue exploring?"

Incorporate feedback before continuing. If the user says it's not important, move on.

## Phase 4: Synthesis

**After investigation completes:**

Present findings incrementally (200-300 words per section). Group by priority tier or by area, whichever makes more sense for this review.

For each finding:
- **What:** Clear description
- **Where:** Files/modules affected
- **Why it matters:** Impact on duplication, changeability, clarity, or performance
- **Priority tier:** 1-4 based on framework
- **Rough scope:** Small, medium, or large effort

Validate each section before continuing to the next.

## Priority Framework

Prioritize findings by:

1. **Reduce duplication** - consolidate scattered logic (highest value)
2. **Enable change** - make future work easier and safer
3. **Improve clarity** - easier to understand and maintain
4. **Performance/reliability** - only when it matters (lowest priority unless critical)

## Outputs

**Primary: Prioritized findings list** (delivered incrementally during Phase 4)

**Secondary: Written document**

After validation, write findings to `docs/reviews/YYYY-MM-DD-<scope>-review.md`

Document structure:
- Scope and context (what was reviewed, why)
- Summary of findings (high-level overview)
- Detailed findings by priority tier
- Recommended next steps

Commit the document to git.

**Optional: Transition to planning**

After presenting findings, ask: "Would you like to design a plan for any of these refactorings?"

- If design exploration needed → invoke `tina:brainstorming`
- If ready to plan → invoke `tina:writing-plans`

## Key Principles

- **One finding at a time during validation.** Don't dump a massive list. Present, discuss, continue.
- **Tests are first-class.** Same scrutiny for test code as production code.
- **Prioritize ruthlessly.** Not everything found is worth fixing. Use the priority framework.
- **Evidence over opinion.** Every finding needs concrete evidence - files, line numbers, examples.
- **Scope creep resistance.** If investigation reveals scope should expand, pause and ask.
- **Actionable over comprehensive.** 5 actionable findings beats 50 minor issues.

## Red Flags

If you catch yourself:
- Dumping all findings at once → Present one at a time
- Listing issues without evidence → Add file paths, line numbers, examples
- Including everything found → Prioritize ruthlessly
- Expanding scope silently → Pause and ask
- Skipping tests → Tests are first-class citizens
```

**Step 3: Verify the file was created**

```bash
ls -la skills/deep-review/
cat skills/deep-review/SKILL.md | head -20
```

**Step 4: Commit**

```bash
git add skills/deep-review/SKILL.md
git commit -m "feat: add deep-review skill for code/architecture investigation"
```

---

## Task 2: Create analytics Skill Directory and SKILL.md

**Files:**
- Create: `skills/analytics/SKILL.md`

**Step 1: Create the skill directory**

```bash
mkdir -p skills/analytics
```

**Step 2: Write the SKILL.md file**

Create `skills/analytics/SKILL.md` with the following content:

```markdown
---
name: analytics
description: Use when you need to answer questions, investigate hunches, or understand patterns in code or data. Hands-on investigation that actually runs queries and scripts.
---

# Analytics

## Overview

Answer questions, investigate hunches, and understand patterns through hands-on data analysis. Actually runs queries and scripts to find answers.

**Announce at start:** "I'm using the analytics skill to investigate this."

## When to Use

- Specific question ("Why did error rates spike yesterday?")
- Vague hunch ("Something feels off with user signups")
- Understanding goal ("I need to understand our API usage patterns")

## Data Sources

| Source | Examples |
|--------|----------|
| **Code** | Structure, dependencies, git history, complexity metrics |
| **Structured data** | CSV, JSON, databases |
| **Logs and metrics** | Application logs, system metrics |
| **Live systems** | Convex, ActiveRecord, SQL, APIs |

## Investigation Modes

- **Hypothesis-driven:** Question → data → answer with evidence
- **Exploration-driven:** Data/goal → patterns → insights

## Phase 1: Understanding Intent

Clarify what they're trying to learn:

1. **What's the question/goal?** (if not already clear from context)
2. **What data source?** (only ask if not obvious)
3. **Which mode?** Hypothesis-driven or exploration-driven

Don't ask questions when the answer is obvious from context.

## Phase 2: Orientation

**Autonomously explore structure:**

- Read schemas, tables, columns, file formats
- Understand the shape of the data
- Form an investigation plan internally

**Ask about domain meaning only when necessary:**

You can read that a column is called `status` with values 1-5. You can't know that `status=3` means "canceled by admin" without asking.

Ask about meaning, not structure.

## Phase 3: Active Investigation

**Write and execute queries, scripts, or analysis code:**

For code analysis:
- Git history: `git log`, `git blame`, change frequency
- Dependencies: imports, call graphs
- Complexity: function length, nesting depth, cyclomatic complexity

For data:
- SQL queries for databases
- Scripts to parse CSV/JSON
- API calls to live systems
- Log parsing and aggregation

Build understanding incrementally. Don't try to answer everything at once.

## Phase 4: Incremental Presentation

**Present findings in chunks:**

1. Show the data (query results, metrics, patterns)
2. Offer interpretation (what this means)
3. Check: "Does this answer your question, or should I dig deeper?"

Adjust direction based on feedback. Continue until the question is answered or goal is achieved.

**Don't:**
- Dump raw data without interpretation
- Keep digging past the answer
- Present everything at once

## Phase 5: Synthesis

**Summarize answers with supporting evidence.**

Write report if findings warrant documentation:

`docs/analytics/YYYY-MM-DD-<topic>.md`

Report structure:
- Question/goal (what we set out to learn)
- Summary (key findings in 2-3 sentences)
- Methodology (what data sources, what approach)
- Detailed findings with evidence
- Conclusions and any recommended actions

**Include the actual queries/scripts** so analysis is reproducible.

Commit the document to git.

## Outputs

**Primary: Answers with evidence**

Each answer includes:
- **The answer:** Direct response to question or insight discovered
- **Supporting evidence:** The data/queries that back it up
- **Confidence level:** How certain, and what caveats apply
- **Related findings:** Anything interesting discovered along the way

**Secondary: Written report** (when findings warrant documentation)

## Key Principles

- **Show your work.** Present data alongside interpretation. Let user see what you saw.
- **Interpret, don't just dump.** Raw data without context is noise. Explain what it means.
- **Ask about meaning, not structure.** You can read schemas. Ask about domain semantics.
- **Validate direction early.** After initial findings, check if you're on track.
- **Reproducibility matters.** Include queries/scripts so analysis can be re-run.
- **Know when to stop.** Answer the question, then stop. Don't dig for thoroughness.
- **Anomalies deserve attention.** Surface unexpected findings even if not the original question.

## Red Flags

If you catch yourself:
- Asking about obvious data sources → Just start investigating
- Dumping raw query results → Interpret what they mean
- Digging past the answer → Stop when question is answered
- Skipping the evidence → Always show what data supports conclusions
- Forgetting reproducibility → Include queries/scripts in output
```

**Step 3: Verify the file was created**

```bash
ls -la skills/analytics/
cat skills/analytics/SKILL.md | head -20
```

**Step 4: Commit**

```bash
git add skills/analytics/SKILL.md
git commit -m "feat: add analytics skill for data-driven investigation"
```

---

## Task 3: Update Plugin Manifest (if needed)

**Files:**
- Check: `.claude-plugin/manifest.json` or similar

**Step 1: Check if skills need to be registered**

```bash
ls -la .claude-plugin/
cat .claude-plugin/manifest.json 2>/dev/null || echo "No manifest found"
```

**Step 2: If manifest exists and skills need registration**

Add entries for `deep-review` and `analytics` following the existing pattern.

**Step 3: Commit if changes were made**

```bash
git add .claude-plugin/
git commit -m "chore: register deep-review and analytics skills in manifest"
```

---

## Task 4: Create Output Directories

**Files:**
- Create: `docs/reviews/.gitkeep`
- Create: `docs/analytics/.gitkeep`

**Step 1: Create the directories with .gitkeep files**

```bash
mkdir -p docs/reviews docs/analytics
touch docs/reviews/.gitkeep docs/analytics/.gitkeep
```

**Step 2: Commit**

```bash
git add docs/reviews/.gitkeep docs/analytics/.gitkeep
git commit -m "chore: add output directories for review and analytics skills"
```

---

## Task 5: Final Verification

**Step 1: Verify skill structure**

```bash
ls -la skills/deep-review/
ls -la skills/analytics/
```

**Step 2: Verify skill content has correct frontmatter**

```bash
head -5 skills/deep-review/SKILL.md
head -5 skills/analytics/SKILL.md
```

**Step 3: Verify output directories exist**

```bash
ls -la docs/reviews/
ls -la docs/analytics/
```

**Step 4: Check git log shows all commits**

```bash
git log --oneline -5
```

**Step 5: Report completion**

Both skills are implemented and ready to use:
- `/deep-review` - for code/architecture investigation
- `/analytics` - for data-driven analysis
