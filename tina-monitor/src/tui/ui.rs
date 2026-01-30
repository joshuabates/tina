//! TUI rendering

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

use super::app::{App, ViewState};
use super::views::orchestration_list::render_orchestration_list;
use super::views::phase_detail;
use super::views::task_inspector::render_task_inspector;

/// Render the application UI
pub fn render(frame: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Header
            Constraint::Min(0),     // Main content
            Constraint::Length(1),  // Footer
        ])
        .split(frame.area());

    render_header(frame, chunks[0]);

    // Render the appropriate view based on current state
    match &app.view_state {
        ViewState::OrchestrationList => {
            render_orchestration_list(frame, chunks[1], app);
        }
        ViewState::PhaseDetail { .. } => {
            phase_detail::render(frame, chunks[1], app);
        }
        ViewState::TaskInspector { task_index } => {
            // First render the PhaseDetail view as background
            phase_detail::render(frame, chunks[1], app);
            // Then render the task inspector modal on top
            if !app.orchestrations.is_empty() {
                let orchestration = &app.orchestrations[app.selected_index];
                if *task_index < orchestration.tasks.len() {
                    let task = &orchestration.tasks[*task_index];
                    render_task_inspector(frame, task);
                }
            }
        }
        ViewState::LogViewer { .. } => {
            // TODO: Implement in Task 6
            phase_detail::render(frame, chunks[1], app);
        }
    }

    render_footer(frame, chunks[2]);

    if app.show_help {
        super::views::help::render_help(frame);
    }
}

fn render_header(frame: &mut Frame, area: Rect) {
    let header = Paragraph::new("Orchestrations")
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .block(Block::default().borders(Borders::BOTTOM));
    frame.render_widget(header, area);
}

fn render_footer(frame: &mut Frame, area: Rect) {
    let footer = Paragraph::new(" j/k:nav  r:refresh  q:quit  ?:help")
        .style(Style::default().fg(Color::DarkGray));
    frame.render_widget(footer, area);
}

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::{backend::TestBackend, Terminal};
    use crate::data::discovery::{Orchestration, OrchestrationStatus};
    use std::path::PathBuf;
    use std::time::{Duration, Instant};

    fn make_test_app() -> App {
        use crate::tui::app::ViewState;
        App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        }
    }

    fn make_test_app_with_orchestrations() -> App {
        use crate::tui::app::ViewState;
        let orchestration = Orchestration {
            team_name: "test-team".to_string(),
            title: "Test Project".to_string(),
            cwd: PathBuf::from("/test"),
            current_phase: 1,
            total_phases: 3,
            design_doc_path: PathBuf::from("/test/design.md"),
            context_percent: Some(50),
            status: OrchestrationStatus::Idle,
            tasks: vec![],
        };

        App {
            should_quit: false,
            orchestrations: vec![orchestration],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        }
    }

    #[test]
    fn test_render_does_not_panic_with_empty_orchestrations() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let app = make_test_app();

        let result = terminal.draw(|frame| render(frame, &app));
        assert!(result.is_ok(), "Render should not panic with empty orchestrations");
    }

    #[test]
    fn test_render_does_not_panic_with_orchestrations() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let app = make_test_app_with_orchestrations();

        let result = terminal.draw(|frame| render(frame, &app));
        assert!(result.is_ok(), "Render should not panic with orchestrations");
    }

    #[test]
    fn test_layout_constraints_are_reasonable() {
        // Test that with a reasonable terminal size, the layout doesn't panic
        let sizes = vec![(80, 24), (120, 40), (40, 10), (200, 60)];

        for (width, height) in sizes {
            let backend = TestBackend::new(width, height);
            let mut terminal = Terminal::new(backend).unwrap();
            let app = make_test_app();

            let result = terminal.draw(|frame| render(frame, &app));
            assert!(
                result.is_ok(),
                "Layout should work with terminal size {}x{}",
                width,
                height
            );
        }
    }

    #[test]
    fn test_layout_adapts_to_small_terminal() {
        // Even with a very small terminal, it shouldn't panic
        let backend = TestBackend::new(20, 5);
        let mut terminal = Terminal::new(backend).unwrap();
        let app = make_test_app();

        let result = terminal.draw(|frame| render(frame, &app));
        assert!(result.is_ok(), "Layout should handle small terminal sizes");
    }

    #[test]
    fn test_render_with_help_modal() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app();
        app.show_help = true;

        let result = terminal.draw(|frame| render(frame, &app));
        assert!(result.is_ok(), "Render should work with help modal visible");
    }

    #[test]
    fn test_render_without_help_modal() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app();
        app.show_help = false;

        let result = terminal.draw(|frame| render(frame, &app));
        assert!(result.is_ok(), "Render should work with help modal hidden");
    }
}
