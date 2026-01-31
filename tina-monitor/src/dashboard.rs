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

    /// Render the dashboard header
    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let phase_text = format!("Phase {}/{}", self.current_phase, self.total_phases);
        let duration_text = Self::format_duration(self.elapsed_mins);
        let status_color = self.status_color();
        let status_text = self.status_text();

        let content = Line::from(vec![
            Span::raw("  "),
            Span::styled(self.feature.clone(), Style::default().fg(Color::White)),
            Span::raw(" | "),
            Span::styled(status_text, Style::default().fg(status_color)),
            Span::raw(" | "),
            Span::raw(phase_text),
            Span::raw(" | "),
            Span::raw(format!("Elapsed: {}", duration_text)),
            Span::raw("  "),
        ]);

        let paragraph = Paragraph::new(content)
            .block(Block::default().borders(Borders::BOTTOM))
            .style(Style::default().bg(Color::Black).fg(Color::White));

        frame.render_widget(paragraph, area);
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
            design_doc: std::path::PathBuf::from("/path/to/design.md"),
            worktree_path: std::path::PathBuf::from("/path/to/worktree"),
            branch: "test-branch".to_string(),
            total_phases: 3,
            current_phase: 1,
            status: OrchestrationStatus::Executing,
            orchestration_started_at: now,
            phases: Default::default(),
            timing: Default::default(),
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
            design_doc: std::path::PathBuf::from("/path/to/design.md"),
            worktree_path: std::path::PathBuf::from("/path/to/worktree"),
            branch: "test-branch".to_string(),
            total_phases: 3,
            current_phase: 2,
            status: OrchestrationStatus::Reviewing,
            orchestration_started_at: now,
            phases: Default::default(),
            timing: Default::default(),
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
            design_doc: std::path::PathBuf::from("/path/to/design.md"),
            worktree_path: std::path::PathBuf::from("/path/to/worktree"),
            branch: "test-branch".to_string(),
            total_phases: 4,
            current_phase: 2,
            status: OrchestrationStatus::Executing,
            orchestration_started_at: now,
            phases: Default::default(),
            timing: Default::default(),
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
            design_doc: std::path::PathBuf::from("/path/to/design.md"),
            worktree_path: std::path::PathBuf::from("/path/to/worktree"),
            branch: "test-branch".to_string(),
            total_phases: 3,
            current_phase: 1,
            status: OrchestrationStatus::Executing,
            orchestration_started_at: start_time,
            phases: Default::default(),
            timing: Default::default(),
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
}
