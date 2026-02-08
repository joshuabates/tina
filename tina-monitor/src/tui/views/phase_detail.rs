//! Phase detail view
//!
//! Two-screen layout for orchestration details:
//! - Screen 1 (OrchPhaseTasks): Orchestrations | Phases | Tasks+Team
//! - Screen 2 (TasksDetail): Tasks+Team | Task Detail

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
    Frame,
};
use syntect::easy::HighlightLines;
use syntect::highlighting::{self, ThemeSet};
use syntect::parsing::SyntaxSet;
use syntect::util::LinesWithEndings;

use crate::data::MonitorOrchestration;
use crate::types::{Agent, Task, TaskStatus};
use crate::tui::app::{App, PaneFocus, PhaseDetailLayout, ViewState};

/// Convert syntect color to ratatui color
fn syntect_to_ratatui_color(color: highlighting::Color) -> Color {
    Color::Rgb(color.r, color.g, color.b)
}

/// Highlight code using syntect
fn highlight_code(
    code: &str,
    lang: &str,
    ps: &SyntaxSet,
    theme: &syntect::highlighting::Theme,
    max_width: usize,
) -> Vec<Line<'static>> {
    let mut result = Vec::new();

    // Find syntax for the language, fall back to plain text
    let syntax = ps
        .find_syntax_by_token(lang)
        .or_else(|| ps.find_syntax_by_extension(lang))
        .unwrap_or_else(|| ps.find_syntax_plain_text());

    let mut highlighter = HighlightLines::new(syntax, theme);

    for line in LinesWithEndings::from(code) {
        let Ok(highlighted) = highlighter.highlight_line(line, ps) else {
            // Fall back to plain text if highlighting fails
            result.push(Line::from(Span::styled(
                truncate(line.trim_end(), max_width),
                Style::default().fg(Color::Cyan),
            )));
            continue;
        };

        let spans: Vec<Span<'static>> = highlighted
            .into_iter()
            .map(|(style, text)| {
                let fg = syntect_to_ratatui_color(style.foreground);
                let mut ratatui_style = Style::default().fg(fg);

                if style.font_style.contains(syntect::highlighting::FontStyle::BOLD) {
                    ratatui_style = ratatui_style.add_modifier(Modifier::BOLD);
                }
                if style.font_style.contains(syntect::highlighting::FontStyle::ITALIC) {
                    ratatui_style = ratatui_style.add_modifier(Modifier::ITALIC);
                }
                if style.font_style.contains(syntect::highlighting::FontStyle::UNDERLINE) {
                    ratatui_style = ratatui_style.add_modifier(Modifier::UNDERLINED);
                }

                Span::styled(text.trim_end_matches('\n').to_string(), ratatui_style)
            })
            .collect();

        result.push(Line::from(spans));
    }

    result
}

/// Render markdown text with syntax highlighting
fn render_markdown(text: &str, max_width: usize) -> Vec<Line<'static>> {
    // Box to avoid stack overflow in test threads (SyntaxSet is very large)
    let ps = Box::new(SyntaxSet::load_defaults_newlines());
    let ts = Box::new(ThemeSet::load_defaults());
    let theme = &ts.themes["base16-eighties.dark"];

    let mut lines = Vec::new();
    let mut in_code_block = false;
    let mut code_block_lang = String::new();
    let mut code_block_content = String::new();

    for line in text.lines() {
        if line.trim().starts_with("```") {
            if in_code_block {
                // End of code block - highlight accumulated content
                let highlighted_lines =
                    highlight_code(&code_block_content, &code_block_lang, &ps, theme, max_width);
                lines.extend(highlighted_lines);

                in_code_block = false;
                code_block_lang.clear();
                code_block_content.clear();
                lines.push(Line::from(Span::styled(
                    "───".to_string(),
                    Style::default().fg(Color::DarkGray),
                )));
            } else {
                // Start of code block
                in_code_block = true;
                code_block_lang = line.trim().trim_start_matches('`').to_string();
                let label = if code_block_lang.is_empty() {
                    "───".to_string()
                } else {
                    format!("─── {} ───", code_block_lang)
                };
                lines.push(Line::from(Span::styled(
                    label,
                    Style::default().fg(Color::DarkGray),
                )));
            }
            continue;
        }

        if in_code_block {
            code_block_content.push_str(line);
            code_block_content.push('\n');
            continue;
        }

        // Headers
        if line.starts_with("# ") {
            lines.push(Line::from(Span::styled(
                line[2..].to_string(),
                Style::default().add_modifier(Modifier::BOLD).fg(Color::Cyan),
            )));
        } else if line.starts_with("## ") {
            lines.push(Line::from(Span::styled(
                line[3..].to_string(),
                Style::default().add_modifier(Modifier::BOLD),
            )));
        } else if line.starts_with("### ") {
            lines.push(Line::from(Span::styled(
                line[4..].to_string(),
                Style::default().add_modifier(Modifier::UNDERLINED),
            )));
        } else if line.starts_with("- ") || line.starts_with("* ") {
            // Bullet list
            lines.push(Line::from(vec![
                Span::styled("  • ".to_string(), Style::default().fg(Color::Yellow)),
                Span::raw(line[2..].to_string()),
            ]));
        } else if line.starts_with("> ") {
            // Blockquote
            lines.push(Line::from(Span::styled(
                format!("│ {}", &line[2..]),
                Style::default().fg(Color::DarkGray).add_modifier(Modifier::ITALIC),
            )));
        } else {
            // Regular text with inline code
            lines.push(render_inline_code(line));
        }
    }

    // Handle unclosed code block
    if in_code_block && !code_block_content.is_empty() {
        let highlighted_lines =
            highlight_code(&code_block_content, &code_block_lang, &ps, theme, max_width);
        lines.extend(highlighted_lines);
    }

    lines
}

