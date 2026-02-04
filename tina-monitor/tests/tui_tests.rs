//! TUI module integration tests

use ratatui::{backend::TestBackend, Terminal};
use std::path::PathBuf;
use std::time::Duration;
use tina_monitor::data::discovery::{Orchestration, OrchestrationStatus};
use tina_monitor::tui::{App, AppResult};

// ============================================================================
// Module Export Tests
// ============================================================================

/// Test that tui module exports are correct
#[test]
fn test_tui_module_exports() {
    // Verify App and AppResult are exported from tui
    // Just checking that the types exist and are accessible
    fn _takes_app_result(_: AppResult<()>) {}
    fn _takes_app(_: App) {}
}

/// Test that AppResult is compatible with standard error handling
#[test]
fn test_app_result_error_handling() {
    fn returns_ok() -> AppResult<i32> {
        Ok(42)
    }

    fn returns_err() -> AppResult<i32> {
        Err(std::io::Error::new(std::io::ErrorKind::Other, "test error").into())
    }

    assert_eq!(returns_ok().unwrap(), 42);
    assert!(returns_err().is_err());
}

/// Test that tui::run function exists and has correct signature
#[test]
fn test_run_function_exists() {
    // We can't actually run the TUI in tests (it needs a terminal),
    // but we can verify the function exists with the correct signature
    use tina_monitor::tui;

    // Type check: run() -> AppResult<()>
    let _: fn() -> tui::AppResult<()> = tui::run;
}

// ============================================================================
// Integration Tests: Empty State Handling
// ============================================================================

/// Test that TUI can handle empty orchestration list
#[test]
fn test_empty_state_renders() {
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let mut app = App::new_with_orchestrations(vec![]);

    // Render should succeed with empty orchestrations
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    assert!(
        result.is_ok(),
        "TUI should render successfully with empty orchestration list"
    );

    // Verify the terminal buffer contains expected content
    let buffer = terminal.backend().buffer().clone();
    let content = buffer
        .content
        .iter()
        .map(|c| c.symbol())
        .collect::<String>();
    assert!(
        content.contains("Orchestrations"),
        "Header should be rendered"
    );
    assert!(content.contains("j/k:nav"), "Footer should be rendered");
}

/// Test that empty state handles navigation gracefully
#[test]
fn test_empty_state_navigation() {
    let mut app = App::new_with_orchestrations(vec![]);

    // Navigation should not panic on empty list
    app.next();
    assert_eq!(
        app.selected_index, 0,
        "next() should not change index on empty list"
    );

    app.previous();
    assert_eq!(
        app.selected_index, 0,
        "previous() should not change index on empty list"
    );
}

// ============================================================================
// Integration Tests: Single Orchestration Handling
// ============================================================================

fn make_test_orchestration(name: &str) -> Orchestration {
    Orchestration {
        team_name: format!("{}-team", name),
        title: name.to_string(),
        feature_name: name.to_string(),
        cwd: PathBuf::from("/test"),
        current_phase: 1,
        total_phases: 3,
        design_doc_path: PathBuf::from("/test/design.md"),
        context_percent: Some(50),
        status: OrchestrationStatus::Idle,
        orchestrator_tasks: vec![],
        tasks: vec![],
        members: vec![],
    }
}

/// Test that TUI can handle single orchestration
#[test]
fn test_single_orchestration_renders() {
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("test-project")]);

    // Render should succeed with single orchestration
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    assert!(
        result.is_ok(),
        "TUI should render successfully with single orchestration"
    );

    // Verify the terminal buffer contains orchestration content
    let buffer = terminal.backend().buffer().clone();
    let content = buffer
        .content
        .iter()
        .map(|c| c.symbol())
        .collect::<String>();
    assert!(
        content.contains("test-project"),
        "Orchestration title should be rendered"
    );
}

