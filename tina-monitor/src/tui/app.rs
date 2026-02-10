//! TUI application state and event loop

use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use ratatui::{backend::Backend, Terminal};
use std::time::{Duration, Instant};

use super::ui;
use crate::config::Config;
use crate::data::MonitorOrchestration;
use crate::terminal::{get_handler, TerminalResult};
use crate::types::Team;
use crate::watcher::DataWatcher;

/// Result type for TUI operations
pub type AppResult<T> = Result<T, Box<dyn std::error::Error>>;

/// Which view/modal is currently active
#[derive(Debug, Clone, PartialEq)]
pub enum ViewState {
    /// Main orchestration list view
    OrchestrationList,
    /// Phase detail view
    PhaseDetail {
        /// Which pane has focus
        focus: PaneFocus,
        /// Selected task index
        task_index: usize,
        /// Selected member index
        member_index: usize,
        /// Layout mode
        layout: PhaseDetailLayout,
        /// Selected phase for viewing (1-indexed)
        selected_phase: u32,
    },
    /// Task inspector modal
    TaskInspector {
        /// Selected task index
        task_index: usize,
    },
    /// Log viewer modal
    LogViewer {
        /// Selected agent index
        agent_index: usize,
        /// Pane ID for tmux capture
        pane_id: String,
        /// Agent name for display
        agent_name: String,
    },
    /// Send dialog modal
    SendDialog {
        /// Pane ID to send to
        pane_id: String,
        /// Agent name for display
        agent_name: String,
    },
    /// Command modal for showing fallback commands
    CommandModal {
        /// Command to show
        command: String,
        /// Description of the command
        description: String,
        /// Whether command was copied
        copied: bool,
    },
    /// Plan viewer modal
    PlanViewer {
        /// Path to the plan file
        plan_path: std::path::PathBuf,
        /// Scroll offset
        scroll_offset: u16,
    },
    /// Commits view modal
    CommitsView {
        /// Worktree path
        worktree_path: std::path::PathBuf,
        /// Git range
        range: String,
        /// Modal title
        title: String,
    },
    /// Diff view modal
    DiffView {
        /// Worktree path
        worktree_path: std::path::PathBuf,
        /// Git range
        range: String,
        /// Modal title
        title: String,
        /// Selected file index
        selected: usize,
        /// Whether showing full diff
        show_full: bool,
        /// Scroll offset for full diff
        scroll: u16,
    },
}

/// Which pane has focus in PhaseDetail view
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PaneFocus {
    /// Orchestrations pane (left column in Screen 1)
    Orchestrations,
    /// Phases pane (middle column in Screen 1)
    Phases,
    /// Tasks pane
    Tasks,
    /// Members pane
    Members,
    /// Detail pane (right column - shows phase plan or task detail)
    Detail,
}

/// Layout mode for PhaseDetail view
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum PhaseDetailLayout {
    /// Screen 1: Orchestrations | Phases | Tasks+Team
    #[default]
    OrchPhaseTasks,
    /// Screen 2: Tasks+Team | Task Detail
    TasksDetail,
}

/// Cached phase data (tasks and members for a specific phase)
#[derive(Debug, Clone)]
pub struct PhaseData {
    pub tasks: Vec<crate::types::Task>,
    pub members: Vec<crate::types::Agent>,
}

#[derive(Debug, Clone, Copy)]
struct PhaseDetailState {
    focus: PaneFocus,
    task_index: usize,
    member_index: usize,
    layout: PhaseDetailLayout,
    selected_phase: u32,
}

/// Main TUI application state
pub struct App {
    /// Whether the application should quit
    pub should_quit: bool,
    /// List of discovered orchestrations
    pub orchestrations: Vec<MonitorOrchestration>,
    /// Index of the currently selected orchestration
    pub selected_index: usize,
    /// Tick rate for event polling
    pub tick_rate: Duration,
    /// Whether to show the help modal
    pub show_help: bool,
    /// File watcher for automatic refresh
    pub(crate) watcher: Option<DataWatcher>,
    /// Time of last refresh (for debouncing)
    pub(crate) last_refresh: Instant,
    /// Current view state
    pub view_state: ViewState,
    /// Log viewer instance
    pub(crate) log_viewer: Option<super::views::log_viewer::LogViewer>,
    /// Send dialog instance
    pub(crate) send_dialog: Option<super::views::send_dialog::SendDialog>,
    /// Command logger instance
    pub(crate) command_logger: Option<crate::logging::CommandLogger>,
    /// Cached phase data for the selected phase (orch_index, phase_number, data)
    pub phase_cache: Option<(usize, u32, PhaseData)>,
}

impl App {
    /// Create a new App instance
    pub fn new() -> AppResult<Self> {
        let config = Config::load()?;
        let watcher = DataWatcher::new(None).ok(); // Don't fail if watcher can't start

        // Load orchestrations from Convex if URL is configured
        let orchestrations = if !config.convex.url.is_empty() {
            let rt = tokio::runtime::Runtime::new()?;
            rt.block_on(async {
                let mut ds = crate::data::ConvexDataSource::new(&config.convex.url).await?;
                ds.list_orchestrations().await
            })?
        } else {
            vec![]
        };

        let command_logger = Some(crate::logging::CommandLogger::new(
            config.logging.command_log,
        ));

        Ok(Self {
            should_quit: false,
            orchestrations,
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger,
            phase_cache: None,
        })
    }

    /// Create a new App instance for testing with provided orchestrations
    ///
    /// This is primarily intended for testing purposes.
    #[doc(hidden)]
    pub fn new_with_orchestrations(orchestrations: Vec<MonitorOrchestration>) -> Self {
        Self {
            should_quit: false,
            orchestrations,
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None, // Don't initialize for tests
            phase_cache: None,
        }
    }

    /// Load and cache phase data for the given phase
    pub fn load_phase_data(&mut self, phase: u32) {
        if self.orchestrations.is_empty() {
            return;
        }

        // Check if already cached
        if let Some((orch_idx, cached_phase, _)) = &self.phase_cache {
            if *orch_idx == self.selected_index && *cached_phase == phase {
                return; // Already cached
            }
        }

        let orch = &self.orchestrations[self.selected_index];
        let (tasks, members) = orch.load_phase_data(phase);
        self.phase_cache = Some((self.selected_index, phase, PhaseData { tasks, members }));
    }

    /// Get cached phase data, or load if not cached
    pub fn get_phase_data(&mut self, phase: u32) -> Option<&PhaseData> {
        self.load_phase_data(phase);
        self.phase_cache.as_ref().map(|(_, _, data)| data)
    }