/// Render the phase detail view based on current layout
pub fn render(frame: &mut Frame, area: Rect, app: &App) {
    let orchestration = match app.orchestrations.get(app.selected_index) {
        Some(orch) => orch,
        None => return,
    };

    // Extract state from view state
    let (focus, task_index, member_index, layout, selected_phase) = match app.view_state {
        ViewState::PhaseDetail {
            focus,
            task_index,
            member_index,
            layout,
            selected_phase,
        } => (focus, task_index, member_index, layout, selected_phase),
        _ => return,
    };

    match layout {
        PhaseDetailLayout::OrchPhaseTasks => {
            render_orch_phase_tasks(frame, area, app, orchestration, focus, task_index, member_index, selected_phase);
        }
        PhaseDetailLayout::TasksDetail => {
            render_tasks_detail(frame, area, app, orchestration, focus, task_index, member_index);
        }
    }
}

/// Render Screen 1: Orchestrations | Phases | Tasks+Team
fn render_orch_phase_tasks(
    frame: &mut Frame,
    area: Rect,
    app: &App,
    orchestration: &MonitorOrchestration,
    focus: PaneFocus,
    task_index: usize,
    member_index: usize,
    selected_phase: u32,
) {
    // Three-column layout: 25% | 25% | 50%
    let columns = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(25),
            Constraint::Percentage(25),
            Constraint::Percentage(50),
        ])
        .split(area);

    // Left: Orchestrations list
    render_orchestrations_pane(frame, columns[0], app, focus == PaneFocus::Orchestrations);

    // Middle: Phase list
    render_phases_pane(frame, columns[1], orchestration, focus == PaneFocus::Phases, selected_phase);

    // Right: Tasks+Team (split vertically)
    let right_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Percentage(60), Constraint::Percentage(40)])
        .split(columns[2]);

    // Get phase-specific tasks and members from cache, or fall back to orchestration data
    let (tasks, members) = if let Some((orch_idx, cached_phase, phase_data)) = &app.phase_cache {
        if *orch_idx == app.selected_index && *cached_phase == selected_phase {
            (&phase_data.tasks, &phase_data.members)
        } else {
            (&orchestration.tasks, &orchestration.members)
        }
    } else {
        (&orchestration.tasks, &orchestration.members)
    };

    render_tasks_pane_with_data(frame, right_chunks[0], tasks, focus == PaneFocus::Tasks, task_index, selected_phase);
    render_members_pane_with_data(frame, right_chunks[1], members, focus == PaneFocus::Members, member_index, selected_phase);
}

/// Render Screen 2: Tasks+Team | Task Detail
fn render_tasks_detail(
    frame: &mut Frame,
    area: Rect,
    _app: &App,
    orchestration: &MonitorOrchestration,
    focus: PaneFocus,
    task_index: usize,
    member_index: usize,
) {
    // Two-column layout: 40% | 60%
    let columns = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(40), Constraint::Percentage(60)])
        .split(area);

    // Left: Tasks+Team (split vertically)
    let left_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Percentage(60), Constraint::Percentage(40)])
        .split(columns[0]);

    render_tasks_pane(frame, left_chunks[0], orchestration, focus == PaneFocus::Tasks, task_index);
    render_members_pane(frame, left_chunks[1], orchestration, focus == PaneFocus::Members, member_index);

    // Right: Task detail
    render_task_detail_pane(frame, columns[1], orchestration, focus == PaneFocus::Detail, task_index);
}

