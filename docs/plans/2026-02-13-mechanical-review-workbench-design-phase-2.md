# Mechanical Review Workbench Phase 2: tina-session Review CLI

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 3e74cfbdff9bf2d8e014cf99ac31290f6bb997e0

**Goal:** Add the `review` CLI subcommand group to tina-session with full lifecycle management: start/complete reviews, add/resolve findings, run/manage checks, and approve/block gates. All commands call Convex mutations created in Phase 1.

**Architecture:** Three layers — tina-data types + Convex client methods (bottom), ConvexWriter wrappers in tina-session (middle), CLI command implementations (top). Commands take `--feature` to infer orchestration context via `get_by_feature`. `review start` returns a review ID; subsequent commands accept `--review-id` explicitly. `run-checks` reads `tina-checks.toml` from the worktree root and runs each CLI check sequentially, writing real-time results to Convex.

**Design doc conventions applied:**
- Top-level `Commands::Review` enum (same nesting pattern as `Commands::Work`)
- `ReviewGateCommands` sub-enum for `gate approve` and `gate block`
- All commands accept `--json` flag for structured output (consistent with Work subcommands)
- `run_convex()` one-shot pattern for all Convex operations
- Error handling: `anyhow::Result<u8>`, return `Ok(1)` for not-found, `Err` for real errors

---

### Task 1: Add review Convex client methods to tina-data

**Files:**
- `tina-data/src/convex_client.rs`

**Model:** opus

**review:** spec-only

**Depends on:** none

Add review mutation and query methods to `TinaConvexClient`. These map directly to the Convex functions created in Phase 1. Insert these methods after the existing PM methods (after `add_comment` / `list_comments`).

Add these methods to the `impl TinaConvexClient` block:

```rust
    // --- Review methods ---

    /// Create a review record.
    pub async fn create_review(
        &mut self,
        orchestration_id: &str,
        phase_number: Option<&str>,
        reviewer_agent: &str,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        if let Some(pn) = phase_number {
            args.insert("phaseNumber".into(), Value::from(pn));
        }
        args.insert("reviewerAgent".into(), Value::from(reviewer_agent));
        let result = self.client.mutation("reviews:createReview", args).await?;
        extract_id(result)
    }

    /// Complete a review.
    pub async fn complete_review(
        &mut self,
        review_id: &str,
        state: &str,
    ) -> Result<()> {
        let mut args = BTreeMap::new();
        args.insert("reviewId".into(), Value::from(review_id));
        args.insert("state".into(), Value::from(state));
        let result = self.client.mutation("reviews:completeReview", args).await?;
        extract_unit(result)
    }

    /// Create a review thread (finding).
    pub async fn create_review_thread(
        &mut self,
        review_id: &str,
        orchestration_id: &str,
        file_path: &str,
        line: i64,
        commit_sha: &str,
        summary: &str,
        body: &str,
        severity: &str,
        source: &str,
        author: &str,
        gate_impact: &str,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("reviewId".into(), Value::from(review_id));
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        args.insert("filePath".into(), Value::from(file_path));
        args.insert("line".into(), Value::from(line));
        args.insert("commitSha".into(), Value::from(commit_sha));
        args.insert("summary".into(), Value::from(summary));
        args.insert("body".into(), Value::from(body));
        args.insert("severity".into(), Value::from(severity));
        args.insert("source".into(), Value::from(source));
        args.insert("author".into(), Value::from(author));
        args.insert("gateImpact".into(), Value::from(gate_impact));
        let result = self.client.mutation("reviewThreads:createThread", args).await?;
        extract_id(result)
    }

    /// Resolve a review thread.
    pub async fn resolve_review_thread(
        &mut self,
        thread_id: &str,
        resolved_by: &str,
    ) -> Result<()> {
        let mut args = BTreeMap::new();
        args.insert("threadId".into(), Value::from(thread_id));
        args.insert("resolvedBy".into(), Value::from(resolved_by));
        let result = self.client.mutation("reviewThreads:resolveThread", args).await?;
        extract_unit(result)
    }

    /// Start a review check.
    pub async fn start_review_check(
        &mut self,
        review_id: &str,
        orchestration_id: &str,
        name: &str,
        kind: &str,
        command: Option<&str>,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("reviewId".into(), Value::from(review_id));
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        args.insert("name".into(), Value::from(name));
        args.insert("kind".into(), Value::from(kind));
        if let Some(cmd) = command {
            args.insert("command".into(), Value::from(cmd));
        }
        let result = self.client.mutation("reviewChecks:startCheck", args).await?;
        extract_id(result)
    }

    /// Complete a review check.
    pub async fn complete_review_check(
        &mut self,
        review_id: &str,
        name: &str,
        status: &str,
        comment: Option<&str>,
        output: Option<&str>,
    ) -> Result<()> {
        let mut args = BTreeMap::new();
        args.insert("reviewId".into(), Value::from(review_id));
        args.insert("name".into(), Value::from(name));
        args.insert("status".into(), Value::from(status));
        if let Some(c) = comment {
            args.insert("comment".into(), Value::from(c));
        }
        if let Some(o) = output {
            args.insert("output".into(), Value::from(o));
        }
        let result = self.client.mutation("reviewChecks:completeCheck", args).await?;
        extract_unit(result)
    }

    /// Upsert a review gate.
    pub async fn upsert_review_gate(
        &mut self,
        orchestration_id: &str,
        gate_id: &str,
        status: &str,
        owner: &str,
        decided_by: Option<&str>,
        summary: &str,
    ) -> Result<String> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        args.insert("gateId".into(), Value::from(gate_id));
        args.insert("status".into(), Value::from(status));
        args.insert("owner".into(), Value::from(owner));
        if let Some(db) = decided_by {
            args.insert("decidedBy".into(), Value::from(db));
        }
        args.insert("summary".into(), Value::from(summary));
        let result = self.client.mutation("reviewGates:upsertGate", args).await?;
        extract_id(result)
    }
```