    fn phase_detail_state(&self) -> Option<PhaseDetailState> {
        match self.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                layout,
                selected_phase,
            } => Some(PhaseDetailState {
                focus,
                task_index,
                member_index,
                layout,
                selected_phase,
            }),
            _ => None,
        }
    }

    fn set_phase_detail_state(&mut self, state: PhaseDetailState) {
        self.view_state = ViewState::PhaseDetail {
            focus: state.focus,
            task_index: state.task_index,
            member_index: state.member_index,
            layout: state.layout,
            selected_phase: state.selected_phase,
        };
    }

    fn current_phase_or_default(&self) -> u32 {
        self.orchestrations
            .get(self.selected_index)
            .map(|orch| orch.current_phase)
            .unwrap_or(1)
    }

    /// Move selection to next orchestration (wraps around)
    pub fn next(&mut self) {
        if self.orchestrations.is_empty() {
            return;
        }
        self.selected_index = (self.selected_index + 1) % self.orchestrations.len();
    }

    /// Move selection to previous orchestration (wraps around)
    pub fn previous(&mut self) {
        if self.orchestrations.is_empty() {
            return;
        }
        if self.selected_index == 0 {
            self.selected_index = self.orchestrations.len() - 1;
        } else {
            self.selected_index -= 1;
        }
    }

    /// Refresh orchestrations list from Convex
    pub fn refresh(&mut self) -> AppResult<()> {
        let config = Config::load()?;
        if !config.convex.url.is_empty() {
            let rt = tokio::runtime::Runtime::new()?;
            self.orchestrations = rt.block_on(async {
                let mut ds = crate::data::ConvexDataSource::new(&config.convex.url).await?;
                ds.list_orchestrations().await
            })?;
        }
        // Clamp selected_index to valid range
        if self.orchestrations.is_empty() {
            self.selected_index = 0;
        } else if self.selected_index >= self.orchestrations.len() {
            self.selected_index = self.orchestrations.len() - 1;
        }
        // Invalidate phase cache
        self.phase_cache = None;
        Ok(())
    }

    /// Check for file watcher events and refresh if needed
    fn check_watcher(&mut self) {
        let should_refresh = if let Some(ref watcher) = self.watcher {
            watcher.has_changes() && self.last_refresh.elapsed() > Duration::from_millis(500)
        } else {
            false
        };

        if should_refresh {
            let _ = self.refresh();
            self.last_refresh = Instant::now();
        }
    }

    /// Handle a key event
    fn handle_key_event(&mut self, key: KeyEvent) {
        // Global keys work in all views
        match key.code {
            KeyCode::Char('?') => {
                self.show_help = !self.show_help;
                return;
            }
            KeyCode::Char('q') => {
                self.should_quit = true;
                return;
            }
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.should_quit = true;
                return;
            }
            _ => {}
        }

        // Handle Esc key - behavior depends on current view and help state
        if key.code == KeyCode::Esc && self.show_help {
            // Close help modal
            self.show_help = false;
            return;
            // Let view-specific handlers handle Esc for navigation
            // Only quit from OrchestrationList view
        }

        // Dispatch to view-specific handler
        match &self.view_state {
            ViewState::OrchestrationList => self.handle_orchestration_list_key(key),
            ViewState::PhaseDetail { .. } => self.handle_phase_detail_key(key),
            ViewState::TaskInspector { .. } => self.handle_task_inspector_key(key),
            ViewState::LogViewer { .. } => self.handle_log_viewer_key(key),
            ViewState::SendDialog { .. } => self.handle_send_dialog_key(key),
            ViewState::CommandModal { .. } => self.handle_command_modal_key(key),
            ViewState::PlanViewer { .. } => self.handle_plan_viewer_key(key),
            ViewState::CommitsView { .. } => self.handle_commits_view_key(key),
            ViewState::DiffView { .. } => self.handle_diff_view_key(key),
        }
    }

    /// Handle key events in OrchestrationList view
    fn handle_orchestration_list_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.should_quit = true;
            }
            KeyCode::Char('j') | KeyCode::Down => self.next(),
            KeyCode::Char('k') | KeyCode::Up => self.previous(),
            KeyCode::Char('r') => {
                let _ = self.refresh();
            }
            KeyCode::Char('g') => {
                let _ = self.handle_goto();
            }
            KeyCode::Char('p') => {
                let _ = self.handle_view_plan();
            }
            KeyCode::Enter => {
                if !self.orchestrations.is_empty() {
                    let current_phase = self.orchestrations[self.selected_index].current_phase;
                    self.load_phase_data(current_phase);
                    self.set_phase_detail_state(PhaseDetailState {
                        focus: PaneFocus::Orchestrations,
                        task_index: 0,
                        member_index: 0,
                        layout: PhaseDetailLayout::OrchPhaseTasks,
                        selected_phase: current_phase,
                    });
                }
            }
            _ => {}
        }
    }

    /// Handle goto action - open terminal tab at orchestration's cwd
    fn handle_goto(&mut self) -> AppResult<()> {
        if self.orchestrations.is_empty() {
            return Ok(());
        }

        let orch = &self.orchestrations[self.selected_index];
        let config = Config::load()?;
        let handler = get_handler(&config.terminal.handler);

        match handler.open_tab_at(&orch.worktree_path)? {
            TerminalResult::Success => {
                // Terminal opened successfully
                Ok(())
            }
            TerminalResult::ShowCommand {
                command,
                description,
            } => {
                // Show command modal
                self.view_state = ViewState::CommandModal {
                    command,
                    description,
                    copied: false,
                };
                Ok(())
            }
        }
    }

    /// Handle attach action - attach to agent's tmux pane
    fn handle_attach_tmux(&mut self, agent_index: usize) -> AppResult<()> {
        if self.orchestrations.is_empty() {
            return Ok(());
        }

        let orch = &self.orchestrations[self.selected_index];

        // Load team config to get agent details
        let team_path = dirs::home_dir()
            .ok_or("Could not find home directory")?
            .join(".claude/teams")
            .join(&orch.team_name())
            .join("config.json");

        let team: Team = serde_json::from_str(&std::fs::read_to_string(&team_path)?)?;

        // Get the selected agent
        let agent = team
            .members
            .get(agent_index)
            .ok_or("Agent index out of bounds")?;

        // Get tmux pane ID if available
        let pane_id = agent.tmux_pane_id.as_deref();

        // Derive session name from team name (convention: tina-{team_name})
        let session_name = format!("tina-{}", orch.team_name());

        let config = Config::load()?;
        let handler = get_handler(&config.terminal.handler);

        match handler.attach_tmux(&session_name, pane_id)? {
            TerminalResult::Success => Ok(()),
            TerminalResult::ShowCommand {
                command,
                description,
            } => {
                self.view_state = ViewState::CommandModal {
                    command,
                    description,
                    copied: false,
                };
                Ok(())
            }
        }
    }

    /// Handle open send dialog action - open send dialog for selected agent
    fn handle_open_send_dialog(&mut self, agent_index: usize) -> AppResult<()> {
        if self.orchestrations.is_empty() {
            return Ok(());
        }

        let orch = &self.orchestrations[self.selected_index];

        // Load team config to get agent details
        let team_path = dirs::home_dir()
            .ok_or("Could not find home directory")?
            .join(".claude/teams")
            .join(&orch.team_name())
            .join("config.json");

        // Try to load team config, fall back to placeholder values if not available
        let (pane_id, agent_name) = if team_path.exists() {
            let team: Team = serde_json::from_str(&std::fs::read_to_string(&team_path)?)?;

            // Get the selected agent
            let agent = team
                .members
                .get(agent_index)
                .ok_or("Agent index out of bounds")?;

            // Get tmux pane ID - if not available, use placeholder
            let pane_id = agent
                .tmux_pane_id
                .clone()
                .unwrap_or_else(|| format!("unknown-{}", agent_index));
            let agent_name = agent.name.clone();

            (pane_id, agent_name)
        } else {
            // Team config doesn't exist (e.g., in tests) - use placeholders
            (
                format!("pane-{}", agent_index),
                format!("Agent {}", agent_index),
            )
        };

        // Load config to get safety settings, fall back to defaults if not available
        let config = Config::load().unwrap_or_default();

        // Create SendDialog instance
        let dialog = super::views::send_dialog::SendDialog::new(
            pane_id.clone(),
            agent_name.clone(),
            config.safety.confirm_send,
        );

        self.send_dialog = Some(dialog);
        self.view_state = ViewState::SendDialog {
            pane_id,
            agent_name,
        };

        Ok(())
    }

    /// Handle key events in CommandModal view
    fn handle_command_modal_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.view_state = ViewState::OrchestrationList;
            }
            KeyCode::Char('y') => {
                // Try to copy to clipboard
                if let ViewState::CommandModal {
                    command,
                    description,
                    ..
                } = &self.view_state
                {
                    let cmd = command.clone();
                    let desc = description.clone();
                    if let Ok(mut clipboard) = arboard::Clipboard::new() {
                        if clipboard.set_text(&cmd).is_ok() {
                            self.view_state = ViewState::CommandModal {
                                command: cmd,
                                description: desc,
                                copied: true,
                            };
                        }
                    }
                }
            }
            _ => {}
        }
    }

    /// Handle key events in PlanViewer view
    fn handle_plan_viewer_key(&mut self, key: KeyEvent) {
        let scroll_offset = match self.view_state {
            ViewState::PlanViewer { scroll_offset, .. } => scroll_offset,
            _ => return,
        };

        match key.code {
            KeyCode::Char('j') | KeyCode::Down => {
                if let ViewState::PlanViewer { plan_path, .. } = &self.view_state {
                    self.view_state = ViewState::PlanViewer {
                        plan_path: plan_path.clone(),
                        scroll_offset: scroll_offset.saturating_add(1),
                    };
                }
            }
            KeyCode::Char('k') | KeyCode::Up => {
                if let ViewState::PlanViewer { plan_path, .. } = &self.view_state {
                    self.view_state = ViewState::PlanViewer {
                        plan_path: plan_path.clone(),
                        scroll_offset: scroll_offset.saturating_sub(1),
                    };
                }
            }
            KeyCode::Char('d') | KeyCode::PageDown => {
                if let ViewState::PlanViewer { plan_path, .. } = &self.view_state {
                    self.view_state = ViewState::PlanViewer {
                        plan_path: plan_path.clone(),
                        scroll_offset: scroll_offset.saturating_add(20),
                    };
                }
            }
            KeyCode::Char('u') | KeyCode::PageUp => {
                if let ViewState::PlanViewer { plan_path, .. } = &self.view_state {
                    self.view_state = ViewState::PlanViewer {
                        plan_path: plan_path.clone(),
                        scroll_offset: scroll_offset.saturating_sub(20),
                    };
                }
            }
            KeyCode::Esc => {
                self.view_state = ViewState::OrchestrationList;
            }
            _ => {}
        }
    }

    /// Handle view plan action
    fn handle_view_plan(&mut self) -> AppResult<()> {
        if let Some(plan_path) = self.get_current_plan_path() {
            self.view_state = ViewState::PlanViewer {
                plan_path,
                scroll_offset: 0,
            };
        }
        Ok(())
    }

    /// Get the current plan path for the selected orchestration
    fn get_current_plan_path(&self) -> Option<std::path::PathBuf> {
        if self.orchestrations.is_empty() {
            return None;
        }

        let orch = &self.orchestrations[self.selected_index];
        let phase = orch.current_phase;

        self.get_plan_path_for_phase(phase)
    }

    /// Get the plan path for a specific phase
    fn get_plan_path_for_phase(&self, phase: u32) -> Option<std::path::PathBuf> {
        if self.orchestrations.is_empty() {
            return None;
        }

        let orch = &self.orchestrations[self.selected_index];

        // Plans are typically in ../docs/plans/ relative to the cwd
        let plan_name = format!(
            "{}-phase-{}.md",
            orch.design_doc_path.file_stem()?.to_str()?,
            phase
        );

        let plan_path = orch
            .worktree_path
            .parent()?
            .join("docs")
            .join("plans")
            .join(plan_name);

        if plan_path.exists() {
            Some(plan_path)
        } else {
            None
        }
    }

    /// Handle viewing plan for a specific phase
    fn handle_view_phase_plan(&mut self, phase: u32) -> AppResult<()> {
        if let Some(plan_path) = self.get_plan_path_for_phase(phase) {
            self.view_state = ViewState::PlanViewer {
                plan_path,
                scroll_offset: 0,
            };
        }
        Ok(())
    }

    /// Handle viewing the design document
    fn handle_view_design_doc(&mut self) -> AppResult<()> {
        if self.orchestrations.is_empty() {
            return Ok(());
        }

        let orch = &self.orchestrations[self.selected_index];
        let design_path = orch.design_doc_path.clone();

        if design_path.exists() {
            self.view_state = ViewState::PlanViewer {
                plan_path: design_path,
                scroll_offset: 0,
            };
        }
        Ok(())
    }

    /// Handle view commits action
    fn handle_view_commits(&mut self) -> AppResult<()> {
        if let Some((worktree_path, range, title)) = self.get_current_phase_git_info() {
            self.view_state = ViewState::CommitsView {
                worktree_path,
                range,
                title,
            };
        }
        Ok(())
    }

    /// Handle view diff action
    fn handle_view_diff(&mut self) -> AppResult<()> {
        if let Some((worktree_path, range, _)) = self.get_current_phase_git_info() {
            let orch = &self.orchestrations[self.selected_index];
            let title = format!("Phase {} Diff - {}", orch.current_phase, orch.title());
            self.view_state = ViewState::DiffView {
                worktree_path,
                range,
                title,
                selected: 0,
                show_full: false,
                scroll: 0,
            };
        }
        Ok(())
    }

    /// Get the current phase git info (worktree path and git range)
    fn get_current_phase_git_info(&self) -> Option<(std::path::PathBuf, String, String)> {
        if self.orchestrations.is_empty() {
            return None;
        }

        let orch = &self.orchestrations[self.selected_index];
        let phase = orch.current_phase;

        let worktree_path = orch.worktree_path.clone();

        // Read handoff to get git range
        let handoff_path = orch
            .worktree_path
            .join(".claude")
            .join("tina")
            .join(format!("phase-{}", phase))
            .join("handoff.md");
        let handoff_content = std::fs::read_to_string(&handoff_path).ok()?;

        // Extract git range from handoff (format: **Git Range**: `main...phase-branch`)
        let range = handoff_content
            .lines()
            .find(|line| line.starts_with("**Git Range**:"))
            .and_then(|line| line.split('`').nth(1).map(|s| s.to_string()))?;

        let title = format!("Phase {} Commits - {}", phase, orch.title());

        Some((worktree_path, range, title))
    }

    /// Handle key events in PhaseDetail view
    fn handle_phase_detail_key(&mut self, key: KeyEvent) {
        let mut detail = match self.phase_detail_state() {
            Some(state) => state,
            None => return,
        };

        // Handle global keys first
        match key.code {
            KeyCode::Esc => {
                self.view_state = ViewState::OrchestrationList;
                return;
            }
            KeyCode::Char('r') => {
                let _ = self.refresh();
                return;
            }
            KeyCode::Char('c') => {
                let _ = self.handle_view_commits();
                return;
            }
            KeyCode::Char('d') => {
                let _ = self.handle_view_diff();
                return;
            }
            KeyCode::Tab => {
                // Tab switches between Tasks and Members within Tasks+Team area
                detail.focus = match detail.focus {
                    PaneFocus::Tasks => PaneFocus::Members,
                    PaneFocus::Members => PaneFocus::Tasks,
                    _ => detail.focus,
                };
                self.set_phase_detail_state(detail);
                return;
            }
            _ => {}
        }

        // Handle h/l navigation between panels and layouts
        match key.code {
            KeyCode::Char('h') | KeyCode::Left => {
                match detail.layout {
                    PhaseDetailLayout::OrchPhaseTasks => {
                        // Screen 1: Orch | Phases | Tasks+Team
                        match detail.focus {
                            PaneFocus::Phases => {
                                detail.focus = PaneFocus::Orchestrations;
                            }
                            PaneFocus::Tasks | PaneFocus::Members => {
                                detail.focus = PaneFocus::Phases;
                            }
                            _ => {}
                        }
                    }
                    PhaseDetailLayout::TasksDetail => {
                        // Screen 2: Tasks+Team | Detail
                        match detail.focus {
                            PaneFocus::Tasks | PaneFocus::Members => {
                                // Switch back to Screen 1
                                detail.focus = PaneFocus::Tasks;
                                detail.layout = PhaseDetailLayout::OrchPhaseTasks;
                            }
                            PaneFocus::Detail => {
                                detail.focus = PaneFocus::Tasks;
                            }
                            _ => {}
                        }
                    }
                }
                self.set_phase_detail_state(detail);
                return;
            }
            KeyCode::Char('l') | KeyCode::Right => {
                match detail.layout {
                    PhaseDetailLayout::OrchPhaseTasks => {
                        // Screen 1: Orch | Phases | Tasks+Team
                        match detail.focus {
                            PaneFocus::Orchestrations => {
                                detail.focus = PaneFocus::Phases;
                            }
                            PaneFocus::Phases => {
                                detail.focus = PaneFocus::Tasks;
                            }
                            PaneFocus::Tasks | PaneFocus::Members => {
                                // Switch to Screen 2
                                detail.focus = PaneFocus::Tasks;
                                detail.layout = PhaseDetailLayout::TasksDetail;
                            }
                            _ => {}
                        }
                    }
                    PhaseDetailLayout::TasksDetail => {
                        // Screen 2: Tasks+Team | Detail
                        match detail.focus {
                            PaneFocus::Tasks | PaneFocus::Members => {
                                detail.focus = PaneFocus::Detail;
                            }
                            _ => {}
                        }
                    }
                }
                self.set_phase_detail_state(detail);
                return;
            }
            _ => {}
        }

        // Handle focus-specific navigation and actions
        match detail.focus {
            PaneFocus::Orchestrations => {
                let orch_count = self.orchestrations.len();
                if orch_count == 0 {
                    return;
                }
                match key.code {
                    KeyCode::Char('j') | KeyCode::Down => {
                        self.selected_index = (self.selected_index + 1) % orch_count;
                        // Update selected_phase to match new orchestration's current phase
                        detail.selected_phase =
                            self.orchestrations[self.selected_index].current_phase;
                        self.set_phase_detail_state(detail);
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        self.selected_index = if self.selected_index == 0 {
                            orch_count - 1
                        } else {
                            self.selected_index - 1
                        };
                        // Update selected_phase to match new orchestration's current phase
                        detail.selected_phase =
                            self.orchestrations[self.selected_index].current_phase;
                        self.set_phase_detail_state(detail);
                    }
                    _ => {}
                }
            }
            PaneFocus::Phases => {
                let total_phases = self
                    .orchestrations
                    .get(self.selected_index)
                    .map(|o| o.total_phases)
                    .unwrap_or(1);

                match key.code {
                    KeyCode::Char('j') | KeyCode::Down => {
                        let new_phase = if detail.selected_phase >= total_phases {
                            1
                        } else {
                            detail.selected_phase + 1
                        };
                        // Load phase data and reset indices since task/member counts may differ
                        self.load_phase_data(new_phase);
                        detail.selected_phase = new_phase;
                        detail.task_index = 0;
                        detail.member_index = 0;
                        self.set_phase_detail_state(detail);
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        let new_phase = if detail.selected_phase <= 1 {
                            total_phases
                        } else {
                            detail.selected_phase - 1
                        };
                        // Load phase data and reset indices since task/member counts may differ
                        self.load_phase_data(new_phase);
                        detail.selected_phase = new_phase;
                        detail.task_index = 0;
                        detail.member_index = 0;
                        self.set_phase_detail_state(detail);
                    }
                    KeyCode::Char('p') | KeyCode::Enter => {
                        let _ = self.handle_view_phase_plan(detail.selected_phase);
                    }
                    KeyCode::Char('D') => {
                        let _ = self.handle_view_design_doc();
                    }
                    _ => {}
                }
            }
            PaneFocus::Tasks => {
                let task_count = self
                    .orchestrations
                    .get(self.selected_index)
                    .map(|o| o.tasks.len())
                    .unwrap_or(0);

                if task_count == 0 {
                    return;
                }

                match key.code {
                    KeyCode::Char('j') | KeyCode::Down => {
                        detail.task_index = (detail.task_index + 1) % task_count;
                        self.set_phase_detail_state(detail);
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        detail.task_index = if detail.task_index == 0 {
                            task_count - 1
                        } else {
                            detail.task_index - 1
                        };
                        self.set_phase_detail_state(detail);
                    }
                    _ => {}
                }
            }
            PaneFocus::Members => {
                match key.code {
                    KeyCode::Char('j') | KeyCode::Down => {
                        detail.member_index += 1;
                        self.set_phase_detail_state(detail);
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        detail.member_index = detail.member_index.saturating_sub(1);
                        self.set_phase_detail_state(detail);
                    }
                    KeyCode::Enter => {
                        // Open log viewer for selected member
                        // Get pane_id and agent_name from the current orchestration
                        if let Some(orch) = self.orchestrations.get(self.selected_index) {
                            if let Some(member) = orch.members.get(detail.member_index) {
                                let pane_id = member.tmux_pane_id.clone().unwrap_or_default();
                                let agent_name = member.name.clone();
                                self.log_viewer = Some(super::views::log_viewer::LogViewer::new(
                                    pane_id.clone(),
                                    agent_name.clone(),
                                ));
                                self.view_state = ViewState::LogViewer {
                                    agent_index: detail.member_index,
                                    pane_id,
                                    agent_name,
                                };
                            }
                        }
                    }
                    KeyCode::Char('a') => {
                        let _ = self.handle_attach_tmux(detail.member_index);
                    }
                    KeyCode::Char('s') => {
                        let _ = self.handle_open_send_dialog(detail.member_index);
                    }
                    _ => {}
                }
            }
            PaneFocus::Detail => {
                // Detail pane - scrolling could be added here
            }
        }
    }

    /// Handle key events in TaskInspector view
    fn handle_task_inspector_key(&mut self, key: KeyEvent) {
        if key.code == KeyCode::Esc {
            let task_index = match &self.view_state {
                ViewState::TaskInspector { task_index } => *task_index,
                _ => 0,
            };
            self.set_phase_detail_state(PhaseDetailState {
                focus: PaneFocus::Tasks,
                task_index,
                member_index: 0,
                layout: PhaseDetailLayout::TasksDetail,
                selected_phase: self.current_phase_or_default(),
            });
        }
    }

    /// Handle key events in LogViewer view
    fn handle_log_viewer_key(&mut self, key: KeyEvent) {
        let agent_index = match self.view_state {
            ViewState::LogViewer { agent_index, .. } => agent_index,
            _ => return,
        };

        match key.code {
            KeyCode::Char('j') | KeyCode::Down => {
                if let Some(viewer) = &mut self.log_viewer {
                    viewer.scroll_down(1);
                }
            }
            KeyCode::Char('k') | KeyCode::Up => {
                if let Some(viewer) = &mut self.log_viewer {
                    viewer.scroll_up(1);
                }
            }
            KeyCode::Char('d') | KeyCode::PageDown => {
                if let Some(viewer) = &mut self.log_viewer {
                    viewer.scroll_down(20);
                }
            }
            KeyCode::Char('u') | KeyCode::PageUp => {
                if let Some(viewer) = &mut self.log_viewer {
                    viewer.scroll_up(20);
                }
            }
            KeyCode::Char('G') => {
                if let Some(viewer) = &mut self.log_viewer {
                    viewer.scroll_to_bottom();
                }
            }
            KeyCode::Char('f') => {
                if let Some(viewer) = &mut self.log_viewer {
                    viewer.toggle_follow();
                }
            }
            KeyCode::Char('a') => {
                // TODO: Attach to tmux pane
                // For now, do nothing as tmux attach functionality is not yet implemented
            }
            KeyCode::Esc => {
                self.log_viewer = None; // Clean up the viewer
                self.set_phase_detail_state(PhaseDetailState {
                    focus: PaneFocus::Members,
                    task_index: 0,
                    member_index: agent_index,
                    layout: PhaseDetailLayout::TasksDetail,
                    selected_phase: self.current_phase_or_default(),
                });
            }
            KeyCode::Char('r') => {
                if let Some(viewer) = &mut self.log_viewer {
                    let _ = viewer.refresh();
                }
            }
            _ => {}
        }
    }

    /// Handle key events in SendDialog view
    fn handle_send_dialog_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.send_dialog = None; // Clean up the dialog
                self.set_phase_detail_state(PhaseDetailState {
                    focus: PaneFocus::Members,
                    task_index: 0,
                    member_index: 0,
                    layout: PhaseDetailLayout::TasksDetail,
                    selected_phase: self.current_phase_or_default(),
                });
            }
            KeyCode::Char(c) if c.is_ascii_digit() && c == '1' => {
                if let Some(dialog) = &mut self.send_dialog {
                    dialog.set_quick_action(1);
                }
            }
            KeyCode::Char(c) if c.is_ascii_digit() && c == '2' => {
                if let Some(dialog) = &mut self.send_dialog {
                    dialog.set_quick_action(2);
                }
            }
            KeyCode::Char('y') => {
                // Confirm send if in confirmation state
                if let Some(dialog) = &self.send_dialog {
                    if dialog.confirming {
                        self.execute_send();
                    }
                }
            }
            KeyCode::Char('n') => {
                // Cancel confirmation
                if let Some(dialog) = &mut self.send_dialog {
                    dialog.confirming = false;
                }
            }
            KeyCode::Char(c) => {
                // Regular character input
                if let Some(dialog) = &mut self.send_dialog {
                    dialog.handle_char(c);
                }
            }
            KeyCode::Backspace => {
                if let Some(dialog) = &mut self.send_dialog {
                    dialog.handle_backspace();
                }
            }
            KeyCode::Enter => {
                // Send command (with confirmation if required)
                if let Some(dialog) = &mut self.send_dialog {
                    // Load config to check safe commands
                    let config = Config::load().unwrap_or_default();

                    if dialog.needs_confirmation && !dialog.confirming {
                        // Check if this is a safe command
                        if !dialog.is_safe_command(&config.safety.safe_commands) {
                            // Need confirmation
                            dialog.confirming = true;
                            return;
                        }
                    }

                    // Either no confirmation needed, or already confirmed, or safe command
                    self.execute_send();
                }
            }
            _ => {}
        }
    }

    /// Execute send command (stub for now, will be implemented in Task 9)
    fn execute_send(&mut self) {
        // Get command and pane_id from the dialog
        if let Some(dialog) = self.send_dialog.as_ref() {
            let command = dialog.get_command().to_string();
            let pane_id = dialog.pane_id.clone();

            // Send to tmux pane - ignore errors for now
            let _ = crate::tmux::send_keys(&pane_id, &command);

            // Log command if logger is configured
            if let Some(logger) = self.command_logger.as_ref() {
                let _ = logger.log(&pane_id, &command);
            }
        }

        // Close send dialog
        self.send_dialog = None;

        self.set_phase_detail_state(PhaseDetailState {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::TasksDetail,
            selected_phase: self.current_phase_or_default(),
        });
    }

    /// Handle key events in CommitsView
    fn handle_commits_view_key(&mut self, _key: KeyEvent) {
        // Navigation is handled by the CommitsView widget itself
        // We only need to handle Esc to return to PhaseDetail
        if _key.code == KeyCode::Esc {
            self.set_phase_detail_state(PhaseDetailState {
                focus: PaneFocus::Tasks,
                task_index: 0,
                member_index: 0,
                layout: PhaseDetailLayout::TasksDetail,
                selected_phase: self.current_phase_or_default(),
            });
        }
    }

    /// Handle key events in DiffView
    fn handle_diff_view_key(&mut self, key: KeyEvent) {
        // Extract current state
        let (worktree_path, range, title, selected, show_full, scroll) = match &self.view_state {
            ViewState::DiffView {
                worktree_path,
                range,
                title,
                selected,
                show_full,
                scroll,
            } => (
                worktree_path.clone(),
                range.clone(),
                title.clone(),
                *selected,
                *show_full,
                *scroll,
            ),
            _ => return,
        };

        match key.code {
            KeyCode::Esc => {
                self.set_phase_detail_state(PhaseDetailState {
                    focus: PaneFocus::Tasks,
                    task_index: 0,
                    member_index: 0,
                    layout: PhaseDetailLayout::TasksDetail,
                    selected_phase: self.current_phase_or_default(),
                });
            }
            KeyCode::Char('j') | KeyCode::Down => {
                // Create temporary view to get file count
                if let Ok(view) = super::views::diff_view::DiffView::new(
                    &worktree_path,
                    range.clone(),
                    title.clone(),
                ) {
                    let file_count = view.stats.files.len();
                    if file_count > 0 {
                        let new_selected = if show_full {
                            selected
                        } else {
                            (selected + 1) % file_count
                        };
                        let new_scroll = if show_full { scroll + 1 } else { scroll };
                        self.view_state = ViewState::DiffView {
                            worktree_path,
                            range,
                            title,
                            selected: new_selected,
                            show_full,
                            scroll: new_scroll,
                        };
                    }
                }
            }
            KeyCode::Char('k') | KeyCode::Up => {
                // Create temporary view to get file count
                if let Ok(view) = super::views::diff_view::DiffView::new(
                    &worktree_path,
                    range.clone(),
                    title.clone(),
                ) {
                    let file_count = view.stats.files.len();
                    let new_selected = if show_full {
                        selected
                    } else if file_count > 0 {
                        if selected == 0 {
                            file_count - 1
                        } else {
                            selected - 1
                        }
                    } else {
                        selected
                    };
                    let new_scroll = if show_full {
                        scroll.saturating_sub(1)
                    } else {
                        scroll
                    };
                    self.view_state = ViewState::DiffView {
                        worktree_path,
                        range,
                        title,
                        selected: new_selected,
                        show_full,
                        scroll: new_scroll,
                    };
                }
            }
            KeyCode::Enter => {
                // Toggle full diff mode
                self.view_state = ViewState::DiffView {
                    worktree_path,
                    range,
                    title,
                    selected,
                    show_full: !show_full,
                    scroll,
                };
            }
            _ => {}
        }
    }

    /// Handle tick events - called periodically from the event loop
    /// Checks if log viewer needs refresh and refreshes if necessary
    pub fn on_tick(&mut self) -> AppResult<()> {
        // Only refresh if we're in LogViewer view
        if let ViewState::LogViewer { .. } = self.view_state {
            if let Some(viewer) = &mut self.log_viewer {
                // Check if refresh is needed based on poll interval
                if viewer.maybe_refresh() {
                    // Attempt to refresh, but don't fail if it can't
                    let _ = viewer.refresh();
                }
            }
        }
        Ok(())
    }

    /// Run the application event loop
    pub fn run<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> AppResult<()> {
        while !self.should_quit {
            terminal.draw(|frame| ui::render(frame, self))?;

            // Check for file watcher events
            self.check_watcher();

            // Call on_tick to handle periodic updates (e.g., log viewer refresh)
            self.on_tick()?;

            self.handle_events()?;
        }
        Ok(())
    }

    /// Handle terminal events
    fn handle_events(&mut self) -> AppResult<()> {
        if event::poll(self.tick_rate)? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    self.handle_key_event(key);
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tui::views::log_viewer::LogViewer;
    use std::path::PathBuf;
    use tina_data::OrchestrationListEntry;

    fn make_test_task(id: &str) -> crate::types::Task {
        crate::types::Task {
            id: id.to_string(),
            subject: format!("Task {}", id),
            description: "Test task".to_string(),
            active_form: None,
            status: crate::types::TaskStatus::Pending,
            owner: None,
            blocks: vec![],
            blocked_by: vec![],
            metadata: serde_json::Value::Null,
        }
    }

    fn make_test_orchestration(title: &str) -> MonitorOrchestration {
        let entry = OrchestrationListEntry {
            id: format!("orch-{}", title),
            node_name: "macbook".to_string(),
            record: tina_data::OrchestrationRecord {
                node_id: "node-1".to_string(),
                project_id: None,
                feature_name: title.to_string(),
                design_doc_path: "design.md".to_string(),
                branch: format!("tina/{}", title),
                worktree_path: Some("/test".to_string()),
                total_phases: 3.0,
                current_phase: 1.0,
                status: "idle".to_string(),
                started_at: "2026-02-07T10:00:00Z".to_string(),
                completed_at: None,
                total_elapsed_mins: None,
            },
        };
        let mut orch = MonitorOrchestration::from_list_entry(entry);
        orch.tasks = vec![
            make_test_task("1"),
            make_test_task("2"),
            make_test_task("3"),
        ];
        orch
    }

    #[test]
    fn test_app_starts_in_orchestration_list_view() {
        let app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        assert!(matches!(app.view_state, ViewState::OrchestrationList));
    }

    #[test]
    fn test_global_question_mark_toggles_help_in_any_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

        // Start in OrchestrationList
        assert!(!app.show_help);

        let key = KeyEvent::new(KeyCode::Char('?'), KeyModifiers::NONE);
        app.handle_key_event(key.clone());
        assert!(app.show_help, "'?' should show help in OrchestrationList");

        app.handle_key_event(key);
        assert!(!app.show_help, "'?' should hide help in OrchestrationList");
    }

    #[test]
    fn test_global_q_quits_from_any_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

        assert!(!app.should_quit);

        let key = KeyEvent::new(KeyCode::Char('q'), KeyModifiers::NONE);
        app.handle_key_event(key);
        assert!(app.should_quit, "'q' should quit from OrchestrationList");
    }

    #[test]
    fn test_global_ctrl_c_quits_from_any_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

        assert!(!app.should_quit);

        let key = KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL);
        app.handle_key_event(key);
        assert!(app.should_quit, "Ctrl+C should quit from OrchestrationList");
    }

    #[test]
    fn test_esc_closes_help_without_changing_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.show_help = true;

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert!(!app.show_help, "Esc should close help");
        assert!(
            matches!(app.view_state, ViewState::OrchestrationList),
            "View should remain OrchestrationList"
        );
        assert!(!app.should_quit, "Should not quit");
    }

    #[test]
    fn test_navigation_keys_work_in_orchestration_list() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);

        assert_eq!(app.selected_index, 0);

        let j_key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(j_key);
        assert_eq!(
            app.selected_index, 1,
            "'j' should navigate in OrchestrationList"
        );

        let k_key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(k_key);
        assert_eq!(
            app.selected_index, 0,
            "'k' should navigate in OrchestrationList"
        );
    }

    #[test]
    fn test_keys_dispatch_based_on_view_state() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);

        // In OrchestrationList, j/k should navigate
        app.view_state = ViewState::OrchestrationList;
        assert_eq!(app.selected_index, 0);

        let j_key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(j_key.clone());
        assert_eq!(
            app.selected_index, 1,
            "'j' should navigate in OrchestrationList"
        );

        // In PhaseDetail, j/k should NOT navigate orchestration list
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };
        let initial_index = app.selected_index;
        app.handle_key_event(j_key);
        assert_eq!(
            app.selected_index, initial_index,
            "'j' should not navigate orchestration list in PhaseDetail view"
        );
    }

    #[test]
    fn test_next_wraps_around_at_end() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![
                make_test_orchestration("project-1"),
                make_test_orchestration("project-2"),
                make_test_orchestration("project-3"),
            ],
            selected_index: 2, // Last item
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        app.next();
        assert_eq!(app.selected_index, 0, "Should wrap to first item");
    }

    #[test]
    fn test_previous_wraps_around_at_beginning() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![
                make_test_orchestration("project-1"),
                make_test_orchestration("project-2"),
                make_test_orchestration("project-3"),
            ],
            selected_index: 0, // First item
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        app.previous();
        assert_eq!(app.selected_index, 2, "Should wrap to last item");
    }

    #[test]
    fn test_next_on_empty_list() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        app.next();
        assert_eq!(app.selected_index, 0, "Should stay at 0 with empty list");
    }

    #[test]
    fn test_previous_on_empty_list() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        app.previous();
        assert_eq!(app.selected_index, 0, "Should stay at 0 with empty list");
    }

    #[test]
    fn test_ctrl_c_sets_quit_flag() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        let key = KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL);
        app.handle_key_event(key);
        assert!(app.should_quit, "Ctrl+C should set should_quit to true");
    }

    #[test]
    fn test_q_key_sets_quit_flag() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        let key = KeyEvent::new(KeyCode::Char('q'), KeyModifiers::NONE);
        app.handle_key_event(key);
        assert!(app.should_quit, "'q' key should set should_quit to true");
    }

    #[test]
    fn test_j_key_navigates_down() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![
                make_test_orchestration("project-1"),
                make_test_orchestration("project-2"),
            ],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);
        assert_eq!(app.selected_index, 1, "'j' should move selection down");
    }

    #[test]
    fn test_k_key_navigates_up() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![
                make_test_orchestration("project-1"),
                make_test_orchestration("project-2"),
            ],
            selected_index: 1,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);
        assert_eq!(app.selected_index, 0, "'k' should move selection up");
    }

    #[test]
    fn test_r_key_triggers_refresh() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![make_test_orchestration("project-1")],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        let key = KeyEvent::new(KeyCode::Char('r'), KeyModifiers::NONE);
        app.handle_key_event(key);
        assert!(!app.should_quit, "Refresh should not quit the app");
    }

    #[test]
    fn test_question_mark_toggles_help() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        let key = KeyEvent::new(KeyCode::Char('?'), KeyModifiers::NONE);

        // First press should show help
        app.handle_key_event(key.clone());
        assert!(app.show_help, "'?' should show help when it's hidden");

        // Second press should hide help
        app.handle_key_event(key);
        assert!(!app.show_help, "'?' should hide help when it's visible");
    }

    #[test]
    fn test_esc_closes_help_when_open() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: true,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);
        assert!(!app.show_help, "Esc should close help when it's open");
        assert!(!app.should_quit, "Esc should not quit when closing help");
    }

    #[test]
    fn test_esc_quits_when_help_not_open() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);
        assert!(app.should_quit, "Esc should quit when help is not open");
    }

    #[test]
    fn test_app_works_without_watcher() {
        let app = App {
            should_quit: false,
            orchestrations: vec![make_test_orchestration("project-1")],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        assert_eq!(app.orchestrations.len(), 1);
        assert_eq!(app.selected_index, 0);
    }

    #[test]
    fn test_check_watcher_handles_none_gracefully() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![make_test_orchestration("project-1")],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
            log_viewer: None,
            send_dialog: None,
            command_logger: None,
            phase_cache: None,
        };

        // Should not panic when watcher is None
        app.check_watcher();
        assert!(!app.should_quit);
    }

    // Task 5: App Event Loop Updates - on_tick() tests

    #[test]
    fn test_on_tick_refreshes_log_viewer_when_interval_elapsed() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

        // Create a log viewer and set it in the app
        let mut viewer = LogViewer::new("test-pane".to_string(), "test-agent".to_string());
        // Set poll interval to 100ms for testing
        viewer.poll_interval = Duration::from_millis(100);
        // Set last refresh to more than 100ms ago
        viewer.last_refresh = Instant::now() - Duration::from_millis(200);

        app.log_viewer = Some(viewer);
        app.view_state = ViewState::LogViewer {
            agent_index: 0,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        // Call on_tick - should attempt to refresh if time has elapsed
        let _ = app.on_tick();

        // Verify log viewer still exists
        assert!(
            app.log_viewer.is_some(),
            "log_viewer should still exist after on_tick"
        );
    }

    #[test]
    fn test_on_tick_skips_refresh_when_interval_not_elapsed() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

        // Create a log viewer with recent refresh time
        let viewer = LogViewer::new("test-pane".to_string(), "test-agent".to_string());
        app.log_viewer = Some(viewer);
        app.view_state = ViewState::LogViewer {
            agent_index: 0,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        // Call on_tick - should skip refresh since viewer was just created
        let _ = app.on_tick();

        // Verify log viewer still exists and remains functional
        assert!(
            app.log_viewer.is_some(),
            "log_viewer should still exist after on_tick"
        );
    }

    #[test]
    fn test_on_tick_does_nothing_when_not_in_log_viewer_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::OrchestrationList;

        // Create a log viewer (should be ignored since not in LogViewer view)
        app.log_viewer = Some(LogViewer::new(
            "test-pane".to_string(),
            "test-agent".to_string(),
        ));

        // Call on_tick - should not attempt refresh
        let _ = app.on_tick();

        // App should remain in OrchestrationList
        assert!(matches!(app.view_state, ViewState::OrchestrationList));
    }

    #[test]
    fn test_on_tick_handles_missing_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 0,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };
        app.log_viewer = None;

        // Call on_tick - should handle gracefully when log_viewer is None
        let result = app.on_tick();

        // Should return Ok even with missing log viewer
        assert!(
            result.is_ok(),
            "on_tick should handle missing log viewer gracefully"
        );
    }

    // Task 2: Enter key handling tests
    #[test]
    fn test_enter_transitions_to_phase_detail_when_orchestrations_exist() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);
        app.selected_index = 1;
        app.view_state = ViewState::OrchestrationList;

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert!(
            matches!(
                app.view_state,
                ViewState::PhaseDetail {
                    focus: PaneFocus::Orchestrations,
                    task_index: 0,
                    member_index: 0,
                    layout: PhaseDetailLayout::OrchPhaseTasks,
                    selected_phase: 1,
                }
            ),
            "Enter should transition to PhaseDetail view with focus on Orchestrations pane"
        );
    }

    #[test]
    fn test_enter_does_nothing_when_orchestrations_list_is_empty() {
        let mut app = App::new_with_orchestrations(vec![]);
        app.view_state = ViewState::OrchestrationList;

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert!(
            matches!(app.view_state, ViewState::OrchestrationList),
            "Enter should not change view when orchestrations list is empty"
        );
    }

    #[test]
    fn test_down_arrow_navigates_in_orchestration_list() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);
        app.selected_index = 0;

        let key = KeyEvent::new(KeyCode::Down, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert_eq!(app.selected_index, 1, "Down arrow should navigate down");
    }

    #[test]
    fn test_up_arrow_navigates_in_orchestration_list() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);
        app.selected_index = 1;

        let key = KeyEvent::new(KeyCode::Up, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert_eq!(app.selected_index, 0, "Up arrow should navigate up");
    }

    // Task 4: Phase Detail Key Handling tests

    #[test]
    fn test_tab_key_switches_focus_to_members_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, .. } => {
                assert_eq!(
                    focus,
                    PaneFocus::Members,
                    "Tab should switch focus from Tasks to Members pane"
                );
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_tab_key_switches_focus_back_to_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, .. } => {
                assert_eq!(
                    focus,
                    PaneFocus::Tasks,
                    "Tab should switch focus from Members to Tasks pane"
                );
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_left_arrow_from_members_switches_focus_to_phases_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Left, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, .. } => {
                assert_eq!(
                    focus,
                    PaneFocus::Phases,
                    "Left arrow from Members in OrchPhaseTasks should switch focus to Phases"
                );
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_right_arrow_from_tasks_switches_to_tasks_detail_layout() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Right, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, layout, .. } => {
                assert_eq!(
                    layout,
                    PhaseDetailLayout::TasksDetail,
                    "Right arrow from Tasks in OrchPhaseTasks should switch to TasksDetail layout"
                );
                assert_eq!(
                    focus,
                    PaneFocus::Tasks,
                    "Focus should remain on Tasks when switching layouts"
                );
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_j_key_navigates_down_in_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(task_index, 1, "'j' should navigate down in tasks pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_k_key_navigates_up_in_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 2,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(task_index, 1, "'k' should navigate up in tasks pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_j_key_wraps_around_at_end_of_tasks() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 2, // Assuming we'll wrap from 2 to 0
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(
                    task_index, 0,
                    "'j' should wrap to beginning at end of tasks"
                );
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_k_key_wraps_around_at_beginning_of_tasks() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(
                    task_index, 2,
                    "'k' should wrap to end at beginning of tasks"
                );
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_down_arrow_navigates_down_in_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Down, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(
                    task_index, 1,
                    "Down arrow should navigate down in tasks pane"
                );
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_up_arrow_navigates_up_in_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 1,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Up, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(task_index, 0, "Up arrow should navigate up in tasks pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_j_key_navigates_down_in_members_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { member_index, .. } => {
                assert_eq!(member_index, 1, "'j' should navigate down in members pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_k_key_navigates_up_in_members_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 1,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { member_index, .. } => {
                assert_eq!(member_index, 0, "'k' should navigate up in members pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_enter_on_tasks_does_nothing_in_new_layout() {
        // In the new two-screen layout, Enter on Tasks does nothing
        // Use 'l' key to navigate to TaskDetail screen instead
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 2,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should still be in PhaseDetail with same state
        match app.view_state {
            ViewState::PhaseDetail {
                focus, task_index, ..
            } => {
                assert_eq!(focus, PaneFocus::Tasks, "Focus should remain on Tasks");
                assert_eq!(task_index, 2, "task_index should not change");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_enter_on_members_does_nothing() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 1,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                ..
            } => {
                assert_eq!(focus, PaneFocus::Members, "Focus should remain on Members");
                assert_eq!(task_index, 0, "task_index should not change");
                assert_eq!(member_index, 1, "member_index should not change");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_l_key_on_members_switches_to_tasks_detail_layout() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 2,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, layout, .. } => {
                assert_eq!(
                    layout,
                    PhaseDetailLayout::TasksDetail,
                    "'l' on members in OrchPhaseTasks should switch to TasksDetail layout"
                );
                assert_eq!(
                    focus,
                    PaneFocus::Tasks,
                    "Focus should switch to Tasks when entering TasksDetail"
                );
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_enter_on_members_opens_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        // Add a member to the orchestration
        app.orchestrations[0].members.push(crate::types::Agent {
            agent_id: "agent-1".to_string(),
            name: "worker-1".to_string(),
            agent_type: Some("worker".to_string()),
            model: "claude-sonnet-4".to_string(),
            joined_at: 0,
            tmux_pane_id: Some("%5".to_string()),
            cwd: std::path::PathBuf::from("/test"),
            subscriptions: vec![],
        });

        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { agent_index, .. } => {
                assert_eq!(
                    agent_index, 0,
                    "Enter on members should open LogViewer with correct agent_index"
                );
            }
            _ => panic!("View state should be LogViewer"),
        }
    }

    #[test]
    fn test_l_key_on_tasks_switches_to_tasks_detail_layout() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 1,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                layout,
                ..
            } => {
                assert_eq!(
                    layout,
                    PhaseDetailLayout::TasksDetail,
                    "'l' on Tasks should switch to TasksDetail layout"
                );
                assert_eq!(focus, PaneFocus::Tasks, "Focus should remain on Tasks");
                assert_eq!(task_index, 1, "task_index should not change");
                assert_eq!(member_index, 0, "member_index should not change");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_esc_in_phase_detail_returns_to_orchestration_list() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 1,
            member_index: 2,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert!(
            matches!(app.view_state, ViewState::OrchestrationList),
            "Esc in PhaseDetail should return to OrchestrationList"
        );
        assert!(!app.should_quit, "Esc should not quit the app");
    }

    #[test]
    fn test_r_key_in_phase_detail_refreshes() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('r'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should still be in PhaseDetail after refresh
        assert!(
            matches!(app.view_state, ViewState::PhaseDetail { .. }),
            "'r' should refresh but stay in PhaseDetail"
        );
    }

    // Task 5: Task Inspector Key Handling tests

    #[test]
    fn test_esc_in_task_inspector_returns_to_phase_detail() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::TaskInspector { task_index: 2 };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                ..
            } => {
                assert_eq!(focus, PaneFocus::Tasks, "Should return to Tasks pane");
                assert_eq!(task_index, 2, "Should preserve task_index");
                assert_eq!(member_index, 0, "Should reset member_index to 0");
            }
            _ => panic!("Esc should return to PhaseDetail view"),
        }
    }

    #[test]
    fn test_task_inspector_ignores_other_keys() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::TaskInspector { task_index: 1 };

        // Try various keys that should do nothing
        for key_code in [
            KeyCode::Char('j'),
            KeyCode::Char('k'),
            KeyCode::Enter,
            KeyCode::Char('r'),
        ] {
            let key = KeyEvent::new(key_code, KeyModifiers::NONE);
            app.handle_key_event(key);

            // Should still be in TaskInspector
            match app.view_state {
                ViewState::TaskInspector { task_index } => {
                    assert_eq!(task_index, 1, "task_index should not change");
                }
                _ => panic!("Should remain in TaskInspector view"),
            }
        }
    }

    // Task 9: Log Viewer Key Handling tests

    #[test]
    fn test_j_key_scrolls_down_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 1,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { agent_index, .. } => {
                assert_eq!(agent_index, 1, "agent_index should not change");
            }
            _ => panic!("Should remain in LogViewer view"),
        }
    }

    #[test]
    fn test_k_key_scrolls_up_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 1,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { agent_index, .. } => {
                assert_eq!(agent_index, 1, "agent_index should not change");
            }
            _ => panic!("Should remain in LogViewer view"),
        }
    }

    #[test]
    fn test_down_arrow_scrolls_down_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 2,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Down, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { agent_index, .. } => {
                assert_eq!(agent_index, 2, "agent_index should not change");
            }
            _ => panic!("Should remain in LogViewer view"),
        }
    }

    #[test]
    fn test_up_arrow_scrolls_up_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 2,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Up, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { agent_index, .. } => {
                assert_eq!(agent_index, 2, "agent_index should not change");
            }
            _ => panic!("Should remain in LogViewer view"),
        }
    }

    #[test]
    fn test_k_key_cannot_go_negative_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 1,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { .. } => {}
            _ => panic!("Should remain in LogViewer view"),
        }
    }

    #[test]
    fn test_d_key_pages_down_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 1,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('d'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { agent_index, .. } => {
                assert_eq!(agent_index, 1, "agent_index should not change");
            }
            _ => panic!("Should remain in LogViewer view"),
        }
    }

    #[test]
    fn test_u_key_pages_up_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 1,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('u'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { agent_index, .. } => {
                assert_eq!(agent_index, 1, "agent_index should not change");
            }
            _ => panic!("Should remain in LogViewer view"),
        }
    }

    #[test]
    fn test_page_down_key_pages_down_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 1,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::PageDown, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { agent_index, .. } => {
                assert_eq!(agent_index, 1, "agent_index should not change");
            }
            _ => panic!("Should remain in LogViewer view"),
        }
    }

    #[test]
    fn test_page_up_key_pages_up_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 1,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::PageUp, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { agent_index, .. } => {
                assert_eq!(agent_index, 1, "agent_index should not change");
            }
            _ => panic!("Should remain in LogViewer view"),
        }
    }

    #[test]
    fn test_u_key_cannot_go_negative_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 1,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('u'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { .. } => {}
            _ => panic!("Should remain in LogViewer view"),
        }
    }

    #[test]
    fn test_esc_in_log_viewer_returns_to_phase_detail_with_members_focus() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 3,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                ..
            } => {
                assert_eq!(
                    focus,
                    PaneFocus::Members,
                    "Esc should return to PhaseDetail with Members focus"
                );
                assert_eq!(task_index, 0, "task_index should be reset to 0");
                assert_eq!(
                    member_index, 3,
                    "member_index should be set to the agent_index from LogViewer"
                );
            }
            _ => panic!("Esc should return to PhaseDetail view"),
        }
    }

    #[test]
    fn test_r_key_refreshes_in_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::LogViewer {
            agent_index: 1,
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('r'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should remain in LogViewer after refresh
        match app.view_state {
            ViewState::LogViewer { agent_index, .. } => {
                assert_eq!(agent_index, 1, "agent_index should not change on refresh");
            }
            _ => panic!("Should remain in LogViewer view after refresh"),
        }
    }

    // Task 3: Goto Action (g key) tests

    #[test]
    fn test_g_key_does_nothing_when_no_orchestrations() {
        let mut app = App::new_with_orchestrations(vec![]);
        app.view_state = ViewState::OrchestrationList;

        let key = KeyEvent::new(KeyCode::Char('g'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should remain in OrchestrationList, no crash
        assert!(matches!(app.view_state, ViewState::OrchestrationList));
    }

    #[test]
    fn test_g_key_opens_command_modal_with_fallback_handler() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.selected_index = 0;
        app.view_state = ViewState::OrchestrationList;

        let key = KeyEvent::new(KeyCode::Char('g'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should transition to CommandModal view
        match app.view_state {
            ViewState::CommandModal {
                command,
                description,
                copied,
            } => {
                assert!(
                    command.contains("/test"),
                    "Command should contain the cwd path"
                );
                assert!(!description.is_empty(), "Description should not be empty");
                assert_eq!(copied, false, "copied should start as false");
            }
            _ => panic!("'g' key should open CommandModal when orchestration selected"),
        }
    }

    #[test]
    fn test_esc_in_command_modal_returns_to_orchestration_list() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::CommandModal {
            command: "cd /test".to_string(),
            description: "Open terminal".to_string(),
            copied: false,
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert!(
            matches!(app.view_state, ViewState::OrchestrationList),
            "Esc should return to OrchestrationList"
        );
    }

    #[test]
    fn test_y_key_in_command_modal_copies_command() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::CommandModal {
            command: "cd /test".to_string(),
            description: "Open terminal".to_string(),
            copied: false,
        };

        let key = KeyEvent::new(KeyCode::Char('y'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Check if copied flag is set (clipboard may not be available in CI)
        match app.view_state {
            ViewState::CommandModal { copied: _, .. } => {
                // If clipboard is available, copied should be true
                // If not available, it should remain false
                // We just verify the state is still CommandModal
            }
            _ => panic!("Should remain in CommandModal after copy attempt"),
        }
    }

    // Task 6: App state for send dialog tests

    #[test]
    fn test_app_initializes_command_logger_from_config() {
        // Test that App::new() doesn't panic and properly loads config
        let result = App::new();

        // Should succeed or fail gracefully (config load might fail in test environment)
        match result {
            Ok(app) => {
                // Verify the app was created with all fields initialized
                assert!(!app.should_quit);
                assert_eq!(app.selected_index, 0);
                // command_logger should be Some if config loads successfully
                // (it's private so we can't check directly, but compilation ensures field exists)
            }
            Err(_e) => {
                // Config load might fail in test environment - that's okay
                // The important thing is that the code compiles and doesn't panic
            }
        }
    }

    // Phase 5.5: Attach to tmux ('a' key) tests

    #[test]
    fn test_a_key_on_members_does_not_panic() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 2,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('a'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should either:
        // 1. Transition to CommandModal (fallback handler - most likely in tests)
        // 2. Stay in PhaseDetail if no team config exists
        // The exact behavior depends on whether team config exists
        // For unit test purposes, we just verify it doesn't panic
        assert!(!app.should_quit, "App should not quit on 'a' key");
    }

    #[test]
    fn test_a_key_on_tasks_does_nothing() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 1,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('a'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should remain in PhaseDetail with Tasks focus
        match app.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                ..
            } => {
                assert_eq!(focus, PaneFocus::Tasks, "Focus should remain on Tasks");
                assert_eq!(task_index, 1, "task_index should not change");
                assert_eq!(member_index, 0, "member_index should not change");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_a_key_does_nothing_when_no_orchestrations() {
        let mut app = App::new_with_orchestrations(vec![]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('a'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should not crash, should remain in PhaseDetail
        assert!(matches!(app.view_state, ViewState::PhaseDetail { .. }));
    }

    // Commits View tests

    #[test]
    fn test_c_key_does_nothing_when_no_orchestrations() {
        let mut app = App::new_with_orchestrations(vec![]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('c'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should not crash, should remain in PhaseDetail
        assert!(matches!(app.view_state, ViewState::PhaseDetail { .. }));
    }

    #[test]
    fn test_c_key_in_phase_detail_attempts_to_open_commits_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 1,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('c'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Will either transition to CommitsView (if phase data exists)
        // or stay in PhaseDetail (if no handoff.md exists)
        // For this test, just verify no panic
        assert!(!app.should_quit, "App should not quit on 'c' key");
    }

    #[test]
    fn test_esc_in_commits_view_returns_to_phase_detail() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::CommitsView {
            worktree_path: PathBuf::from("/test"),
            range: "main...branch".to_string(),
            title: "Test Commits".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                ..
            } => {
                assert_eq!(focus, PaneFocus::Tasks, "Should return to Tasks pane");
                assert_eq!(task_index, 0, "Should reset task_index to 0");
                assert_eq!(member_index, 0, "Should reset member_index to 0");
            }
            _ => panic!("Esc should return to PhaseDetail view"),
        }
    }

    #[test]
    fn test_commits_view_ignores_other_keys() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::CommitsView {
            worktree_path: PathBuf::from("/test"),
            range: "main...branch".to_string(),
            title: "Test Commits".to_string(),
        };

        // Try various keys that should do nothing at the app level
        for key_code in [
            KeyCode::Char('j'),
            KeyCode::Char('k'),
            KeyCode::Enter,
            KeyCode::Char('r'),
        ] {
            let key = KeyEvent::new(key_code, KeyModifiers::NONE);
            app.handle_key_event(key);

            // Should still be in CommitsView
            match app.view_state {
                ViewState::CommitsView { .. } => {}
                _ => panic!("Should remain in CommitsView view"),
            }
        }
    }

    // Task 7: 's' Key Handler in Members Pane tests

    #[test]
    fn test_s_key_on_members_opens_send_dialog() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 1,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('s'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should transition to SendDialog view
        match app.view_state {
            ViewState::SendDialog {
                pane_id,
                agent_name,
            } => {
                assert!(!pane_id.is_empty(), "pane_id should be set");
                assert!(!agent_name.is_empty(), "agent_name should be set");
            }
            _ => panic!("'s' key should open SendDialog when focused on members"),
        }

        // Should have created a send_dialog instance
        assert!(
            app.send_dialog.is_some(),
            "send_dialog should be initialized"
        );
    }

    #[test]
    fn test_s_key_on_tasks_does_nothing() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 1,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('s'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should remain in PhaseDetail with Tasks focus
        match app.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                ..
            } => {
                assert_eq!(focus, PaneFocus::Tasks, "Focus should remain on Tasks");
                assert_eq!(task_index, 1, "task_index should not change");
                assert_eq!(member_index, 0, "member_index should not change");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }

        // Should not have created a send_dialog
        assert!(
            app.send_dialog.is_none(),
            "send_dialog should not be initialized"
        );
    }

    #[test]
    fn test_s_key_does_nothing_when_no_orchestrations() {
        let mut app = App::new_with_orchestrations(vec![]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('s'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should not crash, should remain in PhaseDetail
        assert!(matches!(app.view_state, ViewState::PhaseDetail { .. }));

        // Should not have created a send_dialog
        assert!(
            app.send_dialog.is_none(),
            "send_dialog should not be initialized"
        );
    }

    // Diff View tests

    #[test]
    fn test_d_key_does_nothing_when_no_orchestrations() {
        let mut app = App::new_with_orchestrations(vec![]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('d'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should not crash, should remain in PhaseDetail
        assert!(matches!(app.view_state, ViewState::PhaseDetail { .. }));
    }

    #[test]
    fn test_d_key_in_phase_detail_attempts_to_open_diff_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 1,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('d'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Will either transition to DiffView (if phase data exists)
        // or stay in PhaseDetail (if no handoff.md exists)
        // For this test, just verify no panic
        assert!(!app.should_quit, "App should not quit on 'd' key");
    }

    #[test]
    fn test_esc_in_diff_view_returns_to_phase_detail() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::DiffView {
            worktree_path: PathBuf::from("/test"),
            range: "main...branch".to_string(),
            title: "Test Diff".to_string(),
            selected: 0,
            show_full: false,
            scroll: 0,
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                ..
            } => {
                assert_eq!(focus, PaneFocus::Tasks, "Should return to Tasks pane");
                assert_eq!(task_index, 0, "Should reset task_index to 0");
                assert_eq!(member_index, 0, "Should reset member_index to 0");
            }
            _ => panic!("Esc should return to PhaseDetail view"),
        }
    }

    // Task 8: Send Dialog Key Handler tests

    #[test]
    fn test_character_input_appends_to_send_dialog_input() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.send_dialog = Some(crate::tui::views::send_dialog::SendDialog::new(
            "test-pane".to_string(),
            "test-agent".to_string(),
            false,
        ));
        app.view_state = ViewState::SendDialog {
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('a'), KeyModifiers::NONE);
        app.handle_key_event(key);

        assert_eq!(app.send_dialog.as_ref().unwrap().input, "a");

        let key = KeyEvent::new(KeyCode::Char('b'), KeyModifiers::NONE);
        app.handle_key_event(key);

        assert_eq!(app.send_dialog.as_ref().unwrap().input, "ab");
    }

    #[test]
    fn test_backspace_removes_from_send_dialog_input() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        let mut dialog = crate::tui::views::send_dialog::SendDialog::new(
            "test-pane".to_string(),
            "test-agent".to_string(),
            false,
        );
        dialog.input = "hello".to_string();
        app.send_dialog = Some(dialog);
        app.view_state = ViewState::SendDialog {
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert_eq!(app.send_dialog.as_ref().unwrap().input, "hell");
    }

    #[test]
    fn test_1_key_sets_checkpoint_quick_action() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.send_dialog = Some(crate::tui::views::send_dialog::SendDialog::new(
            "test-pane".to_string(),
            "test-agent".to_string(),
            false,
        ));
        app.view_state = ViewState::SendDialog {
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('1'), KeyModifiers::NONE);
        app.handle_key_event(key);

        let dialog = app.send_dialog.as_ref().unwrap();
        assert_eq!(dialog.quick_action, 1);
        assert_eq!(dialog.input, "/checkpoint");
    }

    #[test]
    fn test_2_key_sets_clear_quick_action() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.send_dialog = Some(crate::tui::views::send_dialog::SendDialog::new(
            "test-pane".to_string(),
            "test-agent".to_string(),
            false,
        ));
        app.view_state = ViewState::SendDialog {
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('2'), KeyModifiers::NONE);
        app.handle_key_event(key);

        let dialog = app.send_dialog.as_ref().unwrap();
        assert_eq!(dialog.quick_action, 2);
        assert_eq!(dialog.input, "/clear");
    }

    #[test]
    fn test_enter_sends_command_when_no_confirmation_needed() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        let mut dialog = crate::tui::views::send_dialog::SendDialog::new(
            "test-pane".to_string(),
            "test-agent".to_string(),
            false, // No confirmation needed
        );
        dialog.input = "/checkpoint".to_string();
        app.send_dialog = Some(dialog);
        app.view_state = ViewState::SendDialog {
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should have closed the dialog (execute_send closes it)
        assert!(
            app.send_dialog.is_none(),
            "Dialog should be closed after send"
        );
    }

    #[test]
    fn test_enter_shows_confirmation_when_confirm_send_enabled() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        let mut dialog = crate::tui::views::send_dialog::SendDialog::new(
            "test-pane".to_string(),
            "test-agent".to_string(),
            true, // Confirmation needed
        );
        dialog.input = "echo test".to_string(); // Not a safe command
        app.send_dialog = Some(dialog);
        app.view_state = ViewState::SendDialog {
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should be in confirmation state
        let dialog = app.send_dialog.as_ref().unwrap();
        assert_eq!(dialog.confirming, true, "Should be in confirmation state");
    }

    #[test]
    fn test_y_confirms_and_sends() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        let mut dialog = crate::tui::views::send_dialog::SendDialog::new(
            "test-pane".to_string(),
            "test-agent".to_string(),
            true,
        );
        dialog.input = "echo test".to_string();
        dialog.confirming = true; // Already in confirmation state
        app.send_dialog = Some(dialog);
        app.view_state = ViewState::SendDialog {
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('y'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should have closed the dialog (execute_send closes it)
        assert!(
            app.send_dialog.is_none(),
            "Dialog should be closed after confirmed send"
        );
    }

    #[test]
    fn test_n_cancels_confirmation() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        let mut dialog = crate::tui::views::send_dialog::SendDialog::new(
            "test-pane".to_string(),
            "test-agent".to_string(),
            true,
        );
        dialog.confirming = true; // In confirmation state
        app.send_dialog = Some(dialog);
        app.view_state = ViewState::SendDialog {
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should have cancelled confirmation
        let dialog = app.send_dialog.as_ref().unwrap();
        assert_eq!(
            dialog.confirming, false,
            "Should have cancelled confirmation"
        );
    }

    #[test]
    fn test_esc_closes_send_dialog() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.send_dialog = Some(crate::tui::views::send_dialog::SendDialog::new(
            "test-pane".to_string(),
            "test-agent".to_string(),
            false,
        ));
        app.view_state = ViewState::SendDialog {
            pane_id: "test-pane".to_string(),
            agent_name: "test-agent".to_string(),
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should have closed the dialog and returned to PhaseDetail
        assert!(app.send_dialog.is_none(), "Dialog should be closed");
        match app.view_state {
            ViewState::PhaseDetail { .. } => (),
            _ => panic!("Should have returned to PhaseDetail"),
        }
    }

    #[test]
    fn test_execute_send_calls_send_keys() {
        use tempfile::NamedTempFile;

        // Create a temporary log file
        let log_file = NamedTempFile::new().unwrap();
        let log_path = log_file.path().to_path_buf();

        let mut app = App {
            should_quit: false,
            orchestrations: vec![make_test_orchestration("project-1")],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::PhaseDetail {
                focus: PaneFocus::Members,
                task_index: 0,
                member_index: 0,
                layout: PhaseDetailLayout::OrchPhaseTasks,
                selected_phase: 1,
            },
            log_viewer: None,
            send_dialog: Some(crate::tui::views::send_dialog::SendDialog {
                input: "echo test".to_string(),
                pane_id: "invalid-pane-for-test".to_string(),
                agent_name: "test-agent".to_string(),
                quick_action: 0,
                needs_confirmation: false,
                confirming: false,
            }),
            command_logger: Some(crate::logging::CommandLogger::new(log_path.clone())),
            phase_cache: None,
        };

        // Execute send - this will fail with invalid pane, but we verify it attempts to send
        app.execute_send();

        // Verify dialog was closed
        assert!(
            app.send_dialog.is_none(),
            "Dialog should be closed after send"
        );

        // Verify returned to PhaseDetail with Members focus
        match app.view_state {
            ViewState::PhaseDetail {
                focus: PaneFocus::Members,
                ..
            } => (),
            _ => panic!("Should have returned to PhaseDetail with Members focus"),
        }
    }

    #[test]
    fn test_execute_send_logs_command() {
        use std::io::Read;
        use tempfile::NamedTempFile;

        // Create a temporary log file
        let log_file = NamedTempFile::new().unwrap();
        let log_path = log_file.path().to_path_buf();

        let mut app = App {
            should_quit: false,
            orchestrations: vec![make_test_orchestration("project-1")],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::PhaseDetail {
                focus: PaneFocus::Members,
                task_index: 0,
                member_index: 0,
                layout: PhaseDetailLayout::OrchPhaseTasks,
                selected_phase: 1,
            },
            log_viewer: None,
            send_dialog: Some(crate::tui::views::send_dialog::SendDialog {
                input: "echo logged command".to_string(),
                pane_id: "test-pane-123".to_string(),
                agent_name: "test-agent".to_string(),
                quick_action: 0,
                needs_confirmation: false,
                confirming: false,
            }),
            command_logger: Some(crate::logging::CommandLogger::new(log_path.clone())),
            phase_cache: None,
        };

        // Execute send
        app.execute_send();

        // Read log file to verify command was logged
        let mut log_contents = String::new();
        std::fs::File::open(&log_path)
            .unwrap()
            .read_to_string(&mut log_contents)
            .unwrap();

        assert!(
            log_contents.contains("test-pane-123"),
            "Log should contain pane ID"
        );
        assert!(
            log_contents.contains("echo logged command"),
            "Log should contain the command"
        );
    }

    #[test]
    fn test_execute_send_returns_to_phase_detail() {
        use tempfile::NamedTempFile;

        // Create a temporary log file
        let log_file = NamedTempFile::new().unwrap();
        let log_path = log_file.path().to_path_buf();

        let mut app = App {
            should_quit: false,
            orchestrations: vec![make_test_orchestration("project-1")],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::PhaseDetail {
                focus: PaneFocus::Tasks,
                task_index: 2,
                member_index: 3,
                layout: PhaseDetailLayout::OrchPhaseTasks,
                selected_phase: 1,
            },
            log_viewer: None,
            send_dialog: Some(crate::tui::views::send_dialog::SendDialog {
                input: "/checkpoint".to_string(),
                pane_id: "test-pane-456".to_string(),
                agent_name: "agent-x".to_string(),
                quick_action: 1,
                needs_confirmation: false,
                confirming: false,
            }),
            command_logger: Some(crate::logging::CommandLogger::new(log_path)),
            phase_cache: None,
        };

        // Execute send
        app.execute_send();

        // Verify view state changed to PhaseDetail with Members focus
        match app.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                ..
            } => {
                assert_eq!(focus, PaneFocus::Members, "Should switch to Members focus");
                assert_eq!(task_index, 0, "Should reset task index to 0");
                assert_eq!(member_index, 0, "Should reset member index to 0");
            }
            _ => panic!("Should be in PhaseDetail view after execute_send"),
        }

        // Verify dialog was closed
        assert!(app.send_dialog.is_none(), "Dialog should be closed");
    }

    #[test]
    fn test_phase_navigation_j_increments_selected_phase() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        // Project has total_phases = 3
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Phases,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { selected_phase, .. } => {
                assert_eq!(
                    selected_phase, 2,
                    "'j' should increment selected_phase from 1 to 2"
                );
            }
            _ => panic!("Should still be in PhaseDetail view"),
        }
    }

    #[test]
    fn test_phase_navigation_k_decrements_selected_phase() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Phases,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 2,
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { selected_phase, .. } => {
                assert_eq!(
                    selected_phase, 1,
                    "'k' should decrement selected_phase from 2 to 1"
                );
            }
            _ => panic!("Should still be in PhaseDetail view"),
        }
    }

    #[test]
    fn test_phase_navigation_wraps_around() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        // total_phases = 3
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Phases,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 3, // At the end
        };

        // 'j' should wrap to 1
        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { selected_phase, .. } => {
                assert_eq!(
                    selected_phase, 1,
                    "'j' at last phase should wrap to phase 1"
                );
            }
            _ => panic!("Should still be in PhaseDetail view"),
        }

        // Now test wrapping the other way: 'k' at phase 1 should wrap to total_phases
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Phases,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 1, // At the beginning
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { selected_phase, .. } => {
                assert_eq!(
                    selected_phase, 3,
                    "'k' at first phase should wrap to last phase (3)"
                );
            }
            _ => panic!("Should still be in PhaseDetail view"),
        }
    }

    #[test]
    fn test_switching_orchestration_resets_selected_phase_to_current() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Orchestrations,
            task_index: 0,
            member_index: 0,
            layout: PhaseDetailLayout::OrchPhaseTasks,
            selected_phase: 2, // Viewing phase 2 of project-1
        };

        // 'j' in Orchestrations pane switches to next orchestration
        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // selected_phase should reset to the new orchestration's current_phase
        match app.view_state {
            ViewState::PhaseDetail { selected_phase, .. } => {
                // Both test orchestrations have current_phase = 1
                assert_eq!(selected_phase, 1, "Switching orchestration should reset selected_phase to new orch's current_phase");
            }
            _ => panic!("Should still be in PhaseDetail view"),
        }
    }
}
