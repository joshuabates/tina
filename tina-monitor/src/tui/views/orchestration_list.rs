//! Orchestration list view
//!
//! Displays a list of orchestrations with their current status.

use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{List, ListItem, ListState},
    Frame,
};

use crate::tui::app::App;
use crate::tui::widgets::{progress_bar, status_indicator};

/// Render the orchestration list view
pub fn render_orchestration_list(frame: &mut Frame, area: Rect, app: &App) {
    let items: Vec<ListItem> = app
        .orchestrations
        .iter()
        .map(|orch| {
            let name = truncate_name(&orch.team_name, 25);
            let path = shorten_path(&orch.cwd, 30);
            let phase = format!("{}/{}", orch.current_phase, orch.total_phases);
            let progress = progress_bar::render(orch.tasks_completed(), orch.tasks_total(), 10);
            let context = orch
                .context_percent
                .map(|p| format!("ctx:{}%", p))
                .unwrap_or_else(|| "ctx:--".to_string());
            let status = status_indicator::render(&orch.status);

            let line = Line::from(vec![
                Span::styled(format!("{:<25} ", name), Style::default()),
                Span::styled(
                    format!("{:<30} ", path),
                    Style::default().fg(Color::DarkGray),
                ),
                Span::styled(format!("{:<5} ", phase), Style::default()),
                Span::raw(progress),
                Span::raw("  "),
                Span::styled(
                    format!("{:<7} ", context),
                    Style::default().fg(Color::Yellow),
                ),
                status,
            ]);
            ListItem::new(line)
        })
        .collect();

    let list = List::new(items)
        .highlight_style(
            Style::default()
                .add_modifier(Modifier::BOLD)
                .add_modifier(Modifier::REVERSED),
        )
        .highlight_symbol("> ");

    let mut state = ListState::default();
    state.select(Some(app.selected_index));

    frame.render_stateful_widget(list, area, &mut state);
}

fn truncate_name(name: &str, max_len: usize) -> String {
    let display = name
        .trim_end_matches("-orchestration")
        .trim_end_matches("-execution");

    if display.len() > max_len {
        format!("{}...", &display[..max_len - 3])
    } else {
        display.to_string()
    }
}

fn shorten_path(path: &std::path::Path, max_len: usize) -> String {
    let path_str = path.to_string_lossy();
    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();

    let shortened = if path_str.starts_with(&home) {
        format!("~{}", &path_str[home.len()..])
    } else {
        path_str.to_string()
    };

    if shortened.len() > max_len {
        format!("...{}", &shortened[shortened.len() - max_len + 3..])
    } else {
        shortened
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_name_removes_suffixes() {
        assert_eq!(truncate_name("my-project-orchestration", 30), "my-project");
        assert_eq!(truncate_name("feature-work-execution", 30), "feature-work");
    }

    #[test]
    fn test_truncate_name_handles_long_names() {
        let long_name = "very-long-project-name-that-exceeds-max-orchestration";
        let result = truncate_name(long_name, 25);
        assert_eq!(result.len(), 25);
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_truncate_name_no_suffix() {
        assert_eq!(truncate_name("simple-name", 25), "simple-name");
    }

    #[test]
    fn test_shorten_path_replaces_home() {
        let home = dirs::home_dir().unwrap();
        let test_path = home.join("Projects/tina/code");

        let result = shorten_path(&test_path, 50);
        assert!(result.starts_with("~/"));
        assert!(!result.contains(&home.to_string_lossy().to_string()));
    }

    #[test]
    fn test_shorten_path_truncates_long_paths() {
        let long_path = std::path::PathBuf::from("/very/long/path/that/exceeds/maximum/length");
        let result = shorten_path(&long_path, 20);

        assert_eq!(result.len(), 20);
        assert!(result.starts_with("..."));
    }

    #[test]
    fn test_shorten_path_short_path_unchanged() {
        let short_path = std::path::PathBuf::from("/short");
        let result = shorten_path(&short_path, 20);
        assert_eq!(result, "/short");
    }
}