Also add this helper near the existing `extract_id` function (around line 408) if not already present:

```rust
fn extract_unit(result: FunctionResult) -> Result<()> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(()),
        FunctionResult::Value(_) => Ok(()),
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}
```

Run: `cargo build -p tina-data 2>&1 | tail -5`
Expected: Build succeeds

---

### Task 2: Add ConvexWriter review wrapper methods

**Files:**
- `tina-session/src/convex.rs`

**Model:** opus

**review:** spec-only

**Depends on:** 1

Add review wrapper methods to the `ConvexWriter` impl block, after the existing Comment methods section (around line 380). Also add `get_by_feature` usage note — review commands will use this to resolve orchestration context.

```rust
    // --- Review methods ---

    /// Create a review record.
    pub async fn create_review(
        &mut self,
        orchestration_id: &str,
        phase_number: Option<&str>,
        reviewer_agent: &str,
    ) -> anyhow::Result<String> {
        self.client
            .create_review(orchestration_id, phase_number, reviewer_agent)
            .await
    }

    /// Complete a review.
    pub async fn complete_review(
        &mut self,
        review_id: &str,
        state: &str,
    ) -> anyhow::Result<()> {
        self.client.complete_review(review_id, state).await
    }

    /// Create a review thread (finding).
    pub async fn create_review_thread(
        &mut self,
        review_id: &str,
        orchestration_id: &str,
        file_path: &str,
        line: i64,
        commit_sha: &str,
        summary: &str,
        body: &str,
        severity: &str,
        source: &str,
        author: &str,
        gate_impact: &str,
    ) -> anyhow::Result<String> {
        self.client
            .create_review_thread(
                review_id,
                orchestration_id,
                file_path,
                line,
                commit_sha,
                summary,
                body,
                severity,
                source,
                author,
                gate_impact,
            )
            .await
    }

    /// Resolve a review thread.
    pub async fn resolve_review_thread(
        &mut self,
        thread_id: &str,
        resolved_by: &str,
    ) -> anyhow::Result<()> {
        self.client
            .resolve_review_thread(thread_id, resolved_by)
            .await
    }

    /// Start a review check.
    pub async fn start_review_check(
        &mut self,
        review_id: &str,
        orchestration_id: &str,
        name: &str,
        kind: &str,
        command: Option<&str>,
    ) -> anyhow::Result<String> {
        self.client
            .start_review_check(review_id, orchestration_id, name, kind, command)
            .await
    }

    /// Complete a review check.
    pub async fn complete_review_check(
        &mut self,
        review_id: &str,
        name: &str,
        status: &str,
        comment: Option<&str>,
        output: Option<&str>,
    ) -> anyhow::Result<()> {
        self.client
            .complete_review_check(review_id, name, status, comment, output)
            .await
    }

    /// Upsert a review gate.
    pub async fn upsert_review_gate(
        &mut self,
        orchestration_id: &str,
        gate_id: &str,
        status: &str,
        owner: &str,
        decided_by: Option<&str>,
        summary: &str,
    ) -> anyhow::Result<String> {
        self.client
            .upsert_review_gate(orchestration_id, gate_id, status, owner, decided_by, summary)
            .await
    }
```

