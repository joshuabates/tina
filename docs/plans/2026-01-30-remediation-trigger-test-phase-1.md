# Remediation Trigger Test Phase 1 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Create a config validator that checks structure but intentionally omits input sanitization to trigger the remediation flow.

**Architecture:** A simple TypeScript module that exports `validate(config: unknown): ValidationResult`. Returns `{ valid: true }` or `{ valid: false, errors: string[] }`. Checks that config has required fields (name, version). **DOES NOT sanitize input** - this is intentional to trigger remediation.

**Phase context:** This is Phase 1 of 2. No previous phases. This phase intentionally has a gap (missing sanitization) that will be caught in review, triggering the remediation flow (Phase 1.5).

---

### Task 1: Initialize TypeScript Project

**Files:**
- Create: `config-validator/package.json`
- Create: `config-validator/tsconfig.json`

**Model:** haiku

**review:** none

**Step 1: Create the package.json**

```json
{
  "name": "config-validator",
  "version": "1.0.0",
  "description": "Config validation utility",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.3.3"
  }
}
```

**Step 2: Create the tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create Jest config**

Create `config-validator/jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
};
```

**Step 4: Create directory structure**

Run: `mkdir -p config-validator/src config-validator/tests`
Expected: Directories created

**Step 5: Install dependencies**

Run: `cd config-validator && npm install`
Expected: Dependencies installed, node_modules created

**Step 6: Add gitignore**

Create `config-validator/.gitignore`:

```
node_modules/
dist/
```

**Step 7: Commit project setup**

```bash
git add config-validator/package.json config-validator/tsconfig.json config-validator/jest.config.js config-validator/.gitignore
git commit -m "feat(config-validator): initialize TypeScript project with Jest"
```

---

### Task 2: Write Failing Test for Valid Config

**Files:**
- Create: `config-validator/tests/validator.test.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Write the failing test**

Create `config-validator/tests/validator.test.ts`:

```typescript
import { validate, ValidationResult } from '../src/validator';

