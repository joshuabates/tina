//! Dashboard header showing orchestration status.
//!
//! Provides an htop-style status bar displaying feature name, status,
//! current phase progress, and elapsed time.

use crate::types::{OrchestrationStatus, SupervisorState};
use chrono::Utc;
use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

/// Dashboard header showing orchestration status
#[derive(Debug, Clone)]
pub struct Dashboard {
    pub feature: String,
    pub status: OrchestrationStatus,
    pub current_phase: u32,
    pub total_phases: u32,
    pub elapsed_mins: i64,
}

impl Dashboard {
    /// Create a new dashboard with default values
    pub fn new() -> Self {
        Self {
            feature: String::new(),
            status: OrchestrationStatus::Planning,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        }
    }

    /// Update dashboard state from supervisor state
    pub fn update(&mut self, state: &SupervisorState) {
        self.feature = state.feature.clone();
        self.status = state.status;
        self.current_phase = state.current_phase;
        self.total_phases = state.total_phases;

        // Calculate elapsed time in minutes
        let now = Utc::now();
        let duration = now.signed_duration_since(state.orchestration_started_at);
        self.elapsed_mins = duration.num_minutes();
    }

    /// Format duration in minutes as a human-readable string
    pub fn format_duration(mins: i64) -> String {
        if mins < 60 {
            format!("{}m", mins)
        } else {
            let hours = mins / 60;
            let remaining_mins = mins % 60;
            if remaining_mins == 0 {
                format!("{}h", hours)
            } else {
                format!("{}h{}m", hours, remaining_mins)
            }
        }
    }

    /// Get color for status indicator
    fn status_color(&self) -> Color {
        match self.status {
            OrchestrationStatus::Executing => Color::Green,
            OrchestrationStatus::Planning => Color::Yellow,
            OrchestrationStatus::Reviewing => Color::Cyan,
            OrchestrationStatus::Complete => Color::Blue,
            OrchestrationStatus::Blocked => Color::Red,
        }
    }

    /// Get status text
    fn status_text(&self) -> &'static str {
        match self.status {
            OrchestrationStatus::Planning => "Planning",
            OrchestrationStatus::Executing => "Executing",
            OrchestrationStatus::Reviewing => "Reviewing",
            OrchestrationStatus::Complete => "Complete",
            OrchestrationStatus::Blocked => "Blocked",
        }
    }

    /// Render the dashboard header (backward compatible)
    pub fn render(&self, frame: &mut Frame, area: Rect) {
        self.render_with_status(frame, area, None);
    }

    /// Render the dashboard header with optional status message
    ///
    /// When a status message is provided, it appears on the right side.
    /// Otherwise, keybinding hints are shown.
    pub fn render_with_status(&self, frame: &mut Frame, area: Rect, status_message: Option<&str>) {
        use ratatui::layout::{Constraint, Direction, Layout};

        // Split area: left for status info, right for hints/message
        let [left_area, right_area] = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Min(40), Constraint::Length(30)])
            .areas(area);

        // Left side: feature, status, phase, elapsed
        let phase_text = format!("Phase {}/{}", self.current_phase, self.total_phases);
        let duration_text = Self::format_duration(self.elapsed_mins);
        let status_color = self.status_color();
        let status_text = self.status_text();

        let left_content = if self.feature.is_empty() {
            // No feature loaded - show welcome message
            Line::from(vec![
                Span::raw("  "),
                Span::styled("tina-monitor", Style::default().fg(Color::Cyan)),
                Span::raw("  Press "),
                Span::styled("/", Style::default().fg(Color::Yellow)),
                Span::raw(" to find an orchestration"),
            ])
        } else {
            Line::from(vec![
                Span::raw("  "),
                Span::styled(self.feature.clone(), Style::default().fg(Color::White)),
                Span::raw(" | "),
                Span::styled(status_text, Style::default().fg(status_color)),
                Span::raw(" | "),
                Span::raw(phase_text),
                Span::raw(" | "),
                Span::raw(format!("Elapsed: {}", duration_text)),
            ])
        };

        let left_paragraph = Paragraph::new(left_content)
            .block(Block::default().borders(Borders::BOTTOM))
            .style(Style::default().bg(Color::Black).fg(Color::White));

        frame.render_widget(left_paragraph, left_area);

        // Right side: status message or keybinding hints
        let right_content = if let Some(msg) = status_message {
            // Show status message (temporary feedback)
            Line::from(vec![
                Span::styled(msg, Style::default().fg(Color::Green)),
                Span::raw("  "),
            ])
        } else {
            // Show keybinding hints
            Line::from(vec![
                Span::styled("[/]", Style::default().fg(Color::DarkGray)),
                Span::raw(" Find  "),
                Span::styled("[?]", Style::default().fg(Color::DarkGray)),
                Span::raw(" Help  "),
            ])
        };

        let right_paragraph = Paragraph::new(right_content)
            .block(Block::default().borders(Borders::BOTTOM))
            .style(Style::default().bg(Color::Black).fg(Color::White))
            .alignment(ratatui::layout::Alignment::Right);

        frame.render_widget(right_paragraph, right_area);
    }
}

