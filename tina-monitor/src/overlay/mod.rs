//! Overlay system for modal dialogs
//!
//! Overlays render on top of the panel grid and capture all keyboard input
//! until closed.

pub mod fuzzy;
pub mod help;
pub mod quicklook;
pub mod send;

use ratatui::layout::{Constraint, Direction, Layout, Rect};

/// Calculate a centered rectangle with given percentage dimensions
pub fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn centered_rect_creates_smaller_rect() {
        let outer = Rect::new(0, 0, 100, 50);
        let inner = centered_rect(60, 70, outer);

        // Inner should be smaller than outer
        assert!(inner.width < outer.width);
        assert!(inner.height < outer.height);
    }

    #[test]
    fn centered_rect_is_centered() {
        let outer = Rect::new(0, 0, 100, 100);
        let inner = centered_rect(50, 50, outer);

        // Check that the inner rect is roughly centered
        let expected_x = (outer.width - inner.width) / 2;
        let expected_y = (outer.height - inner.height) / 2;

        // Allow some rounding tolerance
        assert!(inner.x >= expected_x.saturating_sub(1) && inner.x <= expected_x + 1);
        assert!(inner.y >= expected_y.saturating_sub(1) && inner.y <= expected_y + 1);
    }

    #[test]
    fn centered_rect_with_100_percent_fills_area() {
        let outer = Rect::new(0, 0, 100, 50);
        let inner = centered_rect(100, 100, outer);

        // Should fill most of the area (might have rounding)
        assert!(inner.width >= outer.width - 2);
        assert!(inner.height >= outer.height - 2);
    }
}
