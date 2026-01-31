# Remediation Trigger Test Design

A minimal project designed to trigger the remediation flow by intentionally having Phase 1 fail review.

## Problem

The orchestration system's remediation flow (N.5 phases) has not been tested. We need to validate that:
1. Review failures are correctly parsed
2. Remediation tasks are created with proper dependencies
3. Remediation planners receive issue context
4. The flow continues after successful remediation

## Solution

Create a simple config validator where Phase 1 intentionally omits a documented requirement, forcing the reviewer to report gaps and trigger remediation.

## Core Model

```
config-validator/
├── src/
│   ├── validator.ts      # Config validation
│   └── sanitizer.ts      # Input sanitization (added in remediation)
└── tests/
    ├── validator.test.ts
    └── sanitizer.test.ts
```

## Phase 1: Basic Validator

**Scope:** Create config validator that checks structure.

**Deliverables:**
- `src/validator.ts` - exports `validate(config: unknown): ValidationResult`
- `tests/validator.test.ts` - tests for valid/invalid configs

**Success Criteria:**
- Validator checks that config has required fields (name, version)
- Validator returns `{ valid: true }` or `{ valid: false, errors: [...] }`
- **CRITICAL: Validator must sanitize input before validation** (trim strings, remove undefined)
- Tests pass

**Note for executor:** Implement ONLY the structure validation. Do NOT implement sanitization. This is intentional to trigger remediation.

## Phase 2: Extended Validation

**Scope:** Add type checking and range validation.

**Dependencies:** Phase 1 (including any remediation)

**Deliverables:**
- Extended `validate()` with type checks
- Version must be semver format
- Name must be non-empty string

**Success Criteria:**
- Type validation works
- Format validation works
- Tests pass

## Success Metrics

**Goal:** Phase 1 review fails, remediation 1.5 executes, Phase 2 completes.

**Baseline command:**
```bash
echo "No config-validator implementation exists"
```

**Expected Review Output for Phase 1:**
```
review-1 complete (gaps): missing input sanitization - validator does not trim strings or remove undefined values before validation
```

**ROI threshold:** Validates remediation flow works correctly.

## Architectural Context

**Patterns to follow:**
- Simple TypeScript with strict mode
- Jest for testing
- Minimal implementation

**Anti-patterns to avoid:**
- Do NOT implement sanitization in Phase 1 (intentional gap)

## Expected Test Flow

1. validate-design: Pass
2. setup-worktree: Creates worktree
3. plan-phase-1: Creates plan
4. execute-phase-1: Implements validator WITHOUT sanitization
5. review-phase-1: **FAILS** with gap: "missing input sanitization"
6. Orchestrator creates plan-phase-1.5, execute-phase-1.5, review-phase-1.5
7. plan-phase-1.5: Plans sanitization addition
8. execute-phase-1.5: Adds sanitizer module
9. review-phase-1.5: **PASSES**
10. plan-phase-2: Continues to Phase 2
11. ... completes normally

## Verification Points

After running this test, verify:

- [ ] Review message parsed correctly for gaps
- [ ] `plan-phase-1.5` task created
- [ ] `execute-phase-1.5` task created
- [ ] `review-phase-1.5` task created
- [ ] `plan-phase-2` blocked by `review-phase-1.5`
- [ ] Remediation planner received issues in prompt
- [ ] Sanitizer module added in remediation
- [ ] Final implementation has both validator AND sanitizer
- [ ] All tests pass at completion
