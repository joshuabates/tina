# Codex Worker/Reviewer Functional Parity Phase 1 Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 33de47adcc661a1fdedcc2fc3c55956e45b38129

**Goal:** Define and emit the v2 result contract across all agent definitions and skills so that team-lead can process structured results from both Claude and Codex teammates uniformly.

**Architecture:** Skill and agent definition changes (markdown files). The "contract" lives in skill prompts interpreted by Claude, not in programmatic parsers. No Rust or TypeScript code changes in this phase.

**Phase context:** This is Phase A from the Codex Worker/Reviewer Functional Parity design. It covers: (1) updating agent definitions to request v2 structured headers, (2) updating codex-cli skill to emit v2 headers deterministically, (3) updating team-lead-init and executing-plans skills with dual-grammar recognition, (4) adding acceptance matrix validation logic, and (5) normalizing Codex failure classes in codex-cli.

**Key patterns to follow:**
- Agent output protocols: `agents/implementer.md:94-138`, `agents/spec-reviewer.md:55-97`, `agents/code-quality-reviewer.md:68-117`
- Codex adapter flow: `skills/codex-cli/SKILL.md:103-181` (Steps 4-5)
- Team-lead DAG scheduler: `skills/team-lead-init/SKILL.md:126-261`
- Executing-plans routing: `skills/executing-plans/SKILL.md:138-287`

**Anti-patterns:**
- Don't build a Rust parser — update skill prompts instead
- Don't assume v2 headers will be emitted perfectly by Claude agents — permanent dual-grammar support
- Don't use bare `task_id: <numeric>` — use string UUIDs from TaskCreate

---

## Tasks

### Task 1: Update agent definitions with v2 output contract

**Files:**
- `agents/implementer.md`
- `agents/spec-reviewer.md`
- `agents/code-quality-reviewer.md`

**Model:** opus

**review:** full

**Depends on:** none

Update all three agent definitions to define and emit v2 structured headers in their output format sections.

**Step 1:** Read current output sections in all three agent files to confirm starting state.

Run: `grep -n "Report Format\|Communicating Results\|Team Mode Behavior" agents/implementer.md agents/spec-reviewer.md agents/code-quality-reviewer.md`
Expected: Lines showing current section headers for output format in each file.

**Step 2:** Update `agents/implementer.md` — replace the "Report Format" section (lines 94-100) with v2-aware output format:

Replace the existing Report Format section with:

```markdown
## Report Format

When done, report using v2 structured headers followed by a freeform body:

**v2 Headers (required):**
```
role: worker
task_id: <TaskCreate UUID>
status: pass|gaps|error
git_range: <base>..<head>  (required when status=pass)
files_changed: <comma-separated list>
issues: <semicolon-separated list>  (required when status=gaps or error)
```

**Freeform body (required):**
- What you implemented
- What you tested and results
- Self-review findings (if any)
- Open issues/risks

**Example (pass):**
```
role: worker
task_id: abc-123-def
status: pass
git_range: a1b2c3d..e4f5g6h
files_changed: src/auth.ts, src/auth.test.ts

Implemented JWT authentication middleware with refresh token support.
Tests: 12/12 passing. Self-review: clean.
```

**Example (gaps):**
```
role: worker
task_id: abc-123-def
status: gaps
issues: test for edge case X is flaky; dependency Y not available in worktree

Implemented core logic but blocked on missing dependency.
```
```

**Step 3:** Update `agents/spec-reviewer.md` — replace the "Report Format" and "Communicating Results" sections with v2-aware format:

Replace the Report Format section with:

```markdown
## Report Format

Return v2 structured headers followed by a freeform body:

**v2 Headers (required):**
```
role: spec-reviewer
task_id: <TaskCreate UUID>
status: pass|gaps|error
confidence: high|medium|low  (optional)
issues: <semicolon-separated list>  (required when status=gaps or error)
```

**Freeform body (required):**
One of:
- **Spec compliant**: requirements met, no detector/precondition issues.
- **Precondition failure**: list unmet preconditions.
- **Issues found**: list missing/extra/misinterpreted behavior with file:line refs.

Any issue blocks approval.

**Example (pass):**
```
role: spec-reviewer
task_id: abc-123-def
status: pass
confidence: high

