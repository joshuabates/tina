//! Fuzzy finder overlay for searching orchestrations

use super::centered_rect;
// Re-export for use by app.rs
pub use crate::types::OrchestrationSummary;
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, Paragraph},
    Frame,
};

/// State for the fuzzy finder overlay
#[derive(Debug)]
pub struct FuzzyState {
    pub query: String,
    pub selected: usize,
    pub items: Vec<OrchestrationSummary>,
    pub filtered: Vec<usize>, // Indices into items
}

impl FuzzyState {
    pub fn new(items: Vec<OrchestrationSummary>) -> Self {
        let filtered: Vec<usize> = (0..items.len()).collect();
        Self {
            query: String::new(),
            selected: 0,
            items,
            filtered,
        }
    }

    /// Update the filtered list based on current query
    pub fn update_filter(&mut self) {
        if self.query.is_empty() {
            self.filtered = (0..self.items.len()).collect();
            self.selected = 0;
            return;
        }

        let query_lower = self.query.to_lowercase();
        self.filtered = self
            .items
            .iter()
            .enumerate()
            .filter(|(_, item)| item.feature.to_lowercase().contains(&query_lower))
            .map(|(i, _)| i)
            .collect();

        // Reset selection if out of bounds
        if self.selected >= self.filtered.len() {
            self.selected = 0;
        }
    }

    /// Get the currently selected item
    pub fn selected_item(&self) -> Option<&OrchestrationSummary> {
        self.filtered.get(self.selected).map(|&i| &self.items[i])
    }
}

/// Result of handling a key in fuzzy finder
#[derive(Debug)]
pub enum FuzzyResult {
    /// Close the overlay
    Close,
    /// Key was consumed but no action needed
    Consumed,
    /// Select an orchestration to load
    Select(String), // Feature name
}

/// Render the fuzzy finder overlay
pub fn render(state: &FuzzyState, frame: &mut Frame) {
    let area = centered_rect(60, 60, frame.area());
    frame.render_widget(Clear, area);

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // Input
            Constraint::Min(5),    // Results
        ])
        .split(area);

    // Query input
    let input = Paragraph::new(format!("> {}_", state.query))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Find Orchestration ")
                .title_alignment(Alignment::Center),
        )
        .style(Style::default().fg(Color::Yellow));
    frame.render_widget(input, chunks[0]);

    // Results list
    let items: Vec<ListItem> = state
        .filtered
        .iter()
        .enumerate()
        .map(|(i, &idx)| {
            let item = &state.items[idx];
            let style = if i == state.selected {
                Style::default().add_modifier(Modifier::REVERSED)
            } else {
                Style::default()
            };
            ListItem::new(Line::from(vec![
                Span::styled(&item.feature, style),
                Span::styled(
                    format!(" ({:?})", item.status),
                    Style::default().fg(Color::DarkGray),
                ),
            ]))
        })
        .collect();

    let list = List::new(items).block(Block::default().borders(Borders::ALL));
    frame.render_widget(list, chunks[1]);
}

