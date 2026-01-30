# Orchestration Test Phase 3 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Wire the reader and analyzer modules together into a working CLI that outputs formatted word statistics.

**Architecture:** Three components: (1) `formatter.ts` exports `format(stats: WordStats): string` to produce human-readable output, (2) `index.ts` is the CLI entry point that orchestrates reader -> analyzer -> formatter, and (3) package.json bin entry makes the CLI executable. Uses Node.js process.argv for argument parsing.

**Phase context:** Phase 1 completed `src/reader.ts` (reads files, throws descriptive errors). Phase 2 completed `src/analyzer.ts` (exports `analyze(text: string): WordStats`). This phase integrates them into a CLI and adds output formatting.

---

### Task 1: Write Failing Test for Formatter

**Files:**
- Create: `word-stats/tests/formatter.test.ts`
- Create: `word-stats/src/formatter.ts` (stub only)

**Model:** sonnet

**review:** spec-only

**Step 1: Create stub formatter module**

Create `word-stats/src/formatter.ts`:

```typescript
import { WordStats } from './analyzer';

export function format(stats: WordStats): string {
  throw new Error('Not implemented');
}
```

**Step 2: Write failing tests for formatter**

Create `word-stats/tests/formatter.test.ts`:

```typescript
import { format } from '../src/formatter';
import { WordStats } from '../src/analyzer';

describe('format', () => {
  it('formats stats as human-readable lines', () => {
    const stats: WordStats = {
      wordCount: 100,
      charCount: 500,
      lineCount: 10,
      avgWordLength: 4.5,
    };

    const result = format(stats);

    expect(result).toContain('Words: 100');
    expect(result).toContain('Characters: 500');
    expect(result).toContain('Lines: 10');
    expect(result).toContain('Average word length: 4.5');
  });

  it('formats each stat on its own line', () => {
    const stats: WordStats = {
      wordCount: 5,
      charCount: 25,
      lineCount: 2,
      avgWordLength: 4,
    };

    const result = format(stats);
    const lines = result.trim().split('\n');

    expect(lines.length).toBe(4);
  });

  it('handles zero values', () => {
    const stats: WordStats = {
      wordCount: 0,
      charCount: 0,
      lineCount: 0,
      avgWordLength: 0,
    };

    const result = format(stats);

    expect(result).toContain('Words: 0');
    expect(result).toContain('Characters: 0');
    expect(result).toContain('Lines: 0');
    expect(result).toContain('Average word length: 0');
  });
});
```

**Step 3: Run test to verify failure**

Run: `cd word-stats && npm test -- formatter.test.ts`
Expected: FAIL with "Not implemented" error

**Step 4: Commit the failing test**

```bash
git add word-stats/src/formatter.ts word-stats/tests/formatter.test.ts
git commit -m "test(word-stats): add failing formatter tests"
```

---

### Task 2: Implement Formatter

**Files:**
- Modify: `word-stats/src/formatter.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Implement format function**

Update `word-stats/src/formatter.ts`:

```typescript
import { WordStats } from './analyzer';

export function format(stats: WordStats): string {
  return [
    `Words: ${stats.wordCount}`,
    `Characters: ${stats.charCount}`,
    `Lines: ${stats.lineCount}`,
    `Average word length: ${stats.avgWordLength}`,
  ].join('\n');
}
```

**Step 2: Run test to verify pass**

Run: `cd word-stats && npm test -- formatter.test.ts`
Expected: PASS - 3 tests passing

**Step 3: Commit the implementation**

```bash
git add word-stats/src/formatter.ts
git commit -m "feat(word-stats): implement formatter for human-readable output"
```

---

### Task 3: Create CLI Entry Point (Happy Path)

**Files:**
- Create: `word-stats/src/index.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Create CLI entry point**

Create `word-stats/src/index.ts`:

```typescript
#!/usr/bin/env node

import { readFile } from './reader';
import { analyze } from './analyzer';
import { format } from './formatter';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: word-stats <file>');
    process.exit(1);
  }

  const filePath = args[0];

  try {
    const content = await readFile(filePath);
    const stats = analyze(content);
    const output = format(stats);
    console.log(output);
    process.exit(0);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unknown error occurred');
    }
    process.exit(1);
  }
}

main();
```

**Step 2: Build the project**

Run: `cd word-stats && npm run build`
Expected: Compiles without errors

**Step 3: Test CLI manually with sample file**

Run: `cd word-stats && node dist/index.js tests/fixtures/sample.txt`
Expected output:
```
Words: 10
Characters: 53
Lines: 4
Average word length: 4.3
```

**Step 4: Commit the CLI entry point**

```bash
git add word-stats/src/index.ts
git commit -m "feat(word-stats): add CLI entry point"
```

