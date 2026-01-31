# Remediation Trigger Test Phase 2 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Extend the config validator with type checking and format validation - version must be semver format, name must be non-empty string.

**Architecture:** Extend the existing `validate()` function to add format validation after structure checks. Add semver pattern matching for version field. Add non-empty check for name field after trimming.

**Phase context:** This is Phase 2 of 2. Phase 1 created the basic structure validator, Phase 1.5 (remediation) added input sanitization. This phase adds format validation on top of the existing foundation.

---

### Task 1: Write Failing Test for Semver Version Format

**Files:**
- Modify: `config-validator/tests/validator.test.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Add describe block for format validation**

Add to `config-validator/tests/validator.test.ts`:

```typescript
  describe('format validation', () => {
    describe('version semver format', () => {
      it('accepts valid semver versions', () => {
        const validVersions = ['1.0.0', '0.0.1', '10.20.30', '1.2.3-alpha', '1.2.3-alpha.1', '1.2.3+build'];

        for (const version of validVersions) {
          const result = validate({ name: 'app', version });
          expect(result.valid).toBe(true);
        }
      });

      it('rejects invalid semver versions', () => {
        const invalidVersions = ['1.0', '1', 'v1.0.0', '1.0.0.0', 'latest', 'abc'];

        for (const version of invalidVersions) {
          const result = validate({ name: 'app', version });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Version must be valid semver format (e.g., 1.0.0)');
        }
      });
    });
  });
```

**Step 2: Run test to verify failure**

Run: `cd config-validator && npm test`
Expected: FAIL - invalid versions currently pass validation

**Step 3: Commit the failing test**

```bash
git add config-validator/tests/validator.test.ts
git commit -m "test(config-validator): add failing tests for semver version format"
```

---

### Task 2: Implement Semver Version Validation

**Files:**
- Modify: `config-validator/src/validator.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Add semver regex and validation**

Update `config-validator/src/validator.ts` to add semver validation after the existing field checks:

```typescript
import { sanitize } from './sanitizer';

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// Semver regex - matches major.minor.patch with optional prerelease and build metadata
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

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
  } else if (!SEMVER_REGEX.test(obj.version)) {
    errors.push('Version must be valid semver format (e.g., 1.0.0)');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
```

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test`
Expected: PASS - all tests passing

**Step 3: Commit the implementation**

```bash
git add config-validator/src/validator.ts
git commit -m "feat(config-validator): add semver format validation for version field"
```

---

### Task 3: Write Failing Test for Non-Empty Name

**Files:**
- Modify: `config-validator/tests/validator.test.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Add tests for non-empty name validation**

Add to the 'format validation' describe block in `config-validator/tests/validator.test.ts`:

```typescript
    describe('name non-empty', () => {
      it('accepts non-empty name strings', () => {
        const result = validate({ name: 'my-app', version: '1.0.0' });
        expect(result.valid).toBe(true);
      });

      it('rejects empty string name', () => {
        const result = validate({ name: '', version: '1.0.0' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Name must be a non-empty string');
      });

      it('rejects whitespace-only name (trims to empty)', () => {
        const result = validate({ name: '   ', version: '1.0.0' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Name must be a non-empty string');
      });
    });
```

**Step 2: Run test to verify failure**

Run: `cd config-validator && npm test`
Expected: FAIL - empty strings currently pass validation

**Step 3: Commit the failing test**

```bash
git add config-validator/tests/validator.test.ts
git commit -m "test(config-validator): add failing tests for non-empty name validation"
```

---

### Task 4: Implement Non-Empty Name Validation

**Files:**
- Modify: `config-validator/src/validator.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Add non-empty name check**

Update `config-validator/src/validator.ts` to add non-empty check for name:

```typescript
import { sanitize } from './sanitizer';

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// Semver regex - matches major.minor.patch with optional prerelease and build metadata
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

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
  } else if (obj.name.length === 0) {
    errors.push('Name must be a non-empty string');
  }

  if (typeof obj.version !== 'string') {
    errors.push('Missing required field: version');
  } else if (!SEMVER_REGEX.test(obj.version)) {
    errors.push('Version must be valid semver format (e.g., 1.0.0)');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
```

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test`
Expected: PASS - all tests passing

**Step 3: Commit the implementation**

```bash
git add config-validator/src/validator.ts
git commit -m "feat(config-validator): add non-empty validation for name field"
```

---

### Task 5: Write Type Validation Tests

**Files:**
- Modify: `config-validator/tests/validator.test.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Add type validation tests**

Add to the 'format validation' describe block in `config-validator/tests/validator.test.ts`:

```typescript
    describe('type checking', () => {
      it('rejects name that is a number', () => {
        const result = validate({ name: 123, version: '1.0.0' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: name');
      });

      it('rejects version that is a number', () => {
        const result = validate({ name: 'app', version: 100 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: version');
      });

      it('rejects name that is an object', () => {
        const result = validate({ name: { value: 'app' }, version: '1.0.0' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: name');
      });

      it('rejects name that is an array', () => {
        const result = validate({ name: ['app'], version: '1.0.0' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: name');
      });
    });
```

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test`
Expected: PASS - type checking already enforced by existing string type checks

**Step 3: Commit the tests**

```bash
git add config-validator/tests/validator.test.ts
git commit -m "test(config-validator): add explicit type validation tests"
```

---

### Task 6: Final Verification

**Files:**
- Read: All files for verification

**Model:** haiku

**review:** none

**Step 1: Run all tests**

Run: `cd config-validator && npm test`
Expected: PASS - All tests passing (should be ~20+ tests total)

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

**Step 4: Run tests with coverage (optional)**

Run: `cd config-validator && npm test -- --coverage`
Expected: Good coverage on validator.ts

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~10 | `git diff --stat HEAD~6..HEAD -- 'config-validator/src/*.ts' \| tail -1` |
| Test lines added | ~50 | `git diff --stat HEAD~6..HEAD -- 'config-validator/tests/*.ts' \| tail -1` |
| Files touched | 2 | `git diff --name-only HEAD~6..HEAD \| wc -l` |
| Test count | ~20 | `cd config-validator && npm test -- --json \| jq '.numPassedTests'` |

**Target files:**
- `config-validator/src/validator.ts` - Extended with format validation (~10 additional lines)
- `config-validator/tests/validator.test.ts` - Format validation tests (~50 additional lines)

**ROI expectation:** Phase 2 completes the config validator with proper format validation. The validator now checks:
1. Config is an object (Phase 1)
2. Required fields exist (Phase 1)
3. Input is sanitized (Phase 1.5 remediation)
4. Version is valid semver format (Phase 2)
5. Name is non-empty (Phase 2)
