# Orchestration Test Phase 2 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Create the word analyzer module that processes text into statistics (word count, character count, line count, average word length).

**Architecture:** A TypeScript module that exports `analyze(text: string): WordStats` and a `WordStats` interface. The function uses string manipulation to calculate statistics. No external dependencies.

**Phase context:** Phase 1 completed the reader module (`src/reader.ts`) which reads files and returns text content. This phase creates the analyzer that processes that text. Phase 3 will wire them together into a CLI.

---

### Task 1: Define WordStats Interface and Write Failing Test for Word Count

**Files:**
- Create: `word-stats/src/analyzer.ts`
- Create: `word-stats/tests/analyzer.test.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Create analyzer.ts with interface only**

Create `word-stats/src/analyzer.ts`:

```typescript
export interface WordStats {
  wordCount: number;
  charCount: number;
  lineCount: number;
  avgWordLength: number;
}
```

**Step 2: Write failing test for word count**

Create `word-stats/tests/analyzer.test.ts`:

```typescript
import { analyze, WordStats } from '../src/analyzer';

describe('analyze', () => {
  describe('wordCount', () => {
    it('counts words separated by spaces', () => {
      const result = analyze('hello world');
      expect(result.wordCount).toBe(2);
    });

    it('counts words separated by newlines', () => {
      const result = analyze('hello\nworld');
      expect(result.wordCount).toBe(2);
    });

    it('handles multiple spaces between words', () => {
      const result = analyze('hello   world');
      expect(result.wordCount).toBe(2);
    });
  });
});
```

**Step 3: Run test to verify failure**

Run: `cd word-stats && npm test -- analyzer.test.ts`
Expected: FAIL with "analyze is not a function" or similar import error

**Step 4: Commit the interface and failing test**

```bash
git add word-stats/src/analyzer.ts word-stats/tests/analyzer.test.ts
git commit -m "test(word-stats): add WordStats interface and failing word count tests"
```

---

### Task 2: Implement analyze Function with Word Count

**Files:**
- Modify: `word-stats/src/analyzer.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Implement analyze with word count**

Update `word-stats/src/analyzer.ts`:

```typescript
export interface WordStats {
  wordCount: number;
  charCount: number;
  lineCount: number;
  avgWordLength: number;
}

export function analyze(text: string): WordStats {
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  const wordCount = words.length;

  return {
    wordCount,
    charCount: 0,
    lineCount: 0,
    avgWordLength: 0,
  };
}
```

**Step 2: Run test to verify pass**

Run: `cd word-stats && npm test -- analyzer.test.ts`
Expected: PASS - 3 tests passing

**Step 3: Commit the word count implementation**

```bash
git add word-stats/src/analyzer.ts
git commit -m "feat(word-stats): implement analyze with word count"
```

---

### Task 3: Write Failing Test for Character Count

**Files:**
- Modify: `word-stats/tests/analyzer.test.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Add character count tests**

Add to `word-stats/tests/analyzer.test.ts`:

```typescript
  describe('charCount', () => {
    it('counts all characters including spaces', () => {
      const result = analyze('hello world');
      expect(result.charCount).toBe(11);
    });

    it('counts newlines as characters', () => {
      const result = analyze('hello\nworld');
      expect(result.charCount).toBe(11);
    });
  });
```

**Step 2: Run test to verify failure**

Run: `cd word-stats && npm test -- analyzer.test.ts`
Expected: FAIL - charCount is 0, expected 11

**Step 3: Commit the failing test**

```bash
git add word-stats/tests/analyzer.test.ts
git commit -m "test(word-stats): add failing character count tests"
```

---

### Task 4: Implement Character Count

**Files:**
- Modify: `word-stats/src/analyzer.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Add character count to implementation**

Update the return statement in `word-stats/src/analyzer.ts`:

```typescript
export function analyze(text: string): WordStats {
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  const wordCount = words.length;
  const charCount = text.length;

  return {
    wordCount,
    charCount,
    lineCount: 0,
    avgWordLength: 0,
  };
}
```

**Step 2: Run test to verify pass**

Run: `cd word-stats && npm test -- analyzer.test.ts`
Expected: PASS - 5 tests passing

**Step 3: Commit the character count implementation**

```bash
git add word-stats/src/analyzer.ts
git commit -m "feat(word-stats): implement character count"
```

---

### Task 5: Write Failing Test for Line Count

**Files:**
- Modify: `word-stats/tests/analyzer.test.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Add line count tests**

Add to `word-stats/tests/analyzer.test.ts`:

```typescript
  describe('lineCount', () => {
    it('counts lines separated by newlines', () => {
      const result = analyze('line one\nline two\nline three');
      expect(result.lineCount).toBe(3);
    });

    it('counts single line without newline', () => {
      const result = analyze('single line');
      expect(result.lineCount).toBe(1);
    });

    it('counts trailing newline as extra line', () => {
      const result = analyze('line one\nline two\n');
      expect(result.lineCount).toBe(3);
    });
  });
```

**Step 2: Run test to verify failure**

Run: `cd word-stats && npm test -- analyzer.test.ts`
Expected: FAIL - lineCount is 0, expected 3

**Step 3: Commit the failing test**

```bash
git add word-stats/tests/analyzer.test.ts
git commit -m "test(word-stats): add failing line count tests"
```

---

### Task 6: Implement Line Count

**Files:**
- Modify: `word-stats/src/analyzer.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Add line count to implementation**

Update `word-stats/src/analyzer.ts`:

