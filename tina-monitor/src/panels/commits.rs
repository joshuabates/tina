use crate::panel::{Panel, HandleResult, Direction};
use crate::panels::{border_style, border_type};
use crate::git::commits::Commit;
use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState};
use ratatui::Frame;

pub struct CommitsPanel {
    title: &'static str,
    pub commits: Vec<Commit>,
    pub stats: Option<(usize, usize)>,
    pub selected: usize,
}

impl Default for CommitsPanel {
    fn default() -> Self {
        Self::new()
    }
}

impl CommitsPanel {
    pub fn new() -> Self {
        Self {
            title: "Commits",
            commits: vec![],
            stats: None,
            selected: 0,
        }
    }

    pub fn set_commits(&mut self, commits: Vec<Commit>, insertions: usize, deletions: usize) {
        self.commits = commits;
        self.stats = Some((insertions, deletions));
        // Reset selection if out of bounds
        if self.selected >= self.commits.len() && !self.commits.is_empty() {
            self.selected = self.commits.len() - 1;
        } else if self.commits.is_empty() {
            self.selected = 0;
        }
    }

    pub fn selected_commit(&self) -> Option<&Commit> {
        self.commits.get(self.selected)
    }
}

impl Panel for CommitsPanel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult {
        match key.code {
            crossterm::event::KeyCode::Char('j') | crossterm::event::KeyCode::Down => {
                if self.selected < self.commits.len().saturating_sub(1) {
                    self.selected += 1;
                    HandleResult::Consumed
                } else {
                    HandleResult::MoveFocus(Direction::Down)
                }
            }
            crossterm::event::KeyCode::Char('k') | crossterm::event::KeyCode::Up => {
                if self.selected > 0 {
                    self.selected -= 1;
                    HandleResult::Consumed
                } else {
                    HandleResult::MoveFocus(Direction::Up)
                }
            }
            crossterm::event::KeyCode::Char('l') | crossterm::event::KeyCode::Right => {
                HandleResult::MoveFocus(Direction::Right)
            }
            crossterm::event::KeyCode::Char('h') | crossterm::event::KeyCode::Left => {
                HandleResult::MoveFocus(Direction::Left)
            }
            _ => HandleResult::Ignored,
        }
    }

    fn render(&self, frame: &mut Frame, area: Rect, focused: bool) {
        let title = if let Some((ins, del)) = self.stats {
            format!("Commits (+{} -{})", ins, del)
        } else {
            self.title.to_string()
        };

        let block = Block::default()
            .title(title)
            .borders(Borders::ALL)
            .border_type(border_type(focused))
            .border_style(border_style(focused));

        let items: Vec<ListItem> = if self.commits.is_empty() {
            vec![ListItem::new("No commits in this phase")]
        } else {
            self.commits
                .iter()
                .map(|commit| {
                    let line = Line::from(vec![
                        Span::styled(&commit.short_hash, Style::default().fg(Color::Yellow)),
                        Span::raw(" "),
                        Span::raw(&commit.subject),
                    ]);
                    ListItem::new(line)
                })
                .collect()
        };

        let list = List::new(items)
            .block(block)
            .highlight_style(Style::default().bg(Color::DarkGray));

        let mut state = ListState::default();
        if !self.commits.is_empty() {
            state.select(Some(self.selected));
        }

        frame.render_stateful_widget(list, area, &mut state);
    }

    fn name(&self) -> &'static str {
        self.title
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_commit(short_hash: &str, subject: &str) -> Commit {
        Commit {
            short_hash: short_hash.to_string(),
            hash: format!("{}0000000000000000000000000000000000", short_hash),
            subject: subject.to_string(),
            author: "Test Author".to_string(),
            relative_time: "2 hours ago".to_string(),
        }
    }

    #[test]
    fn set_commits_stores_commits() {
        let mut panel = CommitsPanel::new();
        let commits = vec![
            create_test_commit("abc1234", "Add feature"),
            create_test_commit("def5678", "Fix bug"),
        ];

        panel.set_commits(commits.clone(), 50, 10);

        assert_eq!(panel.commits.len(), 2);
        assert_eq!(panel.commits[0].subject, "Add feature");
        assert_eq!(panel.commits[1].subject, "Fix bug");
    }

    #[test]
    fn set_commits_stores_stats() {
        let mut panel = CommitsPanel::new();
        let commits = vec![create_test_commit("abc1234", "Add feature")];

        panel.set_commits(commits, 100, 25);

        assert_eq!(panel.stats, Some((100, 25)));
    }

    #[test]
    fn selected_commit_returns_current_selection() {
        let mut panel = CommitsPanel::new();
        let commits = vec![
            create_test_commit("abc1234", "Add feature"),
            create_test_commit("def5678", "Fix bug"),
        ];
        panel.set_commits(commits, 50, 10);

        let selected = panel.selected_commit();
        assert!(selected.is_some());
        assert_eq!(selected.unwrap().short_hash, "abc1234");
    }

    #[test]
    fn selected_commit_returns_none_when_empty() {
        let panel = CommitsPanel::new();
        assert!(panel.selected_commit().is_none());
    }

    #[test]
    fn set_commits_resets_selection_when_out_of_bounds() {
        let mut panel = CommitsPanel::new();
        let initial_commits = vec![
            create_test_commit("abc1234", "First"),
            create_test_commit("def5678", "Second"),
            create_test_commit("ghi9012", "Third"),
        ];
        panel.set_commits(initial_commits, 50, 10);
        panel.selected = 2;

        let new_commits = vec![create_test_commit("jkl3456", "Only one")];
        panel.set_commits(new_commits, 20, 5);

        assert_eq!(panel.selected, 0);
    }

    #[test]
    fn set_commits_with_empty_list_resets_selection() {
        let mut panel = CommitsPanel::new();
        let commits = vec![create_test_commit("abc1234", "Add feature")];
        panel.set_commits(commits, 50, 10);
        panel.selected = 0;

        panel.set_commits(vec![], 0, 0);

        assert_eq!(panel.selected, 0);
        assert!(panel.commits.is_empty());
    }
}
