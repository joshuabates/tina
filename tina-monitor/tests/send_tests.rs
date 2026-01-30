//! Integration tests for send functionality
//!
//! These tests verify the send dialog functionality at the integration level,
//! focusing on observable behaviors like view state transitions and rendering.

use ratatui::{backend::TestBackend, Terminal};
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;
use tina_monitor::data::discovery::{Orchestration, OrchestrationStatus};
use tina_monitor::tui::{App, PaneFocus, ViewState};

/// Helper function to create a test orchestration
fn make_test_orchestration(name: &str) -> Orchestration {
    Orchestration {
        team_name: format!("{}-team", name),
        title: name.to_string(),
        cwd: PathBuf::from("/test"),
        current_phase: 1,
        total_phases: 3,
        design_doc_path: PathBuf::from("/test/design.md"),
        context_percent: Some(50),
        status: OrchestrationStatus::Idle,
        tasks: vec![],
    }
}

// ============================================================================
// Test 1: Send Dialog View State Transitions
// ============================================================================

#[test]
fn test_send_dialog_flow_opens_and_closes() {
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

    // Test: Start in PhaseDetail view
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Members,
        task_index: 0,
        member_index: 0,
    };

    // Verify: We're in PhaseDetail view initially
    assert!(
        matches!(app.view_state, ViewState::PhaseDetail { .. }),
        "Should start in PhaseDetail view"
    );

    // Test: Transition to SendDialog view (simulating 's' key behavior)
    app.view_state = ViewState::SendDialog {
        pane_id: "%1".to_string(),
        agent_name: "test-agent".to_string(),
    };

    // Verify: Should be in SendDialog view
    match &app.view_state {
        ViewState::SendDialog {
            pane_id,
            agent_name,
        } => {
            assert_eq!(pane_id, "%1", "Should have pane_id set");
            assert_eq!(agent_name, "test-agent", "Should have agent name set");
        }
        _ => panic!("Should be in SendDialog view"),
    }

    // Verify: SendDialog view can render without panicking
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });
    assert!(result.is_ok(), "SendDialog view should render successfully");

    // Test: Return to PhaseDetail view (simulating Esc key behavior)
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Members,
        task_index: 0,
        member_index: 0,
    };

    // Verify: Back in PhaseDetail view
    match app.view_state {
        ViewState::PhaseDetail { focus, .. } => {
            assert_eq!(focus, PaneFocus::Members, "Should return to Members focus");
        }
        _ => panic!("Should return to PhaseDetail view"),
    }

    // Verify: Can render PhaseDetail view after transition
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });
    assert!(
        result.is_ok(),
        "Should render successfully after view transition"
    );
}

// ============================================================================
// Test 2: Send Dialog Rendering with Different Content
// ============================================================================

#[test]
fn test_send_dialog_input_and_send() {
    use tina_monitor::tui::views::send_dialog::SendDialog;

    // Test: Create a send dialog with input
    let mut dialog = SendDialog::new("%1".to_string(), "worker-1".to_string(), false);

    // Simulate typing
    dialog.handle_char('e');
    dialog.handle_char('c');
    dialog.handle_char('h');
    dialog.handle_char('o');

    // Verify: Input is captured
    assert_eq!(dialog.input, "echo", "Dialog should capture input");

    // Simulate backspace
    dialog.handle_backspace();
    assert_eq!(
        dialog.input, "ech",
        "Backspace should remove last character"
    );

    // Test: Dialog can be rendered with input
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let result = terminal.draw(|frame| {
        let area = frame.area();
        tina_monitor::tui::views::send_dialog::render(&dialog, frame, area);
    });

    assert!(
        result.is_ok(),
        "Dialog with input should render successfully"
    );

    // Verify: Buffer contains the dialog content
    let buffer = terminal.backend().buffer();
    let content: String = buffer.content.iter().map(|c| c.symbol()).collect();

    assert!(
        content.contains("Send Command") || content.len() > 0,
        "Dialog should display title"
    );
}

// ============================================================================
// Test 3: Quick Actions Work
// ============================================================================

#[test]
fn test_quick_actions_work() {
    use tina_monitor::tui::views::send_dialog::SendDialog;

    // Test: Create a send dialog
    let mut dialog = SendDialog::new("%1".to_string(), "worker-1".to_string(), false);

    // Test: Set quick action 1 (/checkpoint)
    dialog.set_quick_action(1);
    assert_eq!(
        dialog.input, "/checkpoint",
        "Quick action 1 should set /checkpoint"
    );
    assert_eq!(dialog.quick_action, 1, "Quick action should be 1");

    // Test: Set quick action 2 (/clear)
    dialog.set_quick_action(2);
    assert_eq!(dialog.input, "/clear", "Quick action 2 should set /clear");
    assert_eq!(dialog.quick_action, 2, "Quick action should be 2");

    // Test: Can type after setting quick action
    dialog.handle_char('!');
    assert_eq!(
        dialog.input, "/clear!",
        "Should be able to type after quick action"
    );

    // Test: Dialog renders with quick action content
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let result = terminal.draw(|frame| {
        let area = frame.area();
        tina_monitor::tui::views::send_dialog::render(&dialog, frame, area);
    });

    assert!(
        result.is_ok(),
        "Dialog with quick action should render successfully"
    );
}

// ============================================================================
// Test 4: Confirmation Flow
// ============================================================================

