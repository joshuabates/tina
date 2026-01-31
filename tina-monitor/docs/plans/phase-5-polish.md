# Phase 5: Polish - Implementation Plan

## Overview

Final polish phase focusing on error handling, edge cases, and visual refinement. This phase improves user experience by providing better feedback, handling empty states gracefully, and adding helpful UI hints.

**Status**: Complete

---

## Tasks Completed

### Task 1: Status Message Display in Dashboard

**Files Modified**: `src/dashboard.rs`, `src/app.rs`

Added `render_with_status` method to Dashboard that displays transient status messages on the right side of the header. Messages like "Copied: abc1234" or "Sent: command" appear after actions and clear on the next key press.

```rust
// Dashboard now has render_with_status method
pub fn render_with_status(&self, frame: &mut Frame, area: Rect, status_message: Option<&str>)

// App render uses it
self.dashboard.render_with_status(frame, dashboard_area, self.status_message.as_deref());
```

**Tests Added**:
- `render_with_status_message_does_not_panic`
- `render_without_status_message_shows_hints`
- `render_with_status_message_does_not_panic` (in app.rs)
- `status_message_clears_on_key_press`

---

### Task 2: Keybinding Hints in Dashboard

**File Modified**: `src/dashboard.rs`

When no status message is displayed, the dashboard shows keybinding hints on the right side:
- `[/] Find` - Open fuzzy finder
- `[?] Help` - Open help screen

This matches the design doc UI layout specification.

---

### Task 3: Welcome State for No Feature Loaded

**File Modified**: `src/dashboard.rs`

When no orchestration is loaded (`feature` is empty), the dashboard displays a welcome message guiding users:

```
tina-monitor  Press / to find an orchestration
```

This helps new users understand how to get started.

---

### Task 4: Fuzzy Finder Empty States

**File Modified**: `src/overlay/fuzzy.rs`

Added proper empty state messages:

1. **No orchestrations at all**:
   ```
   No orchestrations found

   Start an orchestration with tina-session
   ```

2. **Filter returns no matches**:
   ```
   No matches
   ```

**Tests Added**:
- `render_empty_state_does_not_panic`
- `render_no_matches_state_does_not_panic`

---

### Task 5: Code Cleanup

**Files Modified**: `src/layout.rs`, `src/overlay/help.rs`, `src/overlay/quicklook.rs`

1. Updated stale TODO comments in `layout.rs` that referenced Phase 4:
   ```rust
   // Before: TODO: Implement quicklook overlay in Phase 4
   // After: Quicklook is handled by App via overlay system
   ```

2. Extracted helper functions in overlays for cleaner code:
   - `help.rs`: Added `section_header()` helper
   - `quicklook.rs`: Added `detail_line()` helper

---

## File Changes Summary

| File | Lines Changed | Description |
|------|--------------|-------------|
| `src/app.rs` | +37 | Use render_with_status, add tests |
| `src/dashboard.rs` | +122/-5 | Add render_with_status, welcome state, hints |
| `src/layout.rs` | +4/-4 | Update stale TODO comments |
| `src/overlay/fuzzy.rs` | +98/-6 | Add empty state messages, tests |
| `src/overlay/help.rs` | +45/-57 | Extract section_header helper |
| `src/overlay/quicklook.rs` | +52/-102 | Extract detail_line helper |

**Total**: +289/-131 lines

---

## Test Results

- **Before Phase 5**: 498 tests passing
- **After Phase 5**: 504 tests passing (+6 new tests)
- **All tests pass**

---

## Verification

```bash
# Build
cargo build -p tina-monitor

# Run all tests
cargo test -p tina-monitor

# Manual verification
cargo run -p tina-monitor -- --fixture tests/fixtures/sample-orchestration/

# Verify:
# 1. Dashboard shows "[/] Find [?] Help" hints on right side
# 2. Press "/" - fuzzy finder opens
# 3. If no orchestrations, shows "No orchestrations found" message
# 4. Type non-matching text - shows "No matches"
# 5. Load an orchestration - dashboard shows feature name and status
# 6. Press "y" on a commit - shows "Copied: <sha>" status message
# 7. Press any key - status message clears, hints return
```

---

## Design Alignment

This phase implements the following from the design doc:

1. **Dashboard keybinding hints**: `[/] Find  [?] Help` in header (from UI Layout section)
2. **Error handling**: Graceful empty states instead of blank panels
3. **Visual refinement**: Consistent styling, helpful guidance for users

---

## What's NOT in This Phase

Per the design doc's "What We're NOT Building" section:
- Log streaming (use tmux attach instead)
- Inline diff viewer (use quicklook → action → external viewer)
- Multiple orchestration tabs (use fuzzy finder to switch)
- Configuration file (sensible defaults only)

---

## Commit

```
34a1a2e feat(tina-monitor): Phase 5 polish - status messages, empty states, visual refinement
```
