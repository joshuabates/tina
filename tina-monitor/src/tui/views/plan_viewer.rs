//! Plan viewer modal for displaying implementation plans

use ratatui::{
    layout::{Alignment, Rect},
    style::{Color, Style},
    text::Line,
    widgets::{Block, Borders, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState},
    Frame,
};
use std::path::PathBuf;

/// Plan viewer for displaying markdown plan files
pub struct PlanViewer {
    /// Path to the plan file
    pub path: PathBuf,
    /// Loaded markdown content
    pub content: String,
    /// Current scroll position
    pub scroll: u16,
    /// Total number of lines
    pub total_lines: u16,
}

impl PlanViewer {
    /// Create a new PlanViewer by loading the plan file
    pub fn new(path: PathBuf) -> Result<Self, std::io::Error> {
        let content = std::fs::read_to_string(&path)?;
        let total_lines = if content.is_empty() {
            0
        } else {
            content.lines().count() as u16
        };

        Ok(Self {
            path,
            content,
            scroll: 0,
            total_lines,
        })
    }

    /// Scroll down by the given amount
    pub fn scroll_down(&mut self, amount: u16) {
        let max_scroll = self.total_lines.saturating_sub(1);
        self.scroll = self.scroll.saturating_add(amount).min(max_scroll);
    }

    /// Scroll up by the given amount
    pub fn scroll_up(&mut self, amount: u16) {
        self.scroll = self.scroll.saturating_sub(amount);
    }

    /// Render the plan viewer
    pub fn render(&self, frame: &mut Frame, area: Rect) {
        // Get filename for title
        let filename = self.path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown");

        // Convert content to lines
        let lines: Vec<Line> = self.content
            .lines()
            .skip(self.scroll as usize)
            .take(area.height.saturating_sub(2) as usize) // Account for borders
            .map(|line| Line::from(line.to_string()))
            .collect();

        let paragraph = Paragraph::new(lines)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(format!(" {} ", filename))
                    .title_alignment(Alignment::Center),
            )
            .style(Style::default().fg(Color::White));

        frame.render_widget(paragraph, area);

        // Render scrollbar if needed
        if self.total_lines > area.height.saturating_sub(2) {
            let scrollbar = Scrollbar::default()
                .orientation(ScrollbarOrientation::VerticalRight)
                .begin_symbol(None)
                .end_symbol(None);

            let mut scrollbar_state = ScrollbarState::new(
                self.total_lines.saturating_sub(area.height.saturating_sub(2)) as usize
            )
            .position(self.scroll as usize);

            frame.render_stateful_widget(
                scrollbar,
                area.inner(ratatui::layout::Margin { vertical: 1, horizontal: 0 }),
                &mut scrollbar_state,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_plan_viewer_loads_file_content() {
        // Create a temporary plan file
        let mut temp_file = NamedTempFile::new().unwrap();
        let content = "# Test Plan\n\nThis is a test plan.\n\n## Phase 1\n\nImplement feature X.";
        write!(temp_file, "{}", content).unwrap();
        temp_file.flush().unwrap();

        let viewer = PlanViewer::new(temp_file.path().to_path_buf()).unwrap();

        assert_eq!(viewer.content, content);
        assert_eq!(viewer.scroll, 0);
        assert!(viewer.total_lines > 0);
    }

    #[test]
    fn test_plan_viewer_fails_on_nonexistent_file() {
        let result = PlanViewer::new(PathBuf::from("/nonexistent/plan.md"));
        assert!(result.is_err());
    }

    #[test]
    fn test_plan_viewer_scroll_down() {
        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "Line 1\nLine 2\nLine 3\nLine 4\nLine 5").unwrap();
        temp_file.flush().unwrap();

        let mut viewer = PlanViewer::new(temp_file.path().to_path_buf()).unwrap();

        viewer.scroll_down(2);
        assert_eq!(viewer.scroll, 2);

        viewer.scroll_down(1);
        assert_eq!(viewer.scroll, 3);
    }

    #[test]
    fn test_plan_viewer_scroll_up() {
        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "Line 1\nLine 2\nLine 3\nLine 4\nLine 5").unwrap();
        temp_file.flush().unwrap();

        let mut viewer = PlanViewer::new(temp_file.path().to_path_buf()).unwrap();
        viewer.scroll = 5;

        viewer.scroll_up(2);
        assert_eq!(viewer.scroll, 3);

        viewer.scroll_up(1);
        assert_eq!(viewer.scroll, 2);
    }

