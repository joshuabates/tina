# Multi-CLI Agent Support - Phase 2: Codex-CLI Skill and Routing Integration

## Scene-Setting Context

Phase 1 and Phase 1.5 added the foundational primitives:
- `AgentCli` enum and `cli_for_model()` routing function (`tina-session/src/routing.rs`)
- `CodexConfig` and `CliRouting` config structs (`tina-session/src/config.rs`)
- `tina-session config cli-for-model --model <model>` CLI command (`tina-session/src/commands/config.rs`)
- `tina-session exec-codex` synchronous command with timeout, JSON envelope, and event tracking (`tina-session/src/commands/exec_codex.rs`)
- `ConvexWriter::upsert_team_member()` for registering Codex actors in Convex (`tina-session/src/convex.rs`)

Phase 2 builds the skill layer and wires routing into the existing orchestration skills. This is entirely skill markdown files -- no Rust code changes required.

## Complexity Budget

- Max file lines: 400
- Max function lines: 50
- Max total new lines: ~800

## Relevant Files

- `skills/codex-cli/SKILL.md` (new)
- `skills/orchestrate/SKILL.md` (modify)
- `skills/team-lead-init/SKILL.md` (modify)
- `skills/executing-plans/SKILL.md` (modify)
- `tina-session/src/commands/config.rs` (read-only reference -- `cli-for-model` output)
- `tina-session/src/commands/exec_codex.rs` (read-only reference -- JSON envelope format)

## Tasks

### Task 1: Create codex-cli skill

**Model:** opus
**Depends on:** none

Create `skills/codex-cli/SKILL.md` -- the Claude adapter skill that wraps `tina-session exec-codex`.

This skill is invoked by a Claude teammate (not directly by the user). A Claude agent using this skill:

1. Receives task context (task body, relevant files, reviewer rubric) from its spawn prompt.
2. Builds a Codex prompt payload from the task context.
3. Calls `tina-session exec-codex` with the appropriate flags.
4. Parses the JSON envelope returned on stdout.
5. Converts the result into orchestration-compatible status: `pass`, `gaps`, or `error`.
6. Reports findings back through the normal Claude task flow (SendMessage to team lead).

**Skill structure:**

```markdown
---
name: codex-cli
description: Adapter skill for executing tasks via Codex CLI. Used by Claude teammates when a task routes to a Codex-family model.
---
```

**Key sections to include:**

- **STEP 1: Parse invocation** -- Extract feature, phase, task_id, prompt content, cwd, and optional model from the invocation prompt. The spawn prompt provides these as structured fields.
- **STEP 2: Build Codex prompt** -- Assemble the prompt payload from task context. If the task includes specific files or a rubric, format them into the prompt. Support `@file` syntax for large prompts (write prompt to temp file, pass `@path`).
- **STEP 3: Execute via tina-session** -- Run `tina-session exec-codex --feature <f> --phase <p> --task-id <t> --prompt <prompt-or-@file> --cwd <cwd> [--model <m>]`. Capture the JSON envelope from stdout.
- **STEP 4: Parse result** -- Parse the JSON envelope fields: `run_id`, `status`, `model`, `exit_code`, `duration_secs`, `stdout`, `stderr`. Map status to orchestration result:
  - `"completed"` + exit_code 0 -> `pass`
  - `"completed"` + exit_code non-zero -> `gaps` (extract issues from stderr/stdout)
  - `"failed"` -> `error`
  - `"timed_out"` -> `error` (with timeout context)
- **STEP 5: Report result** -- Send message to team lead with structured result using the same patterns as other teammates (e.g., `"review-N complete (pass)"` or `"review-N complete (gaps): <issues>"`).

**Error handling:**
- If `exec-codex` fails to launch (binary missing, codex disabled): report error immediately.
- If Codex returns non-zero but produced output: treat as `gaps` and include relevant output in the report.
- If timeout: report error with "codex timed out after N seconds".

**Forbidden actions:**
- Do not invoke Codex directly (always go through `tina-session exec-codex`).
- Do not modify orchestration state (only report results; team lead handles state transitions).
- Do not retry automatically (team lead decides retry policy).

### Task 2: Integrate routing into orchestrate skill

**Model:** opus
**Depends on:** 1

Update `skills/orchestrate/SKILL.md` to use `tina-session config cli-for-model` for routing decisions when spawning teammates.

**Changes to STEP 4 (Spawn first teammate) and Action Dispatch:**

In the Action Dispatch table, when spawning executor or reviewer teammates, add a routing check:

```bash
# Before spawning a teammate for a task with a model:
CLI=$(tina-session config cli-for-model --model "$MODEL")
if [ "$CLI" = "codex" ]; then
    # Spawn a Claude teammate that uses the codex-cli skill
    # instead of the normal agent type
fi
```

**Specific changes:**

