---
name: codex-cli
description: Adapter skill for executing tasks via Codex CLI. Used by Claude teammates when a task routes to a Codex-family model.
---

# Codex CLI Adapter

Execute a task through the Codex CLI via `tina-session exec-codex`. This skill is invoked by a Claude teammate (not directly by the user) when the orchestrator determines a task's model routes to codex.

## FORBIDDEN ACTIONS
- Invoking Codex directly (always go through `tina-session exec-codex`)
- Modifying orchestration state (only report results; team lead handles state transitions)
- Retrying automatically (team lead decides retry policy)
- Writing code yourself (Codex does the work)

## STEP 1: Parse invocation

Extract structured fields from the spawn prompt. The orchestrator provides these when spawning:

```
feature: <feature-name>
phase: <phase-number>
task_id: <task-id>
role: <executor|reviewer|planner|validator>
cwd: <worktree-path>
model: <model-string>  (optional, uses config default if omitted)
prompt_content: |
  <task body, relevant files, reviewer rubric, etc.>
```

Parse each field. All fields except `model` are required. If any required field is missing, report an error immediately via SendMessage to team lead.

## STEP 2: Build Codex prompt

Assemble the prompt payload from the task context provided in `prompt_content`.

**For executor role:**
```
Implement the following task in the codebase at <cwd>.
Follow TDD: write failing tests first, then implement, then verify.

Task:
<prompt_content>
```

**For reviewer role:**
```
Review the implementation for the following task.
Check for: spec compliance, test coverage, code quality, and architectural patterns.
Report pass/gaps/issues.

Task:
<prompt_content>
```

**For planner role:**
```
Create an implementation plan for the following task.
Break it into concrete subtasks with model assignments and dependencies.

Task:
<prompt_content>
```

**For validator role:**
```
Validate the following design document.
Check feasibility, completeness, and architectural alignment.

Design:
<prompt_content>
```

**Large prompts:** If the assembled prompt exceeds 4000 characters, write it to a temp file and use `@path` syntax:

```bash
PROMPT_FILE=$(mktemp /tmp/codex-prompt-XXXXXX.txt)
# Write assembled prompt to $PROMPT_FILE
# Pass @$PROMPT_FILE to exec-codex instead of inline prompt
```

## STEP 3: Execute via tina-session

Run the command and capture the JSON envelope from stdout:

```bash
tina-session exec-codex \
  --feature "$FEATURE" \
  --phase "$PHASE" \
  --task-id "$TASK_ID" \
  --prompt "$PROMPT"  \
  --cwd "$CWD" \
  --role "$ROLE" \
  ${MODEL:+--model "$MODEL"}
```

**Role mapping:** The `--role` parameter uses the v2 role name:
- Spawn role `executor` → `--role worker`
- Spawn role `reviewer` with name containing `spec-reviewer` → `--role spec-reviewer`
- Spawn role `reviewer` with name containing `code-quality-reviewer` → `--role code-quality-reviewer`

If `exec-codex` fails to launch (binary missing, codex disabled in config), report error immediately:

```
SendMessage to team lead:
  "$TASK_ID error: codex unavailable - <error message>"
```

## STEP 4: Parse result

Parse the JSON envelope printed to stdout by `exec-codex`:

```json
{
  "run_id": "codex_20260209_abc12345",
  "status": "completed|failed|timed_out",
  "model": "gpt-5.3-codex",
  "exit_code": 0,
  "duration_secs": 45.2,
  "stdout": "...",
  "stderr": "...",
  "output_path": null
}
```

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

**Status mapping (worker/reviewer):**

| Envelope status | exit_code | v2 status |
|----------------|-----------|-----------|
| `completed` | 0 | `pass` |
| `failed` | non-zero | `gaps` (default) |
| `timed_out` | any | `error` |

`exec-codex` emits `status: failed` for non-zero Codex exits. Treat these as `gaps` by default, then upgrade to `error` when they match one of the infrastructure failure classes below.

**Failure class normalization:**

Normalize common Codex failure modes into deterministic error outputs:

| Failure class | Detection | v2 output |
|---------------|-----------|-----------|
| Timeout | `status == "timed_out"` | `status: error`, `issues: codex timed out after {duration}s` |
| Binary not found | stderr/stdout contains launch errors (for example `failed to spawn codex binary` or `No such file or directory`) | `status: error`, `issues: codex unavailable - {detail}` |
| Invalid JSON | stdout not parseable | `status: error`, `issues: codex returned invalid output` |
| Codex crash / infra failure | `status == "failed"` and stderr/stdout indicates runtime crash/infrastructure failure | `status: error`, `issues: codex process failed: {first line}` |
| Non-zero task/test failure | `status == "failed"` and `exit_code != 0` and no infrastructure failure signature matched | `status: gaps`, `issues: {first 200 chars of stderr or stdout}` |
| Empty stdout | `stdout == ""` and `exit_code == 0` | `status: error`, `issues: codex returned empty output` |

**Planner results:**
- `status == "completed"` and `exit_code == 0`: plan path from output, result is `pass`
- Otherwise: result is `error`

**Validator results:**
- `status == "completed"` and `exit_code == 0`: parse stdout for pass/warning/stop
- Otherwise: result is `error`

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

## Retry-Aware Behavior

When team-lead retries a Codex agent due to an invalid result, the retry preamble is included in the `prompt_content` field of the spawn prompt. The adapter handles this transparently:

1. **Prompt assembly:** The retry preamble becomes part of the prompt sent to Codex via `exec-codex`. No special handling is needed — the adapter assembles the full prompt from `prompt_content` as usual.

2. **v2 emission unchanged:** The adapter always emits v2 headers deterministically (STEP 5). The retry preamble targets the Codex model's behavior, not the adapter's normalization.

3. **When retry doesn't help:** If the underlying Codex failure is infrastructure-level (timeout, crash, empty output), the retry preamble won't change the outcome. The adapter normalizes the same failure class deterministically. Team-lead will see the same error category on both attempts and should escalate after the second failure.

4. **Detection hint:** If the `prompt_content` starts with `RETRY CONTEXT:`, this is a retry attempt. The adapter should log this fact in the freeform body of the v2 report: "Note: This was a retry attempt after a previous invalid result."

## Error Handling Summary

| Condition | Action |
|-----------|--------|
| `exec-codex` binary not found | Report error: "codex unavailable" |
| Codex disabled in config | Report error: "codex disabled" |
| Codex returns non-zero with output | Treat as `gaps`, include relevant output |
| Codex times out | Report error with timeout duration |
| Codex fails to produce parseable JSON | Report error: "invalid codex output" |
| Prompt file write fails | Report error: "failed to write prompt file" |

## Integration

**Invoked by:**
- `tina:orchestrate` - When routing check determines model uses codex
- `tina:team-lead-init` - When task model routes to codex
- `tina:executing-plans` - When task model routes to codex

**Uses:**
- `tina-session exec-codex` - Synchronous Codex execution with JSON envelope
- `tina-session config cli-for-model` - Routing verification (optional, orchestrator already checked)
- SendMessage - Report results to team lead

## Red Flags

**Never:**
- Call codex binary directly (always use `tina-session exec-codex`)
- Modify orchestration state or task status
- Retry on failure (let the orchestrator decide)
- Parse or interpret Codex stdout beyond extracting the result
- Continue after a launch failure (report and stop)

**Always:**
- Use the exact message format patterns documented in STEP 5
- Include the run_id and duration in error reports when available
- Clean up temp prompt files after execution
- Report errors immediately rather than silently failing
- Note retry context in freeform body when prompt_content starts with "RETRY CONTEXT:"
