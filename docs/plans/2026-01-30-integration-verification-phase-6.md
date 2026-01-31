# Phase 6: Integration Verification

## Overview

Update spec-reviewer and phase-reviewer agents to verify code actually works, not just that it exists. The current reviewers approved code that couldn't possibly work because preconditions weren't met (e.g., reading from files that nothing writes, implementing handlers that are never registered).

## Goal

Reviewers verify integration and functionality:
1. Spec-reviewer checks preconditions before approving
2. Phase-reviewer actually runs the code, not just reads it

## Current State

### spec-reviewer.md

Currently verifies:
- Missing requirements
- Extra/unneeded work
- Misunderstandings

**Missing:**
- Precondition verification (data sources, dependencies, integration points)
- Explicit failure criteria for unmet preconditions

### phase-reviewer.md

Currently verifies:
- Pattern conformance (from Architectural Context)
- Integration verification (traces data flow)
- Reuse + consistency
- Metrics collection

**Missing:**
- Functional verification (actually running the code)
- Language-specific execution examples
- Hard requirement to execute, not just trace

## What Needs to Change

### Task 1: Add Precondition Verification to Spec Reviewer

**Model:** haiku

Add a "Precondition Verification" section that requires checking integration dependencies before approval.

**Actions:**
1. Add "Precondition Verification" section after "Your Job" section
2. Include three mandatory checks:
   - Data sources exist (if code reads a file/API/database, verify the writer exists)
   - Dependencies available (if code imports a module, verify it's implemented)
   - Integration points connected (if code is called by X, verify X actually calls it)
3. Add "Example Failures" subsection with concrete anti-patterns
4. Add explicit fail rule: "If preconditions are not met, the review FAILS"

**Content to add:**

```markdown
## Precondition Verification

Before approving implementation, verify:

1. **Data sources exist** - If code reads a file/API/database, verify the writer exists
2. **Dependencies available** - If code imports a module, verify it's implemented
3. **Integration points connected** - If code is called by X, verify X actually calls it

### Example Failures

- Reading from file that nothing writes → FAIL
- Implementing interface that nothing uses → FAIL
- Handler that's never registered → FAIL
- Test mocking a system that doesn't exist → FAIL

If preconditions are not met, the review FAILS.
```

**Acceptance criteria:**
- Section has 3 explicit precondition checks
- 4 example failure patterns documented
- Clear FAIL statement for unmet preconditions

### Task 2: Update Spec Reviewer Report Format

**Model:** haiku

Add precondition verification to the report output section.

**Actions:**
1. Update "Report Format" section to include precondition check
2. Add structured format for reporting precondition issues
3. Ensure team mode output includes precondition verification

**Updated report format:**

```markdown
## Report Format

Report one of:
- **Spec compliant:** Everything matches after code inspection AND preconditions verified
- **Precondition failure:** List unmet preconditions with specifics
- **Issues found:** List specifically what's missing or extra, with file:line references
```

**Acceptance criteria:**
- Report format includes precondition check
- Precondition failures are a distinct failure type
- Team mode messaging includes precondition issues

### Task 3: Add Functional Verification to Phase Reviewer

**Model:** haiku

Add a "Functional Verification" section requiring actual code execution.

**Actions:**
1. Add "Functional Verification" section after "Integration Verification" section
2. State requirement: "You MUST run the implemented code, not just read it"
3. Add language-specific examples for:
   - CLI tools
   - Libraries
   - Services
4. Add fail rule: "If you cannot run the code successfully, the review FAILS"

**Content to add:**

```markdown
## Functional Verification

You MUST run the implemented code, not just read it.

### For CLI tools:
```bash
./target/release/tool --help
./target/release/tool <typical-args>
```

### For libraries:
```bash
cargo test
cargo run --example basic  # if examples exist
```

### For services:
```bash
cargo run &
PID=$!
curl http://localhost:8080/health
kill $PID
```

### For TypeScript/Node:
```bash
npm test
npm run start  # verify it starts
```

### For Python:
```bash
pytest
python -m <module> --help  # if CLI
```

If you cannot run the code successfully, the review FAILS.
```

**Acceptance criteria:**
- Section requires running code, not just reading
- 5 language/project-type examples provided
- Clear FAIL statement for non-executable code

### Task 4: Update Phase Reviewer Report Format

**Model:** haiku

Add functional verification section to the structured report.

**Actions:**
1. Add "Functional Verification" section to report template
2. Include what was run and the results
3. Add to severity assessment (non-functional = Critical)

**Report section to add:**

```markdown
### Functional Verification
**Executed:** [list of commands run]
**Results:**
- ✅ `./target/release/tina-session --help` - returned help text
- ✅ `cargo test` - 18 tests passed
- ❌ `./target/release/tina-session start` - segfault

**Functional:** Yes / No

If No, status is automatically **Stop**.
```

**Acceptance criteria:**
- Functional verification section in report template
- Commands run are documented
- Non-functional code automatically gets Stop status

### Task 5: Add Verification to Critical Rules

**Model:** haiku

Update the "Critical Rules" sections in both agents to emphasize verification requirements.

**Actions:**
1. In spec-reviewer: Add "Verify preconditions, not just spec match"
2. In phase-reviewer: Add "Execute code, not just trace flow" to DO list
3. Add corresponding DON'T entries for common mistakes

**Acceptance criteria:**
- Both agents have updated Critical Rules
- DO list includes verification requirements
- DON'T list includes common mistakes to avoid

## Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 100 |

This is a documentation-only phase. Two files changed:
- `agents/spec-reviewer.md` - Add ~30 lines
- `agents/phase-reviewer.md` - Add ~40 lines

## Dependencies

- None (documentation-only change)
- Does not require Phases 1-5 completion

## Files Changed

- `agents/spec-reviewer.md` - Add precondition verification
- `agents/phase-reviewer.md` - Add functional verification

## Success Criteria

1. spec-reviewer has Precondition Verification section with 3 checks
2. spec-reviewer has 4 example failure patterns
3. spec-reviewer report format includes precondition check
4. phase-reviewer has Functional Verification section
5. phase-reviewer has 5 language-specific execution examples
6. phase-reviewer report includes what was executed
7. Both agents have updated Critical Rules sections
8. Clear FAIL statements: preconditions unmet = FAIL, non-functional = FAIL

## Verification

After implementation, verify by:

1. Read updated `agents/spec-reviewer.md`
   - Confirm Precondition Verification section exists
   - Confirm 4 example failures documented
   - Confirm report format updated

2. Read updated `agents/phase-reviewer.md`
   - Confirm Functional Verification section exists
   - Confirm execution examples for CLI, library, service
   - Confirm report template includes execution results

3. Verify both files remain under 300 lines
4. Manually review structure matches this plan
