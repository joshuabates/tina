# Phase 4: Strengthened Code-Quality-Reviewer

## Overview

Update the code-quality-reviewer agent to actively detect and block over-engineering, unnecessary abstractions, and complexity violations. The current reviewer checks "does it look reasonable" but approved a 3,185-line file and elaborate abstractions that weren't needed. This phase adds explicit mandates with objective thresholds.

## Goal

Reviewers actively check for over-engineering and simplification opportunities. Reviews FAIL when complexity violations are found.

## Current State

The current `agents/code-quality-reviewer.md` reviews for:
- Architecture and design (SOLID, separation of concerns)
- Code quality (maintainability, naming, error handling)
- Testing (coverage, behavior tests, edge cases)
- Patterns (existing codebase patterns, conventions)

**Missing:**
- Explicit line count thresholds
- Over-engineering detection checklist
- Automatic complexity red flags
- Structured output format for violations
- Hard FAIL requirement when violations found

## What Needs to Change

### Task 1: Add Over-Engineering Detection Section

**Model:** haiku

Add a new section to the agent that explicitly requires checking for over-engineering patterns.

**Actions:**
1. Add "Over-Engineering Detection" section with these checks:
   - File size check (>300 lines = flag for review)
   - Single-use abstractions (generic/trait/interface with one impl)
   - Pass-through layers (layers that just delegate)
   - Deletable code (functionality that could be removed)
2. Each check must have explicit question format
3. Finding any issue requires justification in review output

**Acceptance criteria:**
- Over-engineering section has 4 explicit checks
- Each check is a concrete yes/no question
- Detection requires structured output (not prose)

### Task 2: Add Complexity Red Flags Section

**Model:** haiku

Add objective thresholds that automatically flag code for review justification.

**Actions:**
1. Add "Complexity Red Flags" section with automatic flags:
   - File > 300 lines
   - Function > 40 lines
   - More than 3 levels of nesting
   - Generic/trait with only one implementation
   - Builder pattern for simple structs (< 5 fields)
2. Each flag REQUIRES explicit justification in review
3. Unjustified flags = review FAILS

**Acceptance criteria:**
- 5 specific red flags with numeric thresholds where applicable
- Clear statement that flags require justification
- Unjustified flags block approval

### Task 3: Add Structured Output Format

**Model:** haiku

Replace freeform review output with mandatory structured sections.

**Actions:**
1. Add required output sections:
   - "Simplification Opportunities" (checklist format)
   - "Complexity Violations" (table format with file, lines, issue, recommendation)
2. Provide example of each format
3. State that violations table non-empty = review FAILS

**Output format to add:**

```markdown
#### Simplification Opportunities
- [ ] File X could be merged with Y (both small, related)
- [ ] Function Z is only called once, inline it
- [ ] Trait A has one impl, remove indirection

#### Complexity Violations
| File | Lines | Issue | Recommendation |
|------|-------|-------|----------------|
| app.rs | 3185 | Exceeds 300 line limit | Split into modules |
```

**Acceptance criteria:**
- Two structured output sections defined
- Table format for violations
- Clear pass/fail rule: violations present = FAIL

### Task 4: Update Team Mode Behavior

**Model:** haiku

Ensure the ephemeral team mode section aligns with new requirements.

**Actions:**
1. Update "Block on" list to include new complexity violations
2. Add requirement to output structured violations table
3. Ensure worker receives actionable feedback (file:line + specific issue)

**Acceptance criteria:**
- Block-on list includes complexity violations
- Team mode output matches structured format
- Worker can act on feedback without asking for clarification

### Task 5: Add Examples Section

**Model:** haiku

Add concrete examples showing good vs over-engineered code to calibrate reviewer judgment.

**Actions:**
1. Add "Examples" section at end of agent doc
2. Include 2-3 "PASS" examples (clean, simple code)
3. Include 2-3 "FAIL" examples (over-engineered code)
4. Each example should be ~10-20 lines to illustrate the pattern

**Example patterns to include:**
- Simple struct vs unnecessary builder pattern
- Direct function call vs single-use trait
- Flat code vs over-nested conditionals

**Acceptance criteria:**
- At least 2 PASS examples
- At least 2 FAIL examples
- Each example is brief and illustrates one pattern

## Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 150 |

This is a documentation-only phase. The only file changed is `agents/code-quality-reviewer.md`. The updated file should remain concise (under 200 lines total).

## Dependencies

- None (documentation-only change)
- Does not depend on Phase 1-3 completion

## Files Changed

- `agents/code-quality-reviewer.md` - Updated with new mandates

## Success Criteria

1. Agent doc includes Over-Engineering Detection section with 4 checks
2. Agent doc includes Complexity Red Flags section with 5 thresholds
3. Agent doc includes structured output format (simplification checklist + violations table)
4. Agent doc includes examples of good vs over-engineered code
5. Team mode section updated to use new structured output
6. Clear statement: complexity violations = review FAILS (not "needs fixes", FAILS)

## Verification

After implementation, verify by:

1. Read updated `agents/code-quality-reviewer.md`
2. Confirm all 5 tasks' acceptance criteria are met
3. Verify document is under 200 lines
4. Manually review structure matches this plan
