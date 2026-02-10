# Git, Teams, Tasks & Plans Integration Test

## Overview

Test all four features from tina-web phase 2:
1. Git commit tracking
2. Plan file syncing
3. Team member shutdown events
4. Task description markdown

## Feature: Multi-Phase Calculator Library

Implement a simple calculator library with two phases:
- Phase 1: Basic arithmetic operations (add, subtract)
- Phase 2: Advanced operations (multiply, divide)

Each phase will make git commits that should appear in Convex.

## Implementation Plan

### Phase 1: Basic Arithmetic

**Tasks:**

1. **Implement basic operations** - Create `calculator.ts` with `add()` and `subtract()` functions

## Task: Implement Basic Arithmetic

Create the following functions in `src/calculator.ts`:
- `add(a: number, b: number): number` - Returns the sum
- `subtract(a: number, b: number): number` - Returns the difference

**Acceptance criteria:**
- [ ] Functions implemented correctly
- [ ] Type annotations included
- [ ] Module exports functions

**Example:**
```typescript
add(5, 3)       // Returns 8
subtract(10, 4) // Returns 6
```

2. **Add tests** - Create `calculator.test.ts` with test cases for basic operations

3. **Document implementation** - Commit changes with message: "feat: add basic arithmetic operations"

**Expected behavior:**
- Git commits recorded in Convex
- Plan file synced automatically
- Task descriptions render with markdown formatting

### Phase 2: Advanced Operations

**Tasks:**

1. **Implement advanced operations** - Add `multiply()` and `divide()` to `calculator.ts`

## Task: Implement Advanced Arithmetic

Extend `src/calculator.ts` with:
- `multiply(a: number, b: number): number` - Returns the product
- `divide(a: number, b: number): number` - Returns the quotient (throws on zero divisor)

**Acceptance criteria:**
- [ ] multiply() works correctly
- [ ] divide() throws Error("Division by zero") for zero divisor
- [ ] Tests updated

**Example:**
```typescript
multiply(6, 7)  // Returns 42
divide(20, 4)   // Returns 5
divide(10, 0)   // Throws Error("Division by zero")
```

2. **Handle division by zero** - Add error handling for zero divisor

3. **Update tests** - Add test cases for multiply and divide

4. **Commit changes** - Git commit: "feat: add advanced arithmetic operations"

**Expected behavior:**
- Phase 1 executor agent completes and shuts down
- Shutdown event recorded in Convex
- Phase 2 commits tracked separately
- Plan file for phase 2 synced

## Success Criteria

**Convex validation:**
- Orchestration exists with feature "calculator"
- At least 2 phases recorded
- At least 2 commits recorded (1 per phase)
- At least 2 plans synced (phase-1.md, phase-2.md)
- At least 1 shutdown event (phase 1 executor after completion)
- At least 1 task with markdown description (code block, heading, task list)

**File validation:**
- `src/calculator.ts` exists with all four functions
- `src/calculator.test.ts` exists with test cases
- Plan files created in `docs/plans/` directory

**Timing:**
- Commits appear in Convex within 10 seconds of git commit
- Plans synced within 5 seconds of file write
- Shutdown events recorded within 5 seconds of team config change
