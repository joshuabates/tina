# Add Verbose Mode with Custom Format

## Overview

Add a `--verbose` / `-v` flag to the test-project CLI that prints detailed step-by-step processing output. This exercises Codex retry behavior by requiring precise output formatting that may trigger retry on format mismatch.

## Architectural Context

This is a single-file change to the CLI argument parser and main processing loop. No architectural changes required.

## Requirements

1. Add `--verbose` / `-v` flag to CLI arguments
2. When enabled, print "Processing line N: <content>" for each input line before the transformed output
3. At the end, print "Verbose: processed N lines, M characters total"

## Phase 1: Implement Verbose Mode

### Tasks

1. **Executor (codex):** Add `verbose: bool` field to `Cli` struct with `-v` and `--verbose` flags. When verbose is enabled, before each transformed line print "Processing line N: <original_line>". After all output, print "Verbose: processed N lines, M characters total" where N is line count and M is total character count of all original lines.

2. **Reviewer (codex):** Review the implementation for correctness, ensuring verbose mode does not affect normal processing when not enabled, line numbers start at 1, character counts are accurate, and all existing tests still pass.

### Success Criteria

- `test-project --verbose -u` shows processing details followed by transformed output
- `test-project` (without verbose) works as before with no verbose output
- All existing tests continue to pass
