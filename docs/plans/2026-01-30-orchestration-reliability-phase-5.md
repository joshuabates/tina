# Phase 5: Model Simplification

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Reduce model options from three (opus/sonnet/haiku) to two (opus/haiku). Eliminate decision paralysis by removing the middle option.

**Architecture:** This is a documentation and validation change. No new code modules - only updates to existing files and addition of model validation to `tina-session check plan`.

**Phase context:** Phase 1 implemented the tina-session binary with `check plan` command. This phase extends plan validation to enforce opus/haiku-only model specifications and updates all documentation to remove sonnet references.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 200 |

---

## Overview

From the design document:

> Three model options creates decision paralysis. 8 of 9 planners didn't specify models at all.

The solution:
1. Two models only: **Opus** (reasoning, judgment) and **Haiku** (execution, validation)
2. Mandatory model specification per task
3. Plan validation rejects sonnet and missing models
4. Default model table per role

---

### Task 1: Update tina-session plan validation to reject sonnet

**Files:**
- `/Users/joshuabates/Projects/tina/tina-session/src/commands/check.rs`

**Model:** haiku

**review:** spec-only

**Steps:**

1. Read the current check.rs file to understand plan validation structure

2. The existing `plan()` function already validates models. Update the validation to reject "sonnet" as an invalid model value.

   Find this section:
   ```rust
   if !model.starts_with("opus") && !model.starts_with("haiku") {
       println!("FAIL: Invalid model '{}'. Must be 'opus' or 'haiku'.", model);
       return Ok(1);
   }
   ```

   This is already correct. The design says to remove sonnet, and this code already rejects anything that's not opus or haiku. No code change needed for validation logic.

3. Add a test case to verify sonnet is rejected:

   Add to the `tests` module:
   ```rust
   #[test]
   fn test_plan_validation_rejects_sonnet() {
       let temp = TempDir::new().unwrap();

       let plan_with_sonnet = r#"
   # Phase 1 Plan

   ### Task 1: Something
   **Model:** sonnet

   ### Complexity Budget

   | Metric | Limit |
   |--------|-------|
   | Max lines per file | 400 |
   "#;
       let path = temp.path().join("plan.md");
       fs::write(&path, plan_with_sonnet).unwrap();

       let result = plan(&path).unwrap();
       assert_eq!(result, 1, "Should reject sonnet model");
   }
   ```

**Run:**
```bash
cd /Users/joshuabates/Projects/tina/tina-session && cargo test test_plan_validation_rejects_sonnet
```

**Expected output:**
```
running 1 test
test commands::check::tests::test_plan_validation_rejects_sonnet ... ok
```

---

### Task 2: Update phase-planner agent to use opus/haiku only

**Files:**
- `/Users/joshuabates/Projects/tina/agents/phase-planner.md`

**Model:** haiku

**review:** spec-only

**Steps:**

1. Update the model specification in the frontmatter. Change:
   ```yaml
   model: sonnet
   ```
   To:
   ```yaml
   model: haiku
   ```

2. Update the model selection guidance. Find and replace the selection logic:

   Change:
   ```markdown
   - `haiku` - Simple, mechanical changes (rename, move, delete, simple additions)
   - `sonnet` - Standard implementation tasks (new functions, tests, integrations)
   - `opus` - Complex tasks requiring deep reasoning (architecture, refactoring, debugging)
   ```

   To:
   ```markdown
   - `haiku` - Straightforward implementation (new functions, tests, integrations, mechanical changes)
   - `opus` - Complex reasoning (architecture decisions, refactoring, debugging, judgment calls)
   ```

3. Update the format example. Find and replace:
   ```markdown
   **Model:** <haiku|sonnet|opus>
   ```

   To:
   ```markdown
   **Model:** <haiku|opus>
   ```

4. Update the model_override description. Find:
   ```markdown
   - `model_override`: (optional) Model to use for all tasks (haiku, sonnet, opus).
   ```

   Replace with:
   ```markdown
   - `model_override`: (optional) Model to use for all tasks (haiku or opus).
   ```

**Run:**
```bash
grep -n "sonnet" /Users/joshuabates/Projects/tina/agents/phase-planner.md
```

**Expected output:**
No matches (empty output).

---

### Task 3: Update planner agent to use opus/haiku only

**Files:**
- `/Users/joshuabates/Projects/tina/agents/planner.md`

**Model:** haiku

**review:** spec-only

**Steps:**

1. Find and update the model guidance section. Change:
   ```markdown
   **Model:** [optional - opus (default), sonnet, or haiku]
   ```

   To:
   ```markdown
   **Model:** [optional - opus (default) or haiku]
   ```

2. Find and update the selection guidance. Change:
   ```markdown
   - **sonnet**: Straightforward implementation with clear spec (add simple function, write basic test)
   ```

   To (remove this line entirely, haiku covers straightforward work):
   (Delete the line)

**Run:**
```bash
grep -n "sonnet" /Users/joshuabates/Projects/tina/agents/planner.md
```

**Expected output:**
No matches (empty output).

---

### Task 4: Update phase-executor and worktree-setup agent models

**Files:**
- `/Users/joshuabates/Projects/tina/agents/phase-executor.md`
- `/Users/joshuabates/Projects/tina/agents/worktree-setup.md`

**Model:** haiku

**review:** spec-only

**Steps:**

1. Update phase-executor.md frontmatter. Change:
   ```yaml
   model: sonnet
   ```
   To:
   ```yaml
   model: haiku
   ```