Spec compliant — all 5 requirements met, no extra behavior, preconditions satisfied.
```

**Example (gaps):**
```
role: spec-reviewer
task_id: abc-123-def
status: gaps
confidence: high
issues: missing progress reporting (spec says "report every 100 items"); extra --json flag not requested

Issues found:
- Missing: Progress reporting (spec requirement 3) — src/recovery.ts:45
- Extra: --json flag (not in spec) — src/recovery.ts:12
```
```

Update the Communicating Results section under Team Mode Behavior to use v2 format:

```markdown
### Communicating Results

PASS:
```json
SendMessage({
  type: "message",
  recipient: "worker",
  content: "role: spec-reviewer\ntask_id: <id>\nstatus: pass\nconfidence: high\n\nSpec review passed.",
  summary: "Spec review passed"
})
```

FAIL:
```json
SendMessage({
  type: "message",
  recipient: "worker",
  content: "role: spec-reviewer\ntask_id: <id>\nstatus: gaps\nissues: <issue1>; <issue2>\n\nSpec review FAILED. Issues:\n- [Issue 1]\n- [Issue 2]",
  summary: "Spec review failed with issues"
})
```
```

**Step 4:** Update `agents/code-quality-reviewer.md` — replace the Report Format and Team Mode communication sections with v2-aware format:

Replace the Report Format section with:

```markdown
## Report Format

Return v2 structured headers followed by a freeform body:

**v2 Headers (required):**
```
role: code-quality-reviewer
task_id: <TaskCreate UUID>
status: pass|gaps|error
confidence: high|medium|low  (optional)
issues: <semicolon-separated list>  (required when status=gaps or error)
```

**Freeform body (required):**
Include these sections:

#### Detector Findings
- `test_integrity`: n/a in quality review unless obvious collateral issue
- `reuse_drift`: pass/fail with evidence
- `architecture_drift`: pass/fail with evidence

#### Simplification Opportunities
- [ ] ...

#### Complexity Violations
| File | Lines | Issue | Recommendation |
|------|-------|-------|----------------|

If detector findings (hard-block) or complexity violations remain, review fails.

Then include:
- Strengths
- Issues (by severity, file:line)
- Assessment: APPROVED or FAILED
```

Update the Team Mode PASS/FAIL messages:

```markdown
PASS message:
```json
SendMessage({
  type: "message",
  recipient: "worker",
  content: "role: code-quality-reviewer\ntask_id: <id>\nstatus: pass\n\nCode quality review PASSED.",
  summary: "Code quality review passed"
})
```

FAIL message:
```json
SendMessage({
  type: "message",
  recipient: "worker",
  content: "role: code-quality-reviewer\ntask_id: <id>\nstatus: gaps\nissues: <issue1>; <issue2>\n\nCode quality review FAILED. Issues:\n- [Issue 1]\n- [Issue 2]",
  summary: "Code quality review failed"
})
```
```

**Step 5:** Update `agents/implementer.md` — update the Review Notification section under Team Mode Behavior to include v2 headers in worker messages:

Replace the Review Notification section with:

```markdown
### Review Notification

After implementation, notify reviewers with v2 headers:

```json
SendMessage({
  type: "message",
  recipient: "spec-reviewer",
  content: "role: worker\ntask_id: <id>\nstatus: pass\ngit_range: <base>..<head>\nfiles_changed: <list>\n\nTask complete. Please review.",
  summary: "Implementation complete, requesting spec review"
})

SendMessage({
  type: "message",
  recipient: "code-quality-reviewer",
  content: "role: worker\ntask_id: <id>\nstatus: pass\ngit_range: <base>..<head>\nfiles_changed: <list>\n\nTask complete. Please review.",
  summary: "Implementation complete, requesting code quality review"
})
```
```