impl Default for Dashboard {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    // ====================================================================
    // format_duration Tests
    // ====================================================================

    #[test]
    fn format_duration_zero_minutes() {
        assert_eq!(Dashboard::format_duration(0), "0m");
    }

    #[test]
    fn format_duration_single_minute() {
        assert_eq!(Dashboard::format_duration(1), "1m");
    }

    #[test]
    fn format_duration_under_one_hour() {
        assert_eq!(Dashboard::format_duration(45), "45m");
    }

    #[test]
    fn format_duration_exactly_one_hour() {
        assert_eq!(Dashboard::format_duration(60), "1h");
    }

    #[test]
    fn format_duration_one_hour_with_minutes() {
        assert_eq!(Dashboard::format_duration(90), "1h30m");
    }

    #[test]
    fn format_duration_multiple_hours() {
        assert_eq!(Dashboard::format_duration(180), "3h");
    }

    #[test]
    fn format_duration_multiple_hours_with_minutes() {
        assert_eq!(Dashboard::format_duration(150), "2h30m");
    }

    // ====================================================================
    // Status Color Tests
    // ====================================================================

    #[test]
    fn status_color_executing_is_green() {
        let dashboard = Dashboard {
            feature: String::new(),
            status: OrchestrationStatus::Executing,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        };
        assert_eq!(dashboard.status_color(), Color::Green);
    }

    #[test]
    fn status_color_planning_is_yellow() {
        let dashboard = Dashboard {
            feature: String::new(),
            status: OrchestrationStatus::Planning,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        };
        assert_eq!(dashboard.status_color(), Color::Yellow);
    }

    #[test]
    fn status_color_reviewing_is_cyan() {
        let dashboard = Dashboard {
            feature: String::new(),
            status: OrchestrationStatus::Reviewing,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        };
        assert_eq!(dashboard.status_color(), Color::Cyan);
    }

    #[test]
    fn status_color_complete_is_blue() {
        let dashboard = Dashboard {
            feature: String::new(),
            status: OrchestrationStatus::Complete,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        };
        assert_eq!(dashboard.status_color(), Color::Blue);
    }

    #[test]
    fn status_color_blocked_is_red() {
        let dashboard = Dashboard {
            feature: String::new(),
            status: OrchestrationStatus::Blocked,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        };
        assert_eq!(dashboard.status_color(), Color::Red);
    }

    // ====================================================================
    // Constructor Tests
    // ====================================================================

    #[test]
    fn new_dashboard_has_empty_feature() {
        let dashboard = Dashboard::new();
        assert_eq!(dashboard.feature, "");
    }

    #[test]
    fn new_dashboard_default_status_is_planning() {
        let dashboard = Dashboard::new();
        assert_eq!(dashboard.status, OrchestrationStatus::Planning);
    }

    #[test]
    fn new_dashboard_default_phase_is_zero() {
        let dashboard = Dashboard::new();
        assert_eq!(dashboard.current_phase, 0);
        assert_eq!(dashboard.total_phases, 0);
    }

    #[test]
    fn new_dashboard_default_elapsed_is_zero() {
        let dashboard = Dashboard::new();
        assert_eq!(dashboard.elapsed_mins, 0);
    }

    #[test]
    fn default_trait_creates_dashboard() {
        let dashboard = Dashboard::default();
        assert_eq!(dashboard.feature, "");
        assert_eq!(dashboard.status, OrchestrationStatus::Planning);
        assert_eq!(dashboard.current_phase, 0);
        assert_eq!(dashboard.total_phases, 0);
        assert_eq!(dashboard.elapsed_mins, 0);
    }

    // ====================================================================
    // Update Tests
    // ====================================================================

    #[test]
    fn update_syncs_feature_from_supervisor_state() {
        let mut dashboard = Dashboard::new();
        let now = Utc::now();
        let state = SupervisorState {
            version: 1,
            feature: "test-feature".to_string(),
            spec_doc: std::path::PathBuf::from("/path/to/spec.md"),
            worktree_path: std::path::PathBuf::from("/path/to/worktree"),
            branch: "test-branch".to_string(),
            total_phases: 3,
            current_phase: 1,
            status: OrchestrationStatus::Executing,
            orchestration_started_at: now,
            spec_id: None,
            phases: Default::default(),
            timing: Default::default(),
            model_policy: Default::default(),
            review_policy: Default::default(),
        };

        dashboard.update(&state);

        assert_eq!(dashboard.feature, "test-feature");
    }

