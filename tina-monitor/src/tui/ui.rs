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
use super::views::log_viewer;

/// Render the application UI
pub fn render(frame: &mut Frame, app: &mut App) {
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
            // First render the PhaseDetail view as background
            phase_detail::render(frame, chunks[1], app);
            // Then render the log viewer modal on top
            if let Some(viewer) = &mut app.log_viewer {
                let area = centered_rect(85, 85, frame.area());
                viewer.render(frame, area);
            } else {
                // Fallback to placeholder if viewer is not initialized
                log_viewer::render(app, frame);
            }
        }
        ViewState::CommandModal { .. } => {
            // First render the OrchestrationList view as background
            render_orchestration_list(frame, chunks[1], app);
            // Then render the command modal on top
            super::views::command_modal::render(app, frame);
        }
        ViewState::PlanViewer { plan_path, scroll_offset } => {
            // First render the OrchestrationList view as background
            render_orchestration_list(frame, chunks[1], app);
            // Then render the plan viewer modal on top
            if let Ok(mut viewer) = super::views::plan_viewer::PlanViewer::new(plan_path.clone()) {
                viewer.scroll = *scroll_offset;
                let area = centered_rect(85, 85, frame.area());
                frame.render_widget(ratatui::widgets::Clear, area);
                viewer.render(frame, area);
            }
        }
        ViewState::CommitsView { worktree_path, range, title } => {
            // First render the PhaseDetail view as background
            phase_detail::render(frame, chunks[1], app);
            // Then render the commits view modal on top
            if let Ok(mut commits_view) = super::views::commits_view::CommitsView::new(worktree_path, range.clone(), title.clone()) {
                let area = centered_rect(85, 85, frame.area());
                frame.render_widget(ratatui::widgets::Clear, area);
                commits_view.render(frame, area);
            }
        }
        ViewState::DiffView { worktree_path, range, title, selected, show_full, scroll } => {
            // First render the PhaseDetail view as background
            phase_detail::render(frame, chunks[1], app);
            // Then render the diff view modal on top
            if let Ok(mut diff_view) = super::views::diff_view::DiffView::new(worktree_path, range.clone(), title.clone()) {
                // Apply state from ViewState
                diff_view.selected = *selected;
                diff_view.show_full = *show_full;
                diff_view.scroll = *scroll;
                // Update list_state to match selected
                if !diff_view.stats.files.is_empty() {
                    diff_view.list_state.select(Some(*selected));
                }

                let area = centered_rect(85, 85, frame.area());
                frame.render_widget(ratatui::widgets::Clear, area);
                diff_view.render(frame, area);
            }
        }
    }

    render_footer(frame, chunks[2], app);

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

fn render_footer(frame: &mut Frame, area: Rect, app: &App) {
    let footer_text = match &app.view_state {
        ViewState::OrchestrationList => " j/k:nav  Enter:expand  g:goto  p:plan  r:refresh  q:quit  ?:help",
        ViewState::PhaseDetail { .. } => " t:tasks  m:members  c:commits  d:diff  Enter:inspect  l:logs  Esc:back  ?:help",
        ViewState::TaskInspector { .. } => " Esc:back  ?:help",
        ViewState::LogViewer { .. } => " j/k:scroll  Esc:back  ?:help",
        ViewState::CommandModal { .. } => " y:copy  Esc:close  ?:help",
        ViewState::PlanViewer { .. } => " j/k:scroll  Esc:close  ?:help",
        ViewState::CommitsView { .. } => " j/k:nav  Esc:close  ?:help",
        ViewState::DiffView { .. } => " j/k:nav  Enter:toggle  Esc:close  ?:help",
    };

    let footer = Paragraph::new(footer_text)
        .style(Style::default().fg(Color::DarkGray));
    frame.render_widget(footer, area);
}

