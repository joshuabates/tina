use std::path::Path;
use std::process::Stdio;
use std::time::Instant;

use anyhow::bail;
use chrono::Utc;

use tina_session::config;
use tina_session::routing;

/// Generate a run ID in the format `codex_{YYYYMMDD}_{random8}`.
fn generate_run_id() -> String {
    let date = Utc::now().format("%Y%m%d");
    let random: String = (0..8)
        .map(|_| {
            let idx = (rand_byte() % 36) as usize;
            b"abcdefghijklmnopqrstuvwxyz0123456789"[idx] as char
        })
        .collect();
    format!("codex_{date}_{random}")
}

/// Simple pseudo-random byte from system time.
fn rand_byte() -> u8 {
    use std::time::SystemTime;
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    (nanos ^ (nanos >> 8) ^ (nanos >> 16)) as u8
}

/// Resolve prompt text: if it starts with `@`, read from the named file.
fn resolve_prompt(prompt: &str) -> anyhow::Result<String> {
    if let Some(path) = prompt.strip_prefix('@') {
        let content = std::fs::read_to_string(path)
            .map_err(|e| anyhow::anyhow!("failed to read prompt file '{}': {}", path, e))?;
        Ok(content)
    } else {
        Ok(prompt.to_string())
    }
}

/// Truncate a byte string to at most `max_bytes`, appending a truncation notice.
fn truncate_output(output: &str, max_bytes: usize) -> String {
    if output.len() <= max_bytes {
        return output.to_string();
    }
    // Find a valid UTF-8 boundary at or before max_bytes
    let mut end = max_bytes;
    while end > 0 && !output.is_char_boundary(end) {
        end -= 1;
    }
    let mut truncated = output[..end].to_string();
    truncated.push_str("\n... [output truncated]");
    truncated
}

/// Deterministic agent name: `codex-{role}-{phase}-{hash8}`.
fn agent_name(task_id: &str, phase: &str, role: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    task_id.hash(&mut hasher);
    let hash = hasher.finish();
    let hash8 = format!("{:08x}", hash & 0xFFFF_FFFF);
    format!("codex-{role}-{phase}-{hash8}")
}

pub fn run(
    feature: &str,
    phase: &str,
    task_id: &str,
    prompt: &str,
    cwd: &Path,
    model_override: Option<&str>,
    sandbox_override: Option<&str>,
    timeout_override: Option<u64>,
    output_path: Option<&Path>,
    role: Option<&str>,
) -> anyhow::Result<u8> {
    let cfg = config::load_config()?;
    let codex = &cfg.codex;

    if !codex.enabled {
        bail!("codex is disabled in config (codex.enabled = false)");
    }

    let model = model_override.unwrap_or(&codex.default_model);

    let cli = routing::cli_for_model(model, &cfg.cli_routing);
    if cli != routing::AgentCli::Codex {
        bail!(
            "model '{}' does not route to codex (routes to {})",
            model,
            cli
        );
    }

    let run_id = generate_run_id();
    let resolved_prompt = resolve_prompt(prompt)?;
    let sandbox = sandbox_override.unwrap_or(&codex.default_sandbox);
    let timeout_secs = timeout_override.unwrap_or(codex.timeout_secs);
    let role_str = role.unwrap_or("worker");

    // Emit start event to Convex
    emit_start_event(
        feature,
        phase,
        task_id,
        model,
        &run_id,
        resolved_prompt.len(),
        role_str,
    )?;

    // Spawn codex subprocess
    let start = Instant::now();
    let result = spawn_codex(
        &codex.binary,
        model,
        sandbox,
        &resolved_prompt,
        cwd,
        timeout_secs,
    );
    let duration_secs = start.elapsed().as_secs_f64();

    let (exit_code, raw_stdout, raw_stderr, status_str) = match result {
        Ok((code, stdout, stderr)) => {
            let status = if code == 0 { "completed" } else { "failed" };
            (code, stdout, stderr, status.to_string())
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("timed out") {
                (124, String::new(), msg, "timed_out".to_string())
            } else {
                (1, String::new(), msg, "failed".to_string())
            }
        }
    };

    let stdout = truncate_output(&raw_stdout, codex.max_output_bytes);
    let stderr = truncate_output(&raw_stderr, codex.max_output_bytes);

    // Emit terminal event
    emit_terminal_event(
        feature,
        phase,
        task_id,
        model,
        &run_id,
        &status_str,
        exit_code,
        stdout.len(),
        stderr.len(),
        duration_secs,
        role_str,
    )?;

    // Upsert team member
    let name = agent_name(task_id, phase, role_str);
    upsert_team_member(feature, phase, &name, model)?;

    // Write output file if requested
    if let Some(path) = output_path {
        std::fs::write(path, &stdout)?;
    }

    // Print JSON envelope to stdout
    let envelope = serde_json::json!({
        "run_id": run_id,
        "status": status_str,
        "model": model,
        "exit_code": exit_code,
        "duration_secs": duration_secs,
        "stdout": stdout,
        "stderr": stderr,
        "output_path": output_path.map(|p| p.display().to_string()),
    });
    println!("{}", serde_json::to_string_pretty(&envelope)?);

    Ok(if exit_code == 0 { 0 } else { 1 })
}