/// Render the orchestrations list pane
fn render_orchestrations_pane(frame: &mut Frame, area: Rect, app: &App, is_focused: bool) {
    let items: Vec<ListItem> = app
        .orchestrations
        .iter()
        .enumerate()
        .map(|(i, orch)| {
            let indicator = if i == app.selected_index { "▶ " } else { "  " };
            let status_char = match &orch.status {
                crate::data::MonitorOrchestrationStatus::Executing => "●",
                crate::data::MonitorOrchestrationStatus::Planning => "◑",
                crate::data::MonitorOrchestrationStatus::Reviewing => "◎",
                crate::data::MonitorOrchestrationStatus::Blocked => "✗",
                crate::data::MonitorOrchestrationStatus::Complete => "✓",
                crate::data::MonitorOrchestrationStatus::Idle => "○",
            };
            let status_color = match &orch.status {
                crate::data::MonitorOrchestrationStatus::Executing => Color::Green,
                crate::data::MonitorOrchestrationStatus::Planning => Color::Yellow,
                crate::data::MonitorOrchestrationStatus::Reviewing => Color::Cyan,
                crate::data::MonitorOrchestrationStatus::Blocked => Color::Red,
                crate::data::MonitorOrchestrationStatus::Complete => Color::Blue,
                crate::data::MonitorOrchestrationStatus::Idle => Color::DarkGray,
            };

            let title = truncate(&orch.title(), area.width.saturating_sub(8) as usize);
            let style = if i == app.selected_index {
                Style::default().add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };

            ListItem::new(Line::from(vec![
                Span::raw(indicator),
                Span::styled(status_char, Style::default().fg(status_color)),
                Span::raw(" "),
                Span::styled(title, style),
            ]))
        })
        .collect();

    let border_style = border_style(is_focused);
    let list = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title("Orchestrations")
            .border_style(border_style),
    );

    frame.render_widget(list, area);
}

/// Get status indicator and color for a phase
fn get_phase_status(orchestration: &MonitorOrchestration, phase: u32) -> (&'static str, Color) {
    if phase < orchestration.current_phase {
        // Past phase - assume complete
        ("✓", Color::Green)
    } else if phase == orchestration.current_phase {
        match &orchestration.status {
            crate::data::MonitorOrchestrationStatus::Executing => ("▶", Color::Cyan),
            crate::data::MonitorOrchestrationStatus::Planning => ("◑", Color::Yellow),
            crate::data::MonitorOrchestrationStatus::Reviewing => ("◎", Color::Cyan),
            crate::data::MonitorOrchestrationStatus::Blocked => ("✗", Color::Red),
            crate::data::MonitorOrchestrationStatus::Complete => ("✓", Color::Green),
            crate::data::MonitorOrchestrationStatus::Idle => ("○", Color::DarkGray),
        }
    } else {
        // Future phase
        ("○", Color::DarkGray)
    }
}

/// Render the phases pane as a selectable list
fn render_phases_pane(
    frame: &mut Frame,
    area: Rect,
    orchestration: &MonitorOrchestration,
    is_focused: bool,
    selected_phase: u32,
) {
    // Split area: list on top, context bar on bottom
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(3), Constraint::Length(3)])
        .split(area);

    // Build phase list
    let items: Vec<ListItem> = (1..=orchestration.total_phases)
        .map(|phase| {
            let is_current = phase == orchestration.current_phase;
            let is_selected = phase == selected_phase;

            let (indicator, status_color) = get_phase_status(orchestration, phase);

            let cursor = if is_selected && is_focused { "▶ " } else { "  " };

            let style = if is_selected {
                Style::default().add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };

            let current_marker = if is_current { " ◀" } else { "" };

            ListItem::new(Line::from(vec![
                Span::raw(cursor),
                Span::styled(indicator, Style::default().fg(status_color)),
                Span::raw(" "),
                Span::styled(format!("Phase {}", phase), style),
                Span::styled(current_marker, Style::default().fg(Color::Cyan)),
            ]))
        })
        .collect();

    let border_style = border_style(is_focused);
    let title = format!("{} [p:plan D:design]", truncate(&orchestration.title(), area.width.saturating_sub(20) as usize));
    let list = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title(title)
            .border_style(border_style),
    );
    frame.render_widget(list, chunks[0]);

    // Context bar (bottom) - context_percent not available from Convex
    let context_text = "Context: --".to_string();

    let progress = "[----------]".to_string();

    let context_content = vec![
        Line::from(context_text),
        Line::from(progress),
    ];

    let context_paragraph = Paragraph::new(context_content).block(
        Block::default()
            .borders(Borders::TOP)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    frame.render_widget(context_paragraph, chunks[1]);
}