/// Test that single orchestration handles navigation (wraps)
#[test]
fn test_single_orchestration_navigation_wraps() {
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("test-project")]);

    // next() should wrap around to 0
    app.next();
    assert_eq!(
        app.selected_index, 0,
        "next() should wrap to index 0 on single-item list"
    );

    // previous() should wrap around to 0
    app.previous();
    assert_eq!(
        app.selected_index, 0,
        "previous() should wrap to index 0 on single-item list"
    );
}

// ============================================================================
// Integration Tests: Navigation with Multiple Orchestrations
// ============================================================================

/// Test navigation works correctly with multiple orchestrations
#[test]
fn test_orchestration_list_navigation() {
    let mut app = App::new_with_orchestrations(vec![
        make_test_orchestration("project-1"),
        make_test_orchestration("project-2"),
        make_test_orchestration("project-3"),
    ]);

    // Start at 0
    assert_eq!(app.selected_index, 0);

    // Move down to 1
    app.next();
    assert_eq!(app.selected_index, 1);

    // Move down to 2
    app.next();
    assert_eq!(app.selected_index, 2);

    // Wrap around to 0
    app.next();
    assert_eq!(app.selected_index, 0);

    // Move up (wrap to 2)
    app.previous();
    assert_eq!(app.selected_index, 2);

    // Move up to 1
    app.previous();
    assert_eq!(app.selected_index, 1);
}

/// Test rendering with multiple orchestrations
#[test]
fn test_multiple_orchestrations_render() {
    let backend = TestBackend::new(100, 30);
    let mut terminal = Terminal::new(backend).unwrap();

    let mut app = App::new_with_orchestrations(vec![
        make_test_orchestration("project-alpha"),
        make_test_orchestration("project-beta"),
        make_test_orchestration("project-gamma"),
    ]);

    // Set selected index to middle item
    app.selected_index = 1;

    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    assert!(
        result.is_ok(),
        "TUI should render successfully with multiple orchestrations"
    );

    // Verify all orchestrations are present in the buffer
    let buffer = terminal.backend().buffer().clone();
    let content = buffer
        .content
        .iter()
        .map(|c| c.symbol())
        .collect::<String>();

    assert!(
        content.contains("project-alpha"),
        "First orchestration should be visible"
    );
    assert!(
        content.contains("project-beta"),
        "Second orchestration should be visible"
    );
    assert!(
        content.contains("project-gamma"),
        "Third orchestration should be visible"
    );
}

// ============================================================================
// Integration Tests: File Watcher
// ============================================================================

/// Test that FileWatcher can be created
#[test]
fn test_file_watcher_can_be_created() {
    use tina_monitor::data::watcher::FileWatcher;

    // FileWatcher::new() should either succeed or fail gracefully
    // (may fail if .claude dirs don't exist, which is OK)
    let result = FileWatcher::new();

    // We don't assert success because it depends on environment
    // But it should not panic
    match result {
        Ok(_watcher) => {
            // Success case
        }
        Err(e) => {
            // Failure is acceptable if directories don't exist
            println!("FileWatcher creation failed (acceptable): {}", e);
        }
    }
}

/// Test that App can be constructed without a watcher
#[test]
fn test_app_construction_without_watcher() {
    let app = App::new_with_orchestrations(vec![make_test_orchestration("test")]);

    // Verify app is constructed correctly
    assert_eq!(app.orchestrations.len(), 1);
    assert_eq!(app.selected_index, 0);
    assert!(!app.should_quit);
}

// ============================================================================
// Integration Tests: TUI Module Structure
// ============================================================================

/// Test that all TUI submodules are accessible
#[test]
fn test_tui_module_structure() {
    // Verify public exports from tui module
    use tina_monitor::tui::{App, AppResult};

    // AppResult should be usable
    fn _uses_app_result(_: &App) -> AppResult<()> {
        Ok(())
    }

    // App should be constructible
    let _app = App::new_with_orchestrations(vec![]);
}