    #[test]
    fn update_syncs_status_from_supervisor_state() {
        let mut dashboard = Dashboard::new();
        let now = Utc::now();
        let state = SupervisorState {
            version: 1,
            feature: "test-feature".to_string(),
            spec_doc: std::path::PathBuf::from("/path/to/spec.md"),
            worktree_path: std::path::PathBuf::from("/path/to/worktree"),
            branch: "test-branch".to_string(),
            total_phases: 3,
            current_phase: 2,
            status: OrchestrationStatus::Reviewing,
            orchestration_started_at: now,
            spec_id: None,
            phases: Default::default(),
            timing: Default::default(),
            model_policy: Default::default(),
            review_policy: Default::default(),
        };

        dashboard.update(&state);

        assert_eq!(dashboard.status, OrchestrationStatus::Reviewing);
    }

    #[test]
    fn update_syncs_phase_progress_from_supervisor_state() {
        let mut dashboard = Dashboard::new();
        let now = Utc::now();
        let state = SupervisorState {
            version: 1,
            feature: "test-feature".to_string(),
            spec_doc: std::path::PathBuf::from("/path/to/spec.md"),
            worktree_path: std::path::PathBuf::from("/path/to/worktree"),
            branch: "test-branch".to_string(),
            total_phases: 4,
            current_phase: 2,
            status: OrchestrationStatus::Executing,
            orchestration_started_at: now,
            spec_id: None,
            phases: Default::default(),
            timing: Default::default(),
            model_policy: Default::default(),
            review_policy: Default::default(),
        };

        dashboard.update(&state);

        assert_eq!(dashboard.current_phase, 2);
        assert_eq!(dashboard.total_phases, 4);
    }

    #[test]
    fn update_calculates_elapsed_time() {
        let mut dashboard = Dashboard::new();
        let now = Utc::now();
        let start_time = now - Duration::minutes(30);
        let state = SupervisorState {
            version: 1,
            feature: "test-feature".to_string(),
            spec_doc: std::path::PathBuf::from("/path/to/spec.md"),
            worktree_path: std::path::PathBuf::from("/path/to/worktree"),
            branch: "test-branch".to_string(),
            total_phases: 3,
            current_phase: 1,
            status: OrchestrationStatus::Executing,
            orchestration_started_at: start_time,
            spec_id: None,
            phases: Default::default(),
            timing: Default::default(),
            model_policy: Default::default(),
            review_policy: Default::default(),
        };

        dashboard.update(&state);

        // Should be approximately 30 minutes (allowing some tolerance for test execution time)
        assert!(dashboard.elapsed_mins >= 29 && dashboard.elapsed_mins <= 31);
    }

    // ====================================================================
    // Status Text Tests
    // ====================================================================

    #[test]
    fn status_text_planning() {
        let dashboard = Dashboard {
            feature: String::new(),
            status: OrchestrationStatus::Planning,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        };
        assert_eq!(dashboard.status_text(), "Planning");
    }

    #[test]
    fn status_text_executing() {
        let dashboard = Dashboard {
            feature: String::new(),
            status: OrchestrationStatus::Executing,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        };
        assert_eq!(dashboard.status_text(), "Executing");
    }

    #[test]
    fn status_text_reviewing() {
        let dashboard = Dashboard {
            feature: String::new(),
            status: OrchestrationStatus::Reviewing,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        };
        assert_eq!(dashboard.status_text(), "Reviewing");
    }

    #[test]
    fn status_text_complete() {
        let dashboard = Dashboard {
            feature: String::new(),
            status: OrchestrationStatus::Complete,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        };
        assert_eq!(dashboard.status_text(), "Complete");
    }

    #[test]
    fn status_text_blocked() {
        let dashboard = Dashboard {
            feature: String::new(),
            status: OrchestrationStatus::Blocked,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        };
        assert_eq!(dashboard.status_text(), "Blocked");
    }

    // ====================================================================
    // Status Message Tests (Phase 5)
    // ====================================================================

    #[test]
    fn render_with_status_message_does_not_panic() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;

        let dashboard = Dashboard::new();
        let status_msg = Some("Copied: abc1234".to_string());

        let backend = TestBackend::new(120, 3);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            let area = frame.area();
            dashboard.render_with_status(frame, area, status_msg.as_deref());
        });

        assert!(result.is_ok());
    }

    #[test]
    fn render_without_status_message_shows_hints() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;

        let dashboard = Dashboard::new();

        let backend = TestBackend::new(120, 3);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            let area = frame.area();
            dashboard.render_with_status(frame, area, None);
        });

        assert!(result.is_ok());
    }
}
