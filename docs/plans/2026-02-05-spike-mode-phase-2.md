# Spike Mode Phase 2 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Integrate spike mode into the brainstorming workflow so that design unknowns are captured as TBD sections and the brainstorming session can produce a spike plan alongside the design doc.

**Architecture:** The brainstorming skill (`skills/brainstorming/SKILL.md`) is modified to: (1) guide the user toward marking unknowns as explicit TBD sections during design presentation, (2) detect TBD sections in the written design doc, (3) offer to brainstorm a spike plan when TBDs are found, and (4) write the spike plan as a second artifact from the same brainstorming session. The "After the Design" flow gains a new fork -- if TBDs exist, the spike path is offered before architect review.

**Phase context:** Phase 1 (experimenter agent + spike skill) is complete. This phase modifies only `skills/brainstorming/SKILL.md`.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | N/A (markdown skill) |
| Max total implementation lines | ~100 lines added/modified |

---

### Task 1: Add TBD Guidance to Design Presentation

**Files:**
- Modify: `skills/brainstorming/SKILL.md`

**Model:** haiku

**review:** spec-only

**Step 1: Add TBD section guidance to "Presenting the design" subsection**

In the "## The Process" section, under "**Presenting the design:**", add guidance for handling unknowns. Insert after the line "- Be ready to go back and clarify if something doesn't make sense":

```markdown
- When you encounter genuine unknowns during design -- things that can't be resolved through discussion or research alone (performance questions, compatibility unknowns, library evaluations) -- mark them as explicit TBD sections rather than guessing or hand-waving
- TBD sections should state what's unknown and what information is needed to resolve it
```

**Step 2: Verify the edit**

Read the file and confirm the new lines appear in the correct location within "Presenting the design".

**Step 3: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "feat: add TBD section guidance to brainstorming design presentation"
```

---

### Task 2: Update "After the Design" Flow with Spike Path

**Files:**
- Modify: `skills/brainstorming/SKILL.md`

**Model:** haiku

**review:** spec-only

**Step 1: Replace the "After the Design" section**

Replace the entire "## After the Design" section with updated content that adds TBD detection and the spike plan fork. The new section:

```markdown
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

If the user says yes, continue to "Spike Plan Authoring" below.
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
```

**Step 2: Verify the edit preserves all existing paths**

Read the updated file and confirm:
- Documentation step is unchanged
- Architectural review, design validation, and implementation steps are preserved
- New TBD detection and spike plan authoring sections are present
- The spike plan template matches the format expected by `skills/spike/SKILL.md` (Design Reference, Questions, Experiments, Constraints, Output sections)

**Step 3: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "feat: add TBD detection and spike plan authoring to brainstorming"
```

---

### Task 3: Verify End-to-End Consistency

**Files:**
- None (verification only)

**Model:** haiku

**review:** none

**Step 1: Verify spike plan template matches spike skill expectations**

The spike skill (`skills/spike/SKILL.md` STEP 1) expects these sections in the spike plan:
- `## Design Reference` with design doc path and TBD sections list
- `## Questions` with numbered questions and TBD references
- `## Experiments` with experiment descriptions and success criteria
- `## Constraints`

Read both files and confirm the template in the brainstorming skill produces a document that the spike skill can parse.

**Step 2: Verify the brainstorming flow is coherent**

Read through the full updated `skills/brainstorming/SKILL.md` and check:
- The process naturally flows from design -> TBD detection -> spike plan (if needed) -> architect review
- TBD detection only happens after the design doc is written (not during presentation)
- The spike plan authoring reuses brainstorming's incremental presentation pattern
- No duplicate or conflicting instructions

**Step 3: Verify line count**

Run: `wc -l skills/brainstorming/SKILL.md`
Expected: Under 250 lines (was 143, adding ~80-100 lines of new content)

**Step 4: Commit if fixes needed**

If any consistency issues were found and fixed:
```bash
git add skills/brainstorming/SKILL.md
git commit -m "fix: correct spike plan template format for spike skill compatibility"
```

If no issues: no commit needed.

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~80-100 | `git diff --stat HEAD~2..HEAD -- skills/brainstorming/SKILL.md \| tail -1` |
| Files touched | 1 | `git diff --name-only HEAD~2..HEAD \| wc -l` |
| New files created | 0 | N/A |

**Target files:**
- `skills/brainstorming/SKILL.md` - Modified brainstorming skill with TBD detection and spike plan authoring

**ROI expectation:** This single file modification connects the spike machinery (Phase 1) to the brainstorming workflow, completing the brainstorm -> spike -> design loop. Without this integration, users would have to manually write spike plans -- with it, the brainstorming session naturally produces both artifacts when unknowns exist.