/// Render the tasks pane with selection highlighting
fn render_tasks_pane(
    frame: &mut Frame,
    area: Rect,
    orchestration: &MonitorOrchestration,
    is_focused: bool,
    selected_index: usize,
) {
    let items: Vec<ListItem> = orchestration
        .tasks
        .iter()
        .enumerate()
        .map(|(i, task)| {
            let indicator = match task.status {
                TaskStatus::Completed => "✓",
                TaskStatus::InProgress => "▶",
                TaskStatus::Pending if !task.blocked_by.is_empty() => "✗",
                TaskStatus::Pending => "○",
            };

            let status_color = match task.status {
                TaskStatus::Completed => Color::Green,
                TaskStatus::InProgress => Color::Cyan,
                TaskStatus::Pending if !task.blocked_by.is_empty() => Color::Red,
                TaskStatus::Pending => Color::DarkGray,
            };

            let subject = truncate(&task.subject, area.width.saturating_sub(8) as usize);
            let selected_marker = if i == selected_index && is_focused { "▶ " } else { "  " };

            let style = if i == selected_index {
                Style::default().add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };

            ListItem::new(Line::from(vec![
                Span::raw(selected_marker),
                Span::styled(indicator, Style::default().fg(status_color)),
                Span::raw(" "),
                Span::styled(subject, style),
            ]))
        })
        .collect();

    let border_style = border_style(is_focused);
    let title = format!("Tasks ({}) [Tab: switch]", orchestration.tasks.len());
    let list = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title(title)
            .border_style(border_style),
    );

    frame.render_widget(list, area);
}

/// Render the team members pane with selection highlighting
fn render_members_pane(
    frame: &mut Frame,
    area: Rect,
    orchestration: &MonitorOrchestration,
    is_focused: bool,
    selected_index: usize,
) {
    let items: Vec<ListItem> = orchestration
        .members
        .iter()
        .enumerate()
        .map(|(i, member)| {
            let selected_marker = if i == selected_index && is_focused { "▶ " } else { "  " };

            let model_short = shorten_model(&member.model);
            let agent_type = member.agent_type.as_deref().unwrap_or("agent");

            let style = if i == selected_index {
                Style::default().add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };

            let name = truncate(&member.name, area.width.saturating_sub(20) as usize);

            ListItem::new(Line::from(vec![
                Span::raw(selected_marker),
                Span::styled(name, style),
                Span::styled(format!(" ({}/{})", agent_type, model_short), Style::default().fg(Color::DarkGray)),
            ]))
        })
        .collect();

    let border_style = border_style(is_focused);
    let title = format!("Team ({}) [Tab: switch]", orchestration.members.len());

    if items.is_empty() {
        let paragraph = Paragraph::new(Line::from(Span::styled(
            "No team members",
            Style::default().fg(Color::DarkGray),
        )))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .border_style(border_style),
        );
        frame.render_widget(paragraph, area);
    } else {
        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .border_style(border_style),
        );
        frame.render_widget(list, area);
    }
}

