use ratatui::style::{Color, Modifier, Style};
use ratatui::text::Span;

use crate::data::MonitorOrchestrationStatus;

/// Render a status indicator span
pub fn render(status: &MonitorOrchestrationStatus) -> Span<'static> {
    match status {
        MonitorOrchestrationStatus::Executing => Span::styled(
            "executing".to_string(),
            Style::default().fg(Color::Green),
        ),
        MonitorOrchestrationStatus::Planning => Span::styled(
            "planning".to_string(),
            Style::default().fg(Color::Yellow),
        ),
        MonitorOrchestrationStatus::Reviewing => Span::styled(
            "reviewing".to_string(),
            Style::default().fg(Color::Cyan),
        ),
        MonitorOrchestrationStatus::Blocked => Span::styled(
            "BLOCKED".to_string(),
            Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
        ),
        MonitorOrchestrationStatus::Complete => {
            Span::styled("complete".to_string(), Style::default().fg(Color::Cyan))
        }
        MonitorOrchestrationStatus::Idle => {
            Span::styled("idle".to_string(), Style::default().fg(Color::DarkGray))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_status_executing() {
        let status = MonitorOrchestrationStatus::Executing;
        let span = render(&status);
        assert_eq!(span.content, "executing");
        assert_eq!(span.style.fg, Some(Color::Green));
    }

    #[test]
    fn test_status_planning() {
        let status = MonitorOrchestrationStatus::Planning;
        let span = render(&status);
        assert_eq!(span.content, "planning");
        assert_eq!(span.style.fg, Some(Color::Yellow));
    }

    #[test]
    fn test_status_reviewing() {
        let status = MonitorOrchestrationStatus::Reviewing;
        let span = render(&status);
        assert_eq!(span.content, "reviewing");
        assert_eq!(span.style.fg, Some(Color::Cyan));
    }

    #[test]
    fn test_status_blocked() {
        let status = MonitorOrchestrationStatus::Blocked;
        let span = render(&status);
        assert_eq!(span.content, "BLOCKED");
        assert_eq!(span.style.fg, Some(Color::Red));
        assert!(span.style.add_modifier.contains(Modifier::BOLD));
    }

    #[test]
    fn test_status_complete() {
        let status = MonitorOrchestrationStatus::Complete;
        let span = render(&status);
        assert_eq!(span.content, "complete");
        assert_eq!(span.style.fg, Some(Color::Cyan));
    }

    #[test]
    fn test_status_idle() {
        let status = MonitorOrchestrationStatus::Idle;
        let span = render(&status);
        assert_eq!(span.content, "idle");
        assert_eq!(span.style.fg, Some(Color::DarkGray));
    }
}