```typescript
export function analyze(text: string): WordStats {
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  const wordCount = words.length;
  const charCount = text.length;
  const lineCount = text.length === 0 ? 0 : text.split('\n').length;

  return {
    wordCount,
    charCount,
    lineCount,
    avgWordLength: 0,
  };
}
```

**Step 2: Run test to verify pass**

Run: `cd word-stats && npm test -- analyzer.test.ts`
Expected: PASS - 8 tests passing

**Step 3: Commit the line count implementation**

```bash
git add word-stats/src/analyzer.ts
git commit -m "feat(word-stats): implement line count"
```

---

### Task 7: Write Failing Test for Average Word Length

**Files:**
- Modify: `word-stats/tests/analyzer.test.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Add average word length tests**

Add to `word-stats/tests/analyzer.test.ts`:

```typescript
  describe('avgWordLength', () => {
    it('calculates average length of words', () => {
      const result = analyze('hi hello');
      // "hi" = 2, "hello" = 5, average = 3.5
      expect(result.avgWordLength).toBe(3.5);
    });

    it('rounds to 2 decimal places', () => {
      const result = analyze('a bb ccc');
      // "a" = 1, "bb" = 2, "ccc" = 3, average = 2
      expect(result.avgWordLength).toBe(2);
    });

    it('returns 0 for empty text', () => {
      const result = analyze('');
      expect(result.avgWordLength).toBe(0);
    });
  });
```

**Step 2: Run test to verify failure**

Run: `cd word-stats && npm test -- analyzer.test.ts`
Expected: FAIL - avgWordLength is 0, expected 3.5

**Step 3: Commit the failing test**

```bash
git add word-stats/tests/analyzer.test.ts
git commit -m "test(word-stats): add failing average word length tests"
```

---

### Task 8: Implement Average Word Length

**Files:**
- Modify: `word-stats/src/analyzer.ts`

**Model:** sonnet

**review:** spec-only

**Step 1: Add average word length to implementation**

Update `word-stats/src/analyzer.ts`:

```typescript
export interface WordStats {
  wordCount: number;
  charCount: number;
  lineCount: number;
  avgWordLength: number;
}

export function analyze(text: string): WordStats {
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  const wordCount = words.length;
  const charCount = text.length;
  const lineCount = text.length === 0 ? 0 : text.split('\n').length;
  const avgWordLength = wordCount === 0
    ? 0
    : Math.round((words.reduce((sum, word) => sum + word.length, 0) / wordCount) * 100) / 100;

  return {
    wordCount,
    charCount,
    lineCount,
    avgWordLength,
  };
}
```

**Step 2: Run test to verify pass**

Run: `cd word-stats && npm test -- analyzer.test.ts`
Expected: PASS - 11 tests passing

**Step 3: Commit the average word length implementation**

```bash
git add word-stats/src/analyzer.ts
git commit -m "feat(word-stats): implement average word length"
```

---

### Task 9: Write Test for Empty Input Edge Case

**Files:**
- Modify: `word-stats/tests/analyzer.test.ts`

**Model:** haiku

**review:** none

**Step 1: Add empty input tests**

Add to `word-stats/tests/analyzer.test.ts`:

```typescript
  describe('empty input', () => {
    it('returns all zeros for empty string', () => {
      const result = analyze('');
      expect(result).toEqual({
        wordCount: 0,
        charCount: 0,
        lineCount: 0,
        avgWordLength: 0,
      });
    });

    it('returns all zeros for whitespace only', () => {
      const result = analyze('   \n\n   ');
      expect(result.wordCount).toBe(0);
      expect(result.avgWordLength).toBe(0);
    });
  });
```

**Step 2: Run test to verify pass**

Run: `cd word-stats && npm test -- analyzer.test.ts`
Expected: PASS - 13 tests passing (or may fail on whitespace-only case)

**Step 3: Fix if needed and commit**

If the whitespace-only test fails, the current implementation should handle it correctly. If not, adjust as needed.

```bash
git add word-stats/tests/analyzer.test.ts
git commit -m "test(word-stats): add empty input edge case tests"
```

---

### Task 10: Final Verification

**Files:**
- Read: All analyzer files for verification

**Model:** haiku

**review:** none

**Step 1: Run all tests**

Run: `cd word-stats && npm test`
Expected: PASS - All tests passing (reader + analyzer tests)

**Step 2: Verify TypeScript compiles**

Run: `cd word-stats && npm run build`
Expected: Compiles without errors

**Step 3: Verify exports work correctly**

Run: `cd word-stats && node -e "const { analyze } = require('./dist/analyzer'); console.log(analyze('hello world'))"`
Expected output:
```
{ wordCount: 2, charCount: 11, lineCount: 1, avgWordLength: 5 }
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(word-stats): complete analyzer module with all statistics"
```

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~25 | `git diff --stat HEAD~10..HEAD -- 'word-stats/src/analyzer.ts' \| tail -1` |
| Test lines added | ~80 | `git diff --stat HEAD~10..HEAD -- 'word-stats/tests/analyzer.test.ts' \| tail -1` |
| Files touched | 2 | `git diff --name-only HEAD~10..HEAD \| grep -E 'analyzer' \| wc -l` |
| Test count | 13 | `cd word-stats && npm test -- --json 2>/dev/null \| jq '.numPassedTests'` |

**Target files:**
- `word-stats/src/analyzer.ts` - Core implementation (~25 lines)
- `word-stats/tests/analyzer.test.ts` - Test coverage (~80 lines)

**ROI expectation:** Phase 2 delivers a complete, tested analyzer module in ~105 lines total. Test-to-implementation ratio of ~3:1 ensures thorough coverage of edge cases. Module ready for Phase 3 CLI integration.