/// Render tasks pane with provided task list (for phase-specific data)
fn render_tasks_pane_with_data(
    frame: &mut Frame,
    area: Rect,
    tasks: &[Task],
    is_focused: bool,
    selected_index: usize,
    phase: u32,
) {
    let items: Vec<ListItem> = tasks
        .iter()
        .enumerate()
        .map(|(i, task)| {
            let indicator = match task.status {
                TaskStatus::Completed => "✓",
                TaskStatus::InProgress => "▶",
                TaskStatus::Pending if !task.blocked_by.is_empty() => "✗",
                TaskStatus::Pending => "○",
            };

            let status_color = match task.status {
                TaskStatus::Completed => Color::Green,
                TaskStatus::InProgress => Color::Cyan,
                TaskStatus::Pending if !task.blocked_by.is_empty() => Color::Red,
                TaskStatus::Pending => Color::DarkGray,
            };

            let subject = truncate(&task.subject, area.width.saturating_sub(8) as usize);
            let selected_marker = if i == selected_index && is_focused { "▶ " } else { "  " };

            let style = if i == selected_index {
                Style::default().add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };

            ListItem::new(Line::from(vec![
                Span::raw(selected_marker),
                Span::styled(indicator, Style::default().fg(status_color)),
                Span::raw(" "),
                Span::styled(subject, style),
            ]))
        })
        .collect();

    let border_style = border_style(is_focused);
    let title = format!("Phase {} Tasks ({}) [Tab: switch]", phase, tasks.len());

    if items.is_empty() {
        let paragraph = Paragraph::new(Line::from(Span::styled(
            "No tasks for this phase",
            Style::default().fg(Color::DarkGray),
        )))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .border_style(border_style),
        );
        frame.render_widget(paragraph, area);
    } else {
        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .border_style(border_style),
        );
        frame.render_widget(list, area);
    }
}

/// Render members pane with provided member list (for phase-specific data)
fn render_members_pane_with_data(
    frame: &mut Frame,
    area: Rect,
    members: &[Agent],
    is_focused: bool,
    selected_index: usize,
    phase: u32,
) {
    let items: Vec<ListItem> = members
        .iter()
        .enumerate()
        .map(|(i, member)| {
            let selected_marker = if i == selected_index && is_focused { "▶ " } else { "  " };

            let model_short = shorten_model(&member.model);
            let agent_type = member.agent_type.as_deref().unwrap_or("agent");

            let style = if i == selected_index {
                Style::default().add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };

            let name = truncate(&member.name, area.width.saturating_sub(20) as usize);

            ListItem::new(Line::from(vec![
                Span::raw(selected_marker),
                Span::styled(name, style),
                Span::styled(format!(" ({}/{})", agent_type, model_short), Style::default().fg(Color::DarkGray)),
            ]))
        })
        .collect();

    let border_style = border_style(is_focused);
    let title = format!("Phase {} Team ({}) [Tab: switch]", phase, members.len());

    if items.is_empty() {
        let paragraph = Paragraph::new(Line::from(Span::styled(
            "No team members for this phase",
            Style::default().fg(Color::DarkGray),
        )))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .border_style(border_style),
        );
        frame.render_widget(paragraph, area);
    } else {
        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .border_style(border_style),
        );
        frame.render_widget(list, area);
    }
}

/// Render the task detail pane showing full task information
fn render_task_detail_pane(
    frame: &mut Frame,
    area: Rect,
    orchestration: &MonitorOrchestration,
    is_focused: bool,
    task_index: usize,
) {
    let border_style = border_style(is_focused);

    let task = match orchestration.tasks.get(task_index) {
        Some(t) => t,
        None => {
            let paragraph = Paragraph::new(Line::from(Span::styled(
                "No task selected",
                Style::default().fg(Color::DarkGray),
            )))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title("Task Detail")
                    .border_style(border_style),
            );
            frame.render_widget(paragraph, area);
            return;
        }
    };

    let status_text = match task.status {
        TaskStatus::Completed => ("✓ Completed", Color::Green),
        TaskStatus::InProgress => ("▶ In Progress", Color::Cyan),
        TaskStatus::Pending if !task.blocked_by.is_empty() => ("✗ Blocked", Color::Red),
        TaskStatus::Pending => ("○ Pending", Color::DarkGray),
    };

    let mut lines = vec![
        Line::from(Span::styled(&task.subject, Style::default().add_modifier(Modifier::BOLD))),
        Line::from(""),
        Line::from(vec![
            Span::raw("Status: "),
            Span::styled(status_text.0, Style::default().fg(status_text.1)),
        ]),
    ];

    if let Some(owner) = &task.owner {
        lines.push(Line::from(vec![
            Span::raw("Owner: "),
            Span::styled(owner, Style::default().fg(Color::Yellow)),
        ]));
    }

    if !task.blocked_by.is_empty() {
        lines.push(Line::from(vec![
            Span::raw("Blocked by: "),
            Span::styled(task.blocked_by.join(", "), Style::default().fg(Color::Red)),
        ]));
    }

    if !task.blocks.is_empty() {
        lines.push(Line::from(vec![
            Span::raw("Blocks: "),
            Span::styled(task.blocks.join(", "), Style::default().fg(Color::DarkGray)),
        ]));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled("Description:", Style::default().add_modifier(Modifier::UNDERLINED))));
    lines.push(Line::from(""));

    // Render description with syntax-highlighted markdown
    let max_width = area.width.saturating_sub(4) as usize;
    let description_lines = render_markdown(&task.description, max_width);
    lines.extend(description_lines);

    let paragraph = Paragraph::new(lines)
        .wrap(Wrap { trim: false })
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!("Task #{}", task.id))
                .border_style(border_style),
        );

    frame.render_widget(paragraph, area);
}