---

### Task 4: Add bin Entry to package.json

**Files:**
- Modify: `word-stats/package.json`

**Model:** haiku

**review:** none

**Step 1: Update package.json with bin entry**

Update `word-stats/package.json` to add the bin field:

```json
{
  "name": "word-stats",
  "version": "1.0.0",
  "description": "CLI utility for word statistics",
  "main": "dist/index.js",
  "bin": {
    "word-stats": "./dist/index.js"
  },
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

**Step 2: Rebuild and test bin entry**

Run: `cd word-stats && npm run build && npm link`
Expected: Creates symlink for word-stats command

**Step 3: Test the linked command**

Run: `word-stats tests/fixtures/sample.txt`
Expected output (same as before):
```
Words: 10
Characters: 53
Lines: 4
Average word length: 4.3
```

**Step 4: Commit the bin entry**

```bash
git add word-stats/package.json
git commit -m "feat(word-stats): add bin entry for CLI command"
```

---

### Task 5: Test CLI Error Handling (No Arguments)

**Files:**
- None (manual testing)

**Model:** haiku

**review:** none

**Step 1: Test with no arguments**

Run: `cd word-stats && node dist/index.js`
Expected output:
```
Usage: word-stats <file>
```
Expected exit code: 1

**Step 2: Verify exit code**

Run: `cd word-stats && node dist/index.js; echo "Exit code: $?"`
Expected output:
```
Usage: word-stats <file>
Exit code: 1
```

---

### Task 6: Test CLI Error Handling (Missing File)

**Files:**
- None (manual testing)

**Model:** haiku

**review:** none

**Step 1: Test with nonexistent file**

Run: `cd word-stats && node dist/index.js nonexistent.txt`
Expected output:
```
Error: File not found: nonexistent.txt
```
Expected exit code: 1

**Step 2: Verify exit code**

Run: `cd word-stats && node dist/index.js nonexistent.txt; echo "Exit code: $?"`
Expected output:
```
Error: File not found: nonexistent.txt
Exit code: 1
```

---

### Task 7: Test CLI Success Case (Exit Code 0)

**Files:**
- None (manual testing)

**Model:** haiku

**review:** none

**Step 1: Test with valid file and verify exit code**

Run: `cd word-stats && node dist/index.js tests/fixtures/sample.txt; echo "Exit code: $?"`
Expected output:
```
Words: 10
Characters: 53
Lines: 4
Average word length: 4.3
Exit code: 0
```

---

### Task 8: Test with Empty File

**Files:**
- None (manual testing)

**Model:** haiku

**review:** none

**Step 1: Test with empty file**

Run: `cd word-stats && node dist/index.js tests/fixtures/empty.txt`
Expected output:
```
Words: 0
Characters: 0
Lines: 0
Average word length: 0
```

---

### Task 9: Final Verification - All Tests Pass

**Files:**
- Read: All files for verification

**Model:** haiku

**review:** none

**Step 1: Run all tests**

Run: `cd word-stats && npm test`
Expected: PASS - All tests passing (reader: 3, analyzer: 13, formatter: 3 = 19 total)

**Step 2: Verify TypeScript compiles cleanly**

Run: `cd word-stats && npm run build`
Expected: Compiles without errors or warnings

**Step 3: Verify file structure**

Run: `ls -la word-stats/src/`
Expected:
```
analyzer.ts
formatter.ts
index.ts
reader.ts
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(word-stats): complete CLI integration"
```

---

### Task 10: Cleanup npm link

**Files:**
- None

**Model:** haiku

**review:** none

**Step 1: Unlink the package**

Run: `cd word-stats && npm unlink`
Expected: Removes the global symlink

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~35 | `git diff --stat HEAD~5..HEAD -- 'word-stats/src/*.ts' \| tail -1` |
| Test lines added | ~50 | `git diff --stat HEAD~5..HEAD -- 'word-stats/tests/*.ts' \| tail -1` |
| Files touched | 4 | `git diff --name-only HEAD~5..HEAD \| wc -l` |
| Test count | 19 | `cd word-stats && npm test -- --json 2>/dev/null \| jq '.numPassedTests'` |

**Target files:**
- `word-stats/src/formatter.ts` - Output formatting (~10 lines)
- `word-stats/src/index.ts` - CLI entry point (~25 lines)
- `word-stats/tests/formatter.test.ts` - Formatter tests (~50 lines)
- `word-stats/package.json` - bin entry addition

**ROI expectation:** Phase 3 delivers a complete, working CLI in ~85 lines of new code. Test-to-implementation ratio of ~1.5:1 for this phase reflects that integration code is less complex than the core algorithms tested in Phase 2. The CLI integrates all previous work into a usable tool.
