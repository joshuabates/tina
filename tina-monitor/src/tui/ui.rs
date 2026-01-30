//! TUI rendering

use ratatui::{
    style::{Color, Style},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

use super::app::App;

/// Render the application UI
pub fn render(frame: &mut Frame, _app: &App) {
    let area = frame.area();

    let block = Block::default()
        .title(" Tina Monitor ")
        .borders(Borders::ALL)
        .style(Style::default().fg(Color::White));

    let paragraph = Paragraph::new("Press 'q' or Esc to quit")
        .block(block)
        .style(Style::default());

    frame.render_widget(paragraph, area);
}
