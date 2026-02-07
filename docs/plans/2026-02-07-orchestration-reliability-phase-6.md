# Orchestration Reliability Phase 6: Model Delegation Upgrades

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Add deterministic model routing, plan lint validation, and optional multi-model consensus for critical review steps.

**Architecture:** Extends existing orchestration pipeline with new validation gates. No new services -- all changes are to agent definitions, skill files, and the CLI state machine.

**Phase context:** Phases 1-5 built the reliable orchestration pipeline with CLI-driven state machine, event logging, and monitoring. This phase adds quality gates: a plan lint step that validates plans before execution begins, dual-model validation for design reviews, and optional consensus enforcement for phase reviews. All features are opt-in and configurable.

---

## Task 1: Add plan lint validation to phase-planner agent

**Files:**
- `agents/phase-planner.md`

**Model:** haiku

**review:** spec-only

### Steps

1. Add a "Plan Lint" section to the phase-planner agent definition after the "Quality Standards" section. This defines the lint checks the planner runs on its own plan before reporting completion.

```markdown
## Plan Lint

Before reporting completion, validate the plan against these lint rules. If any rule fails, fix the plan before committing.

### Required Fields per Task

Every task in the plan MUST have:
- `**Files:**` - List of files to modify
- `**Model:** <haiku|opus>` - Model assignment
- `**review:** <spec-only|full>` - Review level
- At least one step with a `Run:` command and `Expected:` output

### Lint Rules

| Rule | Check | Severity |
|------|-------|----------|
| model-tag | Every task has `**Model:**` line | error |
| review-tag | Every task has `**review:**` line | error |
| complexity-budget | `### Complexity Budget` section exists | error |
| phase-estimates | `## Phase Estimates` section exists | error |
| file-list | Every task has `**Files:**` section | warning |
| run-command | Every task has at least one `Run:` block | warning |
| expected-output | Every `Run:` block has `Expected:` | warning |

### Lint Output

After running lint, append a lint report to the plan file:

```markdown
## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
```

If any `error`-severity rule fails, do NOT report completion. Fix the plan first.
If only `warning`-severity rules fail, report completion but include warnings in the lint report.
```

2. Update the existing "Quality Standards" section to reference the lint rules:

Replace the current "Before reporting completion, verify:" list with:

```markdown
Before reporting completion, run plan lint (see Plan Lint section below). All error-severity rules must pass.
```

### Run

```bash
grep -c "Plan Lint" agents/phase-planner.md
```

**Expected:** `1` (section exists)

```bash
grep -c "model-tag" agents/phase-planner.md
```

**Expected:** `1` (lint rule exists)

---

## Task 2: Add model routing policy configuration to supervisor state

**Files:**
- `tina-session/src/state/schema.rs`

**Model:** haiku

**review:** spec-only

### Steps

1. Add a `ModelPolicy` struct and a `model_policy` field to `SupervisorState`:

After the `TimingStats` struct, add:

```rust
/// Model routing policy for orchestration agents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPolicy {
    /// Model for the design validator agent. Default: "opus".
    #[serde(default = "default_opus")]
    pub validator: String,

    /// Model for phase planner agents. Default: "opus".
    #[serde(default = "default_opus")]
    pub planner: String,

    /// Model for phase executor agents. Default: "haiku".
    #[serde(default = "default_haiku")]
    pub executor: String,

    /// Model for phase reviewer agents. Default: "opus".
    #[serde(default = "default_opus")]
    pub reviewer: String,

    /// If true, design validation uses dual-model consensus (validator runs twice
    /// with different models and results must agree). Default: false.
    #[serde(default)]
    pub dual_validation: bool,

    /// If true, phase reviews require consensus from a second model before
    /// marking review as pass. Default: false.
    #[serde(default)]
    pub review_consensus: bool,
}

fn default_opus() -> String {
    "opus".to_string()
}

fn default_haiku() -> String {
    "haiku".to_string()
}

