# Phase 6: Git & Live Logs - Implementation Plan

## Overview

This phase adds deep visibility into agent work through git integration and live log streaming, enabling users to see exactly what changes have been made during each phase and watch agents work in real-time.

## Prerequisites

- Phase 4 (TUI Detail Views) completed - Modal system and log viewer exist
- Phase 5 (TUI Actions) completed - Terminal integration and config support exist

## Goals

1. Git module for parsing commits and diffs in worktree context
2. Commits view (`c` key) showing phase commit history
3. Diff stats view (`d` key) showing changed files
4. Live log viewer with follow mode and real-time polling

---

## Task 1: Git Module Foundation

**Files:**
- CREATE: `tina-monitor/src/git/mod.rs`
- CREATE: `tina-monitor/src/git/commits.rs`
- CREATE: `tina-monitor/src/git/diff.rs`

**Implementation:**

```rust
// src/git/mod.rs
mod commits;
mod diff;

pub use commits::{Commit, CommitSummary, get_commits};
pub use diff::{DiffStat, FileDiff, get_diff_stats};

use anyhow::Result;
use std::path::Path;
use std::process::Command;

/// Execute a git command in the given directory
pub fn git_command(cwd: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("git command failed: {}", stderr);
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

```rust
// src/git/commits.rs
use super::git_command;
use anyhow::Result;
use std::path::Path;

/// A single git commit
#[derive(Debug, Clone)]
pub struct Commit {
    /// Short hash (7 chars)
    pub short_hash: String,
    /// Full hash
    pub hash: String,
    /// Commit subject line
    pub subject: String,
    /// Author name
    pub author: String,
    /// Relative time (e.g., "2 hours ago")
    pub relative_time: String,
}

/// Summary statistics for a commit range
#[derive(Debug, Clone)]
pub struct CommitSummary {
    pub commits: Vec<Commit>,
    pub total_commits: usize,
    pub insertions: usize,
    pub deletions: usize,
}