describe('validate', () => {
  describe('with valid config', () => {
    it('returns valid true when config has name and version', () => {
      const config = { name: 'my-app', version: '1.0.0' };
      const result: ValidationResult = validate(config);

      expect(result).toEqual({ valid: true });
    });
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd config-validator && npm test`
Expected: FAIL with "Cannot find module '../src/validator'"

**Step 3: Commit the failing test**

```bash
git add config-validator/tests/validator.test.ts
git commit -m "test(config-validator): add failing test for valid config"
```

---

### Task 3: Implement validate to Pass Valid Config Test

**Files:**
- Create: `config-validator/src/validator.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Write minimal implementation**

Create `config-validator/src/validator.ts`:

```typescript
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validate(config: unknown): ValidationResult {
  if (typeof config !== 'object' || config === null) {
    return { valid: false, errors: ['Config must be an object'] };
  }

  const obj = config as Record<string, unknown>;

  if (typeof obj.name === 'string' && typeof obj.version === 'string') {
    return { valid: true };
  }

  return { valid: false, errors: ['Missing required fields'] };
}
```

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test`
Expected: PASS - 1 test passing

**Step 3: Commit the implementation**

```bash
git add config-validator/src/validator.ts
git commit -m "feat(config-validator): implement basic validate function"
```

---

### Task 4: Write Failing Test for Missing Name

**Files:**
- Modify: `config-validator/tests/validator.test.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Add test for missing name**

Add to `config-validator/tests/validator.test.ts`:

```typescript
  describe('with invalid config', () => {
    it('returns error when name is missing', () => {
      const config = { version: '1.0.0' };
      const result = validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });
  });
```

**Step 2: Run test to verify failure**

Run: `cd config-validator && npm test`
Expected: FAIL - error message doesn't match expected format

**Step 3: Commit the failing test**

```bash
git add config-validator/tests/validator.test.ts
git commit -m "test(config-validator): add failing test for missing name"
```

---

### Task 5: Implement Specific Error for Missing Name

**Files:**
- Modify: `config-validator/src/validator.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Update implementation with specific errors**

Update `config-validator/src/validator.ts`:

```typescript
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validate(config: unknown): ValidationResult {
  if (typeof config !== 'object' || config === null) {
    return { valid: false, errors: ['Config must be an object'] };
  }

  const obj = config as Record<string, unknown>;
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

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test`
Expected: PASS - 2 tests passing

**Step 3: Commit the specific error handling**

```bash
git add config-validator/src/validator.ts
git commit -m "feat(config-validator): add specific error messages for missing fields"
```

---

### Task 6: Write Failing Test for Missing Version

**Files:**
- Modify: `config-validator/tests/validator.test.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Add test for missing version**

Add to the 'with invalid config' describe block in `config-validator/tests/validator.test.ts`:

```typescript
    it('returns error when version is missing', () => {
      const config = { name: 'my-app' };
      const result = validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: version');
    });
```

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test`
Expected: PASS - 3 tests passing (already handled by current implementation)

**Step 3: Commit the test**

```bash
git add config-validator/tests/validator.test.ts
git commit -m "test(config-validator): add test for missing version"
```

---

### Task 7: Write Test for Both Fields Missing

**Files:**
- Modify: `config-validator/tests/validator.test.ts`

**Model:** haiku

**review:** spec-only

**Step 1: Add test for both missing**

Add to the 'with invalid config' describe block in `config-validator/tests/validator.test.ts`:

```typescript
    it('returns multiple errors when both fields are missing', () => {
      const config = {};
      const result = validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
      expect(result.errors).toContain('Missing required field: version');
    });
```

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test`
Expected: PASS - 4 tests passing

**Step 3: Commit the test**

```bash
git add config-validator/tests/validator.test.ts
git commit -m "test(config-validator): add test for multiple missing fields"
```

---

### Task 8: Write Test for Non-Object Config

**Files:**
- Modify: `config-validator/tests/validator.test.ts`

**Model:** haiku

**review:** none

**Step 1: Add test for non-object**

Add to the 'with invalid config' describe block in `config-validator/tests/validator.test.ts`:

```typescript
    it('returns error when config is not an object', () => {
      const result = validate('not an object');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Config must be an object');
    });

    it('returns error when config is null', () => {
      const result = validate(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Config must be an object');
    });
```

**Step 2: Run test to verify pass**

Run: `cd config-validator && npm test`
Expected: PASS - 6 tests passing

**Step 3: Commit the tests**

```bash
git add config-validator/tests/validator.test.ts
git commit -m "test(config-validator): add tests for non-object input"
```

---

### Task 9: Final Verification

**Files:**
- Read: All created files for verification

**Model:** haiku

**review:** none

**Step 1: Run all tests**

Run: `cd config-validator && npm test`
Expected: PASS - All 6 tests passing

**Step 2: Verify TypeScript compiles**

Run: `cd config-validator && npm run build`
Expected: Compiles without errors, dist/ directory created

**Step 3: Verify file structure**

Run: `ls -la config-validator/src/ config-validator/tests/`
Expected output should show:
```
config-validator/src/:
validator.ts

config-validator/tests/:
validator.test.ts
```

**Step 4: Final commit if needed**

No additional commit needed unless cleanup required.

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~25 | `git diff --stat main..HEAD -- 'config-validator/src/*.ts' \| tail -1` |
| Test lines added | ~50 | `git diff --stat main..HEAD -- 'config-validator/tests/*.ts' \| tail -1` |
| Files touched | 6 | `git diff --name-only main..HEAD \| wc -l` |
| Test count | 6 | `cd config-validator && npm test -- --json \| jq '.numPassedTests'` |

**Target files:**
- `config-validator/package.json` - Project configuration
- `config-validator/tsconfig.json` - TypeScript configuration
- `config-validator/jest.config.js` - Test configuration
- `config-validator/.gitignore` - Build artifact exclusions
- `config-validator/src/validator.ts` - Core implementation (~25 lines)
- `config-validator/tests/validator.test.ts` - Test coverage (~50 lines)

**ROI expectation:** Phase 1 delivers a basic validator that checks structure. INTENTIONALLY missing input sanitization (trim strings, remove undefined). Review should catch this gap and trigger Phase 1.5 remediation.

## Critical Note

**DO NOT implement sanitization in this phase.** The design document explicitly states that validator must sanitize input, but this implementation intentionally omits it. The reviewer should catch this gap and trigger the remediation flow.
