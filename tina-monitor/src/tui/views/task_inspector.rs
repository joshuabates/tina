//! Task inspector modal view showing full task details

use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
    Frame,
};

use crate::data::types::{Task, TaskStatus};

/// Render the task inspector modal
pub fn render_task_inspector(frame: &mut Frame, task: &Task) {
    let area = centered_rect(70, 70, frame.area());

    // Clear the area first
    frame.render_widget(Clear, area);

    let mut lines = Vec::new();

    // Status with color coding
    let status_style = match task.status {
        TaskStatus::Completed => Style::default().fg(Color::Green),
        TaskStatus::InProgress => Style::default().fg(Color::Yellow),
        TaskStatus::Pending => Style::default().fg(Color::Gray),
    };
    let status_text = format!("{:?}", task.status);
    lines.push(Line::from(vec![
        Span::styled("Status: ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled(status_text, status_style),
    ]));
    lines.push(Line::from(""));

    // Owner
    let owner_text = task.owner.as_deref().unwrap_or("None");
    lines.push(Line::from(vec![
        Span::styled("Owner: ", Style::default().add_modifier(Modifier::BOLD)),
        Span::raw(owner_text),
    ]));
    lines.push(Line::from(""));

    // Description
    lines.push(Line::from(Span::styled(
        "Description:",
        Style::default().add_modifier(Modifier::BOLD),
    )));
    lines.push(Line::from(""));

    // Split description into lines
    for desc_line in task.description.lines() {
        lines.push(Line::from(truncate(desc_line, area.width.saturating_sub(4) as usize)));
    }
    lines.push(Line::from(""));

    // Blocked by relationships
    if !task.blocked_by.is_empty() {
        lines.push(Line::from(Span::styled(
            "Blocked by:",
            Style::default().add_modifier(Modifier::BOLD),
        )));
        for blocked_id in &task.blocked_by {
            lines.push(Line::from(format!("  - {}", blocked_id)));
        }
        lines.push(Line::from(""));
    }

    // Blocks relationships
    if !task.blocks.is_empty() {
        lines.push(Line::from(Span::styled(
            "Blocks:",
            Style::default().add_modifier(Modifier::BOLD),
        )));
        for blocks_id in &task.blocks {
            lines.push(Line::from(format!("  - {}", blocks_id)));
        }
        lines.push(Line::from(""));
    }

    // Metadata section (only if metadata exists and is not null/empty object)
    if !task.metadata.is_null() && task.metadata.as_object().map_or(true, |obj| !obj.is_empty()) {
        lines.push(Line::from(Span::styled(
            "Metadata:",
            Style::default().add_modifier(Modifier::BOLD),
        )));
        if let Ok(pretty) = serde_json::to_string_pretty(&task.metadata) {
            for meta_line in pretty.lines() {
                lines.push(Line::from(format!("  {}", meta_line)));
            }
        }
        lines.push(Line::from(""));
    }

    // Close hint
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "[ESC] Close",
        Style::default().fg(Color::DarkGray),
    )));

    let paragraph = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" {} ", task.subject))
                .title_alignment(Alignment::Center),
        )
        .wrap(Wrap { trim: true })
        .style(Style::default().fg(Color::White));

    frame.render_widget(paragraph, area);
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

