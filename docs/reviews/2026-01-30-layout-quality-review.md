# Code Quality Review: src/layout.rs

**Date:** 2026-01-30
**Scope:** PanelGrid implementation in src/layout.rs
**Focus:** Rust idioms, ratatui usage, separation of concerns, focus tracking logic, test structure

---

## Summary

The `PanelGrid` implementation demonstrates solid foundational work with good use of ratatui primitives and clean separation between grid management and panel delegation. However, the code has critical gaps in test coverage and some minor inconsistencies that should be addressed before proceeding to Phase 4 overlay work.

**Key Finding:** The gap between test coverage in `src/layout.rs` (3 trivial tests) vs. `src/panels/mod.rs` (15+ comprehensive tests) represents a significant maintenance risk.

---

## Detailed Findings

### 1. Test Coverage Gap — Priority 2 (Enable Change)

**Status:** ❌ **Issue**

**What:** The test suite in `src/layout.rs` (lines 156-173) contains three tests that only verify enum variants exist and can be pattern-matched. No actual `PanelGrid` behavior is tested.

**Evidence:**
```rust
#[test]
fn grid_result_consumed() {
    let result = GridResult::Consumed;
    assert!(matches!(result, GridResult::Consumed));
}
```

These tests verify the type system, not the logic.

**Missing Coverage:**

1. **Focus movement with wrapping** — No tests for `move_focus()` behavior:
   - Right/Left wrapping at edges
   - Up/Down wrapping at edges
   - Correctness of modulo vs. conditional logic

2. **Key event routing** — No tests for `handle_key()`:
   - Navigation keys (arrows) move focus correctly
   - vim-style keys (hjkl) work as alternatives
   - Non-navigation keys delegate to focused panel
   - `MoveFocus` result from panels causes grid to move focus

3. **Focus state tracking** — No tests for:
   - `focus()` getter returns correct position
   - `set_focus()` sets position correctly
   - Focus updates are reflected in rendering

4. **Grid rendering** — No integration tests for:
   - Correct panel selection based on focus position
   - Focus boolean passed correctly to each panel
   - Layout constraints are applied

**Comparison:** `src/panels/mod.rs` contains 15+ comprehensive tests (lines 10-142) covering navigation, boundary behavior, focus movement, and keyboard shortcuts. That's the standard we should match.

**Why It Matters:**
- The focus movement logic uses both modulo arithmetic and conditionals (see Finding 2) — mixed patterns need verification
- Future changes to grid behavior won't be caught
- New developers can't understand expected behavior from tests
- The grid is the routing hub for keyboard input — correctness is critical

**Scope:** Medium effort (20-30 tests following the pattern from panels/mod.rs)

---

### 2. Pattern Inconsistency in Focus Movement — Priority 3 (Clarity)

**Status:** ⚠️ **Inconsistency**

**What:** The `move_focus()` method (lines 65-80) uses two different approaches for equivalent operations:

```rust
// Modulo arithmetic for wrapping
Direction::Right => {
    self.focus.1 = (self.focus.1 + 1) % 2;
}

// Conditional for wrapping
Direction::Left => {
    self.focus.1 = if self.focus.1 == 0 { 1 } else { 0 };
}
```

Both achieve the same wrapping behavior on a 2x2 grid, but mixing patterns reduces clarity.

**Why It Matters:**
- Inconsistency suggests uncertainty about the approach
- Maintenance risk: future changes might not preserve the pattern
- Conditional form is actually more readable for binary choices

**Recommended Fix:** Standardize on conditionals (more readable):

```rust
Direction::Right => {
    self.focus.1 = if self.focus.1 == 0 { 1 } else { 0 };
}
Direction::Left => {
    self.focus.1 = if self.focus.1 == 0 { 1 } else { 0 };
}
Direction::Down => {
    self.focus.0 = if self.focus.0 == 0 { 1 } else { 0 };
}
Direction::Up => {
    self.focus.0 = if self.focus.0 == 0 { 1 } else { 0 };
}
```

Alternatively, both could use modulo. The choice matters less than consistency.

**Scope:** Small effort (one-line change per direction)

---

### 3. Premature Abstraction — Priority 4 (Low Impact)

**Status:** ⚠️ **Design Concern**

**What:** The `Action` enum (lines 17-20) contains only a `Placeholder` variant:

```rust
pub enum Action {
    /// Placeholder for Phase 4
    Placeholder,
}
```

This appears designed for Phase 4 overlay functionality that hasn't been specified yet.

**Why It Matters:**
- Adds API surface area with no current use
- Tests exist for placeholder behavior (Finding 1) rather than actual behavior
- When Phase 4 is designed, this may need restructuring anyway
- Violates YAGNI principle: You Aren't Gonna Need It