Run: `cargo build -p tina-session 2>&1 | tail -5`
Expected: Build succeeds

---

### Task 3: Add ReviewCommands enum and ReviewGateCommands sub-enum to main.rs

**Files:**
- `tina-session/src/main.rs`

**Model:** opus

**review:** spec-only

**Depends on:** none

Add the `ReviewCommands` and `ReviewGateCommands` enums to `main.rs`. Also add the `Review` variant to the top-level `Commands` enum, the `extract_json_flag` match arm, and the dispatch wiring. Finally register the `review` module in `commands/mod.rs`.

**Step 1:** Add `Review` variant to `Commands` enum (after the `Work` variant around line 375):

```rust
    /// Review management (findings, checks, gates)
    Review {
        #[command(subcommand)]
        command: ReviewCommands,
    },
```

**Step 2:** Add `ReviewCommands` enum (after `CommentCommands` definition, around line 1007):

```rust
#[derive(Subcommand)]
enum ReviewCommands {
    /// Start a new review for a phase or orchestration
    Start {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number (omit for orchestration-level review)
        #[arg(long)]
        phase: Option<String>,

        /// Reviewer agent name
        #[arg(long, default_value = "review-agent")]
        reviewer: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Complete an open review
    Complete {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Review ID (Convex document ID)
        #[arg(long)]
        review_id: String,

        /// Review outcome
        #[arg(long, value_parser = ["approved", "changes_requested", "superseded"])]
        status: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Add a finding (review thread) to the current review
    AddFinding {
        /// Review ID (Convex document ID)
        #[arg(long)]
        review_id: String,

        /// Orchestration ID (Convex document ID)
        #[arg(long)]
        orchestration_id: String,

        /// Source file path
        #[arg(long)]
        file: String,

        /// Line number
        #[arg(long)]
        line: i64,

        /// Git commit SHA this finding relates to
        #[arg(long)]
        commit: String,

        /// Severity level
        #[arg(long, value_parser = ["p0", "p1", "p2"])]
        severity: String,

        /// Which gate this finding can block
        #[arg(long, value_parser = ["plan", "review", "finalize"])]
        gate: String,

        /// Short title
        #[arg(long)]
        summary: String,

        /// Detailed explanation
        #[arg(long)]
        body: String,

        /// Who created it
        #[arg(long, value_parser = ["human", "agent"], default_value = "agent")]
        source: String,

        /// Author name
        #[arg(long, default_value = "review-agent")]
        author: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Resolve a finding
    ResolveFinding {
        /// Thread ID (Convex document ID)
        #[arg(long)]
        finding_id: String,

        /// Who resolved it
        #[arg(long, default_value = "review-agent")]
        resolved_by: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Run all CLI checks from tina-checks.toml
    RunChecks {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Review ID (Convex document ID)
        #[arg(long)]
        review_id: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Start a project check (agent-evaluated)
    StartCheck {
        /// Review ID (Convex document ID)
        #[arg(long)]
        review_id: String,

        /// Orchestration ID (Convex document ID)
        #[arg(long)]
        orchestration_id: String,

        /// Check name
        #[arg(long)]
        name: String,

        /// Check kind
        #[arg(long, value_parser = ["cli", "project"])]
        kind: String,

        /// CLI command (for cli kind)
        #[arg(long)]
        command: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Complete a running check
    CompleteCheck {
        /// Review ID (Convex document ID)
        #[arg(long)]
        review_id: String,

        /// Check name
        #[arg(long)]
        name: String,

        /// Check result
        #[arg(long, value_parser = ["passed", "failed"])]
        status: String,

        /// Explanation on failure
        #[arg(long)]
        comment: Option<String>,

        /// Captured stdout/stderr
        #[arg(long)]
        output: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// HITL gate management
    Gate {
        #[command(subcommand)]
        command: ReviewGateCommands,
    },
}

#[derive(Subcommand)]
enum ReviewGateCommands {
    /// Approve a gate
    Approve {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Gate to approve
        #[arg(long, value_parser = ["plan", "review", "finalize"])]
        gate: String,

        /// Who approved
        #[arg(long, default_value = "human")]
        decided_by: String,

        /// Summary explanation
        #[arg(long, default_value = "Approved")]
        summary: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },

    /// Block a gate
    Block {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Gate to block
        #[arg(long, value_parser = ["plan", "review", "finalize"])]
        gate: String,

        /// Reason for blocking
        #[arg(long)]
        reason: String,

        /// Who blocked
        #[arg(long, default_value = "review-agent")]
        decided_by: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}
```

