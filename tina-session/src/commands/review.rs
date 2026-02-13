use serde_json::json;
use tina_session::convex;

/// Start a new review for a phase or orchestration.
pub fn start(
    feature: &str,
    phase: Option<&str>,
    reviewer: &str,
    json_mode: bool,
) -> Result<u8, anyhow::Error> {
    let feature_name = feature.to_string();
    let phase_str = phase.map(|s| s.to_string());
    let reviewer_str = reviewer.to_string();

    let (review_id, orchestration_id) =
        convex::run_convex(|mut writer| async move {
            let orch = writer
                .get_by_feature(&feature_name)
                .await?
                .ok_or_else(|| {
                    anyhow::anyhow!(
                        "Orchestration not found for feature: {}",
                        feature_name
                    )
                })?;

            let review_id = writer
                .create_review(&orch.id, phase_str.as_deref(), &reviewer_str)
                .await?;

            Ok((review_id, orch.id))
        })?;

    if json_mode {
        println!(
            "{}",
            json!({
                "ok": true,
                "reviewId": review_id,
                "orchestrationId": orchestration_id,
            })
        );
    } else {
        println!("Started review: {}", review_id);
    }
    Ok(0)
}

/// Complete an open review.
pub fn complete(
    _feature: &str,
    review_id: &str,
    status: &str,
    json_mode: bool,
) -> Result<u8, anyhow::Error> {
    let rid = review_id.to_string();
    let st = status.to_string();

    convex::run_convex(|mut writer| async move {
        writer.complete_review(&rid, &st).await
    })?;

    if json_mode {
        println!(
            "{}",
            json!({
                "ok": true,
                "reviewId": review_id,
                "status": status,
            })
        );
    } else {
        println!("Completed review {} as {}", review_id, status);
    }
    Ok(0)
}

/// Add a finding (review thread).
pub fn add_finding(
    review_id: &str,
    orchestration_id: &str,
    file: &str,
    line: i64,
    commit: &str,
    severity: &str,
    gate: &str,
    summary: &str,
    body: &str,
    source: &str,
    author: &str,
    json_mode: bool,
) -> Result<u8, anyhow::Error> {
    let rid = review_id.to_string();
    let oid = orchestration_id.to_string();
    let f = file.to_string();
    let c = commit.to_string();
    let sev = severity.to_string();
    let g = gate.to_string();
    let sum = summary.to_string();
    let b = body.to_string();
    let src = source.to_string();
    let auth = author.to_string();

    let thread_id = convex::run_convex(|mut writer| async move {
        writer
            .create_review_thread(&rid, &oid, &f, line, &c, &sum, &b, &sev, &src, &auth, &g)
            .await
    })?;

    if json_mode {
        println!(
            "{}",
            json!({
                "ok": true,
                "threadId": thread_id,
            })
        );
    } else {
        println!("Added finding: {}", thread_id);
    }
    Ok(0)
}

/// Resolve a finding.
pub fn resolve_finding(
    finding_id: &str,
    resolved_by: &str,
    json_mode: bool,
) -> Result<u8, anyhow::Error> {
    let fid = finding_id.to_string();
    let rb = resolved_by.to_string();

    convex::run_convex(|mut writer| async move {
        writer.resolve_review_thread(&fid, &rb).await
    })?;

    if json_mode {
        println!(
            "{}",
            json!({
                "ok": true,
                "findingId": finding_id,
            })
        );
    } else {
        println!("Resolved finding: {}", finding_id);
    }
    Ok(0)
}

/// Start a check record.
pub fn start_check(
    review_id: &str,
    orchestration_id: &str,
    name: &str,
    kind: &str,
    command: Option<&str>,
    json_mode: bool,
) -> Result<u8, anyhow::Error> {
    let rid = review_id.to_string();
    let oid = orchestration_id.to_string();
    let n = name.to_string();
    let k = kind.to_string();
    let cmd = command.map(|s| s.to_string());

    let check_id = convex::run_convex(|mut writer| async move {
        writer
            .start_review_check(&rid, &oid, &n, &k, cmd.as_deref())
            .await
    })?;

    if json_mode {
        println!(
            "{}",
            json!({
                "ok": true,
                "checkId": check_id,
            })
        );
    } else {
        println!("Started check: {}", name);
    }
    Ok(0)
}

/// Complete a check.
pub fn complete_check(
    review_id: &str,
    name: &str,
    status: &str,
    comment: Option<&str>,
    output: Option<&str>,
    json_mode: bool,
) -> Result<u8, anyhow::Error> {
    let rid = review_id.to_string();
    let n = name.to_string();
    let st = status.to_string();
    let cmt = comment.map(|s| s.to_string());
    let out = output.map(|s| s.to_string());

    convex::run_convex(|mut writer| async move {
        writer
            .complete_review_check(&rid, &n, &st, cmt.as_deref(), out.as_deref())
            .await
    })?;

    if json_mode {
        println!(
            "{}",
            json!({
                "ok": true,
                "name": name,
                "status": status,
            })
        );
    } else {
        println!("Completed check {} as {}", name, status);
    }
    Ok(0)
}

