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
  ${MODEL:+--model "$MODEL"}
```

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

Map status to orchestration result based on role:

**Executor results:**
- `status == "completed"` and `exit_code == 0`: extract git range from stdout if present, result is `pass`
- `status == "completed"` and `exit_code != 0`: result is `gaps`, extract issues from stderr/stdout
- `status == "failed"`: result is `error`
- `status == "timed_out"`: result is `error` with timeout context

**Reviewer results:**
- `status == "completed"` and `exit_code == 0`: parse stdout for pass/gaps verdict
- `status == "completed"` and `exit_code != 0`: result is `gaps`, extract issues
- `status == "failed"`: result is `error`
- `status == "timed_out"`: result is `error` with timeout context

**Planner results:**
- `status == "completed"` and `exit_code == 0`: plan path from output, result is `pass`
- Otherwise: result is `error`

**Validator results:**
- `status == "completed"` and `exit_code == 0`: parse stdout for pass/warning/stop
- Otherwise: result is `error`

## STEP 5: Report result

Send a message to the team lead using the same format patterns as native Claude teammates. The orchestrator's event loop parses these patterns, so format compatibility is critical.

**Executor completion:**
```
SendMessage to team lead:
  "execute-$PHASE complete. Git range: <range>"
  # or on failure:
  "execute-$PHASE error: <reason>"
```

**Reviewer completion:**
```
SendMessage to team lead:
  "review-$PHASE complete (pass)"
  # or with gaps:
  "review-$PHASE complete (gaps): <issue1>, <issue2>"
  # or on failure:
  "review-$PHASE error: <reason>"
```

**Planner completion:**
```
SendMessage to team lead:
  "plan-phase-$PHASE complete. PLAN_PATH: <path>"
  # or on failure:
  "plan-phase-$PHASE error: <reason>"
```

**Validator completion:**
```
SendMessage to team lead:
  "VALIDATION_STATUS: Pass"
  # or:
  "VALIDATION_STATUS: Warning"
  # or:
  "VALIDATION_STATUS: Stop"
```

**Timeout errors:**
```
SendMessage to team lead:
  "$TASK_ID error: codex timed out after $DURATION_SECS seconds"
```

**Launch errors:**
```
SendMessage to team lead:
  "$TASK_ID error: codex unavailable - <error detail>"
```

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
