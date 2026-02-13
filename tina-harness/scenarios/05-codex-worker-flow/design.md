# Add Statistics Summary to CLI

## Overview

Add a `--stats` / `-s` flag to the test-project CLI that prints character and word count statistics after processing. This exercises full Codex routing by using a Codex model for both implementation and review.

## Architectural Context

This is a single-file change to the CLI argument parser and main processing loop. No architectural changes required. The existing Clap-based CLI parser supports boolean flags natively.

## Requirements

1. Add `--stats` / `-s` flag to CLI arguments
2. When enabled, after processing count and print total characters and total words in the output
3. Format: "Stats: N characters, M words"

## Phase 1: Implement Statistics Flag

### Tasks

1. **Executor (codex):** Add `stats: bool` field to `Cli` struct with `-s` and `--stats` flags. After normal processing output, if stats is enabled, count total characters and words in the output and print "Stats: N characters, M words" on a separate line.

2. **Reviewers (codex):** Run both spec-reviewer and code-quality-reviewer passes. Confirm the stats flag does not affect normal processing when not enabled, output counts are accurate, and all existing tests still pass.

### Success Criteria

- `test-project --stats -u` shows output followed by stats line
- `test-project` (without stats) works as before with no stats line
- All existing tests continue to pass, and both Codex reviewers approve