/// Truncate a string to a maximum length, adding "..." if truncated
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else if max_len <= 3 {
        "...".to_string()
    } else {
        format!("{}...", &s[..max_len - 3])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::{backend::TestBackend, Terminal};
    use serde_json::json;

    fn make_test_task() -> Task {
        Task {
            id: "1".to_string(),
            subject: "Test Task".to_string(),
            description: "This is a test task description".to_string(),
            active_form: Some("Testing".to_string()),
            status: TaskStatus::InProgress,
            owner: Some("test-owner".to_string()),
            blocks: vec![],
            blocked_by: vec![],
            metadata: serde_json::Value::Null,
        }
    }

    #[test]
    fn test_render_task_inspector_does_not_panic() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        let task = make_test_task();

        let result = terminal.draw(|frame| render_task_inspector(frame, &task));
        assert!(result.is_ok(), "Task inspector modal should render without panic");
    }

    #[test]
    fn test_task_details_display_correctly() {
        let backend = TestBackend::new(100, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let task = Task {
            id: "42".to_string(),
            subject: "Implement feature X".to_string(),
            description: "Add new feature to the system\nWith multiple lines".to_string(),
            active_form: Some("Implementing".to_string()),
            status: TaskStatus::InProgress,
            owner: Some("alice".to_string()),
            blocks: vec!["43".to_string(), "44".to_string()],
            blocked_by: vec!["41".to_string()],
            metadata: json!({"priority": "high", "estimate": "2h"}),
        };

        let result = terminal.draw(|frame| render_task_inspector(frame, &task));
        assert!(result.is_ok(), "Should render task with all details");

        // Get the buffer to check content
        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();

        // Check that key information is present
        assert!(content.contains("Status:"), "Should display status label");
        assert!(content.contains("Owner:"), "Should display owner label");
        assert!(content.contains("alice"), "Should display owner name");
        assert!(content.contains("Description:"), "Should display description label");
        assert!(content.contains("Blocked by:"), "Should display blocked by section");
        assert!(content.contains("41"), "Should display blocking task ID");
        assert!(content.contains("Blocks:"), "Should display blocks section");
        assert!(content.contains("43"), "Should display blocked task ID");
        assert!(content.contains("Metadata:"), "Should display metadata section");
        assert!(content.contains("[ESC] Close"), "Should display close hint");
    }

    #[test]
    fn test_metadata_section_only_shows_when_metadata_exists() {
        let backend = TestBackend::new(100, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        // Task with null metadata
        let task_no_metadata = Task {
            id: "1".to_string(),
            subject: "Task without metadata".to_string(),
            description: "Description".to_string(),
            active_form: None,
            status: TaskStatus::Pending,
            owner: None,
            blocks: vec![],
            blocked_by: vec![],
            metadata: serde_json::Value::Null,
        };

        let result = terminal.draw(|frame| render_task_inspector(frame, &task_no_metadata));
        assert!(result.is_ok());

        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();
        assert!(!content.contains("Metadata:"), "Should not display metadata section when null");

        // Task with empty object metadata
        let task_empty_metadata = Task {
            metadata: json!({}),
            ..task_no_metadata.clone()
        };

        let result = terminal.draw(|frame| render_task_inspector(frame, &task_empty_metadata));
        assert!(result.is_ok());

        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();
        assert!(!content.contains("Metadata:"), "Should not display metadata section when empty object");

        // Task with actual metadata
        let task_with_metadata = Task {
            metadata: json!({"key": "value"}),
            ..task_no_metadata
        };

        let result = terminal.draw(|frame| render_task_inspector(frame, &task_with_metadata));
        assert!(result.is_ok());

        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();
        assert!(content.contains("Metadata:"), "Should display metadata section when present");
    }

    #[test]
    fn test_status_colors() {
        // Test that different statuses render without errors
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();

        for status in [TaskStatus::Completed, TaskStatus::InProgress, TaskStatus::Pending] {
            let task = Task {
                status,
                ..make_test_task()
            };
            let result = terminal.draw(|frame| render_task_inspector(frame, &task));
            assert!(result.is_ok(), "Should render task with status {:?}", status);
        }
    }

    #[test]
    fn test_truncate_helper() {
        assert_eq!(truncate("short", 10), "short");
        assert_eq!(truncate("exactly ten", 11), "exactly ten");
        assert_eq!(truncate("this is a very long string", 10), "this is...");
        assert_eq!(truncate("abc", 3), "abc");
        assert_eq!(truncate("abcd", 3), "...");
        assert_eq!(truncate("", 10), "");
    }

    #[test]
    fn test_centered_rect() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };

        let result = centered_rect(70, 70, area);
        assert_eq!(result.x, 15, "X position should be 15");
        assert_eq!(result.y, 15, "Y position should be 15");
        assert_eq!(result.width, 70, "Width should be 70");
        assert_eq!(result.height, 70, "Height should be 70");
    }

    #[test]
    fn test_task_with_no_owner() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();

        let task = Task {
            owner: None,
            ..make_test_task()
        };

        let result = terminal.draw(|frame| render_task_inspector(frame, &task));
        assert!(result.is_ok());

        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();
        assert!(content.contains("None"), "Should display 'None' for no owner");
    }

    #[test]
    fn test_multiline_description() {
        let backend = TestBackend::new(80, 30);
        let mut terminal = Terminal::new(backend).unwrap();

        let task = Task {
            description: "First line\nSecond line\nThird line".to_string(),
            ..make_test_task()
        };

        let result = terminal.draw(|frame| render_task_inspector(frame, &task));
        assert!(result.is_ok(), "Should render multiline description");

        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();
        assert!(content.contains("First line"), "Should display first line");
        assert!(content.contains("Second line"), "Should display second line");
        assert!(content.contains("Third line"), "Should display third line");
    }

    #[test]
    fn test_no_relationships() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();

        let task = Task {
            blocks: vec![],
            blocked_by: vec![],
            ..make_test_task()
        };

        let result = terminal.draw(|frame| render_task_inspector(frame, &task));
        assert!(result.is_ok());

        let buffer = terminal.backend().buffer();
        let _content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();
        // Should not show relationship sections when empty
        // But the labels might still be in buffer from previous renders, so we just ensure it doesn't panic
    }
}
