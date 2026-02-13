# Mechanical Review Workbench Phase 7: Review Agent Integration

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 9bb75ae413749e5eab4881743f085aaa604b636a

**Goal:** Wire the review agent into the orchestration flow so that phase reviews use the new `tina-session review` CLI commands (from Phase 2) and the review data model (from Phase 1). Create `tina-checks.toml` convention and project check markdown format. Update the `phase-reviewer` agent definition to follow the Review Agent Flow described in the design doc: start review → run CLI checks → evaluate project checks → diff-walk findings → assess and complete → gate management.

**Architecture:** No new code — Phase 7 is entirely agent definition + skill configuration + convention files. The Rust CLI commands, Convex tables, daemon HTTP server, and web UI are all complete from Phases 1-6. This phase wires them together by updating the `phase-reviewer` agent (`agents/phase-reviewer.md`) to use the review CLI, updating the `orchestrate` skill to pass `feature_name` in review task metadata, and creating the `tina-checks.toml` convention with project check markdown files.

**Phase context:** Phase 1 created the Convex data model (reviews, reviewThreads, reviewChecks, reviewGates). Phase 2 built the `tina-session review` CLI with all commands (start, complete, add-finding, resolve-finding, run-checks, start-check, complete-check, gate approve, gate block). Phase 3 built the daemon HTTP server. Phases 4-6 built the web UI. The `phase-reviewer` agent currently does architectural review but does NOT use the review CLI commands — it writes a markdown report and reports pass/gaps via teammate message. The orchestrate skill already spawns `tina:phase-reviewer` and handles pass/gaps verdicts, but does not pass `feature_name` to the review task metadata.

**Files involved:**
- `tina-checks.toml` (new — check suite configuration at project root)
- `checks/api-contracts.md` (new — example project check markdown)
- `agents/phase-reviewer.md` (edit — integrate review CLI commands into agent workflow)
- `skills/orchestrate/SKILL.md` (edit — add `feature_name` to review task metadata)

---

## Phase Estimates

| Step | Estimated Minutes |
|------|-------------------|
| Task 1: Create tina-checks.toml and project check markdown | 3 |
| Task 2: Update orchestrate skill to pass feature_name to reviewer | 3 |
| Task 3: Update phase-reviewer agent with review CLI integration | 10 |
| Task 4: Verify tina-checks.toml parses correctly | 2 |
| **Total** | **18** |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 500 |

---

### Task 1: Create tina-checks.toml and project check markdown

**Files:**
- `tina-checks.toml` (new)
- `checks/api-contracts.md` (new)

**Model:** haiku

**review:** spec-only

**Depends on:** none

**Steps:**

1. Create `tina-checks.toml` at the project root. This file defines the check suite that `tina-session review run-checks` reads when executing CLI checks. Follow the convention from the design doc's "Check Suite Configuration" section.

Write `tina-checks.toml`:

```toml
# Check suite for tina-session review run-checks.
# CLI checks have a `command` field and are executed automatically.
# Project checks have `kind = "project"` and a `path` to a markdown file
# the review agent reads and evaluates.

[[check]]
name = "typecheck"
command = "mise run check"

[[check]]
name = "test"
command = "mise run test"

[[check]]
name = "convex-test"
command = "npm test"

[[check]]
name = "api-contracts"
kind = "project"
path = "checks/api-contracts.md"
```

2. Create directory `checks/` and write `checks/api-contracts.md`. This is a project check — the review agent reads it, evaluates the codebase against its criteria, and reports pass/fail via `tina-session review start-check` / `complete-check`.

Write `checks/api-contracts.md`:

```markdown
# API Contracts Check

Verify that public API contracts are consistent across layers.

## Criteria

1. **Convex schema matches mutations/queries:** Every field in `convex/schema.ts` table definitions is used by at least one mutation or query. No mutation writes a field not in the schema.

2. **CLI arguments match Convex mutations:** Every `tina-session` CLI command that writes to Convex passes arguments matching the mutation's expected parameters. No silent field drops or type mismatches.

3. **Web query definitions match Convex queries:** Every `QueryDef` in `tina-web/src/services/data/queryDefs.ts` references an existing Convex query function with matching argument types.

4. **Daemon HTTP response types match web hooks:** TypeScript types in `tina-web/src/hooks/useDaemonQuery.ts` match the Rust serialization types in `tina-daemon/src/git.rs`.

## How to evaluate

For each criterion, spot-check 2-3 examples from the phase's changed files. If all spot checks pass, the check passes. If any mismatch is found, the check fails with a description of the mismatch.
```