/// Get commits in a range
///
/// # Arguments
/// * `cwd` - Working directory (worktree path)
/// * `range` - Git range (e.g., "abc123..def456" or "main..HEAD")
pub fn get_commits(cwd: &Path, range: &str) -> Result<CommitSummary> {
    // Get commit list with format: hash|short|subject|author|relative_time
    let format = "%H|%h|%s|%an|%cr";
    let log_output = git_command(cwd, &[
        "log",
        "--oneline",
        &format!("--format={}", format),
        range,
    ])?;

    let commits: Vec<Commit> = log_output
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() >= 5 {
                Some(Commit {
                    hash: parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    subject: parts[2].to_string(),
                    author: parts[3].to_string(),
                    relative_time: parts[4].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    let total_commits = commits.len();

    // Get insertion/deletion stats
    let (insertions, deletions) = get_shortstat(cwd, range)?;

    Ok(CommitSummary {
        commits,
        total_commits,
        insertions,
        deletions,
    })
}

/// Parse git diff --shortstat output
fn get_shortstat(cwd: &Path, range: &str) -> Result<(usize, usize)> {
    let output = git_command(cwd, &["diff", "--shortstat", range])?;

    // Format: " 5 files changed, 100 insertions(+), 20 deletions(-)"
    let mut insertions = 0;
    let mut deletions = 0;

    for part in output.split(',') {
        let part = part.trim();
        if part.contains("insertion") {
            if let Some(num) = part.split_whitespace().next() {
                insertions = num.parse().unwrap_or(0);
            }
        } else if part.contains("deletion") {
            if let Some(num) = part.split_whitespace().next() {
                deletions = num.parse().unwrap_or(0);
            }
        }
    }

    Ok((insertions, deletions))
}
```

```rust
// src/git/diff.rs
use super::git_command;
use anyhow::Result;
use std::path::Path;

/// Statistics for a single file
#[derive(Debug, Clone)]
pub struct FileDiff {
    /// File path (relative to repo root)
    pub path: String,
    /// Number of insertions
    pub insertions: usize,
    /// Number of deletions
    pub deletions: usize,
    /// Binary file flag
    pub is_binary: bool,
}

/// Overall diff statistics
#[derive(Debug, Clone)]
pub struct DiffStat {
    pub files: Vec<FileDiff>,
    pub files_changed: usize,
    pub total_insertions: usize,
    pub total_deletions: usize,
}

/// Get diff stats for a range
///
/// # Arguments
/// * `cwd` - Working directory (worktree path)
/// * `range` - Git range (e.g., "abc123..def456")
pub fn get_diff_stats(cwd: &Path, range: &str) -> Result<DiffStat> {
    // Get numstat for detailed per-file stats
    let numstat_output = git_command(cwd, &["diff", "--numstat", range])?;

    let files: Vec<FileDiff> = numstat_output
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 3 {
                let insertions = parts[0].parse().unwrap_or(0);
                let deletions = parts[1].parse().unwrap_or(0);
                let is_binary = parts[0] == "-" && parts[1] == "-";
                FileDiff {
                    path: parts[2].to_string(),
                    insertions,
                    deletions,
                    is_binary,
                }
            } else {
                FileDiff {
                    path: line.to_string(),
                    insertions: 0,
                    deletions: 0,
                    is_binary: false,
                }
            }
        })
        .collect();

    let files_changed = files.len();
    let total_insertions: usize = files.iter().map(|f| f.insertions).sum();
    let total_deletions: usize = files.iter().map(|f| f.deletions).sum();

    Ok(DiffStat {
        files,
        files_changed,
        total_insertions,
        total_deletions,
    })
}

/// Get full diff content for a range (for detailed view)
pub fn get_full_diff(cwd: &Path, range: &str) -> Result<String> {
    git_command(cwd, &["diff", "--stat", range])
}
```

**Tests:**
- `test_parse_commit_format` - verify commit parsing
- `test_parse_shortstat` - verify insertion/deletion parsing
- `test_parse_numstat` - verify per-file stats parsing
- `test_empty_range` - handle no commits gracefully

---

## Task 2: Commits View Modal

**Files:**
- CREATE: `tina-monitor/src/tui/views/commits_view.rs`
- MODIFY: `tina-monitor/src/tui/views/mod.rs` (export commits_view)
- MODIFY: `tina-monitor/src/tui/app.rs` (add `c` key handler)

**Implementation:**

```rust
// src/tui/views/commits_view.rs
use crate::git::{CommitSummary, get_commits};
use anyhow::Result;
use ratatui::prelude::*;
use ratatui::widgets::{Block, Borders, List, ListItem, ListState, Paragraph};
use std::path::PathBuf;

pub struct CommitsView {
    /// Title for the view (e.g., "auth-feature phase 2")
    pub title: String,
    /// Git range being shown
    pub range: String,
    /// Commit data
    pub summary: CommitSummary,
    /// Selected commit index
    pub selected: usize,
    /// List state for ratatui
    pub list_state: ListState,
}

impl CommitsView {
    /// Create a new commits view
    ///
    /// # Arguments
    /// * `worktree_path` - Path to the git worktree
    /// * `range` - Git range (e.g., "abc123..def456")
    /// * `title` - Display title
    pub fn new(worktree_path: &PathBuf, range: &str, title: String) -> Result<Self> {
        let summary = get_commits(worktree_path, range)?;
        let mut list_state = ListState::default();
        list_state.select(Some(0));

        Ok(Self {
            title,
            range: range.to_string(),
            summary,
            selected: 0,
            list_state,
        })
    }

    pub fn select_next(&mut self) {
        if self.selected < self.summary.commits.len().saturating_sub(1) {
            self.selected += 1;
            self.list_state.select(Some(self.selected));
        }
    }

    pub fn select_previous(&mut self) {
        if self.selected > 0 {
            self.selected -= 1;
            self.list_state.select(Some(self.selected));
        }
    }

    pub fn render(&mut self, frame: &mut Frame, area: Rect) {
        let block = Block::default()
            .title(format!(" Commits: {} ({}) ", self.title, self.range))
            .borders(Borders::ALL);

        let inner = block.inner(area);
        frame.render_widget(block, area);

        // Split area: commit list on top, summary on bottom
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Min(5),
                Constraint::Length(3),
            ])
            .split(inner);

        // Commit list
        let items: Vec<ListItem> = self.summary.commits
            .iter()
            .map(|commit| {
                let line = format!("{} {}", commit.short_hash, commit.subject);
                ListItem::new(line)
            })
            .collect();

        let list = List::new(items)
            .highlight_style(Style::default().add_modifier(Modifier::REVERSED))
            .highlight_symbol("> ");

        frame.render_stateful_widget(list, chunks[0], &mut self.list_state);

        // Summary footer
        let summary_text = format!(
            "{} commits, +{} -{} lines",
            self.summary.total_commits,
            self.summary.insertions,
            self.summary.deletions
        );
        let summary_para = Paragraph::new(summary_text)
            .style(Style::default().fg(Color::DarkGray))
            .alignment(Alignment::Center);
        frame.render_widget(summary_para, chunks[1]);
    }
}
```

Add to app.rs:
```rust
impl App {
    /// Handle 'c' key - view commits for current phase
    pub fn handle_view_commits(&mut self) -> Result<()> {
        let (worktree_path, git_range, title) = match self.get_current_phase_git_info() {
            Some(info) => info,
            None => {
                self.set_status_message("No git range available for current phase");
                return Ok(());
            }
        };

        let view = CommitsView::new(&worktree_path, &git_range, title)?;
        self.push_modal(Modal::Commits(view));
        Ok(())
    }