Run: `grep -c "role:" agents/implementer.md agents/spec-reviewer.md agents/code-quality-reviewer.md`
Expected: Each file should contain multiple occurrences of "role:" showing v2 header usage.

---

### Task 2: Update codex-cli skill to emit v2 headers deterministically

**Files:**
- `skills/codex-cli/SKILL.md`

**Model:** opus

**review:** full

**Depends on:** none

Update the codex-cli skill Step 4 (result parsing) and Step 5 (result reporting) to emit v2 structured headers deterministically when reporting results to team-lead.

**Step 1:** Read current STEP 4 and STEP 5 sections to confirm starting state.

Run: `grep -n "STEP 4\|STEP 5\|SendMessage" skills/codex-cli/SKILL.md`
Expected: Lines showing current Step 4/5 structure and SendMessage patterns.

**Step 2:** Update STEP 4 to normalize results into v2 fields. Replace the current "Map status to orchestration result" section (after the JSON envelope parsing) with:

```markdown
### Normalize to v2 fields

After parsing the JSON envelope, build a v2 result struct with these fields:

| Field | Source |
|-------|--------|
| `role` | From spawn prompt `role` field, mapped: `executor` → `worker`, `reviewer` → infer from spawn name (`spec-reviewer-N` or `code-quality-reviewer-N`) |
| `task_id` | From spawn prompt `task_id` field |
| `status` | Mapped from envelope (see mapping table below) |
| `git_range` | Extracted from stdout if present (pattern: `<hash>..<hash>`) |
| `files_changed` | Extracted from stdout if present |
| `issues` | Extracted from stdout/stderr on non-pass |
| `confidence` | For reviewers only: `high` if exit_code=0, `medium` otherwise |

**Status mapping:**

| Envelope status | exit_code | v2 status |
|----------------|-----------|-----------|
| `completed` | 0 | `pass` |
| `completed` | non-zero | `gaps` |
| `failed` | any | `error` |
| `timed_out` | any | `error` |

**Failure class normalization:**

Normalize common Codex failure modes into deterministic error outputs:

| Failure class | Detection | v2 output |
|---------------|-----------|-----------|
| Timeout | `status == "timed_out"` | `status: error`, `issues: codex timed out after {duration}s` |
| Binary not found | exec-codex launch error | `status: error`, `issues: codex unavailable - {detail}` |
| Invalid JSON | stdout not parseable | `status: error`, `issues: codex returned invalid output` |
| Non-zero exit | `exit_code != 0` | `status: gaps`, `issues: {first 200 chars of stderr or stdout}` |
| Empty stdout | `stdout == ""` and `exit_code == 0` | `status: error`, `issues: codex returned empty output` |
```

**Step 3:** Replace the entire STEP 5 section with v2-header-based reporting:

```markdown
## STEP 5: Report result with v2 headers

Send a message to the team lead with v2 structured headers. The v2 headers are machine-parseable and the freeform body provides context.

**Worker completion (role=executor):**

Pass:
```
SendMessage to team lead:
  content: |
    role: worker
    task_id: $TASK_ID
    status: pass
    git_range: <extracted range>
    files_changed: <extracted list>

    Codex run $RUN_ID completed in ${DURATION_SECS}s.
    <relevant stdout excerpt>
  summary: "execute-$PHASE complete"
```

Gaps:
```
SendMessage to team lead:
  content: |
    role: worker
    task_id: $TASK_ID
    status: gaps
    issues: <normalized issues>

    Codex run $RUN_ID completed with issues in ${DURATION_SECS}s.
    <relevant stdout/stderr excerpt>
  summary: "execute-$PHASE gaps"
```

Error:
```
SendMessage to team lead:
  content: |
    role: worker
    task_id: $TASK_ID
    status: error
    issues: <normalized error>

    Codex run $RUN_ID failed after ${DURATION_SECS}s.
    <error context>
  summary: "execute-$PHASE error"