3. Verify the toml parses:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && python3 -c "import tomllib; f=open('tina-checks.toml','rb'); d=tomllib.load(f); print(len(d['check']), 'checks'); [print(f'  {c[\"name\"]} ({c.get(\"kind\",\"cli\")})') for c in d['check']]"`
Expected: 4 checks listed with names typecheck, test, convex-test, api-contracts

---

### Task 2: Update orchestrate skill to pass feature_name to reviewer

**Files:**
- `skills/orchestrate/SKILL.md` (edit)

**Model:** haiku

**review:** spec-only

**Depends on:** none

**Steps:**

1. Read `skills/orchestrate/SKILL.md` and locate the review-phase-N TaskCreate metadata section (around line 645-655). The current metadata is:

```json
"metadata": {
    "phase_num": <N>,
    "design_doc_path": "<DESIGN_DOC or 'convex://<DESIGN_ID>'>",
    "design_id": "<DESIGN_ID or null>",
    "output_path": "<WORKTREE_PATH>/.claude/tina/reports/phase-<N>-review.md"
}
```

Edit to add `feature_name`:

```json
"metadata": {
    "phase_num": <N>,
    "design_doc_path": "<DESIGN_DOC or 'convex://<DESIGN_ID>'>",
    "design_id": "<DESIGN_ID or null>",
    "feature_name": "<FEATURE_NAME>",
    "output_path": "<WORKTREE_PATH>/.claude/tina/reports/phase-<N>-review.md"
}
```

2. Also locate the reviewer spawn section (around line 824-827) which says:
> Before spawning: Update review-phase-N metadata with worktree_path, design_doc_path, and git_range

Edit to include `feature_name`:
> Before spawning: Update review-phase-N metadata with worktree_path, design_doc_path, feature_name, and git_range

3. Verify the edit is consistent by searching for other references to review task metadata in the file.

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && grep -n "feature_name" skills/orchestrate/SKILL.md | head -10`
Expected: At least 2 matches — one in TaskCreate metadata, one in spawn section

---

### Task 3: Update phase-reviewer agent with review CLI integration

**Files:**
- `agents/phase-reviewer.md` (edit)

**Model:** opus

**review:** full

**Depends on:** Task 1, Task 2

**Steps:**

1. Read the full current `agents/phase-reviewer.md`. The agent currently:
   - Reads design doc + plan
   - Does pattern conformance, integration verification, functional verification, detector checks, metrics collection
   - Writes a markdown report
   - Sends pass/gaps verdict via teammate message

   The updated agent must ALSO:
   - Call `tina-session review start` to create a review record in Convex (visible in web UI)
   - Call `tina-session review run-checks` to execute CLI checks from `tina-checks.toml`
   - Evaluate project checks via `tina-session review start-check` / `complete-check`
   - Write findings as reviewThreads via `tina-session review add-finding`
   - Call `tina-session review complete` with final status
   - Manage gates via `tina-session review gate`

