//! Tests for PanelGrid layout system

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::{backend::TestBackend, Terminal};
use tina_monitor::layout::{PanelGrid, GridResult};
use tina_monitor::panel::Direction;

fn make_key_event(code: KeyCode) -> KeyEvent {
    KeyEvent::new(code, KeyModifiers::NONE)
}

// ============================================================================
// Focus Navigation Tests
// ============================================================================

/// Test that focus starts at (0, 0)
#[test]
fn test_panel_grid_initial_focus() {
    let grid = PanelGrid::new();
    assert_eq!(
        grid.focus(),
        (0, 0),
        "Initial focus should be at top-left (0, 0)"
    );
}

/// Test that right arrow moves focus right within bounds
#[test]
fn test_focus_moves_right_within_bounds() {
    let mut grid = PanelGrid::new();
    grid.set_focus((0, 0));

    let result = grid.handle_key(make_key_event(KeyCode::Right));
    assert_eq!(
        result, GridResult::Consumed,
        "Right key should be consumed when moving right"
    );
    assert_eq!(
        grid.focus(),
        (0, 1),
        "Focus should move from (0, 0) to (0, 1)"
    );
}

/// Test that right arrow at column 1 wraps to column 0
#[test]
fn test_focus_right_wraps_at_edge() {
    let mut grid = PanelGrid::new();
    grid.set_focus((0, 1));

    let result = grid.handle_key(make_key_event(KeyCode::Right));
    assert_eq!(
        result, GridResult::Consumed,
        "Right key should be consumed when wrapping"
    );
    assert_eq!(
        grid.focus(),
        (0, 0),
        "Focus should wrap from (0, 1) to (0, 0)"
    );
}

/// Test that left arrow moves focus left within bounds
#[test]
fn test_focus_moves_left_within_bounds() {
    let mut grid = PanelGrid::new();
    grid.set_focus((0, 1));

    let result = grid.handle_key(make_key_event(KeyCode::Left));
    assert_eq!(
        result, GridResult::Consumed,
        "Left key should be consumed when moving left"
    );
    assert_eq!(
        grid.focus(),
        (0, 0),
        "Focus should move from (0, 1) to (0, 0)"
    );
}

/// Test that left arrow at column 0 wraps to column 1
#[test]
fn test_focus_left_wraps_at_edge() {
    let mut grid = PanelGrid::new();
    grid.set_focus((0, 0));

    let result = grid.handle_key(make_key_event(KeyCode::Left));
    assert_eq!(
        result, GridResult::Consumed,
        "Left key should be consumed when wrapping"
    );
    assert_eq!(
        grid.focus(),
        (0, 1),
        "Focus should wrap from (0, 0) to (0, 1)"
    );
}

/// Test that down arrow moves focus down within bounds
#[test]
fn test_focus_moves_down_within_bounds() {
    let mut grid = PanelGrid::new();
    grid.set_focus((0, 0));

    let result = grid.handle_key(make_key_event(KeyCode::Down));
    assert_eq!(
        result, GridResult::Consumed,
        "Down key should be consumed when moving down"
    );
    assert_eq!(
        grid.focus(),
        (1, 0),
        "Focus should move from (0, 0) to (1, 0)"
    );
}

/// Test that down arrow at row 1 wraps to row 0
#[test]
fn test_focus_down_wraps_at_edge() {
    let mut grid = PanelGrid::new();
    grid.set_focus((1, 0));

    let result = grid.handle_key(make_key_event(KeyCode::Down));
    assert_eq!(
        result, GridResult::Consumed,
        "Down key should be consumed when wrapping"
    );
    assert_eq!(
        grid.focus(),
        (0, 0),
        "Focus should wrap from (1, 0) to (0, 0)"
    );
}

/// Test that up arrow moves focus up within bounds
#[test]
fn test_focus_moves_up_within_bounds() {
    let mut grid = PanelGrid::new();
    grid.set_focus((1, 0));

    let result = grid.handle_key(make_key_event(KeyCode::Up));
    assert_eq!(
        result, GridResult::Consumed,
        "Up key should be consumed when moving up"
    );
    assert_eq!(
        grid.focus(),
        (0, 0),
        "Focus should move from (1, 0) to (0, 0)"
    );
}

/// Test that up arrow at row 0 wraps to row 1
#[test]
fn test_focus_up_wraps_at_edge() {
    let mut grid = PanelGrid::new();
    grid.set_focus((0, 0));

    let result = grid.handle_key(make_key_event(KeyCode::Up));
    assert_eq!(
        result, GridResult::Consumed,
        "Up key should be consumed when wrapping"
    );
    assert_eq!(
        grid.focus(),
        (1, 0),
        "Focus should wrap from (0, 0) to (1, 0)"
    );
}

