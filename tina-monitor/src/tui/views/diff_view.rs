//! Diff stats view modal
//!
//! Displays git diff statistics for a range with file list and full diff view.

use crate::git::diff::{get_diff_stats, get_full_diff, DiffStat};
use anyhow::Result;
use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Wrap},
    Frame,
};
use std::path::Path;

/// Diff view modal showing git diff statistics
pub struct DiffView {
    pub title: String,
    pub range: String,
    pub worktree_path: std::path::PathBuf,
    pub stats: DiffStat,
    pub selected: usize,
    pub list_state: ListState,
    pub full_diff: Option<String>,
    pub show_full: bool,
    pub scroll: u16,
}

impl DiffView {
    /// Create a new DiffView
    pub fn new<P: AsRef<Path>>(worktree_path: P, range: String, title: String) -> Result<Self> {
        let stats = get_diff_stats(worktree_path.as_ref(), &range)?;
        let mut list_state = ListState::default();
        if !stats.files.is_empty() {
            list_state.select(Some(0));
        }

        Ok(Self {
            title,
            range,
            worktree_path: worktree_path.as_ref().to_path_buf(),
            stats,
            selected: 0,
            list_state,
            full_diff: None,
            show_full: false,
            scroll: 0,
        })
    }

    /// Select next file
    pub fn select_next(&mut self) {
        if self.stats.files.is_empty() {
            return;
        }
        self.selected = (self.selected + 1) % self.stats.files.len();
        self.list_state.select(Some(self.selected));
    }

    /// Select previous file
    pub fn select_previous(&mut self) {
        if self.stats.files.is_empty() {
            return;
        }
        if self.selected == 0 {
            self.selected = self.stats.files.len() - 1;
        } else {
            self.selected -= 1;
        }
        self.list_state.select(Some(self.selected));
    }

    /// Toggle between file list and full diff view
    pub fn toggle_full_diff(&mut self) -> Result<()> {
        if self.full_diff.is_none() {
            // Load the full diff on first toggle
            self.full_diff = Some(get_full_diff(&self.worktree_path, &self.range)?);
        }
        self.show_full = !self.show_full;
        Ok(())
    }

    /// Scroll down in full diff view
    pub fn scroll_down(&mut self) {
        self.scroll += 1;
    }

    /// Scroll up in full diff view
    pub fn scroll_up(&mut self) {
        if self.scroll > 0 {
            self.scroll -= 1;
        }
    }

    /// Render the diff view
    pub fn render(&mut self, frame: &mut Frame, area: Rect) {
        if self.show_full {
            self.render_full_diff(frame, area);
        } else {
            self.render_file_list(frame, area);
        }
    }

    /// Render file list mode
    fn render_file_list(&mut self, frame: &mut Frame, area: Rect) {
        // Split area into file list and summary footer
        let chunks = Layout::default()
            .direction(ratatui::layout::Direction::Vertical)
            .constraints([Constraint::Min(3), Constraint::Length(3)])
            .split(area);

        // Render file list
        let file_items: Vec<ListItem> = self
            .stats
            .files
            .iter()
            .map(|file| {
                let content = if file.is_binary {
                    format!("{} (binary)", file.path)
                } else {
                    format!("{} (+{} -{})", file.path, file.insertions, file.deletions)
                };
                ListItem::new(content)
            })
            .collect();

        let file_list = List::new(file_items)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(self.title.clone()),
            )
            .highlight_style(
                Style::default()
                    .bg(Color::DarkGray)
                    .add_modifier(Modifier::BOLD),
            );

        frame.render_stateful_widget(file_list, chunks[0], &mut self.list_state);

        // Render summary footer
        let summary_text = format!(
            "{} files changed, +{} insertions, -{} deletions",
            self.stats.files_changed, self.stats.total_insertions, self.stats.total_deletions
        );

        let summary = Paragraph::new(Line::from(vec![Span::styled(
            summary_text,
            Style::default().fg(Color::Cyan),
        )]))
        .block(Block::default().borders(Borders::ALL).title("Summary"));