2. Edit `agents/phase-reviewer.md`. The key structural change is adding a new section "## Review Data Model Integration" after the "Reading Your Task" section, and updating the "Your Job" section to include CLI calls at each step. Add `feature_name` to required metadata.

   Add to **Required parameters from task.metadata:**
   ```
   - `feature_name`: Feature name for review CLI commands
   ```

   Add new section after "Resolve Design Content" and before "## Input":

   ```markdown
   ## Review Data Model Integration

   This agent integrates with the review data model via `tina-session review` CLI commands.
   All review state flows through Convex and is visible in real-time on tina-web.

   ### Step 0: Start Review Record

   Before any review work, create the review record:

   ```bash
   REVIEW_JSON=$(tina-session review start \
     --feature "$FEATURE_NAME" \
     --phase "$PHASE_NUM" \
     --reviewer "phase-reviewer" \
     --json)
   REVIEW_ID=$(echo "$REVIEW_JSON" | jq -r '.reviewId')
   ORCHESTRATION_ID=$(echo "$REVIEW_JSON" | jq -r '.orchestrationId')
   ```

   ### Step 1: Run CLI Checks

   Execute all CLI checks from `tina-checks.toml`:

   ```bash
   CHECKS_JSON=$(tina-session review run-checks \
     --feature "$FEATURE_NAME" \
     --review-id "$REVIEW_ID" \
     --json)
   ```

   Results stream into Convex as each check completes (web shows checks filling in real-time).
   Parse the JSON summary to identify failures.

   ### Step 2: Evaluate Project Checks

   For each project check in `tina-checks.toml` (entries with `kind = "project"`):

   1. Start the check record:
      ```bash
      tina-session review start-check \
        --review-id "$REVIEW_ID" \
        --orchestration-id "$ORCHESTRATION_ID" \
        --name "$CHECK_NAME" \
        --kind project \
        --json
      ```

   2. Read the check's markdown file (from the `path` field in `tina-checks.toml`)
   3. Evaluate the codebase against the criteria described in the markdown
   4. Complete the check with your verdict:
      ```bash
      tina-session review complete-check \
        --review-id "$REVIEW_ID" \
        --name "$CHECK_NAME" \
        --status passed|failed \
        --comment "Explanation of result" \
        --json
      ```

   ### Step 3: Write Findings

   During code review (pattern conformance, integration verification, etc.), write each
   finding as a reviewThread:

   ```bash
   tina-session review add-finding \
     --review-id "$REVIEW_ID" \
     --orchestration-id "$ORCHESTRATION_ID" \
     --file "src/example.ts" \
     --line 42 \
     --commit "$(git rev-parse HEAD)" \
     --severity p0|p1|p2 \
     --gate review \
     --summary "Short description" \
     --body "Detailed explanation with fix suggestion" \
     --source agent \
     --author "phase-reviewer" \
     --json
   ```

   Severity mapping:
   - **p0** (critical): Won't work at runtime, dead code, not integrated, detector hard-block
   - **p1** (important): Pattern violations, missed reuse, >50% metric drift
   - **p2** (informational): Style inconsistencies, minor readability, warnings

   Gate impact mapping:
   - **review**: Standard code review findings (default)
   - **plan**: Issues that indicate planning problems
   - **finalize**: Issues that should block final merge

   ### Step 4: Complete Review

   After all checks and code review:

   ```bash
   # Determine status based on findings
   # approved: all checks passed, no unresolved p0/p1 findings
   # changes_requested: any failed checks or unresolved p0/p1 findings
   tina-session review complete \
     --feature "$FEATURE_NAME" \
     --review-id "$REVIEW_ID" \
     --status approved|changes_requested \
     --json
   ```

   ### Step 5: Gate Management (if changes_requested)

   If the review result is `changes_requested` and the review gate requires HITL:

   ```bash
   tina-session review gate block \
     --feature "$FEATURE_NAME" \
     --gate review \
     --reason "Unresolved p0 findings: ..." \
     --json
   ```

   If approved:
   ```bash
   tina-session review gate approve \
     --feature "$FEATURE_NAME" \
     --gate review \
     --json
   ```
   ```

3. Update the "Your Job" section to reference the CLI integration steps. The existing review steps (Pattern Conformance, Integration Verification, Functional Verification, Detector + Reuse, Metrics) remain but each should note that findings get written via `add-finding`. Add a note at the start of "Your Job":

   ```markdown
   **IMPORTANT:** Before starting any review work, execute Step 0 from "Review Data Model
   Integration" to create the review record. After running CLI checks (Step 1) and project
   checks (Step 2), proceed with the review sections below. As you find issues in each
   section, write them as findings using Step 3. After all sections, complete the review
   using Steps 4-5.
   ```

4. Update the "Completion Message Format" section to note that findings are now also persisted in Convex (not just in the markdown report):

   Add after the existing completion format:
   ```markdown
   **Note:** In addition to sending the teammate message, all findings are persisted in
   Convex via `tina-session review add-finding` and visible in real-time on tina-web.
   The markdown report at `output_path` remains the canonical detailed review, but the
   Convex data enables the web UI's review workbench (Changes tab thread markers, Checks
   tab status badges, Conversation tab feed).
   ```

5. Verify the agent file is well-formed and under the line limit:

Run: `wc -l /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/agents/phase-reviewer.md`
Expected: Under 400 lines (complexity budget limit)

---

### Task 4: Verify tina-checks.toml parses correctly with Rust CLI

**Files:**
- (no edits — verification only)

**Model:** haiku

**review:** spec-only

**Depends on:** Task 1

**Steps:**

1. Verify `tina-checks.toml` parses with the same TOML parser the Rust CLI uses. The CLI uses `toml::from_str` with the `ChecksConfig` struct. Run a quick parse test:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && cargo test --manifest-path tina-session/Cargo.toml 2>&1 | tail -15`
Expected: All existing tests pass (no regressions from config file addition)

2. Verify that `tina-session review run-checks --help` shows the expected interface:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && cargo run --manifest-path tina-session/Cargo.toml -- review run-checks --help 2>&1`
Expected: Help text showing --feature, --review-id, --json flags

3. Verify the project check markdown is accessible:

Run: `ls -la /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/checks/api-contracts.md`
Expected: File exists

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