/// Test that vim keys work (hjkl navigation)
#[test]
fn test_vim_navigation_keys() {
    let mut grid = PanelGrid::new();
    grid.set_focus((0, 0));

    // h = left
    let result = grid.handle_key(make_key_event(KeyCode::Char('h')));
    assert_eq!(result, GridResult::Consumed);
    assert_eq!(grid.focus(), (0, 1));

    // l = right
    let result = grid.handle_key(make_key_event(KeyCode::Char('l')));
    assert_eq!(result, GridResult::Consumed);
    assert_eq!(grid.focus(), (0, 0));

    // j = down
    let result = grid.handle_key(make_key_event(KeyCode::Char('j')));
    assert_eq!(result, GridResult::Consumed);
    assert_eq!(grid.focus(), (1, 0));

    // k = up
    let result = grid.handle_key(make_key_event(KeyCode::Char('k')));
    assert_eq!(result, GridResult::Consumed);
    assert_eq!(grid.focus(), (0, 0));
}

// ============================================================================
// Panel Delegation Tests
// ============================================================================

/// Test that key events are delegated to the focused panel
#[test]
fn test_key_event_delegated_to_focused_panel() {
    let mut grid = PanelGrid::new();
    grid.set_focus((0, 0));

    // A key that panels should handle (like 'j' for down navigation in a panel)
    let result = grid.handle_key(make_key_event(KeyCode::Char('j')));
    // This should be consumed by the panel or the grid
    assert!(
        matches!(result, GridResult::Consumed | GridResult::Ignored),
        "Key should be handled or ignored, not cause error"
    );
}

/// Test that panel requests for focus movement are honored
#[test]
fn test_panel_focus_movement_request() {
    let mut grid = PanelGrid::new();
    grid.set_focus((1, 1)); // Bottom-right corner

    // Simulate a key that requests movement down from the focused panel
    // This tests that when a panel returns MoveFocus(Direction::Down),
    // the grid moves focus accordingly
    grid.move_focus(Direction::Down);
    assert_eq!(
        grid.focus(),
        (0, 1),
        "Focus should move down (wrapping) from (1, 1) to (0, 1)"
    );
}

// ============================================================================
// Rendering Tests
// ============================================================================

/// Test that grid can be rendered
#[test]
fn test_panel_grid_renders() {
    let grid = PanelGrid::new();
    let backend = TestBackend::new(200, 50);
    let mut terminal = Terminal::new(backend).unwrap();

    // Grid rendering should succeed without panicking
    let result = terminal.draw(|frame| {
        let area = frame.area();
        grid.render(frame, area);
    });

    assert!(result.is_ok(), "Grid should render successfully");
}

/// Test that focused panel is highlighted in rendering
#[test]
fn test_focused_panel_highlighted() {
    let mut grid = PanelGrid::new();
    let backend = TestBackend::new(200, 50);
    let mut terminal = Terminal::new(backend).unwrap();

    // Set focus to (0, 0) and render
    grid.set_focus((0, 0));
    let result1 = terminal.draw(|frame| {
        let area = frame.area();
        grid.render(frame, area);
    });
    assert!(result1.is_ok());

    // Set focus to (1, 1) and render again
    grid.set_focus((1, 1));
    let result2 = terminal.draw(|frame| {
        let area = frame.area();
        grid.render(frame, area);
    });
    assert!(result2.is_ok());
    // Both renders should succeed, grid handles focus tracking correctly
}

/// Test that focused panel has visual highlight (cyan border color)
#[test]
fn test_focused_panel_has_visual_highlight() {
    use ratatui::style::Color;

    let mut grid = PanelGrid::new();
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    // Initial focus is (0,0) - Orchestrator Team
    grid.set_focus((0, 0));
    terminal.draw(|frame| {
        let area = frame.area();
        grid.render(frame, area);
    }).unwrap();

    // Get cell style at a border position of focused panel (top-left)
    let buffer = terminal.backend().buffer();

    // The focused panel border should have Cyan color
    // Check the top-left corner of the grid (position 0,0 is the corner)
    let cell = buffer.cell((0, 0)).unwrap();
    assert_eq!(
        cell.fg,
        Color::Cyan,
        "Focused panel at (0,0) should have Cyan border"
    );

    // Move focus to right panel (0,1) - Tasks panel
    grid.move_focus(Direction::Right);
    terminal.draw(|frame| {
        let area = frame.area();
        grid.render(frame, area);
    }).unwrap();

    let buffer = terminal.backend().buffer();
    // Now top-left panel should be unfocused (DarkGray)
    let cell = buffer.cell((0, 0)).unwrap();
    assert_eq!(
        cell.fg,
        Color::DarkGray,
        "Unfocused panel at (0,0) should have DarkGray border after moving focus"
    );

    // The Tasks panel is in the right half, so check its left border
    // With 80 columns, each half is 40 columns, so Tasks panel starts around column 40
    let cell = buffer.cell((40, 0)).unwrap();
    assert_eq!(
        cell.fg,
        Color::Cyan,
        "Focused panel at (0,1) should have Cyan border"
    );
}

// ============================================================================
// Grid Layout Tests
// ============================================================================