    /// Get git range info for current phase
    fn get_current_phase_git_info(&self) -> Option<(PathBuf, String, String)> {
        let orch = self.get_selected_orchestration()?;

        // Get git_range from execute-phase-N task metadata
        let phase = orch.current_phase;
        let task_id = format!("execute-phase-{}", phase);

        // Find the task and get its git_range metadata
        let task = orch.tasks.iter().find(|t| t.id == task_id)?;
        let git_range = task.metadata.get("git_range")?.as_str()?;

        let title = format!("{} phase {}", orch.team_name, phase);

        Some((orch.cwd.clone(), git_range.to_string(), title))
    }
}
```

**Keybindings in commits view:**
- `j`/`k` or arrows: navigate commits
- `Esc`: close modal

---

## Task 3: Diff Stats View Modal

**Files:**
- CREATE: `tina-monitor/src/tui/views/diff_view.rs`
- MODIFY: `tina-monitor/src/tui/views/mod.rs` (export diff_view)
- MODIFY: `tina-monitor/src/tui/app.rs` (add `d` key handler)

**Implementation:**

```rust
// src/tui/views/diff_view.rs
use crate::git::{DiffStat, FileDiff, get_diff_stats, get_full_diff};
use anyhow::Result;
use ratatui::prelude::*;
use ratatui::widgets::{Block, Borders, List, ListItem, ListState, Paragraph};
use std::path::PathBuf;

pub struct DiffView {
    /// Title for the view
    pub title: String,
    /// Git range
    pub range: String,
    /// Worktree path (for full diff)
    pub worktree_path: PathBuf,
    /// Diff statistics
    pub stats: DiffStat,
    /// Selected file index
    pub selected: usize,
    /// List state
    pub list_state: ListState,
    /// Full diff content (lazy loaded)
    pub full_diff: Option<String>,
    /// Show full diff mode
    pub show_full: bool,
    /// Scroll position for full diff
    pub scroll: u16,
}

impl DiffView {
    pub fn new(worktree_path: &PathBuf, range: &str, title: String) -> Result<Self> {
        let stats = get_diff_stats(worktree_path, range)?;
        let mut list_state = ListState::default();
        list_state.select(Some(0));

        Ok(Self {
            title,
            range: range.to_string(),
            worktree_path: worktree_path.clone(),
            stats,
            selected: 0,
            list_state,
            full_diff: None,
            show_full: false,
            scroll: 0,
        })
    }

    pub fn select_next(&mut self) {
        if !self.show_full && self.selected < self.stats.files.len().saturating_sub(1) {
            self.selected += 1;
            self.list_state.select(Some(self.selected));
        }
    }

    pub fn select_previous(&mut self) {
        if !self.show_full && self.selected > 0 {
            self.selected -= 1;
            self.list_state.select(Some(self.selected));
        }
    }

    pub fn scroll_down(&mut self, amount: u16) {
        if self.show_full {
            self.scroll = self.scroll.saturating_add(amount);
        }
    }

    pub fn scroll_up(&mut self, amount: u16) {
        if self.show_full {
            self.scroll = self.scroll.saturating_sub(amount);
        }
    }

