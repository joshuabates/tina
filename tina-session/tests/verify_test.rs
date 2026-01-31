use assert_cmd::prelude::*;
use predicates::prelude::*;
use std::fs;
use std::process::Command;
use tempfile::TempDir;

fn tina_session_bin() -> std::path::PathBuf {
    // Build target directory relative to the project
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("target");
    path.push("debug");
    path.push("tina-session");
    path
}

fn create_passing_rust_project(dir: &TempDir) {
    // Create Cargo.toml
    fs::write(
        dir.path().join("Cargo.toml"),
        r#"[package]
name = "test-project"
version = "0.1.0"
edition = "2021"
"#,
    )
    .unwrap();

    // Create src directory
    fs::create_dir(dir.path().join("src")).unwrap();

    // Create lib.rs with a passing test
    fs::write(
        dir.path().join("src/lib.rs"),
        r#"
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 2), 4);
    }
}
"#,
    )
    .unwrap();
}

fn create_failing_rust_project(dir: &TempDir) {
    // Create Cargo.toml
    fs::write(
        dir.path().join("Cargo.toml"),
        r#"[package]
name = "test-project"
version = "0.1.0"
edition = "2021"
"#,
    )
    .unwrap();

    // Create src directory
    fs::create_dir(dir.path().join("src")).unwrap();

    // Create lib.rs with a failing test
    fs::write(
        dir.path().join("src/lib.rs"),
        r#"
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_fails() {
        assert_eq!(add(2, 2), 5); // Intentional failure
    }
}
"#,
    )
    .unwrap();
}

#[test]
fn verify_command_passes_for_valid_rust_project() {
    let temp = TempDir::new().unwrap();
    create_passing_rust_project(&temp);

    Command::new(tina_session_bin())
        .args(["check", "verify", "--cwd", temp.path().to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("PASS"));
}

#[test]
fn verify_command_fails_for_failing_tests() {
    let temp = TempDir::new().unwrap();
    create_failing_rust_project(&temp);

    Command::new(tina_session_bin())
        .args(["check", "verify", "--cwd", temp.path().to_str().unwrap()])
        .assert()
        .code(1)
        .stdout(predicate::str::contains("FAIL"));
}
