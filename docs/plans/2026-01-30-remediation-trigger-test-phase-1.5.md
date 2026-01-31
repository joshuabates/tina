# Remediation Trigger Test Phase 1.5 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Add input sanitization to the config validator to address the gap identified in Phase 1 review: "missing input sanitization - validator does not trim strings or remove undefined values before validation"

**Architecture:** Add a `sanitizer.ts` module that exports `sanitize(config: unknown): unknown` to clean input before validation. Integrate sanitization into the existing `validate()` function. Sanitization trims whitespace from strings and removes properties with undefined values.

**Phase context:** This is Phase 1.5 (remediation for Phase 1). Phase 1 implemented the basic validator but intentionally omitted input sanitization. This remediation adds that missing functionality.

**Remediation for:** Phase 1
**Issues:** missing input sanitization - validator does not trim strings or remove undefined values before validation

---

### Task 1: Write Failing Test for String Trimming

**Files:**
- Create: `config-validator/tests/sanitizer.test.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Write the failing test for trim**

Create `config-validator/tests/sanitizer.test.ts`:

```typescript
import { sanitize } from '../src/sanitizer';

describe('sanitize', () => {
  describe('string trimming', () => {
    it('trims whitespace from string values', () => {
      const input = { name: '  my-app  ', version: '\t1.0.0\n' };
      const result = sanitize(input);

      expect(result).toEqual({ name: 'my-app', version: '1.0.0' });
    });

    it('trims nested string values', () => {
      const input = { name: 'app', config: { env: '  production  ' } };
      const result = sanitize(input);

      expect(result).toEqual({ name: 'app', config: { env: 'production' } });
    });
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd config-validator && npm test -- sanitizer.test.ts`
Expected: FAIL with "Cannot find module '../src/sanitizer'"

**Step 3: Commit the failing test**

```bash
git add config-validator/tests/sanitizer.test.ts
git commit -m "test(config-validator): add failing tests for string trimming"
```

---

### Task 2: Implement sanitize Function for String Trimming

**Files:**
- Create: `config-validator/src/sanitizer.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Write minimal implementation**

Create `config-validator/src/sanitizer.ts`:

```typescript
export function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitize(val);
    }
    return result;
  }

  return value;
}
```

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test -- sanitizer.test.ts`
Expected: PASS - 2 tests passing

**Step 3: Commit the implementation**

```bash
git add config-validator/src/sanitizer.ts
git commit -m "feat(config-validator): implement sanitize function for string trimming"
```

---

### Task 3: Write Failing Test for Undefined Removal

**Files:**
- Modify: `config-validator/tests/sanitizer.test.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Add tests for undefined removal**

Add to `config-validator/tests/sanitizer.test.ts`:

```typescript
  describe('undefined removal', () => {
    it('removes properties with undefined values', () => {
      const input = { name: 'my-app', version: undefined, extra: 'value' };
      const result = sanitize(input);

      expect(result).toEqual({ name: 'my-app', extra: 'value' });
      expect(result).not.toHaveProperty('version');
    });

    it('removes nested undefined values', () => {
      const input = { name: 'app', config: { env: 'prod', debug: undefined } };
      const result = sanitize(input);

      expect(result).toEqual({ name: 'app', config: { env: 'prod' } });
    });
  });
```

**Step 2: Run test to verify failure**

Run: `cd config-validator && npm test -- sanitizer.test.ts`
Expected: FAIL - undefined values are not being removed

**Step 3: Commit the failing test**

```bash
git add config-validator/tests/sanitizer.test.ts
git commit -m "test(config-validator): add failing tests for undefined removal"
```

---

### Task 4: Implement Undefined Removal

**Files:**
- Modify: `config-validator/src/sanitizer.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Update implementation to remove undefined**

Update `config-validator/src/sanitizer.ts`:

```typescript
export function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        result[key] = sanitize(val);
      }
    }
    return result;
  }

  return value;
}
```

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test -- sanitizer.test.ts`
Expected: PASS - 4 tests passing

**Step 3: Commit the implementation**

```bash
git add config-validator/src/sanitizer.ts
git commit -m "feat(config-validator): add undefined value removal to sanitize"
```

---

### Task 5: Write Failing Integration Test

**Files:**
- Modify: `config-validator/tests/validator.test.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Add integration test for sanitization in validation**

Add to `config-validator/tests/validator.test.ts`:

```typescript
  describe('input sanitization', () => {
    it('trims whitespace from string values before validation', () => {
      const config = { name: '  my-app  ', version: '\t1.0.0\n' };
      const result = validate(config);

      expect(result.valid).toBe(true);
    });

    it('treats properties with undefined values as missing', () => {
      const config = { name: 'my-app', version: undefined };
      const result = validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: version');
    });
  });