/// Calculate a centered rectangle with given percentage dimensions
fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
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
            log_viewer: None,
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
            log_viewer: None,
        }
    }

    #[test]
    fn test_render_does_not_panic_with_empty_orchestrations() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app();

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "Render should not panic with empty orchestrations");
    }

    #[test]
    fn test_render_does_not_panic_with_orchestrations() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "Render should not panic with orchestrations");
    }

    #[test]
    fn test_layout_constraints_are_reasonable() {
        // Test that with a reasonable terminal size, the layout doesn't panic
        let sizes = vec![(80, 24), (120, 40), (40, 10), (200, 60)];

        for (width, height) in sizes {
            let backend = TestBackend::new(width, height);
            let mut terminal = Terminal::new(backend).unwrap();
            let mut app = make_test_app();

            let result = terminal.draw(|frame| render(frame, &mut app));
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
        let mut app = make_test_app();

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "Layout should handle small terminal sizes");
    }

    #[test]
    fn test_render_with_help_modal() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app();
        app.show_help = true;

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "Render should work with help modal visible");
    }

    #[test]
    fn test_render_without_help_modal() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app();
        app.show_help = false;

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "Render should work with help modal hidden");
    }

    // Task 10: Tests for view state rendering

    #[test]
    fn test_render_orchestration_list_view() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();
        app.view_state = crate::tui::app::ViewState::OrchestrationList;

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "OrchestrationList view should render without panic");
    }

    #[test]
    fn test_render_phase_detail_view() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();
        app.view_state = crate::tui::app::ViewState::PhaseDetail {
            focus: crate::tui::app::PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "PhaseDetail view should render without panic");
    }

    #[test]
    fn test_render_task_inspector_modal() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();
        app.view_state = crate::tui::app::ViewState::TaskInspector {
            task_index: 0,
        };

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "TaskInspector modal should render without panic");
    }

    #[test]
    fn test_render_log_viewer_modal() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();
        app.view_state = crate::tui::app::ViewState::LogViewer {
            agent_index: 0,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "LogViewer modal should render without panic");
    }

    #[test]
    fn test_help_modal_renders_on_top_of_orchestration_list() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();
        app.view_state = crate::tui::app::ViewState::OrchestrationList;
        app.show_help = true;

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "Help modal should render on top of OrchestrationList");
    }

    #[test]
    fn test_help_modal_renders_on_top_of_phase_detail() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();
        app.view_state = crate::tui::app::ViewState::PhaseDetail {
            focus: crate::tui::app::PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };
        app.show_help = true;

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "Help modal should render on top of PhaseDetail");
    }

    #[test]
    fn test_help_modal_renders_on_top_of_task_inspector() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();
        app.view_state = crate::tui::app::ViewState::TaskInspector {
            task_index: 0,
        };
        app.show_help = true;

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "Help modal should render on top of TaskInspector");
    }

    #[test]
    fn test_help_modal_renders_on_top_of_log_viewer() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();
        app.view_state = crate::tui::app::ViewState::LogViewer {
            agent_index: 0,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };
        app.show_help = true;

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "Help modal should render on top of LogViewer");
    }

    #[test]
    fn test_task_inspector_renders_over_phase_detail_background() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();

        // Set up TaskInspector view - this should show PhaseDetail as background
        app.view_state = crate::tui::app::ViewState::TaskInspector {
            task_index: 0,
        };

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "TaskInspector should render with PhaseDetail background");
    }

    #[test]
    fn test_log_viewer_renders_over_phase_detail_background() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();

        // Set up LogViewer view - this should show PhaseDetail as background
        app.view_state = crate::tui::app::ViewState::LogViewer {
            agent_index: 0,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let result = terminal.draw(|frame| render(frame, &mut app));
        assert!(result.is_ok(), "LogViewer should render with PhaseDetail background");
    }

    #[test]
    fn test_footer_shows_orchestration_list_hints() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();
        app.view_state = crate::tui::app::ViewState::OrchestrationList;

        terminal.draw(|frame| render(frame, &mut app)).unwrap();
        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();

        // Footer should contain orchestration list hints
        assert!(content.contains("j/k:nav"), "Footer should contain navigation hint");
        assert!(content.contains("Enter:expand"), "Footer should contain expand hint");
        assert!(content.contains("r:refresh"), "Footer should contain refresh hint");
        assert!(content.contains("q:quit"), "Footer should contain quit hint");
        assert!(content.contains("?:help"), "Footer should contain help hint");
    }

    #[test]
    fn test_footer_shows_phase_detail_hints() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let mut app = make_test_app_with_orchestrations();
        app.view_state = crate::tui::app::ViewState::PhaseDetail {
            focus: crate::tui::app::PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        terminal.draw(|frame| render(frame, &mut app)).unwrap();
        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();

        // Footer should contain phase detail hints
        assert!(content.contains("t:tasks"), "Footer should contain tasks hint");
        assert!(content.contains("m:members"), "Footer should contain members hint");
        assert!(content.contains("Enter:inspect"), "Footer should contain inspect hint");
        assert!(content.contains("l:logs"), "Footer should contain logs hint");
        assert!(content.contains("Esc:back"), "Footer should contain back hint");
        assert!(content.contains("?:help"), "Footer should contain help hint");
    }
}