fn spawn_codex(
    binary: &str,
    model: &str,
    sandbox: &str,
    prompt: &str,
    cwd: &Path,
    timeout_secs: u64,
) -> anyhow::Result<(i32, String, String)> {
    let mut child = std::process::Command::new(binary)
        .arg("exec")
        .arg("--model")
        .arg(model)
        .arg("--full-auto")
        .arg("--sandbox")
        .arg(sandbox)
        .arg(prompt)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| anyhow::anyhow!("failed to spawn codex binary '{}': {}", binary, e))?;

    // Enforce timeout
    let deadline = Instant::now() + std::time::Duration::from_secs(timeout_secs);
    loop {
        match child.try_wait()? {
            Some(status) => {
                let stdout = child.stdout.take().map_or_else(String::new, |mut r| {
                    let mut s = String::new();
                    std::io::Read::read_to_string(&mut r, &mut s).unwrap_or(0);
                    s
                });
                let stderr = child.stderr.take().map_or_else(String::new, |mut r| {
                    let mut s = String::new();
                    std::io::Read::read_to_string(&mut r, &mut s).unwrap_or(0);
                    s
                });
                return Ok((status.code().unwrap_or(1), stdout, stderr));
            }
            None => {
                if Instant::now() >= deadline {
                    // Kill the process on timeout
                    let _ = child.kill();
                    let _ = child.wait();
                    bail!("codex process timed out after {} seconds", timeout_secs);
                }
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
        }
    }
}

fn emit_start_event(
    feature: &str,
    phase: &str,
    task_id: &str,
    model: &str,
    run_id: &str,
    prompt_length: usize,
    role: &str,
) -> anyhow::Result<()> {
    let detail = serde_json::json!({
        "runId": run_id,
        "taskId": task_id,
        "model": model,
        "promptLength": prompt_length,
        "role": role,
    });

    tina_session::convex::run_convex_write(|mut writer| async move {
        let orch = writer.get_by_feature(feature).await?;
        let orch = orch
            .ok_or_else(|| anyhow::anyhow!("no orchestration found for feature '{}'", feature))?;
        writer
            .record_event(&tina_session::convex::EventArgs {
                orchestration_id: orch.id,
                phase_number: Some(phase.to_string()),
                event_type: "codex_run_started".to_string(),
                source: "tina-session".to_string(),
                summary: format!("Codex run started for task {}", task_id),
                detail: Some(serde_json::to_string(&detail)?),
                recorded_at: Utc::now().to_rfc3339(),
            })
            .await?;
        Ok(())
    })
}

fn emit_terminal_event(
    feature: &str,
    phase: &str,
    task_id: &str,
    model: &str,
    run_id: &str,
    status: &str,
    exit_code: i32,
    stdout_bytes: usize,
    stderr_bytes: usize,
    duration_secs: f64,
    role: &str,
) -> anyhow::Result<()> {
    let event_type = match status {
        "completed" => "codex_run_completed",
        "timed_out" => "codex_run_timed_out",
        _ => "codex_run_failed",
    };
    let detail = serde_json::json!({
        "runId": run_id,
        "taskId": task_id,
        "model": model,
        "exitCode": exit_code,
        "stdoutBytes": stdout_bytes,
        "stderrBytes": stderr_bytes,
        "durationSecs": duration_secs,
        "role": role,
    });

    tina_session::convex::run_convex_write(|mut writer| async move {
        let orch = writer.get_by_feature(feature).await?;
        let orch = orch
            .ok_or_else(|| anyhow::anyhow!("no orchestration found for feature '{}'", feature))?;
        writer
            .record_event(&tina_session::convex::EventArgs {
                orchestration_id: orch.id,
                phase_number: Some(phase.to_string()),
                event_type: event_type.to_string(),
                source: "tina-session".to_string(),
                summary: format!("Codex run {} for task {}", status, task_id),
                detail: Some(serde_json::to_string(&detail)?),
                recorded_at: Utc::now().to_rfc3339(),
            })
            .await?;
        Ok(())
    })
}

