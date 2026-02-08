# Add Verbose Flag to CLI

## Overview

Add a `--verbose` flag to the test-project CLI that enables detailed output during processing.

## Architectural Context

This is a single-file change to the CLI argument parser and main processing loop. No architectural changes required. The existing Clap-based CLI parser supports boolean flags natively.

## Requirements

1. Add `--verbose` / `-v` flag to CLI arguments
2. When enabled, print each line before and after processing
3. Show transformation summary at the end

## Phase 1: Implement Verbose Flag

### Tasks

1. Add `verbose: bool` field to `Cli` struct with `-v` and `--verbose` flags
2. Pass verbose setting through to processing logic
3. When verbose is enabled:
   - Print "Processing: {original}" before each line
   - Print "Result: {processed}" after each line
   - Print "Processed N lines" at the end

### Success Criteria

- `test-project --verbose -u` shows transformation details
- `test-project` (without verbose) works as before
- All existing tests continue to pass