    pub fn toggle_full_diff(&mut self) -> Result<()> {
        if self.show_full {
            self.show_full = false;
        } else {
            // Lazy load full diff
            if self.full_diff.is_none() {
                self.full_diff = Some(get_full_diff(&self.worktree_path, &self.range)?);
            }
            self.show_full = true;
            self.scroll = 0;
        }
        Ok(())
    }

    pub fn render(&mut self, frame: &mut Frame, area: Rect) {
        let block = Block::default()
            .title(format!(" Changes: {} ", self.title))
            .borders(Borders::ALL);

        let inner = block.inner(area);
        frame.render_widget(block, area);

        if self.show_full {
            self.render_full_diff(frame, inner);
        } else {
            self.render_file_list(frame, inner);
        }
    }

    fn render_file_list(&mut self, frame: &mut Frame, area: Rect) {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Min(5),
                Constraint::Length(3),
            ])
            .split(area);

        // File list with +/- indicators
        let items: Vec<ListItem> = self.stats.files
            .iter()
            .map(|file| {
                let changes = if file.is_binary {
                    " [binary]".to_string()
                } else {
                    format!(" | +{:<4} -{:<4}", file.insertions, file.deletions)
                };
                let line = format!("{}{}", file.path, changes);
                ListItem::new(line)
            })
            .collect();

        let list = List::new(items)
            .highlight_style(Style::default().add_modifier(Modifier::REVERSED))
            .highlight_symbol("> ");

        frame.render_stateful_widget(list, chunks[0], &mut self.list_state);

        // Summary and hint
        let summary = format!(
            "{} files changed, {} insertions(+), {} deletions(-)    [Enter] Full diff  [ESC] Close",
            self.stats.files_changed,
            self.stats.total_insertions,
            self.stats.total_deletions
        );
        let hint = Paragraph::new(summary)
            .style(Style::default().fg(Color::DarkGray))
            .alignment(Alignment::Center);
        frame.render_widget(hint, chunks[1]);
    }

    fn render_full_diff(&self, frame: &mut Frame, area: Rect) {
        let diff_content = self.full_diff.as_deref().unwrap_or("");

        let lines: Vec<&str> = diff_content
            .lines()
            .skip(self.scroll as usize)
            .take(area.height as usize)
            .collect();

        // Color diff output
        let styled_lines: Vec<Line> = lines
            .iter()
            .map(|line| {
                let style = if line.starts_with('+') && !line.starts_with("+++") {
                    Style::default().fg(Color::Green)
                } else if line.starts_with('-') && !line.starts_with("---") {
                    Style::default().fg(Color::Red)
                } else if line.starts_with("@@") {
                    Style::default().fg(Color::Cyan)
                } else {
                    Style::default()
                };
                Line::styled(*line, style)
            })
            .collect();

        let text = Text::from(styled_lines);
        let para = Paragraph::new(text);
        frame.render_widget(para, area);
    }
}
```

Add to app.rs:
```rust
impl App {
    /// Handle 'd' key - view diff stats for current phase
    pub fn handle_view_diff(&mut self) -> Result<()> {
        let (worktree_path, git_range, title) = match self.get_current_phase_git_info() {
            Some(info) => info,
            None => {
                self.set_status_message("No git range available for current phase");
                return Ok(());
            }
        };

        let view = DiffView::new(&worktree_path, &git_range, title)?;
        self.push_modal(Modal::Diff(view));
        Ok(())
    }
}
```

**Keybindings in diff view:**
- `j`/`k` or arrows: navigate files (list mode) or scroll (full diff mode)
- `Enter`: toggle full diff view
- `Esc`: close modal (or return to list from full diff)

---

## Task 4: Live Log Viewer with Follow Mode

**Files:**
- MODIFY: `tina-monitor/src/tui/views/log_viewer.rs` (add follow mode and polling)
- MODIFY: `tina-monitor/src/tmux/capture.rs` (add continuous capture support)

**Implementation:**

Update capture.rs:
```rust
// src/tmux/capture.rs
use anyhow::Result;
use std::process::Command;

/// Captured pane output
#[derive(Debug, Clone)]
pub struct PaneCapture {
    /// Captured lines
    pub lines: Vec<String>,
    /// Total line count in pane history
    pub total_lines: usize,
}