2. Update worktree-setup.md frontmatter. Change:
   ```yaml
   model: sonnet
   ```
   To:
   ```yaml
   model: haiku
   ```

**Run:**
```bash
grep -n "model:" /Users/joshuabates/Projects/tina/agents/phase-executor.md /Users/joshuabates/Projects/tina/agents/worktree-setup.md
```

**Expected output:**
```
/Users/joshuabates/Projects/tina/agents/phase-executor.md:6:model: haiku
/Users/joshuabates/Projects/tina/agents/worktree-setup.md:6:model: haiku
```

---

### Task 5: Update orchestrate skill model policy table

**Files:**
- `/Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md`

**Model:** haiku

**review:** spec-only

**Steps:**

1. Find the model override comment and update it. Change:
   ```markdown
   MODEL_OVERRIDE="$2"  # haiku, sonnet, or opus
   ```
   To:
   ```markdown
   MODEL_OVERRIDE="$2"  # haiku or opus
   ```

2. Find and update the Model Policy table. Change:
   ```markdown
   | Worktree Setup | sonnet | Straightforward provisioning tasks |
   ```
   To:
   ```markdown
   | Worktree Setup | haiku | Straightforward provisioning tasks |
   ```

3. Change:
   ```markdown
   | Phase Executor | sonnet | Tmux management and file monitoring |
   ```
   To:
   ```markdown
   | Phase Executor | haiku | Tmux management and file monitoring |
   ```

**Run:**
```bash
grep -n "sonnet" /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md
```

**Expected output:**
No matches (empty output).

---

### Task 6: Update team-lead-init skill model references

**Files:**
- `/Users/joshuabates/Projects/tina/skills/team-lead-init/SKILL.md`

**Model:** haiku

**review:** spec-only

**Steps:**

1. Find and update the metadata example. Change:
   ```markdown
   "metadata": { "model": "<haiku|sonnet|opus>" }
   ```
   To:
   ```markdown
   "metadata": { "model": "<haiku|opus>" }
   ```

2. Find and update the model field description. Change:
   ```markdown
   The `model` field controls which model the implementer uses (haiku, sonnet, or opus).
   ```
   To:
   ```markdown
   The `model` field controls which model the implementer uses (haiku or opus).
   ```

3. Find and update the model field accepts line. Change:
   ```markdown
   The model field accepts: `haiku`, `sonnet`, or `opus`.
   ```
   To:
   ```markdown
   The model field accepts: `haiku` or `opus`.
   ```

**Run:**
```bash
grep -n "sonnet" /Users/joshuabates/Projects/tina/skills/team-lead-init/SKILL.md
```

**Expected output:**
No matches (empty output).

---

### Task 7: Update writing-skills best practices

**Files:**
- `/Users/joshuabates/Projects/tina/skills/writing-skills/anthropic-best-practices.md`

**Model:** haiku

**review:** spec-only

**Steps:**

1. Find and update the Claude Sonnet reference. Change:
   ```markdown
   * **Claude Sonnet** (balanced): Is the Skill clear and efficient?
   ```
   To:
   ```markdown
   * **Claude Haiku** (fast/efficient): Is the Skill clear and efficient?
   ```

2. Find and update the testing checklist. Change:
   ```markdown
   * [ ] Tested with Haiku, Sonnet, and Opus
   ```
   To:
   ```markdown
   * [ ] Tested with Haiku and Opus
   ```

**Run:**
```bash
grep -n "Sonnet\|sonnet" /Users/joshuabates/Projects/tina/skills/writing-skills/anthropic-best-practices.md
```

**Expected output:**
No matches (empty output).

---

### Task 8: Run full verification

**Files:** (none - verification only)

**Model:** haiku

**review:** spec-only

**Steps:**

1. Run clippy to verify Rust changes are clean:
   ```bash
   cd /Users/joshuabates/Projects/tina/tina-session && cargo clippy -- -D warnings
   ```

2. Run all tina-session tests:
   ```bash
   cd /Users/joshuabates/Projects/tina/tina-session && cargo test
   ```

3. Verify no sonnet references remain in key files:
   ```bash
   grep -r "sonnet" /Users/joshuabates/Projects/tina/agents/*.md /Users/joshuabates/Projects/tina/skills/orchestrate/SKILL.md /Users/joshuabates/Projects/tina/skills/team-lead-init/SKILL.md /Users/joshuabates/Projects/tina/skills/writing-skills/anthropic-best-practices.md
   ```

**Run:**
```bash
cd /Users/joshuabates/Projects/tina/tina-session && cargo test && cargo clippy -- -D warnings
```

**Expected output:**
All tests pass, no clippy warnings.

---

## Phase Estimates

| Metric | Estimate |
|--------|----------|
| Total tasks | 8 |
| Expected duration | 30-45 minutes |
| Lines changed | ~50 |

**ROI:** This phase eliminates a common source of decision paralysis. The cost is minimal (documentation updates) but the benefit is clearer guidance and enforceable validation.

---

## Definition of Done

- [ ] `tina-session check plan` rejects plans with `**Model:** sonnet`
- [ ] All agent frontmatter uses haiku or opus (not sonnet)
- [ ] Orchestrate skill model policy table updated
- [ ] Team-lead-init skill model references updated
- [ ] Writing-skills best practices updated
- [ ] All tests pass
- [ ] No sonnet references in updated files
