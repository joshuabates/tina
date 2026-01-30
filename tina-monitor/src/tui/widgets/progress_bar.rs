use ratatui::style::{Color, Style};
use ratatui::text::Span;

/// Render a text-based progress bar
/// Example: "████████░░" for 80% complete
pub fn render(completed: usize, total: usize, width: usize) -> String {
    if total == 0 {
        return "░".repeat(width);
    }

    let filled = (completed * width) / total;
    let empty = width.saturating_sub(filled);

    format!("{}{}", "█".repeat(filled), "░".repeat(empty))
}

/// Render a styled progress bar span
pub fn render_styled<'a>(completed: usize, total: usize, width: usize) -> Span<'a> {
    let text = render(completed, total, width);

    let color = if total == 0 {
        Color::DarkGray
    } else if completed >= total {
        Color::Green
    } else {
        Color::Blue
    };

    Span::styled(text, Style::default().fg(color))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_progress_bar_empty() {
        // 0/10 should show all empty blocks
        let result = render(0, 10, 10);
        assert_eq!(result, "░░░░░░░░░░");
    }

    #[test]
    fn test_progress_bar_full() {
        // 5/5 should show all filled blocks
        let result = render(5, 5, 10);
        assert_eq!(result, "██████████");
    }

    #[test]
    fn test_progress_bar_partial() {
        // 8/10 (80%) should show 8 filled and 2 empty
        let result = render(8, 10, 10);
        assert_eq!(result, "████████░░");
    }

    #[test]
    fn test_progress_bar_zero_total() {
        // 0/0 should show all empty blocks (edge case)
        let result = render(0, 0, 10);
        assert_eq!(result, "░░░░░░░░░░");
    }

    #[test]
    fn test_progress_bar_styled_colors() {
        // Zero total should be DarkGray
        let span = render_styled(0, 0, 10);
        assert_eq!(span.style.fg, Some(Color::DarkGray));

        // Incomplete should be Blue
        let span = render_styled(5, 10, 10);
        assert_eq!(span.style.fg, Some(Color::Blue));

        // Complete should be Green
        let span = render_styled(10, 10, 10);
        assert_eq!(span.style.fg, Some(Color::Green));
    }
}
