# Architect Skill & Phase Reviewer Design

Add architectural review at two points: before implementation (architect skill) and after each phase (phase reviewer subagent). Catches pattern drift, ensures integration, maintains consistency.

## Problem

Common issues during multi-phase implementation:
- Code and tests don't follow existing patterns
- Implementers invent new approaches instead of reusing existing ones
- Code is written but not properly integrated end-to-end
- Later phases copy bad patterns from earlier phases, compounding drift

## Solution

Two components at different points in the workflow:

1. **Architect Skill** - Reviews design before implementation, adds architectural context
2. **Phase Reviewer Subagent** - Verifies phase follows architecture after implementation

## Updated Workflow

```
Brainstorming
    ↓
Design Doc (saved to disk)
    ↓
Architect Skill ←→ User (questions)
    ↓
Design Doc + Architectural Context section
    ↓
Planner (phase N)
    ↓
Implementation Plan
    ↓
Executing Plans (tasks with spec + quality review)
    ↓
Phase Reviewer ←→ Implementer (fix loop)
    ↓
Phase complete? → More phases? → Back to Planner
    ↓
All phases complete
```

## Component 1: Architect Skill

**Type:** Skill (runs in main conversation, can ask questions)

**When:** After brainstorming produces design doc, before planner

**What it does:**

1. Reads the design document
2. Explores existing codebase to understand current patterns and architecture
3. Asks user questions if architectural decisions are unclear (interactive, one at a time)
4. Adds "Architectural Context" section to design doc containing:
   - Existing patterns to follow (with file:line references)
   - Specific code/modules to reuse
   - Anti-patterns to avoid (things that exist but shouldn't be copied)
   - How this feature fits the overall architecture
5. Gates the design - approval required before proceeding to planning

**Interface:**

- Input: Design document path
- Output: Updated design doc path, approval status, any unresolved concerns

**File:** `skills/architect/SKILL.md`

## Component 2: Phase Reviewer Subagent

**Type:** Subagent (runs autonomously, reports back)

**When:** After all tasks in a phase complete, before moving to next phase

**What it receives:**

- Design doc path (includes architect's context section)
- Phase number that was just completed
- Git range (base SHA → head SHA) for the phase's commits

**What it checks:**

### 1. Pattern Conformance
- Code follows patterns specified in architect's context section
- Didn't invent new approaches when existing ones should be used
- Tests follow established testing patterns

### 2. Integration Verification (Data Flow Trace)
- Identifies entry points for the new functionality
- Traces through new code to outputs/side effects
- Verifies the chain is complete - not isolated functions sitting unconnected
- Flags anything written but not wired up:
  - Dead code (written but unreachable)
  - Missing connections (function exists but never called)
  - Incomplete chains (starts but doesn't reach expected output)

### 3. Reuse + Consistency
- High reuse of existing utilities/helpers
- Low ceremony (no unnecessary abstractions)
- Consistent style with rest of codebase
- Tests are readable and follow existing patterns

**Issue categories:**

- **Critical:** Code not integrated, won't work at runtime
- **Important:** Pattern violations, invented new approach instead of reusing
- **Minor:** Style inconsistencies, readability issues

**All issues must be fixed.** Severity indicates impact, not whether to fix. The fix loop continues until zero issues remain.

**Remediation flow:**

1. Phase reviewer reports issues with file:line references
2. Orchestrator dispatches implementer to fix
3. Phase reviewer re-reviews
4. Repeat until approved (zero issues)
5. Only then proceed to next phase

**Output:**

- Approval status (approved / needs fixes)
- Issues list with file:line references and fix instructions
- Data flow verification summary (what was traced, what's connected)

**File:** `agents/phase-reviewer.md`

## Files to Modify

### skills/brainstorming/SKILL.md

After writing design doc, invoke architect skill before asking about implementation.

### skills/executing-plans/SKILL.md

After phase tasks complete, dispatch phase reviewer before proceeding to next phase.

## Implementation Notes

- Use `tina:writing-skills` skill when creating the architect skill
- Use existing agent patterns from `agents/planner.md` for phase reviewer
- Architect's context section should be clearly marked so phase reviewer can find it
- Phase reviewer should reference architect's context explicitly in its checks

## Phases

### Phase 1: Architect Skill
- Create `skills/architect/SKILL.md`
- Modify `skills/brainstorming/SKILL.md` to invoke architect

### Phase 2: Phase Reviewer Subagent
- Create `agents/phase-reviewer.md`
- Modify `skills/executing-plans/SKILL.md` to invoke phase reviewer