```

**Step 2: Run test to verify failure**

Run: `cd config-validator && npm test -- validator.test.ts`
Expected: FAIL - validation doesn't handle whitespace or undefined

**Step 3: Commit the failing test**

```bash
git add config-validator/tests/validator.test.ts
git commit -m "test(config-validator): add failing tests for sanitization in validation"
```

---

### Task 6: Integrate Sanitizer into Validator

**Files:**
- Modify: `config-validator/src/validator.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Update validator to use sanitizer**

Update `config-validator/src/validator.ts`:

```typescript
import { sanitize } from './sanitizer';

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validate(config: unknown): ValidationResult {
  // Sanitize input first - trim strings and remove undefined values
  const sanitized = sanitize(config);

  if (typeof sanitized !== 'object' || sanitized === null) {
    return { valid: false, errors: ['Config must be an object'] };
  }

  const obj = sanitized as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.name !== 'string') {
    errors.push('Missing required field: name');
  }

  if (typeof obj.version !== 'string') {
    errors.push('Missing required field: version');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
```

**Step 2: Run all tests to verify pass**

Run: `cd config-validator && npm test`
Expected: PASS - All tests passing (8 total: 6 original + 2 new integration tests)

**Step 3: Commit the integration**

```bash
git add config-validator/src/validator.ts
git commit -m "feat(config-validator): integrate sanitizer into validate function"
```

---

### Task 7: Add Edge Case Tests

**Files:**
- Modify: `config-validator/tests/sanitizer.test.ts`

**Model:** haiku

**review:** none

**Step 1: Add edge case tests**

Add to `config-validator/tests/sanitizer.test.ts`:

```typescript
  describe('edge cases', () => {
    it('returns null as-is', () => {
      expect(sanitize(null)).toBeNull();
    });

    it('returns undefined as-is', () => {
      expect(sanitize(undefined)).toBeUndefined();
    });

    it('returns numbers as-is', () => {
      expect(sanitize(42)).toBe(42);
    });

    it('returns booleans as-is', () => {
      expect(sanitize(true)).toBe(true);
    });

    it('handles arrays with mixed types', () => {
      const input = ['  hello  ', 42, { name: '  test  ' }];
      const result = sanitize(input);

      expect(result).toEqual(['hello', 42, { name: 'test' }]);
    });

    it('handles empty objects', () => {
      expect(sanitize({})).toEqual({});
    });

    it('handles empty arrays', () => {
      expect(sanitize([])).toEqual([]);
    });
  });
```

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test -- sanitizer.test.ts`
Expected: PASS - 11 tests passing in sanitizer.test.ts

**Step 3: Commit edge case tests**

```bash
git add config-validator/tests/sanitizer.test.ts
git commit -m "test(config-validator): add edge case tests for sanitizer"
```

---

### Task 8: Final Verification

**Files:**
- Read: All files for verification

**Model:** haiku

**review:** none

**Step 1: Run all tests**

Run: `cd config-validator && npm test`
Expected: PASS - All tests passing (15+ total)

**Step 2: Verify TypeScript compiles**

Run: `cd config-validator && npm run build`
Expected: Compiles without errors

**Step 3: Verify file structure**

Run: `ls -la config-validator/src/ config-validator/tests/`
Expected output should show:
```
config-validator/src/:
sanitizer.ts
validator.ts

config-validator/tests/:
sanitizer.test.ts
validator.test.ts
```

**Step 4: Final commit if needed**

No additional commit needed unless cleanup required.

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~25 | `git diff --stat HEAD~8..HEAD -- 'config-validator/src/*.ts' \| tail -1` |
| Test lines added | ~70 | `git diff --stat HEAD~8..HEAD -- 'config-validator/tests/*.ts' \| tail -1` |
| Files touched | 4 | `git diff --name-only HEAD~8..HEAD \| wc -l` |
| Test count | ~15 | `cd config-validator && npm test -- --json \| jq '.numPassedTests'` |

**Target files:**
- `config-validator/src/sanitizer.ts` - New sanitization module (~25 lines)
- `config-validator/src/validator.ts` - Updated with sanitizer integration
- `config-validator/tests/sanitizer.test.ts` - New sanitizer tests (~55 lines)
- `config-validator/tests/validator.test.ts` - Integration tests added (~15 lines)

**ROI expectation:** Phase 1.5 remediation adds the missing sanitization functionality. After this phase, the config-validator properly trims strings and removes undefined values before validation, satisfying the original design requirement.