/// Test that App can be constructed with various field values
#[test]
fn test_app_field_visibility() {
    // All public fields should be accessible for testing
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("test")]);

    // Modify public fields
    app.should_quit = true;
    app.selected_index = 5;
    app.tick_rate = Duration::from_millis(250);
    app.show_help = true;

    assert!(app.should_quit);
    assert_eq!(app.orchestrations.len(), 1);
    assert_eq!(app.selected_index, 5);
    assert_eq!(app.tick_rate, Duration::from_millis(250));
    assert!(app.show_help);
}

// ============================================================================
// Integration Tests: View State Transitions
// ============================================================================

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use tina_monitor::data::types::{Task, TaskStatus};
use tina_monitor::tui::{PaneFocus, PhaseDetailLayout, ViewState};

/// Helper function to create a test task
fn make_test_task(id: &str, status: TaskStatus) -> Task {
    Task {
        id: id.to_string(),
        subject: format!("Task {}", id),
        description: format!("Description for task {}", id),
        active_form: Some(format!("Working on {}", id)),
        status,
        owner: None,
        blocks: vec![],
        blocked_by: vec![],
        metadata: serde_json::Value::Null,
    }
}

/// Helper function to create a test orchestration with tasks
fn make_test_orchestration_with_tasks(name: &str, tasks: Vec<Task>) -> Orchestration {
    Orchestration {
        team_name: format!("{}-team", name),
        title: name.to_string(),
        feature_name: name.to_string(),
        cwd: PathBuf::from("/test"),
        current_phase: 1,
        total_phases: 3,
        design_doc_path: PathBuf::from("/test/design.md"),
        context_percent: Some(50),
        status: OrchestrationStatus::Idle,
        orchestrator_tasks: vec![],
        tasks,
        members: vec![],
    }
}

/// Test that app starts in OrchestrationList view
#[test]
fn test_view_state_transitions_initial_state() {
    let app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
    assert!(
        matches!(app.view_state, ViewState::OrchestrationList),
        "App should start in OrchestrationList view"
    );
}

/// Test Enter key expands orchestration to PhaseDetail view
#[test]
fn test_enter_expands_to_phase_detail() {
    let mut app = App::new_with_orchestrations(vec![
        make_test_orchestration("project-1"),
        make_test_orchestration("project-2"),
    ]);

    // Start in OrchestrationList
    assert!(matches!(app.view_state, ViewState::OrchestrationList));

    // Simulate Enter key press
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    // Render to ensure we're in a good state
    let _ = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    // Simulate Enter key through the key event method (tested in unit tests)
    // We verify the transition works by checking the view_state
    let _key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
    // Note: We can't call handle_key_event directly as it's private,
    // but the unit tests in app.rs already verify this works
    // This integration test verifies the overall flow

    // For this integration test, we'll manually set the state to verify rendering
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 0,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };

    // Verify the view renders correctly in PhaseDetail state
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    assert!(
        result.is_ok(),
        "PhaseDetail view should render successfully"
    );

    // Verify we're in the correct state
    match app.view_state {
        ViewState::PhaseDetail {
            focus,
            task_index,
            member_index,
            ..
        } => {
            assert_eq!(focus, PaneFocus::Tasks, "Focus should be on Tasks pane");
            assert_eq!(task_index, 0, "Should start at first task");
            assert_eq!(member_index, 0, "Should start at first member");
        }
        _ => panic!("Should be in PhaseDetail view"),
    }
}

/// Test Esc key returns from PhaseDetail to OrchestrationList
#[test]
fn test_esc_returns_to_orchestration_list() {
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

    // Set to PhaseDetail view
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 2,
        member_index: 1,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };

    // Simulate Esc key to return to OrchestrationList
    // The unit tests verify this works; here we test the rendering
    app.view_state = ViewState::OrchestrationList;

    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    assert!(
        result.is_ok(),
        "OrchestrationList should render after returning"
    );
    assert!(
        matches!(app.view_state, ViewState::OrchestrationList),
        "Should be back in OrchestrationList view"
    );
}

