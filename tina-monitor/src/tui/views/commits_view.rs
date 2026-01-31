//! Commits view modal
//!
//! Displays git commits in a range with summary statistics.

use crate::git::commits::{get_commits, CommitSummary};
use anyhow::Result;
use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
    Frame,
};
use std::path::Path;

/// Commits view modal showing git commits in a range
pub struct CommitsView {
    title: String,
    #[allow(dead_code)]
    range: String,
    summary: CommitSummary,
    selected: usize,
    list_state: ListState,
}

impl CommitsView {
    /// Create a new CommitsView
    pub fn new<P: AsRef<Path>>(worktree_path: P, range: String, title: String) -> Result<Self> {
        let summary = get_commits(worktree_path.as_ref(), &range)?;
        let mut list_state = ListState::default();
        if !summary.commits.is_empty() {
            list_state.select(Some(0));
        }

        Ok(Self {
            title,
            range,
            summary,
            selected: 0,
            list_state,
        })
    }

    /// Select next commit
    pub fn select_next(&mut self) {
        if self.summary.commits.is_empty() {
            return;
        }
        self.selected = (self.selected + 1) % self.summary.commits.len();
        self.list_state.select(Some(self.selected));
    }

    /// Select previous commit
    pub fn select_previous(&mut self) {
        if self.summary.commits.is_empty() {
            return;
        }
        if self.selected == 0 {
            self.selected = self.summary.commits.len() - 1;
        } else {
            self.selected -= 1;
        }
        self.list_state.select(Some(self.selected));
    }

    /// Render the commits view
    pub fn render(&mut self, frame: &mut Frame, area: Rect) {
        // Split area into commits list and summary footer
        let chunks = Layout::default()
            .direction(ratatui::layout::Direction::Vertical)
            .constraints([Constraint::Min(3), Constraint::Length(3)])
            .split(area);

        // Render commits list
        let commits_items: Vec<ListItem> = self
            .summary
            .commits
            .iter()
            .map(|commit| {
                let content = format!("{} {}", commit.short_hash, commit.subject);
                ListItem::new(content)
            })
            .collect();

        let commits_list = List::new(commits_items)
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

        frame.render_stateful_widget(commits_list, chunks[0], &mut self.list_state);

        // Render summary footer
        let summary_text = format!(
            "{} commits, +{} insertions, -{} deletions",
            self.summary.total_commits, self.summary.insertions, self.summary.deletions
        );

        let summary = Paragraph::new(Line::from(vec![Span::styled(
            summary_text,
            Style::default().fg(Color::Cyan),
        )]))
        .block(Block::default().borders(Borders::ALL).title("Summary"));

        frame.render_widget(summary, chunks[1]);
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
    fn test_commits_view_new() {
        let repo = get_test_repo_path();
        let view = CommitsView::new(
            &repo,
            "HEAD~2..HEAD".to_string(),
            "Test Commits".to_string(),
        );

        assert!(view.is_ok(), "Should create CommitsView successfully");
        let view = view.unwrap();
        assert_eq!(view.title, "Test Commits");
        assert_eq!(view.range, "HEAD~2..HEAD");
    }

    #[test]
    fn test_commits_view_starts_with_first_selected() {
        let repo = get_test_repo_path();
        let view = CommitsView::new(&repo, "HEAD~2..HEAD".to_string(), "Test".to_string()).unwrap();

        assert_eq!(view.selected, 0, "Should start with first commit selected");
        assert_eq!(
            view.list_state.selected(),
            Some(0),
            "ListState should have first item selected"
        );
    }

    #[test]
    fn test_select_next_wraps_around() {
        let repo = get_test_repo_path();
        let mut view =
            CommitsView::new(&repo, "HEAD~2..HEAD".to_string(), "Test".to_string()).unwrap();

        let commit_count = view.summary.commits.len();
        if commit_count > 0 {
            // Move to last commit
            for _ in 0..commit_count - 1 {
                view.select_next();
            }
            assert_eq!(view.selected, commit_count - 1);

            // Wrap around
            view.select_next();
            assert_eq!(view.selected, 0, "Should wrap to first commit");
        }
    }

    #[test]
    fn test_select_previous_wraps_around() {
        let repo = get_test_repo_path();
        let mut view =
            CommitsView::new(&repo, "HEAD~2..HEAD".to_string(), "Test".to_string()).unwrap();

        if !view.summary.commits.is_empty() {
            assert_eq!(view.selected, 0);

            view.select_previous();
            assert_eq!(
                view.selected,
                view.summary.commits.len() - 1,
                "Should wrap to last commit"
            );
        }
    }

    #[test]
    fn test_select_next_with_empty_commits() {
        let repo = get_test_repo_path();
        let mut view =
            CommitsView::new(&repo, "HEAD..HEAD".to_string(), "Test".to_string()).unwrap();

        assert_eq!(view.summary.commits.len(), 0, "Should have no commits");
        view.select_next();
        assert_eq!(view.selected, 0, "Should stay at 0 with empty list");
    }

    #[test]
    fn test_select_previous_with_empty_commits() {
        let repo = get_test_repo_path();
        let mut view =
            CommitsView::new(&repo, "HEAD..HEAD".to_string(), "Test".to_string()).unwrap();

        assert_eq!(view.summary.commits.len(), 0, "Should have no commits");
        view.select_previous();
        assert_eq!(view.selected, 0, "Should stay at 0 with empty list");
    }

    #[test]
    fn test_navigation_preserves_list_state() {
        let repo = get_test_repo_path();
        let mut view =
            CommitsView::new(&repo, "HEAD~2..HEAD".to_string(), "Test".to_string()).unwrap();

        if view.summary.commits.len() >= 2 {
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
    fn test_summary_contains_correct_stats() {
        let repo = get_test_repo_path();
        let view = CommitsView::new(&repo, "HEAD~1..HEAD".to_string(), "Test".to_string()).unwrap();

        // Check that summary fields exist and are reasonable
        assert!(
            view.summary.total_commits <= 100,
            "Total commits should be reasonable"
        );
        assert_eq!(
            view.summary.total_commits,
            view.summary.commits.len(),
            "Total should match commits length"
        );
    }

    #[test]
    fn test_invalid_worktree_path_returns_error() {
        let invalid_path = PathBuf::from("/nonexistent/path");
        let result = CommitsView::new(
            &invalid_path,
            "HEAD~1..HEAD".to_string(),
            "Test".to_string(),
        );

        assert!(result.is_err(), "Should return error for invalid path");
    }
}