**Step 3:** Add json flag extraction for Review (in `extract_json_flag_from_work_command`). Actually, Review is NOT under Work — it's a top-level command. So instead, handle json error recovery inline in the dispatch. Add this match arm in the `run()` function (after the `Commands::Work` block, around line 1487):

```rust
        Commands::Review { command } => {
            let json_mode = match &command {
                ReviewCommands::Start { json, .. } => *json,
                ReviewCommands::Complete { json, .. } => *json,
                ReviewCommands::AddFinding { json, .. } => *json,
                ReviewCommands::ResolveFinding { json, .. } => *json,
                ReviewCommands::RunChecks { json, .. } => *json,
                ReviewCommands::StartCheck { json, .. } => *json,
                ReviewCommands::CompleteCheck { json, .. } => *json,
                ReviewCommands::Gate { command } => match command {
                    ReviewGateCommands::Approve { json, .. } => *json,
                    ReviewGateCommands::Block { json, .. } => *json,
                },
            };
            let result = match command {
                ReviewCommands::Start {
                    feature,
                    phase,
                    reviewer,
                    json,
                } => commands::review::start(&feature, phase.as_deref(), &reviewer, json),

                ReviewCommands::Complete {
                    feature,
                    review_id,
                    status,
                    json,
                } => commands::review::complete(&feature, &review_id, &status, json),

                ReviewCommands::AddFinding {
                    review_id,
                    orchestration_id,
                    file,
                    line,
                    commit,
                    severity,
                    gate,
                    summary,
                    body,
                    source,
                    author,
                    json,
                } => commands::review::add_finding(
                    &review_id,
                    &orchestration_id,
                    &file,
                    line,
                    &commit,
                    &severity,
                    &gate,
                    &summary,
                    &body,
                    &source,
                    &author,
                    json,
                ),

                ReviewCommands::ResolveFinding {
                    finding_id,
                    resolved_by,
                    json,
                } => commands::review::resolve_finding(&finding_id, &resolved_by, json),

                ReviewCommands::RunChecks {
                    feature,
                    review_id,
                    json,
                } => commands::review::run_checks(&feature, &review_id, json),

                ReviewCommands::StartCheck {
                    review_id,
                    orchestration_id,
                    name,
                    kind,
                    command,
                    json,
                } => commands::review::start_check(
                    &review_id,
                    &orchestration_id,
                    &name,
                    &kind,
                    command.as_deref(),
                    json,
                ),

                ReviewCommands::CompleteCheck {
                    review_id,
                    name,
                    status,
                    comment,
                    output,
                    json,
                } => commands::review::complete_check(
                    &review_id,
                    &name,
                    &status,
                    comment.as_deref(),
                    output.as_deref(),
                    json,
                ),

                ReviewCommands::Gate { command } => match command {
                    ReviewGateCommands::Approve {
                        feature,
                        gate,
                        decided_by,
                        summary,
                        json,
                    } => commands::review::gate_approve(
                        &feature,
                        &gate,
                        &decided_by,
                        &summary,
                        json,
                    ),

                    ReviewGateCommands::Block {
                        feature,
                        gate,
                        reason,
                        decided_by,
                        json,
                    } => commands::review::gate_block(
                        &feature,
                        &gate,
                        &reason,
                        &decided_by,
                        json,
                    ),
                },
            };

            match result {
                Ok(code) => Ok(code),
                Err(e) if json_mode => {
                    eprintln!(
                        "{}",
                        serde_json::json!({
                            "ok": false,
                            "error": format!("{:#}", e),
                        })
                    );
                    Ok(1)
                }
                Err(e) => Err(e),
            }
        }
```