```

**Reviewer completion (role=reviewer):**

Pass:
```
SendMessage to team lead:
  content: |
    role: <spec-reviewer|code-quality-reviewer>
    task_id: $TASK_ID
    status: pass
    confidence: <high|medium>

    Codex review run $RUN_ID completed in ${DURATION_SECS}s.
    <relevant review output>
  summary: "review-$PHASE complete (pass)"
```

Gaps:
```
SendMessage to team lead:
  content: |
    role: <spec-reviewer|code-quality-reviewer>
    task_id: $TASK_ID
    status: gaps
    confidence: <high|medium|low>
    issues: <normalized issues>

    Codex review run $RUN_ID found issues in ${DURATION_SECS}s.
    <issue details>
  summary: "review-$PHASE complete (gaps)"
```

Error:
```
SendMessage to team lead:
  content: |
    role: <spec-reviewer|code-quality-reviewer>
    task_id: $TASK_ID
    status: error
    issues: <normalized error>

    Codex review run $RUN_ID failed after ${DURATION_SECS}s.
  summary: "review-$PHASE error"
```

**Planner and Validator:** Keep existing message formats (planner and validator parity is out of scope for this rollout).

**IMPORTANT:** All v2 headers must be emitted as the first lines of the message content, separated from the freeform body by a blank line. This allows team-lead to parse headers deterministically when present.
```

**Step 4:** Add a new section after STEP 5 for failure class normalization examples:

```markdown
## Failure Class Reference

These common Codex failure patterns are normalized deterministically before reporting:

| Scenario | Raw output | v2 report |
|----------|-----------|-----------|
| Clean success | exit_code=0, stdout has code output | `status: pass`, extract git_range from stdout |
| Test failures | exit_code=1, stderr has test output | `status: gaps`, `issues: test failures: {summary}` |
| Timeout (300s) | timed_out status | `status: error`, `issues: codex timed out after 300s` |
| Codex crash | failed status, stderr has stack trace | `status: error`, `issues: codex process failed: {first line}` |
| Empty output | exit_code=0, empty stdout | `status: error`, `issues: codex returned empty output` |
| Unparseable JSON | stdout is not valid JSON envelope | `status: error`, `issues: codex returned invalid output` |

The adapter MUST normalize all of these before sending to team-lead. Team-lead should never receive raw Codex error output.
```

Run: `grep -c "role:" skills/codex-cli/SKILL.md`
Expected: Multiple occurrences showing v2 header usage in all message templates.

---

### Task 3: Update team-lead-init skill with dual-grammar recognition and acceptance matrix

**Files:**
- `skills/team-lead-init/SKILL.md`

**Model:** opus

**review:** full

**Depends on:** none

Update the team-lead-init skill to recognize v2 headers from both Claude and Codex agents, with permanent legacy fallback, and add acceptance matrix validation.

**Step 1:** Read the current STEP 5.3 and 5.4 sections to understand how worker/reviewer messages are currently handled.

Run: `grep -n "5.3\|5.4\|Wait for\|worker.*complete\|review.*complete" skills/team-lead-init/SKILL.md`
Expected: Lines showing current message handling patterns.

**Step 2:** Add a new section after STEP 4 (task creation) and before STEP 5 (DAG scheduler) defining the v2 contract and dual-grammar recognition:

Insert after the STEP 4 section closing `---`:

```markdown
## STEP 4b: Result contract and dual-grammar recognition

### v2 Result Contract

All worker and reviewer outputs normalize to this schema:

| Field | Type | Required |
|-------|------|----------|
| `role` | `worker\|spec-reviewer\|code-quality-reviewer` | always |
| `task_id` | string (TaskCreate UUID) | always |
| `status` | `pass\|gaps\|error` | always |
| `git_range` | string | when role=worker and status=pass |
| `files_changed` | string | optional |
| `issues` | string | when status=gaps or error |
| `confidence` | `high\|medium\|low` | optional, reviewers only |

### Acceptance matrix

When processing a result message, validate required fields:

| role | status | required fields |
|------|--------|----------------|
| worker | pass | task_id, status, git_range |
| worker | gaps or error | task_id, status, issues |
| spec-reviewer | pass | task_id, status |
| spec-reviewer | gaps or error | task_id, status, issues |
| code-quality-reviewer | pass | task_id, status |
| code-quality-reviewer | gaps or error | task_id, status, issues |

If a required field is missing from a v2 message, treat the result as invalid (see retry policy).

### Dual-grammar recognition (permanent)

Team-lead accepts BOTH formats permanently:

**v2 format (structured headers):** Message starts with `role:` line followed by key-value header lines, then a blank line, then freeform body. Parse headers into the v2 schema above.

**Legacy format (freeform):** Message does NOT start with `role:`. Interpret the message body using LLM reasoning to extract:
- Pass/fail verdict from phrases like "review passed", "spec compliant", "APPROVED", "FAILED", "issues found"
- Git range from patterns like `abc123..def456`
- Issues from bullet lists or numbered findings

**Recognition logic:**
1. Check if first line of message content matches `^role:\s*(worker|spec-reviewer|code-quality-reviewer)$`
2. If yes: parse as v2 — extract all header fields, validate against acceptance matrix
3. If no: parse as legacy — interpret freeform message for verdict, git range, issues

**IMPORTANT:** Claude agents produce freeform text. v2 headers are a best-effort convention for Claude, not a guaranteed parse. Always handle legacy gracefully. For Codex outputs (via codex-cli adapter), v2 is deterministic.

---
```

**Step 3:** Update STEP 5.3 ("Wait for ANY worker to complete") to use dual-grammar recognition when processing worker completion messages:

Add after the existing "Monitor for Teammate messages" text:

```markdown
When a worker message arrives, apply dual-grammar recognition:
1. If message has v2 headers: extract `role`, `task_id`, `status`, `git_range`, `files_changed`, `issues`
2. If message is legacy freeform: interpret verdict and extract git range from text
3. Validate against acceptance matrix (for v2 messages only)
4. If v2 validation fails (missing required field): treat as invalid result, apply retry policy
```

**Step 4:** Update STEP 5.4 ("Review the completed task") to process reviewer results with dual-grammar recognition:

Add after the "Wait for both reviewers to approve" text:

```markdown
When a reviewer message arrives, apply dual-grammar recognition:
1. If message has v2 headers: extract `role`, `task_id`, `status`, `issues`, `confidence`
2. If message is legacy freeform: interpret pass/fail verdict and extract issues from text
3. For v2 messages, validate against acceptance matrix
4. Decision logic:
   - `status: pass` → reviewer approved
   - `status: gaps` → reviewer found issues, send back to worker for fixes
   - `status: error` → reviewer encountered an error, apply retry policy
```

**Step 5:** Add retry policy for invalid results as a new subsection after STEP 5.4:

```markdown
### 5.4b Invalid result handling

When a result message fails v2 acceptance matrix validation or cannot be interpreted:

1. **First attempt:** Retry the agent (worker or reviewer) once with stricter instructions. Add to the retry prompt:
   ```
   IMPORTANT: Your previous response could not be parsed. You MUST include v2 structured headers at the start of your message:
   role: <your-role>
   task_id: <task-id>
   status: pass|gaps|error
   [additional required fields per acceptance matrix]

   Then include your freeform explanation after a blank line.
   ```
2. **Second failure:** Mark the run as failed. For workers, shut down and retry with fresh worker (existing retry policy). For reviewers, treat as review error — shut down reviewer and spawn replacement.
3. **After exhausting retries:** Mark task as blocked per existing escalation protocol.

Note: This retry policy applies only to unparseable/invalid results. Valid results with `status=gaps` follow the normal remediation loop (reviewer sends issues to worker, worker fixes, re-review).
```