1. **`spawn_executor` action handler**: Before spawning `tina:phase-executor`, check if the model routes to codex. If codex, spawn a `tina:codex-cli` teammate instead. The codex-cli teammate will wrap the execution through `tina-session exec-codex`.

2. **`spawn_reviewer` action handler**: Before spawning `tina:phase-reviewer`, check if the model routes to codex. If codex, spawn a `tina:codex-cli` teammate that runs the review through Codex. The result format (pass/gaps) is the same regardless of which CLI ran it.

3. **`spawn_planner` action handler**: Same routing check. If codex, spawn `tina:codex-cli` instead of `tina:phase-planner`.

4. **`spawn_validator` action handler**: Same routing check. If codex, spawn `tina:codex-cli` instead of `tina:design-validator`.

**Message format compatibility:**

The codex-cli skill produces the same message format as native Claude teammates:
- `"plan-phase-N complete. PLAN_PATH: X"`
- `"execute-N complete. Git range: X..Y"`
- `"review-N complete (pass)"` or `"review-N complete (gaps): issues"`

This means the orchestrator's event loop (STEP 5) needs no changes to message parsing.

**Where to add routing logic:**

Add a new section "### Routing Check" between the current "Action Dispatch" table and the "Handling Each Message" section. This section documents the routing pattern once, and the individual action handlers reference it.

The routing check pattern:
```bash
# Get model for this action (from .model field in CLI response, or from task metadata)
MODEL="${ACTION_MODEL:-}"
if [ -n "$MODEL" ]; then
    CLI=$(tina-session config cli-for-model --model "$MODEL")
else
    CLI="claude"  # default when no model specified
fi
```

Then in each spawn handler, replace the hardcoded agent type with a conditional:
```
if CLI == "codex":
    subagent_type = "tina:codex-cli"
    prompt includes: role (executor/reviewer/planner/validator), task context, model
else:
    subagent_type = original agent type (tina:phase-executor, etc.)
    prompt = original prompt
```

### Task 3: Integrate routing into team-lead-init skill

**Model:** opus
**Depends on:** 1

Update `skills/team-lead-init/SKILL.md` to support free-form model strings and route workers/reviewers through codex-cli when needed.

**Changes:**

1. **STEP 4 (Create tasks from plan):** Replace the `<haiku|opus>` assumption in the model metadata comment. Change:
   ```json
   "metadata": { "model": "<haiku|opus>", "task_number": N }
   ```
   To:
   ```json
   "metadata": { "model": "<model-string>", "task_number": N }
   ```
   Add a note that model can be any string (opus, haiku, codex, gpt-5.3-codex, etc.). The routing decision happens at spawn time, not at plan parse time.

2. **STEP 5.2 (Spawn workers for ready tasks):** After reading the model from task metadata, add a routing check before spawning:

   ```bash
   MODEL=$(TaskGet metadata.model)
   CLI=$(tina-session config cli-for-model --model "$MODEL")
   ```

   If `CLI == "codex"`:
   - Instead of spawning `tina:implementer`, spawn `tina:codex-cli` with the task context.
   - The codex-cli teammate will run the task through `tina-session exec-codex`.
   - The prompt must include: feature name, phase number, task ID, full task text, cwd (worktree path).

   If `CLI == "claude"`:
   - Spawn `tina:implementer` as before, passing model.

3. **STEP 5.4 (Review completed task):** Same routing check for reviewers. If the task's model routes to codex, spawn codex-cli for review instead of native reviewers.

4. **Model field note in "The model field accepts" line (currently line 483):** Replace `haiku` or `opus` with "any model string supported by `tina-session config cli-for-model`".

### Task 4: Integrate routing into executing-plans skill

**Model:** opus
**Depends on:** 1

Update `skills/executing-plans/SKILL.md` to add routing awareness for direct plan execution mode (non-team mode).

**Changes:**

1. **Per-task execution section:** When dispatching the implementer subagent, add a routing check:

   ```bash
   # Get model from task metadata (if plan specifies one)
   MODEL="${TASK_MODEL:-}"
   if [ -n "$MODEL" ]; then
       CLI=$(tina-session config cli-for-model --model "$MODEL")
   else
       CLI="claude"
   fi
   ```

   If `CLI == "codex"`: dispatch `tina:codex-cli` subagent instead of `tina:implementer`.
   If `CLI == "claude"`: dispatch `tina:implementer` as before.

2. **Reviewer dispatch:** Same routing check when dispatching spec-reviewer and code-quality-reviewer. If model routes to codex, use codex-cli.

3. **Team Mode Process section (STEP 5.2 equivalent):** The team mode worker spawn already respects model from metadata. Add the same routing check pattern: query `cli-for-model`, spawn `tina:codex-cli` if codex, otherwise spawn native agent.

4. **Agents section:** Add `tina:codex-cli` to the list:
   ```
   - `tina:codex-cli` - Adapter for executing tasks via Codex CLI (used when model routes to codex)
   ```
