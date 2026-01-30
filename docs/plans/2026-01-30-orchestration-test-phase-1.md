# Orchestration Test Phase 1 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Create the file reader module that can read text files and handle errors gracefully.

**Architecture:** A simple TypeScript module that exports a single async function `readFile(path: string): Promise<string>`. Uses Node.js `fs/promises` for file I/O. Throws descriptive errors for missing files.

**Phase context:** This is Phase 1 of 3. No previous phases. This module provides the foundation for Phase 2's analyzer which needs text content to process.

---

### Task 1: Initialize TypeScript Project

**Files:**
- Create: `word-stats/package.json`
- Create: `word-stats/tsconfig.json`

**Model:** sonnet

**review:** none

**Step 1: Create the package.json**

```json
{
  "name": "word-stats",
  "version": "1.0.0",
  "description": "CLI utility for word statistics",
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

Create `word-stats/jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
};
```

**Step 4: Create directory structure**

Run: `mkdir -p word-stats/src word-stats/tests`
Expected: Directories created

**Step 5: Install dependencies**

Run: `cd word-stats && npm install`
Expected: Dependencies installed, node_modules created

**Step 6: Commit project setup**

```bash
git add word-stats/package.json word-stats/tsconfig.json word-stats/jest.config.js
git commit -m "feat(word-stats): initialize TypeScript project with Jest"
```

---

### Task 2: Write Failing Test for readFile Success Case

**Files:**
- Create: `word-stats/tests/reader.test.ts`
- Create: `word-stats/tests/fixtures/sample.txt`

**Model:** sonnet

**review:** spec-only

**Step 1: Create test fixture**

Create `word-stats/tests/fixtures/sample.txt`:

```
Hello world
This is a test file.
It has three lines.
```

**Step 2: Write the failing test**

Create `word-stats/tests/reader.test.ts`:

```typescript
import { readFile } from '../src/reader';
import * as path from 'path';

describe('readFile', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');

  describe('when file exists', () => {
    it('returns the file contents as a string', async () => {
      const filePath = path.join(fixturesDir, 'sample.txt');
      const result = await readFile(filePath);

      expect(result).toBe('Hello world\nThis is a test file.\nIt has three lines.\n');
    });
  });
});
```

**Step 3: Run test to verify failure**

Run: `cd word-stats && npm test`
Expected: FAIL with "Cannot find module '../src/reader'"

**Step 4: Commit the failing test**

```bash
git add word-stats/tests/reader.test.ts word-stats/tests/fixtures/sample.txt
git commit -m "test(word-stats): add failing test for readFile success case"
```

---

### Task 3: Implement readFile to Pass Success Test

**Files:**
- Create: `word-stats/src/reader.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Write minimal implementation**

Create `word-stats/src/reader.ts`:

```typescript
import { readFile as fsReadFile } from 'fs/promises';

export async function readFile(filePath: string): Promise<string> {
  return fsReadFile(filePath, 'utf-8');
}
```

**Step 2: Run test to verify pass**

Run: `cd word-stats && npm test`
Expected: PASS - 1 test passing

**Step 3: Commit the implementation**

```bash
git add word-stats/src/reader.ts
git commit -m "feat(word-stats): implement readFile for reading text files"
```

---

### Task 4: Write Failing Test for Missing File Error

**Files:**
- Modify: `word-stats/tests/reader.test.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Add test for missing file**

Add to `word-stats/tests/reader.test.ts`:

```typescript
  describe('when file does not exist', () => {
    it('throws an error with descriptive message', async () => {
      const filePath = path.join(fixturesDir, 'nonexistent.txt');

      await expect(readFile(filePath)).rejects.toThrow(
        /File not found: .*nonexistent\.txt/
      );
    });
  });