**Recommended Fix:** Remove `Action` and `GridResult::GlobalAction` until Phase 4 is designed. When overlay requirements are clear, add the proper abstraction.

**Alternative:** If Phase 4 design is already decided, expand this with actual variants.

**Scope:** Small effort (remove enum, update GridResult to remove GlobalAction variant)

---

## Positive Findings

### ✅ Rust Idioms & Best Practices

**Strengths:**

1. **Proper `Default` implementation** (lines 145-148):
   ```rust
   impl Default for PanelGrid {
       fn default() -> Self {
           Self::new()
       }
   }
   ```
   Clean delegation pattern.

2. **Smart type design** for `GridResult` and `Action`:
   - Copy/Clone for small enums (zero-cost)
   - PartialEq/Eq for comparisons (testing and logic)
   - Debug for diagnostics

3. **Immutable borrows in const contexts**:
   ```rust
   pub fn focus(&self) -> (usize, usize) {
       self.focus
   }
   ```
   Good use of borrows and tuple copying.

4. **Private fields with controlled access**:
   - `panels` and `focus` are private
   - Mutation only through defined methods
   - No accidental state corruption

### ✅ Ratatui Usage & Layout Primitives

**Strengths:**

1. **Correct Layout composition** (lines 120-127):
   ```rust
   let [top, bottom] = Layout::default()
       .direction(LayoutDirection::Vertical)
       .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
       .areas(area);
   ```
   - Proper enum type: `LayoutDirection` (distinct from `Direction`)
   - Correct constraint usage: `Percentage(50)` for 2x2 split
   - Proper destructuring with `areas()`

2. **Two-level layout hierarchy** (lines 129-137):
   - Vertical split first (rows)
   - Horizontal split second (columns)
   - Standard TUI pattern

3. **Focus boolean passed correctly** (lines 139-145):
   ```rust
   let is_focused_00 = self.focus == (0, 0);
   // ...
   self.panels[0][0].render(frame, top_left, is_focused_00);
   ```
   Each panel receives accurate focus state for styling.

### ✅ Separation of Concerns

**Strengths:**

1. **Grid owns layout and focus, not content**:
   - `PanelGrid` manages 2x2 positioning and focus state
   - Individual `Panel` implementations handle their content
   - Clean responsibility boundary

2. **Upward communication through `HandleResult::MoveFocus`**:
   ```rust
   match result {
       HandleResult::MoveFocus(dir) => {
           self.move_focus(dir);
           GridResult::Consumed
       }
   }
   ```
   Panels can request focus movement without knowing about the grid structure. Excellent abstraction.

3. **No cross-panel coupling**:
   - Panels are boxed trait objects (`Box<dyn Panel>`)
   - Grid doesn't assume anything about panel implementations
   - Easy to add new panel types

4. **Key routing strategy**:
   - Grid intercepts navigation keys (arrows, hjkl)
   - All other keys delegate to focused panel
   - Clear responsibility split

---

## Assessment Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| **Test Coverage** | ❌ Critical gap | 3 trivial tests vs. 15+ in panels/mod.rs |
| **Rust Idioms** | ✅ Good | Proper Default, immutability, type design |
| **Ratatui Usage** | ✅ Excellent | Correct layout composition, constraints, focus passing |
| **Separation of Concerns** | ✅ Good | Grid/panel boundary is clean, upward communication works |
| **Focus Logic** | ⚠️ Consistent but unclear | Works correctly, but mixed patterns reduce clarity |
| **API Design** | ⚠️ Over-specified | `Action` enum exists for undesigned Phase 4 |

---

## Recommended Actions

### Must Complete Before Proceeding

1. **Implement comprehensive test suite** for `PanelGrid`:
   - 20-30 tests matching the quality of `src/panels/mod.rs`
   - Cover focus movement, wrapping, key routing, state tracking
   - Include edge cases and boundary conditions

### Should Complete Soon

2. **Standardize focus movement logic**:
   - Choose one pattern (conditional recommended for clarity)
   - Apply consistently across all four directions
   - Add a comment explaining the wrapping strategy

### Optional (Low Priority)

3. **Remove premature abstraction**:
   - Delete `Action` enum and `GridResult::GlobalAction` variant
   - Add back when Phase 4 requirements are clear
   - Reduces API surface area

---

## Conclusion

The `PanelGrid` implementation is fundamentally sound with good use of ratatui and clean architectural separation. The main blocker for proceeding is **test coverage** — the current test suite provides zero verification of critical navigation and focus behavior. Once comprehensive tests are added, this module will be ready for Phase 4 integration work.

The pattern inconsistency and premature abstraction are lower-priority cleanup items that improve maintainability but don't affect correctness.

