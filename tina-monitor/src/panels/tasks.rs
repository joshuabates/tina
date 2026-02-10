use crate::panel::{HandleResult, Panel};
use crate::panels::{border_style, border_type, clamp_selection, handle_selectable_list_key};
use crate::types::{Task, TaskStatus};
use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState};
use ratatui::Frame;

pub struct TasksPanel {
    title: &'static str,
    pub tasks: Vec<Task>,
    pub selected: usize,
}

impl Default for TasksPanel {
    fn default() -> Self {
        Self::new()
    }
}

impl TasksPanel {
    pub fn new() -> Self {
        Self {
            title: "Tasks",
            tasks: vec![],
            selected: 0,
        }
    }

    pub fn set_tasks(&mut self, tasks: Vec<Task>) {
        self.tasks = tasks;
        clamp_selection(&mut self.selected, self.tasks.len());
    }

    pub fn selected_task(&self) -> Option<&Task> {
        self.tasks.get(self.selected)
    }
}

impl Panel for TasksPanel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult {
        handle_selectable_list_key(key.code, &mut self.selected, self.tasks.len())
    }

    fn render(&self, frame: &mut Frame, area: Rect, focused: bool) {
        let block = Block::default()
            .title(self.title)
            .borders(Borders::ALL)
            .border_type(border_type(focused))
            .border_style(border_style(focused));

        let items: Vec<ListItem> = if self.tasks.is_empty() {
            vec![ListItem::new("No tasks")]
        } else {
            self.tasks
                .iter()
                .map(|task| {
                    let status_icon = match task.status {
                        TaskStatus::Completed => {
                            Span::styled("[x]", Style::default().fg(Color::Green))
                        }
                        TaskStatus::InProgress => {
                            Span::styled("[>]", Style::default().fg(Color::Yellow))
                        }
                        TaskStatus::Pending => {
                            Span::styled("[ ]", Style::default().fg(Color::DarkGray))
                        }
                    };

                    let mut spans =
                        vec![status_icon, Span::raw(" "), Span::raw(task.subject.clone())];

                    if let Some(owner) = &task.owner {
                        spans.push(Span::raw(" <- "));
                        spans.push(Span::styled(
                            owner.clone(),
                            Style::default().fg(Color::Cyan),
                        ));
                    }

                    if !task.blocked_by.is_empty() {
                        spans.push(Span::raw(" "));
                        spans.push(Span::styled("(blocked)", Style::default().fg(Color::Red)));
                    }

                    ListItem::new(Line::from(spans))
                })
                .collect()
        };

        let list = List::new(items)
            .block(block)
            .highlight_style(Style::default().bg(Color::DarkGray));

        let mut state = ListState::default();
        if !self.tasks.is_empty() {
            state.select(Some(self.selected));
        }

        frame.render_stateful_widget(list, area, &mut state);
    }

    fn name(&self) -> &'static str {
        self.title
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;

    pub fn make_test_task(id: &str, status: TaskStatus) -> Task {
        Task {
            id: id.to_string(),
            subject: format!("Task {}", id),
            description: format!("Description for task {}", id),
            active_form: None,
            status,
            owner: None,
            blocks: vec![],
            blocked_by: vec![],
            metadata: serde_json::Value::Null,
        }
    }

    #[test]
    fn new_task_panel_has_no_tasks() {
        let panel = TasksPanel::new();
        assert_eq!(panel.tasks.len(), 0);
        assert_eq!(panel.selected, 0);
    }

    #[test]
    fn set_tasks_adds_tasks() {
        let mut panel = TasksPanel::new();
        let tasks = vec![
            make_test_task("1", TaskStatus::Completed),
            make_test_task("2", TaskStatus::InProgress),
            make_test_task("3", TaskStatus::Pending),
        ];

        panel.set_tasks(tasks.clone());
        assert_eq!(panel.tasks.len(), 3);
        assert_eq!(panel.tasks[0].id, "1");
        assert_eq!(panel.tasks[1].id, "2");
        assert_eq!(panel.tasks[2].id, "3");
    }

    #[test]
    fn selected_task_returns_current_selection() {
        let mut panel = TasksPanel::new();
        let tasks = vec![
            make_test_task("1", TaskStatus::Completed),
            make_test_task("2", TaskStatus::InProgress),
        ];

        panel.set_tasks(tasks);
        panel.selected = 0;

        let task = panel.selected_task();
        assert!(task.is_some());
        assert_eq!(task.unwrap().id, "1");
    }

    #[test]
    fn selected_task_returns_none_when_empty() {
        let panel = TasksPanel::new();
        assert!(panel.selected_task().is_none());
    }

    #[test]
    fn set_tasks_resets_selection_if_out_of_bounds() {
        let mut panel = TasksPanel::new();
        panel.selected = 5;

        let tasks = vec![
            make_test_task("1", TaskStatus::Pending),
            make_test_task("2", TaskStatus::Pending),
        ];

        panel.set_tasks(tasks);
        // Selection should be reset to last valid index (1)
        assert_eq!(panel.selected, 1);
    }

    #[test]
    fn set_tasks_preserves_valid_selection() {
        let mut panel = TasksPanel::new();
        panel.selected = 1;

        let tasks = vec![
            make_test_task("1", TaskStatus::Pending),
            make_test_task("2", TaskStatus::Pending),
            make_test_task("3", TaskStatus::Pending),
        ];

        panel.set_tasks(tasks);
        // Selection should stay at 1 since it's still valid
        assert_eq!(panel.selected, 1);
    }

    #[test]
    fn set_tasks_resets_to_zero_on_empty() {
        let mut panel = TasksPanel::new();
        panel.selected = 5;
        panel.set_tasks(vec![]);

        assert_eq!(panel.selected, 0);
    }

    #[test]
    fn task_with_owner_renders_owner() {
        let mut panel = TasksPanel::new();
        let mut task = make_test_task("1", TaskStatus::Pending);
        task.owner = Some("alice".to_string());

        panel.set_tasks(vec![task]);

        // Verify selected_task includes owner
        let selected = panel.selected_task().unwrap();
        assert_eq!(selected.owner, Some("alice".to_string()));
    }

    #[test]
    fn task_with_blocked_by_is_blocked() {
        let mut panel = TasksPanel::new();
        let mut task = make_test_task("1", TaskStatus::Pending);
        task.blocked_by = vec!["other-task".to_string()];

        panel.set_tasks(vec![task]);

        let selected = panel.selected_task().unwrap();
        assert!(!selected.blocked_by.is_empty());
    }

    #[test]
    fn multiple_tasks_with_different_statuses() {
        let mut panel = TasksPanel::new();
        let tasks = vec![
            make_test_task("1", TaskStatus::Completed),
            make_test_task("2", TaskStatus::InProgress),
            make_test_task("3", TaskStatus::Pending),
        ];

        panel.set_tasks(tasks);

        assert_eq!(panel.tasks[0].status, TaskStatus::Completed);
        assert_eq!(panel.tasks[1].status, TaskStatus::InProgress);
        assert_eq!(panel.tasks[2].status, TaskStatus::Pending);
    }

    #[test]
    fn render_empty_state() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;

        let panel = TasksPanel::new();
        let backend = TestBackend::new(80, 10);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            let area = frame.area();
            panel.render(frame, area, true);
        });

        assert!(result.is_ok(), "Should render empty state without error");
    }

    #[test]
    fn render_tasks_with_all_attributes() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;

        let mut panel = TasksPanel::new();

        // Create task with owner and blocked status
        let mut task1 = make_test_task("1", TaskStatus::Completed);
        task1.owner = Some("alice".to_string());

        let mut task2 = make_test_task("2", TaskStatus::InProgress);
        task2.owner = Some("bob".to_string());
        task2.blocked_by = vec!["task-1".to_string()];

        let task3 = make_test_task("3", TaskStatus::Pending);

        panel.set_tasks(vec![task1, task2, task3]);

        let backend = TestBackend::new(80, 10);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            let area = frame.area();
            panel.render(frame, area, true);
        });

        assert!(
            result.is_ok(),
            "Should render tasks with all attributes without error"
        );
    }
}