/// Capture output from a tmux pane
///
/// # Arguments
/// * `pane_id` - The tmux pane ID (e.g., "%15")
/// * `history_lines` - Number of history lines to capture
pub fn capture_pane(pane_id: &str, history_lines: usize) -> Result<PaneCapture> {
    // Capture with history
    let output = Command::new("tmux")
        .args([
            "capture-pane",
            "-t", pane_id,
            "-p",  // Print to stdout
            "-S", &format!("-{}", history_lines),  // Start N lines before visible
            "-e",  // Include escape sequences (for colors)
        ])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("tmux capture failed: {}", stderr);
    }

    let content = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let total_lines = lines.len();

    Ok(PaneCapture { lines, total_lines })
}

/// Get the height of a tmux pane
pub fn get_pane_height(pane_id: &str) -> Result<usize> {
    let output = Command::new("tmux")
        .args(["display-message", "-t", pane_id, "-p", "#{pane_height}"])
        .output()?;

    let height_str = String::from_utf8_lossy(&output.stdout);
    Ok(height_str.trim().parse().unwrap_or(24))
}
```

Update log_viewer.rs:
```rust
// src/tui/views/log_viewer.rs
use crate::tmux::capture::{capture_pane, PaneCapture};
use anyhow::Result;
use ratatui::prelude::*;
use ratatui::widgets::{Block, Borders, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState};
use std::time::{Duration, Instant};

pub struct LogViewer {
    /// Agent name for title
    pub agent_name: String,
    /// Team name
    pub team_name: String,
    /// Tmux pane ID
    pub pane_id: String,
    /// Captured log content
    pub capture: PaneCapture,
    /// Scroll position (0 = top of captured content)
    pub scroll: usize,
    /// Follow mode - auto-scroll to bottom
    pub follow: bool,
    /// Last refresh time
    pub last_refresh: Instant,
    /// Poll interval
    pub poll_interval: Duration,
    /// History lines to capture
    pub history_lines: usize,
}

impl LogViewer {
    pub fn new(agent_name: String, team_name: String, pane_id: String, poll_interval_ms: u64) -> Result<Self> {
        let history_lines = 500; // Configurable
        let capture = capture_pane(&pane_id, history_lines)?;
        let scroll = capture.total_lines.saturating_sub(1); // Start at bottom

        Ok(Self {
            agent_name,
            team_name,
            pane_id,
            capture,
            scroll,
            follow: true, // Start in follow mode
            last_refresh: Instant::now(),
            poll_interval: Duration::from_millis(poll_interval_ms),
            history_lines,
        })
    }

    /// Check if we need to refresh and do it
    pub fn maybe_refresh(&mut self) -> Result<bool> {
        if self.last_refresh.elapsed() >= self.poll_interval {
            self.refresh()?;
            return Ok(true);
        }
        Ok(false)
    }

    /// Force refresh the captured content
    pub fn refresh(&mut self) -> Result<()> {
        let previous_total = self.capture.total_lines;
        self.capture = capture_pane(&self.pane_id, self.history_lines)?;
        self.last_refresh = Instant::now();

        // If following, scroll to show new content
        if self.follow && self.capture.total_lines > previous_total {
            self.scroll = self.capture.total_lines.saturating_sub(1);
        }

        Ok(())
    }

    pub fn scroll_down(&mut self, amount: usize) {
        self.scroll = (self.scroll + amount).min(self.capture.total_lines.saturating_sub(1));
        // Disable follow when manually scrolling up
    }

    pub fn scroll_up(&mut self, amount: usize) {
        self.scroll = self.scroll.saturating_sub(amount);
        self.follow = false; // Disable follow when scrolling up
    }

    pub fn scroll_to_bottom(&mut self) {
        self.scroll = self.capture.total_lines.saturating_sub(1);
        self.follow = true;
    }

    pub fn toggle_follow(&mut self) {
        self.follow = !self.follow;
        if self.follow {
            self.scroll_to_bottom();
        }
    }

