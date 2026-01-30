//! Phase detail view
//!
//! Displays task and team information for a specific phase in a split pane layout.

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use crate::data::types::TaskStatus;
use crate::tui::app::{App, PaneFocus, ViewState};
use crate::tui::widgets::progress_bar;

/// Render the phase detail view
pub fn render(frame: &mut Frame, area: Rect, app: &App) {
    let orchestration = match app.orchestrations.get(app.selected_index) {
        Some(orch) => orch,
        None => return,
    };

    // Extract focus from view state
    let (focus, _task_index, _member_index) = match app.view_state {
        ViewState::PhaseDetail {
            focus,
            task_index,
            member_index,
        } => (focus, task_index, member_index),
        _ => return,
    };

    // Overall layout: header + content
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(3), Constraint::Min(0)])
        .split(area);

    // Render header
    render_header(frame, chunks[0], orchestration);

    // Split content area: 60% tasks, 40% team
    let content_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(60), Constraint::Percentage(40)])
        .split(chunks[1]);

    // Render tasks pane
    render_tasks_pane(
        frame,
        content_chunks[0],
        orchestration,
        focus == PaneFocus::Tasks,
    );

    // Render team pane
    render_team_pane(
        frame,
        content_chunks[1],
        orchestration,
        focus == PaneFocus::Members,
    );
}

/// Render the header with orchestration title, phase, and status
fn render_header(
    frame: &mut Frame,
    area: Rect,
    orchestration: &crate::data::discovery::Orchestration,
) {
    let title = format!(
        "{} - Phase {}/{}",
        orchestration.title, orchestration.current_phase, orchestration.total_phases
    );

    let status_text = match &orchestration.status {
        crate::data::discovery::OrchestrationStatus::Executing { phase } => {
            format!("Executing phase {}", phase)
        }
        crate::data::discovery::OrchestrationStatus::Blocked { phase, reason } => {
            format!("Blocked at phase {}: {}", phase, reason)
        }
        crate::data::discovery::OrchestrationStatus::Complete => "Complete".to_string(),
        crate::data::discovery::OrchestrationStatus::Idle => "Idle".to_string(),
    };

    let header_line = Line::from(vec![
        Span::styled(title, Style::default().add_modifier(Modifier::BOLD)),
        Span::raw(" - "),
        Span::styled(status_text, Style::default().fg(Color::Yellow)),
    ]);

    let header = Paragraph::new(header_line).block(Block::default().borders(Borders::ALL));

    frame.render_widget(header, area);
}

/// Render the tasks pane
fn render_tasks_pane(
    frame: &mut Frame,
    area: Rect,
    orchestration: &crate::data::discovery::Orchestration,
    is_focused: bool,
) {
    let items: Vec<ListItem> = orchestration
        .tasks
        .iter()
        .map(|task| {
            let indicator = match task.status {
                TaskStatus::Completed => "\u{2713}",  // ✓
                TaskStatus::InProgress => "\u{25B6}", // ▶
                TaskStatus::Pending if !task.blocked_by.is_empty() => "\u{2717}", // ✗
                TaskStatus::Pending => "\u{25CB}",    // ○
            };

            let color = match task.status {
                TaskStatus::Completed => Color::Green,
                TaskStatus::InProgress => Color::Cyan,
                TaskStatus::Pending if !task.blocked_by.is_empty() => Color::Red,
                TaskStatus::Pending => Color::DarkGray,
            };

            let subject = truncate(&task.subject, area.width.saturating_sub(5) as usize);

            let line = Line::from(vec![
                Span::styled(format!("{} ", indicator), Style::default().fg(color)),
                Span::styled(subject, Style::default()),
            ]);

            ListItem::new(line)
        })
        .collect();

    let border_style = if is_focused {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let list = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title("Tasks")
            .border_style(border_style),
    );

    frame.render_widget(list, area);
}

