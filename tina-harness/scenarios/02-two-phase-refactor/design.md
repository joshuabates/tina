# Extract Utils Module

## Overview

Refactor the test-project to extract shared utility functions into a dedicated `utils` module, then update existing code to use them.

## Requirements

1. Create a new `src/utils/` module
2. Move reusable functionality into utils
3. Update existing code to use the new utils

## Phase 1: Create Utils Module

### Tasks

1. Create `src/utils/mod.rs`
2. Add a `StringExt` trait with extension methods:
   - `fn trim_and_lowercase(&self) -> String`
   - `fn is_blank(&self) -> bool`
3. Export utils module from lib.rs
4. Add unit tests for the new trait

### Success Criteria

- `src/utils/mod.rs` exists with `StringExt` trait
- Unit tests for StringExt pass
- lib.rs exports the utils module

## Phase 2: Use Utils in Core

### Tasks

1. Import `StringExt` in `core/processor.rs`
2. Use `is_blank()` to add blank line filtering option to ProcessorConfig
3. Update processor to skip blank lines when configured
4. Add tests for blank line filtering

### Success Criteria

- Processor can filter blank lines using utils
- All tests pass
- No code duplication for string checks