        frame.render_widget(summary, chunks[1]);
    }

    /// Render full diff mode
    fn render_full_diff(&self, frame: &mut Frame, area: Rect) {
        let diff_text = self.full_diff.as_deref().unwrap_or("Loading...");

        let paragraph = Paragraph::new(diff_text)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(format!("{} (Full Diff)", self.title)),
            )
            .wrap(Wrap { trim: false })
            .scroll((self.scroll, 0));

        frame.render_widget(paragraph, area);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn get_test_repo_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_path_buf()
    }

    #[test]
    fn test_diff_view_new() {
        let repo = get_test_repo_path();
        let view = DiffView::new(&repo, "HEAD~1..HEAD".to_string(), "Test Diff".to_string());

        assert!(view.is_ok(), "Should create DiffView successfully");
        let view = view.unwrap();
        assert_eq!(view.title, "Test Diff");
        assert_eq!(view.range, "HEAD~1..HEAD");
        assert_eq!(view.show_full, false, "Should start in file list mode");
        assert_eq!(view.scroll, 0, "Should start with scroll at 0");
        assert!(
            view.full_diff.is_none(),
            "Should not load full diff initially"
        );
    }

    #[test]
    fn test_diff_view_starts_with_first_selected() {
        let repo = get_test_repo_path();
        let view = DiffView::new(&repo, "HEAD~1..HEAD".to_string(), "Test".to_string()).unwrap();

        if !view.stats.files.is_empty() {
            assert_eq!(view.selected, 0, "Should start with first file selected");
            assert_eq!(
                view.list_state.selected(),
                Some(0),
                "ListState should have first item selected"
            );
        }
    }

    #[test]
    fn test_select_next_wraps_around() {
        let repo = get_test_repo_path();
        let mut view =
            DiffView::new(&repo, "HEAD~1..HEAD".to_string(), "Test".to_string()).unwrap();

        let file_count = view.stats.files.len();
        if file_count > 0 {
            // Move to last file
            for _ in 0..file_count - 1 {
                view.select_next();
            }
            assert_eq!(view.selected, file_count - 1);

            // Wrap around
            view.select_next();
            assert_eq!(view.selected, 0, "Should wrap to first file");
        }
    }

    #[test]
    fn test_select_previous_wraps_around() {
        let repo = get_test_repo_path();
        let mut view =
            DiffView::new(&repo, "HEAD~1..HEAD".to_string(), "Test".to_string()).unwrap();

        if !view.stats.files.is_empty() {
            assert_eq!(view.selected, 0);

            view.select_previous();
            assert_eq!(
                view.selected,
                view.stats.files.len() - 1,
                "Should wrap to last file"
            );
        }
    }

    #[test]
    fn test_select_next_with_empty_files() {
        let repo = get_test_repo_path();
        let mut view = DiffView::new(&repo, "HEAD..HEAD".to_string(), "Test".to_string()).unwrap();

        assert_eq!(view.stats.files.len(), 0, "Should have no files");
        view.select_next();
        assert_eq!(view.selected, 0, "Should stay at 0 with empty list");
    }

    #[test]
    fn test_select_previous_with_empty_files() {
        let repo = get_test_repo_path();
        let mut view = DiffView::new(&repo, "HEAD..HEAD".to_string(), "Test".to_string()).unwrap();

        assert_eq!(view.stats.files.len(), 0, "Should have no files");
        view.select_previous();
        assert_eq!(view.selected, 0, "Should stay at 0 with empty list");
    }

    #[test]
    fn test_toggle_full_diff_loads_diff() {
        let repo = get_test_repo_path();
        let mut view =
            DiffView::new(&repo, "HEAD~1..HEAD".to_string(), "Test".to_string()).unwrap();

        assert_eq!(view.show_full, false);
        assert!(view.full_diff.is_none());

        let result = view.toggle_full_diff();
        assert!(
            result.is_ok(),
            "Should toggle to full diff mode successfully"
        );
        assert_eq!(view.show_full, true, "Should be in full diff mode");
        assert!(view.full_diff.is_some(), "Should have loaded full diff");
    }

    #[test]
    fn test_toggle_full_diff_back_to_list() {
        let repo = get_test_repo_path();
        let mut view =
            DiffView::new(&repo, "HEAD~1..HEAD".to_string(), "Test".to_string()).unwrap();

        // Toggle to full diff
        let _ = view.toggle_full_diff();
        assert_eq!(view.show_full, true);

        // Toggle back to list
        let result = view.toggle_full_diff();
        assert!(
            result.is_ok(),
            "Should toggle back to list mode successfully"
        );
        assert_eq!(view.show_full, false, "Should be back in list mode");
        // full_diff should still be cached
        assert!(view.full_diff.is_some(), "Should keep cached full diff");
    }

    #[test]
    fn test_scroll_down_increments() {
        let repo = get_test_repo_path();
        let mut view =
            DiffView::new(&repo, "HEAD~1..HEAD".to_string(), "Test".to_string()).unwrap();

        assert_eq!(view.scroll, 0);
        view.scroll_down();
        assert_eq!(view.scroll, 1, "Should increment scroll");
        view.scroll_down();
        assert_eq!(view.scroll, 2, "Should increment scroll again");
    }

    #[test]
    fn test_scroll_up_decrements() {
        let repo = get_test_repo_path();
        let mut view =
            DiffView::new(&repo, "HEAD~1..HEAD".to_string(), "Test".to_string()).unwrap();

        view.scroll = 5;
        view.scroll_up();
        assert_eq!(view.scroll, 4, "Should decrement scroll");
        view.scroll_up();
        assert_eq!(view.scroll, 3, "Should decrement scroll again");
    }

    #[test]
    fn test_scroll_up_stops_at_zero() {
        let repo = get_test_repo_path();
        let mut view =
            DiffView::new(&repo, "HEAD~1..HEAD".to_string(), "Test".to_string()).unwrap();

        assert_eq!(view.scroll, 0);
        view.scroll_up();
        assert_eq!(view.scroll, 0, "Should not go below zero");
    }

    #[test]
    fn test_navigation_preserves_list_state() {
        let repo = get_test_repo_path();
        let mut view =
            DiffView::new(&repo, "HEAD~1..HEAD".to_string(), "Test".to_string()).unwrap();

        if view.stats.files.len() >= 2 {
            view.select_next();
            assert_eq!(view.selected, 1);
            assert_eq!(
                view.list_state.selected(),
                Some(1),
                "ListState should be synchronized"
            );

            view.select_previous();
            assert_eq!(view.selected, 0);
            assert_eq!(
                view.list_state.selected(),
                Some(0),
                "ListState should be synchronized"
            );
        }
    }

    #[test]
    fn test_invalid_worktree_path_returns_error() {
        let invalid_path = PathBuf::from("/nonexistent/path");
        let result = DiffView::new(
            &invalid_path,
            "HEAD~1..HEAD".to_string(),
            "Test".to_string(),
        );

        assert!(result.is_err(), "Should return error for invalid path");
    }
}