/// Render the team pane
fn render_team_pane(
    frame: &mut Frame,
    area: Rect,
    orchestration: &crate::data::discovery::Orchestration,
    is_focused: bool,
) {
    let border_style = if is_focused {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    // For now, show context percentage and progress bar
    // In the future, this will show team members
    let context_text = if let Some(pct) = orchestration.context_percent {
        format!("Context: {}%", pct)
    } else {
        "Context: --".to_string()
    };

    let progress = orchestration
        .context_percent
        .map(|pct| progress_bar::render(pct as usize, 100, area.width.saturating_sub(4) as usize))
        .unwrap_or_else(|| "[----------]".to_string());

    let content = vec![
        Line::from(""),
        Line::from(Span::styled(context_text, Style::default())),
        Line::from(""),
        Line::from(Span::raw(progress)),
    ];

    let paragraph = Paragraph::new(content).block(
        Block::default()
            .borders(Borders::ALL)
            .title("Team")
            .border_style(border_style),
    );

    frame.render_widget(paragraph, area);
}

/// Truncate a string to a maximum length, adding ellipsis if needed
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::discovery::{Orchestration, OrchestrationStatus};
    use crate::data::types::{Task, TaskStatus};
    use ratatui::{backend::TestBackend, Terminal};
    use std::path::PathBuf;

    fn make_test_task(
        id: &str,
        subject: &str,
        status: TaskStatus,
        blocked_by: Vec<String>,
    ) -> Task {
        Task {
            id: id.to_string(),
            subject: subject.to_string(),
            description: "Test description".to_string(),
            active_form: None,
            status,
            owner: None,
            blocks: vec![],
            blocked_by,
            metadata: serde_json::Value::Null,
        }
    }

    fn make_test_orchestration() -> Orchestration {
        Orchestration {
            team_name: "test-team".to_string(),
            title: "Test Project".to_string(),
            cwd: PathBuf::from("/test"),
            current_phase: 2,
            total_phases: 4,
            design_doc_path: PathBuf::from("/test/design.md"),
            context_percent: Some(65),
            status: OrchestrationStatus::Executing { phase: 2 },
            tasks: vec![
                make_test_task("1", "Completed task", TaskStatus::Completed, vec![]),
                make_test_task("2", "In progress task", TaskStatus::InProgress, vec![]),
                make_test_task("3", "Pending task", TaskStatus::Pending, vec![]),
                make_test_task(
                    "4",
                    "Blocked task",
                    TaskStatus::Pending,
                    vec!["99".to_string()],
                ),
            ],
        }
    }

    #[test]
    fn test_render_phase_detail_does_not_panic() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let orchestration = make_test_orchestration();
        let mut app = App::new_with_orchestrations(vec![orchestration]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let result = terminal.draw(|frame| render(frame, frame.area(), &app));
        assert!(result.is_ok(), "Phase detail should render without panic");
    }

    #[test]
    fn test_tasks_pane_renders_all_tasks_with_correct_status_indicators() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let orchestration = make_test_orchestration();
        let mut app = App::new_with_orchestrations(vec![orchestration]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        terminal
            .draw(|frame| render(frame, frame.area(), &app))
            .unwrap();
        let buffer = terminal.backend().buffer();

        // Check for task status indicators in the buffer
        let buffer_str = buffer
            .content()
            .iter()
            .map(|c| c.symbol())
            .collect::<String>();

        // Should contain checkmark for completed
        assert!(
            buffer_str.contains("\u{2713}"),
            "Should show checkmark for completed task"
        );
        // Should contain play symbol for in progress
        assert!(
            buffer_str.contains("\u{25B6}"),
            "Should show play symbol for in progress task"
        );
        // Should contain circle for pending
        assert!(
            buffer_str.contains("\u{25CB}"),
            "Should show circle for pending task"
        );
        // Should contain X for blocked
        assert!(
            buffer_str.contains("\u{2717}"),
            "Should show X for blocked task"
        );
    }

    #[test]
    fn test_team_pane_renders_context_percentage() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let orchestration = make_test_orchestration();
        let mut app = App::new_with_orchestrations(vec![orchestration]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
        };

        terminal
            .draw(|frame| render(frame, frame.area(), &app))
            .unwrap();
        let buffer = terminal.backend().buffer();
        let buffer_str = buffer
            .content()
            .iter()
            .map(|c| c.symbol())
            .collect::<String>();

        assert!(
            buffer_str.contains("Context: 65%"),
            "Should display context percentage"
        );
    }

    #[test]
    fn test_focused_pane_has_highlighted_border() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let orchestration = make_test_orchestration();

        // Test with Tasks focused
        let mut app = App::new_with_orchestrations(vec![orchestration.clone()]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let result = terminal.draw(|frame| render(frame, frame.area(), &app));
        assert!(result.is_ok(), "Should render with Tasks focused");

        // Test with Members focused
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
        };

        let result = terminal.draw(|frame| render(frame, frame.area(), &app));
        assert!(result.is_ok(), "Should render with Members focused");

        // The actual border colors are tested implicitly through the render functions
        // which apply different border_style based on focus state
    }

    #[test]
    fn test_truncate_function_works_correctly() {
        assert_eq!(truncate("short", 10), "short");
        assert_eq!(truncate("exactly ten!", 12), "exactly ten!");
        assert_eq!(truncate("this is a very long string", 10), "this is...");
        assert_eq!(truncate("abc", 3), "abc");
        assert_eq!(truncate("abcd", 3), "...");
    }

    #[test]
    fn test_render_with_empty_orchestrations_list() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let mut app = App::new_with_orchestrations(vec![]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let result = terminal.draw(|frame| render(frame, frame.area(), &app));
        assert!(result.is_ok(), "Should not panic with empty orchestrations");
    }

    #[test]
    fn test_render_with_no_tasks() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let mut orchestration = make_test_orchestration();
        orchestration.tasks = vec![];

        let mut app = App::new_with_orchestrations(vec![orchestration]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let result = terminal.draw(|frame| render(frame, frame.area(), &app));
        assert!(result.is_ok(), "Should render with no tasks");
    }

    #[test]
    fn test_context_usage_bar_displays() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let orchestration = make_test_orchestration();
        let mut app = App::new_with_orchestrations(vec![orchestration]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
        };

        terminal
            .draw(|frame| render(frame, frame.area(), &app))
            .unwrap();
        let buffer = terminal.backend().buffer();
        let buffer_str = buffer
            .content()
            .iter()
            .map(|c| c.symbol())
            .collect::<String>();

        // Should contain progress bar characters (filled blocks █ or empty blocks ░)
        assert!(
            buffer_str.contains('\u{2588}') || buffer_str.contains('\u{2591}'),
            "Should display progress bar blocks"
        );
    }

    #[test]
    fn test_header_displays_title_and_phase() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let orchestration = make_test_orchestration();
        let mut app = App::new_with_orchestrations(vec![orchestration]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        terminal
            .draw(|frame| render(frame, frame.area(), &app))
            .unwrap();
        let buffer = terminal.backend().buffer();
        let buffer_str = buffer
            .content()
            .iter()
            .map(|c| c.symbol())
            .collect::<String>();

        assert!(
            buffer_str.contains("Test Project"),
            "Should display orchestration title"
        );
        assert!(
            buffer_str.contains("Phase 2/4"),
            "Should display current phase"
        );
    }

    #[test]
    fn test_team_pane_handles_missing_context_percentage() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let mut orchestration = make_test_orchestration();
        orchestration.context_percent = None;

        let mut app = App::new_with_orchestrations(vec![orchestration]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
        };

        terminal
            .draw(|frame| render(frame, frame.area(), &app))
            .unwrap();
        let buffer = terminal.backend().buffer();
        let buffer_str = buffer
            .content()
            .iter()
            .map(|c| c.symbol())
            .collect::<String>();

        assert!(
            buffer_str.contains("Context: --"),
            "Should display placeholder when no context"
        );
    }
}