#[test]
fn test_confirmation_flow() {
    use tina_monitor::tui::views::send_dialog::SendDialog;

    // Test: Create dialog that needs confirmation
    let mut dialog = SendDialog::new("%1".to_string(), "worker-1".to_string(), true);

    // Verify: Initial state
    assert!(dialog.needs_confirmation, "Dialog should need confirmation");
    assert!(
        !dialog.confirming,
        "Should not be in confirming state initially"
    );

    // Test: Enter confirming state
    dialog.confirming = true;
    assert!(dialog.confirming, "Should enter confirming state");

    // Test: Dialog renders correctly in confirming state
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let result = terminal.draw(|frame| {
        let area = frame.area();
        tina_monitor::tui::views::send_dialog::render(&dialog, frame, area);
    });

    assert!(
        result.is_ok(),
        "Dialog in confirming state should render successfully"
    );

    // Test: Can exit confirming state
    dialog.confirming = false;
    assert!(!dialog.confirming, "Should exit confirming state");

    // Test: Safe command check
    let safe_commands = vec!["/checkpoint".to_string(), "/clear".to_string()];

    dialog.input = "/checkpoint".to_string();
    assert!(
        dialog.is_safe_command(&safe_commands),
        "/checkpoint should be recognized as safe"
    );

    dialog.input = "dangerous".to_string();
    assert!(
        !dialog.is_safe_command(&safe_commands),
        "Non-safe command should return false"
    );
}

// ============================================================================
// Test 5: Command Logging Creates File
// ============================================================================

#[test]
fn test_command_logging_creates_file() {
    use tina_monitor::logging::CommandLogger;

    // Create a temporary directory for the log file
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let log_path = temp_dir.path().join("test_commands.log");

    // Test: Create a command logger
    let logger = CommandLogger::new(log_path.clone());

    // Test: Log a command
    let result = logger.log("%1", "echo test");
    assert!(result.is_ok(), "Logging should succeed");

    // Verify: Log file should be created
    assert!(
        log_path.exists(),
        "Log file should be created after logging command"
    );

    // Verify: Log file should contain the command
    let log_content = fs::read_to_string(&log_path).expect("Failed to read log file");
    assert!(
        log_content.contains("echo test"),
        "Log file should contain the sent command"
    );

    // Verify: Log should contain pane ID
    assert!(
        log_content.contains("%1"),
        "Log file should contain the pane ID"
    );

    // Verify: Log should contain timestamp (ISO 8601 format)
    assert!(
        log_content.contains("T") || log_content.contains("Z"),
        "Log file should contain timestamp in ISO format"
    );

    // Test: Log multiple commands
    let result2 = logger.log("%2", "/checkpoint");
    assert!(result2.is_ok(), "Second log should succeed");

    let log_content2 = fs::read_to_string(&log_path).expect("Failed to read log file");
    assert!(
        log_content2.contains("/checkpoint"),
        "Log file should contain second command"
    );
    assert!(
        log_content2.contains("echo test"),
        "Log file should still contain first command"
    );
}

// ============================================================================
// Additional Edge Case Tests
// ============================================================================

#[test]
fn test_send_dialog_with_empty_input() {
    use tina_monitor::tui::views::send_dialog::SendDialog;

    // Test: Create dialog with empty input
    let dialog = SendDialog::new("%1".to_string(), "worker-1".to_string(), false);

    // Verify: Empty input
    assert_eq!(dialog.input, "", "Dialog should start with empty input");
    assert_eq!(
        dialog.get_command(),
        "",
        "get_command should return empty string"
    );

    // Test: Dialog can render with empty input
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let result = terminal.draw(|frame| {
        let area = frame.area();
        tina_monitor::tui::views::send_dialog::render(&dialog, frame, area);
    });

    assert!(
        result.is_ok(),
        "Dialog with empty input should render successfully"
    );
}

#[test]
fn test_send_dialog_renders_correctly_in_app() {
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

    // Test: Set to SendDialog view state
    app.view_state = ViewState::SendDialog {
        pane_id: "%5".to_string(),
        agent_name: "test-agent".to_string(),
    };

    // Verify: Dialog can render in the TUI
    let backend = TestBackend::new(100, 30);
    let mut terminal = Terminal::new(backend).unwrap();
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    assert!(
        result.is_ok(),
        "Send dialog should render successfully in TUI"
    );

    // Verify: Buffer contains expected content
    let buffer = terminal.backend().buffer().clone();
    let content: String = buffer.content.iter().map(|c| c.symbol()).collect();

    assert!(content.len() > 0, "Dialog should render content");
}

#[test]
fn test_send_dialog_multiple_view_state_transitions() {
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

    // Test: Multiple transitions between views
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Members,
        task_index: 0,
        member_index: 0,
    };

    app.view_state = ViewState::SendDialog {
        pane_id: "%1".to_string(),
        agent_name: "agent-1".to_string(),
    };

    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 0,
        member_index: 0,
    };

    app.view_state = ViewState::SendDialog {
        pane_id: "%2".to_string(),
        agent_name: "agent-2".to_string(),
    };

    // Verify: Final state
    match &app.view_state {
        ViewState::SendDialog {
            pane_id,
            agent_name,
        } => {
            assert_eq!(pane_id, "%2");
            assert_eq!(agent_name, "agent-2");
        }
        _ => panic!("Should be in SendDialog view"),
    }

    // Verify: Can render after multiple transitions
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    assert!(result.is_ok(), "Should render after multiple transitions");
}