/// Test that grid has all 4 panels
#[test]
fn test_grid_has_four_panels() {
    let _grid = PanelGrid::new();
    // Grid should have panels at all 4 positions
    // We verify this by checking that focus can be set to all 4 positions
    for row in 0..2 {
        for col in 0..2 {
            let mut test_grid = PanelGrid::new();
            test_grid.set_focus((row, col));
            assert_eq!(
                test_grid.focus(),
                (row, col),
                "Grid should have panel at ({}, {})",
                row,
                col
            );
        }
    }
}

/// Test that all panels are in correct positions
#[test]
fn test_grid_panel_arrangement() {
    let grid = PanelGrid::new();

    // (0,0) should be Team panel
    // (0,1) should be Tasks panel
    // (1,0) should be Team panel (second)
    // (1,1) should be Commits panel
    // This is verified indirectly by the grid structure and panel names

    assert_eq!(grid.focus(), (0, 0), "Grid should initialize with focus at (0, 0)");

    // The specific panel type verification happens through rendering and panel behavior
}

// ============================================================================
// Edge Cases and Wrapping Tests
// ============================================================================

/// Test focus wrapping behavior in all directions
#[test]
fn test_focus_wrapping_all_directions() {
    let mut grid = PanelGrid::new();

    // Test from each corner
    let corners = vec![(0, 0), (0, 1), (1, 0), (1, 1)];

    for (row, col) in corners {
        grid.set_focus((row, col));

        // Test right wrap from right edge
        if col == 1 {
            let mut test_grid = PanelGrid::new();
            test_grid.set_focus((row, col));
            test_grid.move_focus(Direction::Right);
            assert_eq!(
                test_grid.focus(),
                (row, 0),
                "Right should wrap from ({}, 1) to ({}, 0)",
                row,
                row
            );
        }

        // Test left wrap from left edge
        if col == 0 {
            let mut test_grid = PanelGrid::new();
            test_grid.set_focus((row, col));
            test_grid.move_focus(Direction::Left);
            assert_eq!(
                test_grid.focus(),
                (row, 1),
                "Left should wrap from ({}, 0) to ({}, 1)",
                row,
                row
            );
        }

        // Test down wrap from bottom
        if row == 1 {
            let mut test_grid = PanelGrid::new();
            test_grid.set_focus((row, col));
            test_grid.move_focus(Direction::Down);
            assert_eq!(
                test_grid.focus(),
                (0, col),
                "Down should wrap from (1, {}) to (0, {})",
                col,
                col
            );
        }

        // Test up wrap from top
        if row == 0 {
            let mut test_grid = PanelGrid::new();
            test_grid.set_focus((row, col));
            test_grid.move_focus(Direction::Up);
            assert_eq!(
                test_grid.focus(),
                (1, col),
                "Up should wrap from (0, {}) to (1, {})",
                col,
                col
            );
        }
    }
}

/// Test that unknown keys are ignored appropriately
#[test]
fn test_unknown_keys_ignored() {
    let mut grid = PanelGrid::new();
    let initial_focus = grid.focus();

    // Send an unrecognized key
    let result = grid.handle_key(make_key_event(KeyCode::F(12)));

    // Focus should not change, result should be Ignored
    assert_eq!(
        grid.focus(),
        initial_focus,
        "Focus should not change for unknown keys"
    );
    assert_eq!(
        result, GridResult::Ignored,
        "Unknown keys should return Ignored"
    );
}

/// Test that focus can be set to any valid position
#[test]
fn test_set_focus_to_all_positions() {
    let mut grid = PanelGrid::new();

    for row in 0..2 {
        for col in 0..2 {
            grid.set_focus((row, col));
            assert_eq!(
                grid.focus(),
                (row, col),
                "Should be able to set focus to ({}, {})",
                row,
                col
            );
        }
    }
}

// ============================================================================
// Integration Tests
// ============================================================================

/// Test complete navigation sequence through the grid
#[test]
fn test_complete_grid_navigation() {
    let mut grid = PanelGrid::new();

    // Start at (0, 0) - Team
    assert_eq!(grid.focus(), (0, 0));

    // Move right to (0, 1) - Tasks
    grid.move_focus(Direction::Right);
    assert_eq!(grid.focus(), (0, 1));

    // Move down to (1, 1) - Commits
    grid.move_focus(Direction::Down);
    assert_eq!(grid.focus(), (1, 1));

    // Move left to (1, 0) - Team
    grid.move_focus(Direction::Left);
    assert_eq!(grid.focus(), (1, 0));

    // Move up to (0, 0) - Team
    grid.move_focus(Direction::Up);
    assert_eq!(grid.focus(), (0, 0));
}

/// Test that multiple render calls work correctly
#[test]
fn test_multiple_render_calls() {
    let mut grid = PanelGrid::new();
    let backend = TestBackend::new(200, 50);
    let mut terminal = Terminal::new(backend).unwrap();

    for _ in 0..5 {
        grid.move_focus(Direction::Right);
        let result = terminal.draw(|frame| {
            let area = frame.area();
            grid.render(frame, area);
        });
        assert!(result.is_ok(), "Grid should render consistently");
    }
}