```

**Step 2: Run test to verify failure**

Run: `cd word-stats && npm test`
Expected: FAIL - error message doesn't match pattern (default Node error doesn't include "File not found")

**Step 3: Commit the failing test**

```bash
git add word-stats/tests/reader.test.ts
git commit -m "test(word-stats): add failing test for missing file error"
```

---

### Task 5: Implement Descriptive Error for Missing Files

**Files:**
- Modify: `word-stats/src/reader.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Update implementation with error handling**

Update `word-stats/src/reader.ts`:

```typescript
import { readFile as fsReadFile } from 'fs/promises';

export async function readFile(filePath: string): Promise<string> {
  try {
    return await fsReadFile(filePath, 'utf-8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw error;
  }
}
```

**Step 2: Run test to verify pass**

Run: `cd word-stats && npm test`
Expected: PASS - 2 tests passing

**Step 3: Commit the error handling**

```bash
git add word-stats/src/reader.ts
git commit -m "feat(word-stats): add descriptive error for missing files"
```

---

### Task 6: Write Test for Empty File

**Files:**
- Modify: `word-stats/tests/reader.test.ts`
- Create: `word-stats/tests/fixtures/empty.txt`

**Model:** haiku

**review:** none

**Step 1: Create empty fixture**

Create `word-stats/tests/fixtures/empty.txt` (empty file):

```
```

**Step 2: Add test for empty file**

Add to `word-stats/tests/reader.test.ts`:

```typescript
  describe('when file is empty', () => {
    it('returns an empty string', async () => {
      const filePath = path.join(fixturesDir, 'empty.txt');
      const result = await readFile(filePath);

      expect(result).toBe('');
    });
  });
```

**Step 3: Run test to verify pass**

Run: `cd word-stats && npm test`
Expected: PASS - 3 tests passing (empty file already handled by current implementation)

**Step 4: Commit the edge case test**

```bash
git add word-stats/tests/reader.test.ts word-stats/tests/fixtures/empty.txt
git commit -m "test(word-stats): add test for empty file handling"
```

---

### Task 7: Final Verification and Cleanup

**Files:**
- Read: All created files for verification

**Model:** haiku

**review:** none

**Step 1: Run all tests**

Run: `cd word-stats && npm test`
Expected: PASS - All 3 tests passing

**Step 2: Verify TypeScript compiles**

Run: `cd word-stats && npm run build`
Expected: Compiles without errors, dist/ directory created

**Step 3: Verify file structure**

Run: `ls -la word-stats/src/ word-stats/tests/`
Expected output should show:
```
word-stats/src/:
reader.ts

word-stats/tests/:
reader.test.ts
fixtures/
```

**Step 4: Add dist to gitignore**

Create or update `word-stats/.gitignore`:

```
node_modules/
dist/
```

**Step 5: Final commit**

```bash
git add word-stats/.gitignore
git commit -m "chore(word-stats): add gitignore for build artifacts"
```

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~15 | `git diff --stat main..HEAD -- 'word-stats/src/*.ts' \| tail -1` |
| Test lines added | ~35 | `git diff --stat main..HEAD -- 'word-stats/tests/*.ts' \| tail -1` |
| Files touched | 7-8 | `git diff --name-only main..HEAD \| wc -l` |
| Test count | 3 | `cd word-stats && npm test -- --json \| jq '.numPassedTests'` |

**Target files:**
- `word-stats/package.json` - Project configuration
- `word-stats/tsconfig.json` - TypeScript configuration
- `word-stats/jest.config.js` - Test configuration
- `word-stats/src/reader.ts` - Core implementation (~15 lines)
- `word-stats/tests/reader.test.ts` - Test coverage (~35 lines)
- `word-stats/tests/fixtures/sample.txt` - Test fixture
- `word-stats/tests/fixtures/empty.txt` - Edge case fixture
- `word-stats/.gitignore` - Build artifact exclusions

**ROI expectation:** Phase 1 delivers a complete, tested module in ~50 lines total. Test-to-implementation ratio of ~2:1 validates TDD approach. Module provides foundation for Phase 2's analyzer.
