# Add Dry-Run Flag to CLI

## Overview

Add a `--dry-run` flag to the test-project CLI that shows what processing would happen without making changes. This exercises multi-CLI routing by using a Codex model for code review.

## Architectural Context

This is a single-file change to the CLI argument parser and main processing loop. No architectural changes required. The existing Clap-based CLI parser supports boolean flags natively.

## Requirements

1. Add `--dry-run` / `-n` flag to CLI arguments
2. When enabled, print each line showing what would be processed but do not transform
3. Show summary of lines that would be affected

## Phase 1: Implement Dry-Run Flag

### Tasks

1. **Executor (opus):** Add `dry_run: bool` field to `Cli` struct with `-n` and `--dry-run` flags. When dry-run is enabled, print "Would process: {line}" for each input line instead of transforming it. Print "Dry run: N lines would be processed" at the end.

2. **Reviewer (codex):** Review the implementation for correctness, ensuring the dry-run flag does not affect normal processing when not enabled, and that all existing tests still pass.

### Success Criteria

- `test-project --dry-run -u` shows what would be processed
- `test-project` (without dry-run) works as before
- All existing tests continue to pass