Run: `grep -c "acceptance matrix\|dual-grammar\|v2.*header\|legacy.*format" skills/team-lead-init/SKILL.md`
Expected: Multiple occurrences showing dual-grammar recognition is documented throughout.

---

### Task 4: Update executing-plans skill with dual-grammar recognition

**Files:**
- `skills/executing-plans/SKILL.md`

**Model:** opus

**review:** spec-only

**Depends on:** 3

Update the executing-plans skill with the same dual-grammar recognition as team-lead-init.

**Step 1:** Read the current "Message Handling" section to understand current message patterns.

Run: `grep -n "Message Handling\|From workers\|From reviewers" skills/executing-plans/SKILL.md`
Expected: Lines showing current message handling section.

**Step 2:** Add a new section "Result Contract" after the "Team Mode Process" section header and before "Ephemeral Team Mode Implementation":

```markdown
### Result Contract and Dual-Grammar Recognition

Team-lead in executing-plans mode accepts both v2 structured headers and legacy freeform messages permanently.

**v2 format:** Message starts with `role:` header line. Parse key-value headers (role, task_id, status, git_range, files_changed, issues, confidence) then freeform body after blank line.

**Legacy format:** Message does not start with `role:`. Interpret freeform text for verdict, git range, and issues using LLM reasoning.

**Acceptance matrix (v2 only):**
| role | status | required fields |
|------|--------|----------------|
| worker | pass | task_id, status, git_range |
| worker | gaps/error | task_id, status, issues |
| spec-reviewer | pass | task_id, status |
| spec-reviewer | gaps/error | task_id, status, issues |
| code-quality-reviewer | pass | task_id, status |
| code-quality-reviewer | gaps/error | task_id, status, issues |

Claude agents emit v2 as best-effort. Codex agents (via codex-cli) emit v2 deterministically. Always handle legacy gracefully.
```

**Step 3:** Update the "Message Handling" section to reference dual-grammar recognition:

Replace the current message handling section content with:

```markdown
### Message Handling

Team-lead monitors for messages and applies dual-grammar recognition:

**From workers (v2 or legacy):**
- v2 `status: pass` or legacy "Implementation complete" → Spawn reviewers
- v2 `status: gaps` or legacy "Task blocked on X" → Note blocker, assess next steps
- v2 `status: error` or legacy error indication → Apply retry policy

**From reviewers (v2 or legacy):**
- v2 `status: pass` or legacy "Review passed" / "APPROVED" → Track as passed, check if both complete
- v2 `status: gaps` or legacy "Issues found: [list]" → Worker fixes, re-review
- v2 `status: error` or legacy "Review loop exceeded" → Team-lead intervenes

**Invalid result handling:**
If a v2 message fails acceptance matrix validation, retry the agent once with stricter instructions requesting v2 headers. On second failure, follow existing escalation.
```

Run: `grep -c "dual-grammar\|acceptance matrix\|v2.*header\|legacy.*format" skills/executing-plans/SKILL.md`
Expected: Multiple occurrences showing dual-grammar recognition is documented.

---

## Phase Estimates

| Task | Estimated effort | Risk |
|------|-----------------|------|
| Task 1: Agent definitions v2 contract | 15-20 min | Low — straightforward markdown updates |
| Task 2: Codex-cli v2 headers | 15-20 min | Medium — must ensure all failure classes covered |
| Task 3: Team-lead-init dual-grammar | 15-20 min | Medium — most complex, acceptance matrix + retry |
| Task 4: Executing-plans dual-grammar | 10-15 min | Low — mirrors team-lead-init patterns |

**Total estimated:** 55-75 min
**Critical path:** Tasks 1-3 are independent; Task 4 depends on Task 3 for pattern consistency.

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 500 |

Note: All changes are markdown (skill/agent definitions), so function length is not directly applicable. The 500-line budget covers total new/modified lines across all skill and agent files.

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