    pub fn render(&mut self, frame: &mut Frame, area: Rect) {
        let follow_indicator = if self.follow { " [FOLLOWING]" } else { "" };
        let title = format!(" Logs: {} ({}) {} ", self.agent_name, self.team_name, follow_indicator);

        let block = Block::default()
            .title(title)
            .borders(Borders::ALL);

        let inner = block.inner(area);
        frame.render_widget(block, area);

        // Calculate visible window
        let visible_height = inner.height as usize;
        let start_line = if self.follow {
            self.capture.total_lines.saturating_sub(visible_height)
        } else {
            self.scroll.min(self.capture.total_lines.saturating_sub(visible_height))
        };

        // Get visible lines
        let visible_lines: Vec<&str> = self.capture.lines
            .iter()
            .skip(start_line)
            .take(visible_height)
            .map(|s| s.as_str())
            .collect();

        // Render content
        let text = visible_lines.join("\n");
        let para = Paragraph::new(text);
        frame.render_widget(para, inner);

        // Scrollbar
        if self.capture.total_lines > visible_height {
            let scrollbar = Scrollbar::default()
                .orientation(ScrollbarOrientation::VerticalRight);
            let mut state = ScrollbarState::default()
                .content_length(self.capture.total_lines)
                .position(start_line);
            frame.render_stateful_widget(scrollbar, area, &mut state);
        }

        // Footer hint
        let hint_area = Rect {
            x: area.x + 1,
            y: area.y + area.height - 1,
            width: area.width - 2,
            height: 1,
        };
        let hint = if self.follow {
            "[f] Stop following  [ESC] Close  [a] Attach"
        } else {
            "[f] Follow (auto-scroll)  [G] Go to bottom  [ESC] Close  [a] Attach"
        };
        let hint_para = Paragraph::new(hint)
            .style(Style::default().fg(Color::DarkGray))
            .alignment(Alignment::Right);
        frame.render_widget(hint_para, hint_area);
    }
}
```

---

## Task 5: App Event Loop Updates for Live Polling

**Files:**
- MODIFY: `tina-monitor/src/tui/app.rs` (add poll timing and log refresh)

**Implementation:**

```rust
impl App {
    /// Tick handler - called regularly by event loop
    pub fn on_tick(&mut self) -> Result<()> {
        // Check if log viewer needs refresh
        if let Some(Modal::LogViewer(ref mut viewer)) = self.current_modal_mut() {
            viewer.maybe_refresh()?;
        }

        Ok(())
    }

    /// Handle key events in log viewer
    fn handle_log_viewer_key(&mut self, key: KeyEvent) -> Result<bool> {
        let viewer = match self.current_modal_mut() {
            Some(Modal::LogViewer(v)) => v,
            _ => return Ok(false),
        };

        match key.code {
            KeyCode::Char('f') => viewer.toggle_follow(),
            KeyCode::Char('G') => viewer.scroll_to_bottom(),
            KeyCode::Char('j') | KeyCode::Down => viewer.scroll_down(1),
            KeyCode::Char('k') | KeyCode::Up => viewer.scroll_up(1),
            KeyCode::PageDown => viewer.scroll_down(10),
            KeyCode::PageUp => viewer.scroll_up(10),
            KeyCode::Char('a') => {
                // Attach to pane (reuse existing attach logic)
                return self.handle_attach_from_log_viewer();
            }
            KeyCode::Esc => {
                self.pop_modal();
            }
            _ => {}
        }

        Ok(false)
    }
}
```

Update event loop in main.rs or app.rs:
```rust
pub fn run_tui(config: Config) -> Result<()> {
    // ... terminal setup ...

    let tick_rate = Duration::from_millis(config.tui.log_poll_interval);
    let mut last_tick = Instant::now();

    loop {
        terminal.draw(|f| app.render(f))?;

        let timeout = tick_rate
            .checked_sub(last_tick.elapsed())
            .unwrap_or_else(|| Duration::from_secs(0));

        if crossterm::event::poll(timeout)? {
            if let Event::Key(key) = crossterm::event::read()? {
                if app.handle_key_event(key)? {
                    break; // Quit requested
                }
            }
        }

        if last_tick.elapsed() >= tick_rate {
            app.on_tick()?;
            last_tick = Instant::now();
        }
    }

    // ... terminal cleanup ...
    Ok(())
}
```

---

## Task 6: Help Modal Updates

**Files:**
- MODIFY: `tina-monitor/src/tui/views/help_modal.rs` (add new keybindings)

Update help content:
```
┌─ Help ──────────────────────────────────────────────────────────────────┐
│                                                                         │
│ Navigation                                                              │
│   j/k or ↑/↓   Move selection up/down                                  │
│   Enter        Expand/collapse or select                                │
│   Esc          Close modal or go back                                   │
│   t            Focus task list (in phase view)                          │
│   m            Focus team members (in phase view)                       │
│                                                                         │
│ Actions                                                                 │
│   g            Open terminal at worktree (goto)                         │
│   a            Attach to agent's tmux pane                              │
│   p            View current phase plan                                  │
│   l            View agent logs                                          │
│   c            View commits for current phase                           │
│   d            View diff stats for current phase                        │
│   r            Force refresh                                            │
│                                                                         │
│ Log Viewer                                                              │
│   f            Toggle follow mode (auto-scroll)                         │
│   G            Jump to bottom                                           │
│   PgUp/PgDn    Scroll by page                                           │
│                                                                         │
│ Diff Viewer                                                             │
│   Enter        Toggle full diff view                                    │
│                                                                         │
│ Other                                                                   │
│   ?            Show this help                                           │
│   q            Quit                                                     │
│                                                                         │
│                                                             [ESC] Close │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Task 7: Modal Enum Updates