impl Default for ModelPolicy {
    fn default() -> Self {
        Self {
            validator: default_opus(),
            planner: default_opus(),
            executor: default_haiku(),
            reviewer: default_opus(),
            dual_validation: false,
            review_consensus: false,
        }
    }
}
```

2. Add `model_policy` field to `SupervisorState`:

```rust
#[serde(default)]
pub model_policy: ModelPolicy,
```

3. Update `SupervisorState::new()` to include model_policy:

```rust
model_policy: ModelPolicy::default(),
```

4. Add a test for ModelPolicy serialization:

```rust
#[test]
fn test_model_policy_default() {
    let policy = ModelPolicy::default();
    assert_eq!(policy.validator, "opus");
    assert_eq!(policy.planner, "opus");
    assert_eq!(policy.executor, "haiku");
    assert_eq!(policy.reviewer, "opus");
    assert!(!policy.dual_validation);
    assert!(!policy.review_consensus);
}

#[test]
fn test_model_policy_deserializes_with_defaults() {
    let json = r#"{}"#;
    let policy: ModelPolicy = serde_json::from_str(json).unwrap();
    assert_eq!(policy.validator, "opus");
    assert_eq!(policy.executor, "haiku");
    assert!(!policy.dual_validation);
}

#[test]
fn test_supervisor_state_with_model_policy() {
    let state = SupervisorState::new(
        "test",
        PathBuf::from("/docs/design.md"),
        PathBuf::from("/worktree"),
        "tina/test",
        2,
    );
    assert_eq!(state.model_policy.validator, "opus");
    assert_eq!(state.model_policy.executor, "haiku");
}
```

### Run

```bash
cd tina-session && cargo test test_model_policy
```

**Expected:** All model policy tests pass.

```bash
cd tina-session && cargo test test_supervisor_state_with_model_policy
```

**Expected:** Test passes.

---

## Task 3: Wire model policy into orchestrate advance action responses

**Files:**
- `tina-session/src/state/orchestrate.rs`

**Model:** opus

**review:** full

### Steps

1. Add a `model` field to `SpawnPlanner`, `SpawnExecutor`, `SpawnReviewer`, and `SpawnValidator` action variants:

Update the `Action` enum:

```rust
pub enum Action {
    SpawnValidator {
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    SpawnPlanner {
        phase: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    SpawnExecutor {
        phase: String,
        plan_path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    SpawnReviewer {
        phase: String,
        git_range: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    // ... rest unchanged
}
```

2. Update `next_action` and `advance_state` to populate the `model` field from `state.model_policy`:

For each action construction site, read the appropriate model from the policy:
- `SpawnValidator` -> `state.model_policy.validator`
- `SpawnPlanner` -> `state.model_policy.planner`
- `SpawnExecutor` -> `state.model_policy.executor`
- `SpawnReviewer` -> `state.model_policy.reviewer`

Only include the `model` field if it differs from the default for that agent type. This keeps the JSON output clean for existing orchestrations.

3. Update the `orchestrate.rs` command to pass model_policy through (already has access to state).

4. Update existing tests to account for the new `model` field. Use `..` pattern matching to ignore the model field where it's not the focus of the test.

### Run

```bash
cd tina-session && cargo test -- orchestrate
```

**Expected:** All orchestrate tests pass.

---

## Task 4: Update SKILL.md to read model from action response and pass to spawned agents

**Files:**
- `skills/orchestrate/SKILL.md`

**Model:** haiku

**review:** spec-only

### Steps

1. In the "Action Dispatch" section, update each spawn action to pass the model from the CLI response:

Update the Action Dispatch table:

```markdown
| Action | What to Do |
|--------|------------|
| `spawn_validator` | Spawn `tina:design-validator` teammate (model from `.model` if present) |
| `spawn_planner` | Spawn `tina:phase-planner` for `.phase` (model from `.model` if present) |
| `spawn_executor` | Spawn `tina:phase-executor` for `.phase` (plan at `.plan_path`, model from `.model` if present) |
| `spawn_reviewer` | Spawn `tina:phase-reviewer` for `.phase` (range at `.git_range`, model from `.model` if present) |
```

2. Update the spawn examples to show how to pass the model. In the "Spawning Teammates" section, add a note after the spawn JSON blocks:

```markdown
**Model override from CLI:**

If the action response includes a `model` field, pass it to the spawn:
```json
{
  "subagent_type": "tina:phase-planner",
  "team_name": "<TEAM_NAME>",
  "name": "planner-<N>",
  "model": "<model from action>",
  "prompt": "task_id: plan-phase-<N>"
}
```

If no `model` field is present, omit it and the agent definition's default model will be used.
```

3. Update the "Model Policy" table to note that models come from `supervisor-state.json`:

```markdown
## Model Policy

Model assignments come from `model_policy` in `supervisor-state.json`. Defaults:

| Agent | Default Model | Rationale |
|-------|---------------|-----------|
| Orchestrator | opus | Coordinates team, handles complex decisions |
| Design Validator | opus | Analyzes feasibility, runs baseline commands |
| Phase Planner | opus | Creates detailed plans, needs codebase understanding |
| Phase Executor | haiku | Tmux management and file monitoring |
| Phase Reviewer | opus | Analyzes implementation quality |

To override, set `model_policy` in `supervisor-state.json` before starting orchestration, or pass `--model <model>` to override all agents.
```

### Run

```bash
grep -c "model_policy" skills/orchestrate/SKILL.md
```

**Expected:** At least `1`.

---

## Task 5: Add review consensus support to phase-reviewer agent

**Files:**
- `agents/phase-reviewer.md`

**Model:** haiku

**review:** spec-only

### Steps

1. Add a "Consensus Mode" section after the "Completion Message Format" section:

```markdown
## Consensus Mode

When `review_consensus: true` is set in the orchestration model policy, the orchestrator will run two independent reviews of the same phase. The orchestrator (not you) handles spawning the second reviewer and comparing results.

Your behavior does NOT change in consensus mode. Write your review report and send your completion message exactly as documented above. The orchestrator compares your verdict with the second reviewer's verdict:

- **Both pass:** Phase passes.
- **Both gaps:** Orchestrator merges issue lists and creates remediation.
- **Disagree (one pass, one gaps):** Orchestrator flags disagreement to user for manual resolution.

You do not need to know whether consensus mode is active. Just do your job.
```

### Run

```bash
grep -c "Consensus Mode" agents/phase-reviewer.md
```

**Expected:** `1`.

---

## Task 6: Add consensus handling to orchestration state machine

**Files:**
- `tina-session/src/state/orchestrate.rs`

**Model:** opus

**review:** full

### Steps

1. Add a `review_verdicts` field to `PhaseState` to track consensus reviews:

In `schema.rs`, add to `PhaseState`:

```rust
/// Collected review verdicts for consensus mode.
/// Each entry is ("pass" or "gaps", optional issues list).
#[serde(default, skip_serializing_if = "Vec::is_empty")]
pub review_verdicts: Vec<ReviewVerdict>,
```

Add the `ReviewVerdict` struct:

```rust
/// A single review verdict for consensus tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewVerdict {
    pub result: String, // "pass" or "gaps"
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub issues: Vec<String>,
}
```

2. In `orchestrate.rs`, update `ReviewPass` and `ReviewGaps` handlers to check `state.model_policy.review_consensus`:

When `review_consensus` is true:
- On first review result: store the verdict in `phase_state.review_verdicts`, return `SpawnReviewer` with a different model (swap opus/haiku or use a second configured model) to get a second opinion.
- On second review result: compare verdicts and decide:
  - Both pass -> proceed as normal (complete phase, advance)
  - Both gaps -> merge issues, proceed with remediation
  - Disagree -> return a new `Action::ConsensusDisagreement` that the orchestrator surfaces to the user

3. Add the `ConsensusDisagreement` action variant:

```rust
/// Review consensus disagreement - requires human resolution.
ConsensusDisagreement {
    phase: String,
    verdict_1: String,
    verdict_2: String,
    issues: Vec<String>,
},
```

4. When `review_consensus` is false (the default), behavior is unchanged from current implementation.

5. Add tests:

```rust
#[test]
fn test_review_consensus_first_verdict_spawns_second_reviewer() {
    let mut state = test_state(2);
    state.model_policy.review_consensus = true;
    state.phases.insert("1".to_string(), PhaseState {
        status: PhaseStatus::Reviewing,
        git_range: Some("abc..def".to_string()),
        planning_started_at: Some(Utc::now()),
        review_started_at: Some(Utc::now()),
        ..PhaseState::default()
    });
    let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
    // First verdict should spawn second reviewer
    assert!(matches!(action, Action::SpawnReviewer { .. }));
    assert_eq!(state.phases["1"].review_verdicts.len(), 1);
    assert_eq!(state.phases["1"].review_verdicts[0].result, "pass");
}

#[test]
fn test_review_consensus_both_pass() {
    let mut state = test_state(2);
    state.model_policy.review_consensus = true;
    state.phases.insert("1".to_string(), PhaseState {
        status: PhaseStatus::Reviewing,
        git_range: Some("abc..def".to_string()),
        planning_started_at: Some(Utc::now()),
        review_started_at: Some(Utc::now()),
        review_verdicts: vec![ReviewVerdict {
            result: "pass".to_string(),
            issues: vec![],
        }],
        ..PhaseState::default()
    });
    let action = advance_state(&mut state, "1", AdvanceEvent::ReviewPass).unwrap();
    // Both pass -> advance to next phase
    assert!(matches!(action, Action::SpawnPlanner { .. }));
}

#[test]
fn test_review_consensus_disagreement() {
    let mut state = test_state(2);
    state.model_policy.review_consensus = true;
    state.phases.insert("1".to_string(), PhaseState {
        status: PhaseStatus::Reviewing,
        git_range: Some("abc..def".to_string()),
        planning_started_at: Some(Utc::now()),
        review_started_at: Some(Utc::now()),
        review_verdicts: vec![ReviewVerdict {
            result: "pass".to_string(),
            issues: vec![],
        }],
        ..PhaseState::default()
    });
    let action = advance_state(
        &mut state,
        "1",
        AdvanceEvent::ReviewGaps { issues: vec!["missing tests".to_string()] },
    ).unwrap();
    // Disagreement -> surface to user
    assert!(matches!(action, Action::ConsensusDisagreement { .. }));
}
```

### Run

```bash
cd tina-session && cargo test -- orchestrate
```

**Expected:** All tests pass including new consensus tests.

---

## Task 7: Update SKILL.md to handle consensus disagreement action

**Files:**
- `skills/orchestrate/SKILL.md`

**Model:** haiku

**review:** spec-only

### Steps

1. Add `consensus_disagreement` to the Action Dispatch table:

```markdown
| `consensus_disagreement` | Surface to user: "Reviewers disagree on phase `.phase`. Verdict 1: `.verdict_1`, Verdict 2: `.verdict_2`. Please resolve manually." |
```

2. Add consensus handling to the "On reviewer-N message" event handler:

After the existing reviewer handling, add:

```markdown
**On consensus disagreement (from CLI):**
```
if NEXT_ACTION is "consensus_disagreement":
    Print:
    ---------------------------------------------------------------
    REVIEW CONSENSUS DISAGREEMENT: Phase <phase>
      Reviewer 1: <verdict_1>
      Reviewer 2: <verdict_2>
      Issues: <issues>

    Please resolve manually:
      - To accept as pass: TaskUpdate review-phase-N, status: completed, metadata: { status: "pass" }
      - To accept as gaps: TaskUpdate review-phase-N, status: completed, metadata: { status: "gaps", issues: [...] }
    ---------------------------------------------------------------
```
```

### Run

```bash
grep -c "consensus_disagreement" skills/orchestrate/SKILL.md
```

**Expected:** At least `2` (dispatch table + handler).

---

## Phase Estimates

| Metric | Expected |
|--------|----------|
| Impl lines | ~150 (Rust) + ~100 (Markdown) |
| Test lines | ~100 |
| Files touched | 5 |

### Target Files

- `agents/phase-planner.md` - Add plan lint section
- `agents/phase-reviewer.md` - Add consensus mode docs
- `tina-session/src/state/schema.rs` - Add ModelPolicy struct
- `tina-session/src/state/orchestrate.rs` - Wire model into actions, consensus logic
- `skills/orchestrate/SKILL.md` - Wire model policy + consensus dispatch

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 500 |

### ROI Expectation

Model routing makes quality gates deterministic rather than relying on agent memory. Plan lint catches missing structure before execution wastes time. Consensus is opt-in with zero overhead when disabled.

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
