# Orchestration System Test Design

A minimal multi-phase project designed to exercise the orchestration workflow end-to-end.

## Problem

We need to validate that the orchestration system works correctly after significant updates. This includes:
- Design validation
- Worktree setup
- Phase planning
- Phase execution (team-lead in tmux)
- Task implementation
- Code review (spec + quality)
- Phase review
- Remediation handling (if reviews fail)
- Phase transitions
- Completion and cleanup

## Solution

Create a simple CLI utility with 3 phases that exercises all orchestration components without complex domain logic. The utility will be a "word stats" tool that reads text and outputs statistics.

## Core Model

```
word-stats/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── reader.ts         # File reading
│   ├── analyzer.ts       # Word analysis
│   └── formatter.ts      # Output formatting
└── tests/
    ├── reader.test.ts
    ├── analyzer.test.ts
    └── formatter.test.ts
```

## Phase 1: Core Reader Module

**Scope:** Create the file reader module that can read text files.

**Deliverables:**
- `src/reader.ts` - exports `readFile(path: string): Promise<string>`
- `tests/reader.test.ts` - tests for reading files, handling missing files

**Success Criteria:**
- Reader can read existing files
- Reader throws descriptive error for missing files
- Tests pass

## Phase 2: Word Analyzer Module

**Scope:** Create the analyzer that processes text into statistics.

**Dependencies:** Phase 1 (uses reader to get content)

**Deliverables:**
- `src/analyzer.ts` - exports `analyze(text: string): WordStats`
- `tests/analyzer.test.ts` - tests for word counting, character counting, line counting

**WordStats interface:**
```typescript
interface WordStats {
  wordCount: number;
  charCount: number;
  lineCount: number;
  avgWordLength: number;
}
```

**Success Criteria:**
- Analyzer correctly counts words, characters, lines
- Handles empty input
- Tests pass

## Phase 3: CLI Integration

**Scope:** Wire everything together into a working CLI.

**Dependencies:** Phase 2 (uses analyzer)

**Deliverables:**
- `src/formatter.ts` - exports `format(stats: WordStats): string`
- `src/index.ts` - CLI entry point that ties reader → analyzer → formatter
- `tests/formatter.test.ts` - tests for output formatting
- Update package.json with bin entry

**Success Criteria:**
- `word-stats <file>` outputs statistics
- Exit code 0 on success, 1 on error
- All tests pass

## Success Metrics

**Goal:** All 3 phases complete with passing tests and clean reviews.

**Baseline command:**
```bash
echo "No word-stats implementation exists"
```

**Progress command:**
```bash
ls -la word-stats/src/ 2>/dev/null && npm test --prefix word-stats 2>/dev/null || echo "Not yet complete"
```

**ROI threshold:** Implementation creates ~150 lines of production code, ~200 lines of test code across 3 phases with functioning CLI.

## Architectural Context

**Patterns to follow:**
- Simple module exports (one function per module for this test)
- TypeScript with strict mode
- Jest for testing

**Code to reuse:**
- None (greenfield test project)

**Anti-patterns to avoid:**
- Over-engineering (this is a test harness, keep it minimal)
- Complex abstractions (direct, simple code)

**Integration points:**
- Each phase builds on previous
- Final phase integrates all modules into CLI