**Files:**
- MODIFY: `tina-monitor/src/tui/app.rs` (add new modal variants)

```rust
pub enum Modal {
    Help(HelpModal),
    TaskInspector(TaskInspector),
    LogViewer(LogViewer),
    PlanViewer(PlanViewer),
    CommandModal(CommandModal),
    // New in phase 6
    Commits(CommitsView),
    Diff(DiffView),
}
```

---

## Task 8: Tests

**Files:**
- CREATE: `tina-monitor/tests/git_tests.rs`
- MODIFY: `tina-monitor/tests/fixtures/` (add sample git output)

**Test Cases:**

Git module tests:
- `test_parse_commits` - parse git log output with various formats
- `test_parse_empty_range` - handle empty range gracefully
- `test_parse_shortstat` - extract insertions/deletions from shortstat
- `test_parse_numstat` - parse per-file stats including binary files
- `test_binary_file_detection` - detect "-\t-\tfile.png" format

Log viewer tests:
- `test_follow_mode_scrolls_to_bottom` - verify follow behavior
- `test_manual_scroll_disables_follow` - verify follow disabled on scroll up
- `test_refresh_updates_content` - verify capture refresh

Sample fixtures for git output:
```
# tests/fixtures/git/log_output.txt
abc1234|abc1234|feat: add auth middleware|Alice|2 hours ago
def5678|def5678|test: add auth tests|Bob|1 hour ago

# tests/fixtures/git/numstat_output.txt
156	0	src/auth/middleware.ts
89	12	src/auth/config.ts
-	-	assets/logo.png

# tests/fixtures/git/shortstat_output.txt
 3 files changed, 245 insertions(+), 12 deletions(-)
```

---

## Dependencies

Ensure these are in Cargo.toml (most should exist from prior phases):
```toml
ratatui = "0.28"
crossterm = "0.28"
anyhow = "1"
```

No new dependencies required for this phase.

---

## Success Criteria

1. `c` key opens commits view showing phase commit history
2. Commits view displays hash, subject, and summary stats
3. `d` key opens diff view showing per-file change stats
4. Diff view can toggle to full diff with colored output
5. Log viewer polls at configured interval (default 500ms)
6. Follow mode auto-scrolls to new content
7. Manual scrolling disables follow mode
8. `f` key toggles follow mode
9. All git operations use worktree path correctly
10. All tests pass

---

## Estimated Work

| Task | Effort |
|------|--------|
| Task 1: Git module foundation | Medium |
| Task 2: Commits view modal | Medium |
| Task 3: Diff stats view modal | Medium |
| Task 4: Live log viewer | Medium |
| Task 5: Event loop updates | Small |
| Task 6: Help modal updates | Small |
| Task 7: Modal enum updates | Small |
| Task 8: Tests | Medium |

---

## Notes

- Git range comes from `execute-phase-N` task metadata field `git_range`
- If no git range exists (phase not complete), show appropriate message
- Log viewer polling should be efficient - only refresh when modal is open
- Full diff view uses git's stat format, not full patch (to avoid overwhelming output)
- Follow mode is the default for log viewer since users typically want to see latest output