/// Handle key input for fuzzy finder
pub fn handle_key(state: &mut FuzzyState, key: KeyEvent) -> FuzzyResult {
    match key.code {
        KeyCode::Esc => FuzzyResult::Close,
        KeyCode::Enter => {
            if let Some(item) = state.selected_item() {
                FuzzyResult::Select(item.feature.clone())
            } else {
                FuzzyResult::Close
            }
        }
        KeyCode::Up | KeyCode::Char('k') if key.modifiers.is_empty() || key.code == KeyCode::Up => {
            if state.selected > 0 {
                state.selected -= 1;
            }
            FuzzyResult::Consumed
        }
        KeyCode::Down | KeyCode::Char('j')
            if key.modifiers.is_empty() || key.code == KeyCode::Down =>
        {
            if state.selected < state.filtered.len().saturating_sub(1) {
                state.selected += 1;
            }
            FuzzyResult::Consumed
        }
        KeyCode::Char(c) => {
            state.query.push(c);
            state.update_filter();
            FuzzyResult::Consumed
        }
        KeyCode::Backspace => {
            state.query.pop();
            state.update_filter();
            FuzzyResult::Consumed
        }
        _ => FuzzyResult::Consumed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crossterm::event::KeyModifiers;

    fn make_key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    fn create_items() -> Vec<OrchestrationSummary> {
        use crate::types::OrchestrationStatus;
        use std::path::PathBuf;
        vec![
            OrchestrationSummary {
                feature: "auth-feature".to_string(),
                worktree_path: PathBuf::from("/tmp/auth"),
                status: OrchestrationStatus::Executing,
                current_phase: 1,
                total_phases: 3,
                elapsed_mins: 10,
            },
            OrchestrationSummary {
                feature: "payment-system".to_string(),
                worktree_path: PathBuf::from("/tmp/payment"),
                status: OrchestrationStatus::Complete,
                current_phase: 3,
                total_phases: 3,
                elapsed_mins: 60,
            },
            OrchestrationSummary {
                feature: "auth-refactor".to_string(),
                worktree_path: PathBuf::from("/tmp/auth-refactor"),
                status: OrchestrationStatus::Planning,
                current_phase: 0,
                total_phases: 2,
                elapsed_mins: 5,
            },
        ]
    }

    #[test]
    fn new_state_shows_all_items() {
        let items = create_items();
        let state = FuzzyState::new(items.clone());

        assert_eq!(state.filtered.len(), items.len());
        assert_eq!(state.selected, 0);
    }

    #[test]
    fn filter_narrows_results() {
        let items = create_items();
        let mut state = FuzzyState::new(items);

        state.query = "auth".to_string();
        state.update_filter();

        assert_eq!(state.filtered.len(), 2); // auth-feature and auth-refactor
    }

    #[test]
    fn filter_case_insensitive() {
        let items = create_items();
        let mut state = FuzzyState::new(items);

        state.query = "AUTH".to_string();
        state.update_filter();

        assert_eq!(state.filtered.len(), 2);
    }

    #[test]
    fn empty_filter_shows_all() {
        let items = create_items();
        let mut state = FuzzyState::new(items.clone());

        state.query = "auth".to_string();
        state.update_filter();
        assert_eq!(state.filtered.len(), 2);

        state.query = String::new();
        state.update_filter();
        assert_eq!(state.filtered.len(), items.len());
    }

    #[test]
    fn selected_item_returns_correct_item() {
        let items = create_items();
        let mut state = FuzzyState::new(items);

        state.selected = 1;
        let selected = state.selected_item().unwrap();
        assert_eq!(selected.feature, "payment-system");
    }

    #[test]
    fn esc_closes_fuzzy() {
        let mut state = FuzzyState::new(create_items());
        assert!(matches!(
            handle_key(&mut state, make_key(KeyCode::Esc)),
            FuzzyResult::Close
        ));
    }

    #[test]
    fn enter_selects_item() {
        let mut state = FuzzyState::new(create_items());
        match handle_key(&mut state, make_key(KeyCode::Enter)) {
            FuzzyResult::Select(feature) => assert_eq!(feature, "auth-feature"),
            other => panic!("Expected Select, got {:?}", other),
        }
    }

    #[test]
    fn down_moves_selection() {
        let mut state = FuzzyState::new(create_items());
        assert_eq!(state.selected, 0);

        handle_key(&mut state, make_key(KeyCode::Down));
        assert_eq!(state.selected, 1);
    }

    #[test]
    fn up_moves_selection() {
        let mut state = FuzzyState::new(create_items());
        state.selected = 1;

        handle_key(&mut state, make_key(KeyCode::Up));
        assert_eq!(state.selected, 0);
    }

    #[test]
    fn char_adds_to_query() {
        let mut state = FuzzyState::new(create_items());

        handle_key(&mut state, make_key(KeyCode::Char('a')));
        assert_eq!(state.query, "a");
    }

    #[test]
    fn backspace_removes_from_query() {
        let mut state = FuzzyState::new(create_items());
        state.query = "auth".to_string();

        handle_key(&mut state, make_key(KeyCode::Backspace));
        assert_eq!(state.query, "aut");
    }

    #[test]
    fn render_does_not_panic() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;

        let state = FuzzyState::new(create_items());
        let backend = TestBackend::new(80, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            render(&state, frame);
        });

        assert!(result.is_ok());
    }
}