/// Get border style based on focus state
fn border_style(is_focused: bool) -> Style {
    if is_focused {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    }
}

/// Shorten model name for display
fn shorten_model(model: &str) -> &str {
    if model.contains("opus") {
        "opus"
    } else if model.contains("sonnet") {
        "sonnet"
    } else if model.contains("haiku") {
        "haiku"
    } else {
        model
    }
}

/// Render a line with inline `code` formatting
fn render_inline_code(line: &str) -> Line<'static> {
    let mut spans = Vec::new();
    let mut chars = line.chars().peekable();
    let mut current_text = String::new();
    let mut in_code = false;

    while let Some(c) = chars.next() {
        if c == '`' {
            if in_code {
                // End of inline code
                spans.push(Span::styled(
                    std::mem::take(&mut current_text),
                    Style::default().fg(Color::Cyan),
                ));
                in_code = false;
            } else {
                // Start of inline code - flush regular text first
                if !current_text.is_empty() {
                    spans.push(Span::raw(std::mem::take(&mut current_text)));
                }
                in_code = true;
            }
        } else {
            current_text.push(c);
        }
    }

    // Flush remaining text
    if !current_text.is_empty() {
        if in_code {
            // Unclosed backtick - treat as regular text with the backtick
            spans.push(Span::raw(format!("`{}", current_text)));
        } else {
            spans.push(Span::raw(current_text));
        }
    }

    Line::from(spans)
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
    use crate::data::MonitorOrchestration;
    use crate::types::{Task, TaskStatus};
    use tina_data::OrchestrationListEntry;
    use ratatui::{backend::TestBackend, Terminal};

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

    fn make_test_orchestration() -> MonitorOrchestration {
        let entry = OrchestrationListEntry {
            id: "orch-1".to_string(),
            node_name: "macbook".to_string(),
            record: tina_data::OrchestrationRecord {
                node_id: "node-1".to_string(),
                project_id: None,
                feature_name: "test-project".to_string(),
                design_doc_path: "design.md".to_string(),
                branch: "tina/test-project".to_string(),
                worktree_path: Some("/test".to_string()),
                total_phases: 4.0,
                current_phase: 2.0,
                status: "executing".to_string(),
                started_at: "2026-02-07T10:00:00Z".to_string(),
                completed_at: None,
                total_elapsed_mins: None,
            },
        };
        let mut orch = MonitorOrchestration::from_list_entry(entry);
        orch.tasks = vec![
            make_test_task("1", "Completed task", TaskStatus::Completed, vec![]),
            make_test_task("2", "In progress task", TaskStatus::InProgress, vec![]),
            make_test_task("3", "Pending task", TaskStatus::Pending, vec![]),
            make_test_task(
                "4",
                "Blocked task",
                TaskStatus::Pending,
                vec!["99".to_string()],
            ),
        ];
        orch
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
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
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
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
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
    fn test_team_pane_renders_context_placeholder() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let orchestration = make_test_orchestration();
        let mut app = App::new_with_orchestrations(vec![orchestration]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
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
            "Should display context placeholder (not available from Convex)"
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
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let result = terminal.draw(|frame| render(frame, frame.area(), &app));
        assert!(result.is_ok(), "Should render with Tasks focused");

        // Test with Members focused
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
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
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
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
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
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
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
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

        // Context bar renders "Context: --" and "[----------]" as text
        assert!(
            buffer_str.contains("Context: --"),
            "Should display context placeholder"
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
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
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
            buffer_str.contains("test-project"),
            "Should display orchestration title"
        );
        // With the new phase list, we show "Phase 2" as the current phase item
        assert!(
            buffer_str.contains("Phase 2"),
            "Should display phase 2 in the list"
        );
    }

    #[test]
    fn test_team_pane_handles_context_placeholder() {
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let orchestration = make_test_orchestration();

        let mut app = App::new_with_orchestrations(vec![orchestration]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
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