**Step 4:** Add `pub mod review;` to `tina-session/src/commands/mod.rs`.

Run: `cargo check -p tina-session 2>&1 | tail -10` (will fail until Task 4 creates review.rs, but enum/dispatch should parse)
Expected: Errors only about missing `commands::review` module

---

### Task 4: Implement review lifecycle commands (start, complete)

**Files:**
- `tina-session/src/commands/review.rs`

**Model:** opus

**review:** spec-only

**Depends on:** 2, 3

Create `tina-session/src/commands/review.rs` with `start` and `complete` functions. The `start` command uses `get_by_feature` to resolve orchestration_id, then creates a review via Convex. The `complete` command calls the mutation directly.

```rust
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
                .ok_or_else(|| anyhow::anyhow!("Orchestration not found for feature: {}", feature_name))?;

            let review_id = writer
                .create_review(
                    &orch.id,
                    phase_str.as_deref(),
                    &reviewer_str,
                )
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
    let feature_name = feature.to_string();

    // 1. Load orchestration context
    let orch = convex::run_convex(|mut writer| async move {
        writer.get_by_feature(&feature_name).await
    })?
    .ok_or_else(|| anyhow::anyhow!("Orchestration not found for feature: {}", feature))?;

    let worktree = orch
        .worktree_path
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("No worktree_path for orchestration"))?;

    // 2. Parse tina-checks.toml
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
        let command = check.command.as_deref().unwrap_or("");
        let name = &check.name;

        // Record check start in Convex
        let rid = review_id.to_string();
        let oid = orch.id.clone();
        let n = name.clone();
        let cmd = command.to_string();
        let _check_id = convex::run_convex(|mut writer| async move {
            writer
                .start_review_check(&rid, &oid, &n, "cli", Some(&cmd))
                .await
        })?;

        // Execute command
        let start = std::time::Instant::now();
        let cmd_output = std::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .current_dir(worktree)
            .output();

        let (exit_code, stdout_stderr) = match cmd_output {
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
        };
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

        results.push(json!({
            "name": name,
            "command": command,
            "status": check_status,
            "exit_code": exit_code,
            "duration_ms": duration_ms,
            "output": stdout_stderr,
        }));

        if !json_mode {
            let icon = if exit_code == 0 { "PASS" } else { "FAIL" };
            eprintln!("[{}] {} ({}ms)", icon, name, duration_ms);
        }
    }

    if json_mode {
        println!("{}", serde_json::to_string_pretty(&results)?);
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
    let feature_name = feature.to_string();
    let g = gate.to_string();
    let db = decided_by.to_string();
    let sum = summary.to_string();

    let gate_id = convex::run_convex(|mut writer| async move {
        let orch = writer
            .get_by_feature(&feature_name)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Orchestration not found for feature: {}", feature_name))?;

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
    let feature_name = feature.to_string();
    let g = gate.to_string();
    let r = reason.to_string();
    let db = decided_by.to_string();

    let gate_id = convex::run_convex(|mut writer| async move {
        let orch = writer
            .get_by_feature(&feature_name)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Orchestration not found for feature: {}", feature_name))?;

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
```

Run: `cargo build -p tina-session 2>&1 | tail -10`
Expected: Build succeeds with no errors

---

### Task 5: Build verification and full test suite

**Files:** (none — verification only)

**Model:** haiku

**review:** spec-only

**Depends on:** 4

Run the full build and test suite to verify everything compiles and existing tests pass.

Run: `cargo build -p tina-data -p tina-session 2>&1 | tail -10`
Expected: Both crates build successfully

Run: `cargo test -p tina-data 2>&1 | tail -20`
Expected: All tina-data tests pass

Run: `cargo test -p tina-session 2>&1 | tail -20`
Expected: All tina-session tests pass

Run: `npm test 2>&1 | tail -20`
Expected: All Convex tests pass (review tables from Phase 1)

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 800 |

---

## Phase Estimates

| Task | Estimate |
|------|----------|
| Task 1: tina-data review client methods | 5 min |
| Task 2: ConvexWriter review wrappers | 4 min |
| Task 3: ReviewCommands enums + dispatch | 8 min |
| Task 4: review.rs full implementation | 10 min |
| Task 5: Build verification + tests | 3 min |
| **Total** | **~30 min** |

---

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