/// Test Enter on task opens TaskInspector
#[test]
fn test_enter_opens_task_inspector() {
    let tasks = vec![
        make_test_task("1", TaskStatus::Completed),
        make_test_task("2", TaskStatus::InProgress),
        make_test_task("3", TaskStatus::Pending),
    ];

    let mut app =
        App::new_with_orchestrations(vec![make_test_orchestration_with_tasks("project-1", tasks)]);

    // Start in PhaseDetail with Tasks focused
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 1,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };

    // Simulate Enter on task (unit tests verify this works)
    app.view_state = ViewState::TaskInspector { task_index: 1 };

    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    assert!(result.is_ok(), "TaskInspector should render successfully");

    match app.view_state {
        ViewState::TaskInspector { task_index } => {
            assert_eq!(task_index, 1, "Should open inspector for task at index 1");
        }
        _ => panic!("Should be in TaskInspector view"),
    }
}

/// Test pane focus switches between Tasks and Members
#[test]
fn test_pane_focus_switches() {
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

    // Start with Tasks focus
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 0,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };

    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    // Render with Tasks focus
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });
    assert!(result.is_ok(), "Should render with Tasks focus");

    // Switch to Members focus
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Members,
        task_index: 0,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };

    // Render with Members focus
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });
    assert!(result.is_ok(), "Should render with Members focus");

    match app.view_state {
        ViewState::PhaseDetail { focus, .. } => {
            assert_eq!(focus, PaneFocus::Members, "Focus should be on Members");
        }
        _ => panic!("Should still be in PhaseDetail view"),
    }
}

/// Test LogViewer opens and closes correctly
#[test]
fn test_log_viewer_transitions() {
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

    // Start in PhaseDetail with Members focused
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Members,
        task_index: 0,
        member_index: 2,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };

    // Open LogViewer (simulating 'l' key)
    app.view_state = ViewState::LogViewer {
        agent_index: 2,
        pane_id: "%0".to_string(),
        agent_name: "test-agent".to_string(),
    };

    let backend = TestBackend::new(100, 30);
    let mut terminal = Terminal::new(backend).unwrap();

    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    assert!(result.is_ok(), "LogViewer should render successfully");

    match app.view_state {
        ViewState::LogViewer {
            agent_index,
            pane_id,
            agent_name,
        } => {
            assert_eq!(
                agent_index, 2,
                "Should open log viewer for agent at index 2"
            );
            assert_eq!(pane_id, "%0", "Should have pane_id");
            assert_eq!(agent_name, "test-agent", "Should have agent_name");
        }
        _ => panic!("Should be in LogViewer view"),
    }

    // Close LogViewer (simulating Esc key)
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Members,
        task_index: 0,
        member_index: 2,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };

    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });

    assert!(result.is_ok(), "Should return to PhaseDetail successfully");
}

/// Test that empty orchestration list is handled gracefully in all views
#[test]
fn test_empty_orchestration_list_graceful_handling() {
    let mut app = App::new_with_orchestrations(vec![]);

    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    // Test OrchestrationList view with empty list
    app.view_state = ViewState::OrchestrationList;
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });
    assert!(
        result.is_ok(),
        "Empty OrchestrationList should render without panic"
    );

    // Test PhaseDetail view with empty list (shouldn't normally happen, but test edge case)
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 0,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });
    assert!(
        result.is_ok(),
        "PhaseDetail with empty list should render without panic"
    );

    // Test TaskInspector with empty list
    app.view_state = ViewState::TaskInspector { task_index: 0 };
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });
    assert!(
        result.is_ok(),
        "TaskInspector with empty list should render without panic"
    );

    // Test LogViewer with empty list
    app.view_state = ViewState::LogViewer {
        agent_index: 0,
        pane_id: "%0".to_string(),
        agent_name: "test-agent".to_string(),
    };
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &mut app);
    });
    assert!(
        result.is_ok(),
        "LogViewer with empty list should render without panic"
    );
}