    #[test]
    fn test_plan_viewer_scroll_up_does_not_go_negative() {
        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "Line 1\nLine 2").unwrap();
        temp_file.flush().unwrap();

        let mut viewer = PlanViewer::new(temp_file.path().to_path_buf()).unwrap();
        viewer.scroll = 1;

        viewer.scroll_up(5);
        assert_eq!(viewer.scroll, 0, "Scroll should not go below 0");
    }

    #[test]
    fn test_plan_viewer_scroll_down_clamps_at_max() {
        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "Line 1\nLine 2\nLine 3").unwrap();
        temp_file.flush().unwrap();

        let mut viewer = PlanViewer::new(temp_file.path().to_path_buf()).unwrap();
        let max_scroll = viewer.total_lines.saturating_sub(1);

        viewer.scroll_down(1000);
        assert!(viewer.scroll <= max_scroll, "Scroll should not exceed max");
    }

    #[test]
    fn test_plan_viewer_calculates_total_lines() {
        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "Line 1\nLine 2\nLine 3\nLine 4").unwrap();
        temp_file.flush().unwrap();

        let viewer = PlanViewer::new(temp_file.path().to_path_buf()).unwrap();
        assert_eq!(viewer.total_lines, 4);
    }

    #[test]
    fn test_plan_viewer_handles_empty_file() {
        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "").unwrap();
        temp_file.flush().unwrap();

        let viewer = PlanViewer::new(temp_file.path().to_path_buf()).unwrap();
        assert_eq!(viewer.content, "");
        assert_eq!(viewer.total_lines, 0);
        assert_eq!(viewer.scroll, 0);
    }

    #[test]
    fn test_plan_viewer_stores_path() {
        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "content").unwrap();
        temp_file.flush().unwrap();

        let path = temp_file.path().to_path_buf();
        let viewer = PlanViewer::new(path.clone()).unwrap();
        assert_eq!(viewer.path, path);
    }

    #[test]
    fn test_plan_viewer_render_does_not_panic() {
        use ratatui::{backend::TestBackend, Terminal, layout::Rect};

        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "# Test Plan\n\nContent here").unwrap();
        temp_file.flush().unwrap();

        let viewer = PlanViewer::new(temp_file.path().to_path_buf()).unwrap();
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            let area = Rect {
                x: 0,
                y: 0,
                width: 80,
                height: 24,
            };
            viewer.render(frame, area);
        });

        assert!(result.is_ok(), "Render should not panic");
    }

    #[test]
    fn test_plan_viewer_render_shows_filename_in_title() {
        use ratatui::{backend::TestBackend, Terminal, layout::Rect};

        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "# Test Plan").unwrap();
        temp_file.flush().unwrap();

        let path = temp_file.path().to_path_buf();
        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        let viewer = PlanViewer::new(path).unwrap();

        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();

        terminal.draw(|frame| {
            let area = Rect { x: 0, y: 0, width: 80, height: 24 };
            viewer.render(frame, area);
        }).unwrap();

        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();
        assert!(content.contains(&filename), "Title should contain filename");
    }

    #[test]
    fn test_plan_viewer_render_displays_content() {
        use ratatui::{backend::TestBackend, Terminal, layout::Rect};

        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "Test content line 1\nTest content line 2").unwrap();
        temp_file.flush().unwrap();

        let viewer = PlanViewer::new(temp_file.path().to_path_buf()).unwrap();
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();

        terminal.draw(|frame| {
            let area = Rect { x: 0, y: 0, width: 80, height: 24 };
            viewer.render(frame, area);
        }).unwrap();

        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();
        assert!(content.contains("Test content line 1"), "Should display first line");
        assert!(content.contains("Test content line 2"), "Should display second line");
    }
}
