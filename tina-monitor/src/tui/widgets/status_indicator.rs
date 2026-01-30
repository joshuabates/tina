use ratatui::style::{Color, Modifier, Style};
use ratatui::text::Span;

use crate::data::discovery::OrchestrationStatus;

/// Render a status indicator span
pub fn render(status: &OrchestrationStatus) -> Span<'static> {
    match status {
        OrchestrationStatus::Executing { phase } => {
            Span::styled(
                format!("phase {}", phase),
                Style::default().fg(Color::Green),
            )
        }
        OrchestrationStatus::Blocked { .. } => {
            Span::styled(
                "BLOCKED".to_string(),
                Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
            )
        }
        OrchestrationStatus::Complete => {
            Span::styled(
                "complete".to_string(),
                Style::default().fg(Color::Cyan),
            )
        }
        OrchestrationStatus::Idle => {
            Span::styled(
                "idle".to_string(),
                Style::default().fg(Color::DarkGray),
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_status_executing() {
        let status = OrchestrationStatus::Executing { phase: 2 };
        let span = render(&status);
        assert_eq!(span.content, "phase 2");
        assert_eq!(span.style.fg, Some(Color::Green));
    }

    #[test]
    fn test_status_blocked() {
        let status = OrchestrationStatus::Blocked {
            phase: 1,
            reason: "waiting for approval".to_string(),
        };
        let span = render(&status);
        assert_eq!(span.content, "BLOCKED");
        assert_eq!(span.style.fg, Some(Color::Red));
        assert!(span.style.add_modifier.contains(Modifier::BOLD));
    }

    #[test]
    fn test_status_complete() {
        let status = OrchestrationStatus::Complete;
        let span = render(&status);
        assert_eq!(span.content, "complete");
        assert_eq!(span.style.fg, Some(Color::Cyan));
    }

    #[test]
    fn test_status_idle() {
        let status = OrchestrationStatus::Idle;
        let span = render(&status);
        assert_eq!(span.content, "idle");
        assert_eq!(span.style.fg, Some(Color::DarkGray));
    }
}