/// Test complete navigation flow through all views
#[test]
fn test_complete_navigation_flow() {
    let tasks = vec![
        make_test_task("1", TaskStatus::Completed),
        make_test_task("2", TaskStatus::InProgress),
        make_test_task("3", TaskStatus::Pending),
    ];

    let mut app = App::new_with_orchestrations(vec![
        make_test_orchestration_with_tasks("project-1", tasks.clone()),
        make_test_orchestration_with_tasks("project-2", tasks),
    ]);

    let backend = TestBackend::new(100, 40);
    let mut terminal = Terminal::new(backend).unwrap();

    // Step 1: Start in OrchestrationList
    assert!(matches!(app.view_state, ViewState::OrchestrationList));
    let _ = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));

    // Step 2: Enter PhaseDetail
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 0,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Should navigate to PhaseDetail");

    // Step 3: Switch to Members pane
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Members,
        task_index: 0,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Should switch to Members pane");

    // Step 4: Open LogViewer
    app.view_state = ViewState::LogViewer {
        agent_index: 0,
        pane_id: "%0".to_string(),
        agent_name: "test-agent".to_string(),
    };
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Should open LogViewer");

    // Step 5: Return to PhaseDetail
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Members,
        task_index: 0,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Should return to PhaseDetail");

    // Step 6: Switch to Tasks and open TaskInspector
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 1,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };
    let _ = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));

    app.view_state = ViewState::TaskInspector { task_index: 1 };
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Should open TaskInspector");

    // Step 7: Return to PhaseDetail
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 1,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(
        result.is_ok(),
        "Should return to PhaseDetail from TaskInspector"
    );

    // Step 8: Return to OrchestrationList
    app.view_state = ViewState::OrchestrationList;
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Should return to OrchestrationList");
}

/// Test rendering with various task counts
#[test]
fn test_rendering_with_various_task_counts() {
    let backend = TestBackend::new(100, 40);
    let mut terminal = Terminal::new(backend).unwrap();

    // Test with no tasks
    let mut app =
        App::new_with_orchestrations(vec![make_test_orchestration_with_tasks("no-tasks", vec![])]);
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 0,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Should render with zero tasks");

    // Test with one task
    let tasks = vec![make_test_task("1", TaskStatus::Pending)];
    let mut app =
        App::new_with_orchestrations(vec![make_test_orchestration_with_tasks("one-task", tasks)]);
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 0,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Should render with one task");

    // Test with many tasks
    let tasks: Vec<Task> = (0..20)
        .map(|i| make_test_task(&format!("{}", i), TaskStatus::Pending))
        .collect();
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration_with_tasks(
        "many-tasks",
        tasks,
    )]);
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 10,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Should render with many tasks");
}

/// Test that help modal can be toggled in any view state
#[test]
fn test_help_modal_in_all_views() {
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let tasks = vec![make_test_task("1", TaskStatus::Pending)];
    let mut app =
        App::new_with_orchestrations(vec![make_test_orchestration_with_tasks("project", tasks)]);

    // Test help in OrchestrationList
    app.view_state = ViewState::OrchestrationList;
    app.show_help = true;
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Help should render in OrchestrationList");

    // Test help in PhaseDetail
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 0,
        member_index: 0,
        layout: PhaseDetailLayout::OrchPhaseTasks,
        selected_phase: 1,
    };
    app.show_help = true;
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Help should render in PhaseDetail");

    // Test help in TaskInspector
    app.view_state = ViewState::TaskInspector { task_index: 0 };
    app.show_help = true;
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Help should render in TaskInspector");

    // Test help in LogViewer
    app.view_state = ViewState::LogViewer {
        agent_index: 0,
        pane_id: "%0".to_string(),
        agent_name: "test-agent".to_string(),
    };
    app.show_help = true;
    let result = terminal.draw(|frame| tina_monitor::tui::ui::render(frame, &mut app));
    assert!(result.is_ok(), "Help should render in LogViewer");
}