fn upsert_team_member(
    feature: &str,
    phase: &str,
    agent_name: &str,
    model: &str,
) -> anyhow::Result<()> {
    tina_session::convex::run_convex_write(|mut writer| async move {
        let orch = writer.get_by_feature(feature).await?;
        let orch = orch
            .ok_or_else(|| anyhow::anyhow!("no orchestration found for feature '{}'", feature))?;
        writer
            .upsert_team_member(&tina_session::convex::UpsertTeamMemberArgs {
                orchestration_id: orch.id,
                phase_number: phase.to_string(),
                agent_name: agent_name.to_string(),
                agent_type: Some("codex".to_string()),
                model: Some(model.to_string()),
                joined_at: Some(Utc::now().to_rfc3339()),
                recorded_at: Utc::now().to_rfc3339(),
                tmux_pane_id: None,
            })
            .await?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_id_format() {
        let id = generate_run_id();
        assert!(
            id.starts_with("codex_"),
            "run_id should start with 'codex_': {}",
            id
        );
        // Format: codex_YYYYMMDD_xxxxxxxx
        let parts: Vec<&str> = id.split('_').collect();
        assert_eq!(parts.len(), 3);
        assert_eq!(
            parts[1].len(),
            8,
            "date part should be 8 chars: {}",
            parts[1]
        );
        assert_eq!(
            parts[2].len(),
            8,
            "random part should be 8 chars: {}",
            parts[2]
        );
    }

    #[test]
    fn prompt_resolution_plain_text() {
        let result = resolve_prompt("hello world").unwrap();
        assert_eq!(result, "hello world");
    }

    #[test]
    fn prompt_resolution_from_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("prompt.txt");
        std::fs::write(&file, "file content here").unwrap();
        let result = resolve_prompt(&format!("@{}", file.display())).unwrap();
        assert_eq!(result, "file content here");
    }

    #[test]
    fn prompt_resolution_missing_file() {
        let result = resolve_prompt("@/nonexistent/path/file.txt");
        assert!(result.is_err());
    }

    #[test]
    fn truncation_under_limit() {
        let output = "short";
        assert_eq!(truncate_output(output, 100), "short");
    }

    #[test]
    fn truncation_at_limit() {
        let output = "abcde";
        assert_eq!(truncate_output(output, 5), "abcde");
    }

    #[test]
    fn truncation_over_limit() {
        let output = "hello world this is too long";
        let result = truncate_output(output, 10);
        assert!(result.starts_with("hello worl"));
        assert!(result.contains("[output truncated]"));
    }

    #[test]
    fn agent_name_format() {
        let name = agent_name("task-123", "1", "worker");
        assert!(name.starts_with("codex-worker-1-"), "got: {}", name);
        assert_eq!(name.len(), "codex-worker-1-".len() + 8);
    }

    #[test]
    fn agent_name_deterministic() {
        let name1 = agent_name("task-abc", "2", "worker");
        let name2 = agent_name("task-abc", "2", "worker");
        assert_eq!(name1, name2);
    }

    #[test]
    fn agent_name_different_for_different_tasks() {
        let name1 = agent_name("task-1", "1", "worker");
        let name2 = agent_name("task-2", "1", "worker");
        assert_ne!(name1, name2);
    }

    #[test]
    fn agent_name_includes_role() {
        let worker = agent_name("task-1", "1", "worker");
        let reviewer = agent_name("task-1", "1", "spec-reviewer");
        assert!(worker.starts_with("codex-worker-"), "got: {}", worker);
        assert!(
            reviewer.starts_with("codex-spec-reviewer-"),
            "got: {}",
            reviewer
        );
        assert_ne!(worker, reviewer);
    }
}