/// Run all CLI checks from tina-checks.toml.
pub fn run_checks(
    feature: &str,
    review_id: &str,
    json_mode: bool,
) -> Result<u8, anyhow::Error> {
    let orch = load_orchestration(feature)?;
    let worktree = orch
        .worktree_path
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("No worktree_path for orchestration"))?;

    let checks_path = std::path::Path::new(worktree).join("tina-checks.toml");
    let checks_config = parse_checks_toml(&checks_path)?;

    let cli_checks: Vec<&CheckEntry> = checks_config
        .check
        .iter()
        .filter(|c| c.kind.as_deref() != Some("project"))
        .collect();

    if cli_checks.is_empty() {
        if json_mode {
            println!("{}", json!({ "ok": true, "checks": [] }));
        } else {
            println!("No CLI checks found in tina-checks.toml");
        }
        return Ok(0);
    }

    // 3. Run each CLI check
    let mut results = Vec::new();
    for check in &cli_checks {
        let result = run_single_check(check, worktree, review_id, &orch.id)?;
        if !json_mode {
            let status = result["status"].as_str().unwrap_or("unknown");
            let icon = if status == "passed" { "PASS" } else { "FAIL" };
            let ms = result["duration_ms"].as_u64().unwrap_or(0);
            eprintln!("[{}] {} ({}ms)", icon, &check.name, ms);
        }
        results.push(result);
    }

    if json_mode {
        println!("{}", json!({ "ok": true, "checks": results }));
    }
    Ok(0)
}

/// Approve a gate.
pub fn gate_approve(
    feature: &str,
    gate: &str,
    decided_by: &str,
    summary: &str,
    json_mode: bool,
) -> Result<u8, anyhow::Error> {
    let orch = load_orchestration(feature)?;
    let g = gate.to_string();
    let db = decided_by.to_string();
    let sum = summary.to_string();

    let gate_id = convex::run_convex(|mut writer| async move {
        writer
            .upsert_review_gate(&orch.id, &g, "approved", "human", Some(&db), &sum)
            .await
    })?;

    if json_mode {
        println!(
            "{}",
            json!({
                "ok": true,
                "gateId": gate_id,
                "gate": gate,
                "status": "approved",
            })
        );
    } else {
        println!("Approved gate: {}", gate);
    }
    Ok(0)
}

/// Block a gate.
pub fn gate_block(
    feature: &str,
    gate: &str,
    reason: &str,
    decided_by: &str,
    json_mode: bool,
) -> Result<u8, anyhow::Error> {
    let orch = load_orchestration(feature)?;
    let g = gate.to_string();
    let r = reason.to_string();
    let db = decided_by.to_string();

    let gate_id = convex::run_convex(|mut writer| async move {
        writer
            .upsert_review_gate(&orch.id, &g, "blocked", "review-agent", Some(&db), &r)
            .await
    })?;

    if json_mode {
        println!(
            "{}",
            json!({
                "ok": true,
                "gateId": gate_id,
                "gate": gate,
                "status": "blocked",
            })
        );
    } else {
        println!("Blocked gate: {} ({})", gate, reason);
    }
    Ok(0)
}

// --- Shared helpers ---

fn load_orchestration(feature: &str) -> anyhow::Result<convex::OrchestrationRecord> {
    let feature_name = feature.to_string();
    convex::run_convex(|mut writer| async move {
        writer.get_by_feature(&feature_name).await
    })?
    .ok_or_else(|| anyhow::anyhow!("Orchestration not found for feature: {}", feature))
}

// --- Check execution helpers ---

fn execute_shell_command(command: &str, cwd: &str) -> (i32, String) {
    match std::process::Command::new("sh")
        .arg("-c")
        .arg(command)
        .current_dir(cwd)
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = if stderr.is_empty() {
                stdout.to_string()
            } else {
                format!("{}\n{}", stdout, stderr)
            };
            (output.status.code().unwrap_or(1), combined)
        }
        Err(e) => (1, format!("Failed to execute: {}", e)),
    }
}

fn run_single_check(
    check: &CheckEntry,
    worktree: &str,
    review_id: &str,
    orch_id: &str,
) -> anyhow::Result<serde_json::Value> {
    let command = check.command.as_deref().unwrap_or("");
    let name = &check.name;

    // Record check start in Convex
    let rid = review_id.to_string();
    let oid = orch_id.to_string();
    let n = name.clone();
    let cmd = command.to_string();
    let _check_id = convex::run_convex(|mut writer| async move {
        writer
            .start_review_check(&rid, &oid, &n, "cli", Some(&cmd))
            .await
    })?;

    // Execute command
    let start = std::time::Instant::now();
    let (exit_code, stdout_stderr) = execute_shell_command(command, worktree);
    let duration_ms = start.elapsed().as_millis() as u64;
    let check_status = if exit_code == 0 { "passed" } else { "failed" };

    // Record check completion in Convex
    let rid = review_id.to_string();
    let n = name.clone();
    let st = check_status.to_string();
    let out = stdout_stderr.clone();
    convex::run_convex(|mut writer| async move {
        writer
            .complete_review_check(&rid, &n, &st, None, Some(&out))
            .await
    })?;

    Ok(json!({
        "name": name,
        "command": command,
        "status": check_status,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "output": stdout_stderr,
    }))
}

// --- tina-checks.toml parsing ---

#[derive(serde::Deserialize)]
struct ChecksConfig {
    check: Vec<CheckEntry>,
}

#[derive(serde::Deserialize)]
struct CheckEntry {
    name: String,
    #[serde(default)]
    command: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[allow(dead_code)]
    #[serde(default)]
    path: Option<String>,
}

fn parse_checks_toml(path: &std::path::Path) -> anyhow::Result<ChecksConfig> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| anyhow::anyhow!("Failed to read {}: {}", path.display(), e))?;
    let config: ChecksConfig = toml::from_str(&content)
        .map_err(|e| anyhow::anyhow!("Failed to parse {}: {}", path.display(), e))?;
    Ok(config)
}
