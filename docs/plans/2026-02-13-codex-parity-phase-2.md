# Codex Worker/Reviewer Functional Parity Phase 2 Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 4ad8a2f30fdfc3f9d20b9f500cbfa087dac0d2a4

**Goal:** Make the retry-once policy for invalid Codex results fully operational in team-lead decision paths. Phase 1 defined the v2 contract, dual-grammar recognition, and abstract retry policy (section 5.4b). This phase makes the retry protocol concrete: explicit state tracking, spawn-replacement mechanics, stricter instruction templates, and escalation flow.

**Architecture:** Skill definition changes (markdown files). No Rust or TypeScript code changes. The retry enforcement lives in team-lead's decision flow (interpreted by Claude), not in a programmatic state machine.

**Phase context:** Phase 1 updated agent definitions with v2 output headers, updated codex-cli to emit v2 deterministically, and added dual-grammar recognition + abstract retry policy to team-lead-init and executing-plans. This phase expands the abstract 5.4b retry section into a complete, operational retry protocol.

**Key patterns to follow:**
- Team-lead DAG scheduler: `skills/team-lead-init/SKILL.md:177-346` (Steps 5.1-5.7)
- Existing retry skeleton: `skills/team-lead-init/SKILL.md:294-311` (Step 5.4b)
- Executing-plans message handling: `skills/executing-plans/SKILL.md:411-426`
- Codex adapter flow: `skills/codex-cli/SKILL.md:163-258` (Step 5)
- Error handling: `skills/team-lead-init/SKILL.md:340-346`

**Anti-patterns:**
- Don't build a Rust parser for retry logic — this lives in skill prompts
- Don't add retry counters as code state — team-lead tracks retries as LLM reasoning state
- Don't make retry logic Codex-only — it applies to any agent producing invalid v2 results

---

## Tasks

### Task 1: Expand team-lead-init retry protocol with concrete decision flow and templates

**Files:**
- `skills/team-lead-init/SKILL.md`

**Model:** opus

**review:** full

**Depends on:** none

Expand the existing abstract section 5.4b ("Invalid result handling") into a complete, operational retry protocol with explicit tracking, decision flow, spawn mechanics, and stricter instruction templates.

**Step 1:** Read the current section 5.4b and surrounding context (Steps 5.3, 5.4, error handling section) to confirm starting state.

Run: `grep -n "5\.4b\|retry_tracker\|stricter instructions\|Invalid result" skills/team-lead-init/SKILL.md`
Expected: Lines showing the current abstract 5.4b section (around lines 294-311) with no retry_tracker references yet.

**Step 2:** Replace the existing section 5.4b ("Invalid result handling", lines 294-311) with a comprehensive retry protocol. The new section should be:

```markdown
### 5.4b Retry protocol for invalid results

**Scope:** This protocol handles results that fail v2 acceptance matrix validation or are completely uninterpretable. It does NOT apply to valid results with `status=gaps` (those follow the normal remediation loop where reviewer sends issues to worker).

**Retry tracker:** Team-lead maintains a mental retry counter per agent spawn:

```
retry_tracker:
  worker-1: { attempts: 0, max: 1 }
  spec-reviewer-1: { attempts: 0, max: 1 }
  code-quality-reviewer-1: { attempts: 0, max: 1 }
```

Each agent gets at most 1 retry (2 total attempts). The counter resets when a new agent is spawned for a different task.

**Decision flow:**

```
Invalid result received from agent-N
  │
  ├── attempts < max?
  │     │
  │     YES → Shut down agent-N
  │     │     Increment attempts
  │     │     Spawn replacement agent-N with stricter prompt
  │     │     Wait for replacement result
  │     │
  │     NO → Escalate (see escalation below)
  │
  └── Result is valid but status=gaps/error?
        │
        └── Normal remediation flow (NOT a retry)
```

**Step 1 — Detect invalid result:**

A result is "invalid" when:
1. v2 headers are present but fail acceptance matrix validation (missing required fields)
2. Message cannot be interpreted at all (no v2 headers AND no recognizable legacy verdict)
3. `task_id` in v2 headers doesn't match the expected task

A result is NOT invalid when:
- Legacy freeform message with a clear pass/fail verdict (valid legacy)
- v2 message with `status: gaps` or `status: error` and all required fields present (valid gaps/error)

**Step 2 — Retry with stricter instructions:**

Shut down the failed agent:
```json
SendMessage({ type: "shutdown_request", recipient: "agent-N", content: "Invalid result, retrying" })
```

Spawn a replacement with the same name and an augmented prompt. Prepend this retry preamble to the original prompt:

**For workers (invalid result retry):**
```
RETRY CONTEXT: Your previous run produced an invalid result that could not be processed.
The team-lead could not extract a valid verdict from your output.

You MUST include v2 structured headers as the FIRST lines of your completion message:

role: worker
task_id: <your-task-id>
status: pass|gaps|error
git_range: <base>..<head>  (required when status=pass)
issues: <description>  (required when status=gaps or error)

Then include a blank line followed by your freeform explanation.

IMPORTANT: Do NOT skip the headers. Do NOT embed them inside prose. They must be the very first lines of your message.

---
<original task prompt follows>
```

**For reviewers (invalid result retry):**
```
RETRY CONTEXT: Your previous review produced an invalid result that could not be processed.
The team-lead could not extract a valid verdict from your output.

You MUST include v2 structured headers as the FIRST lines of your completion message:

role: <spec-reviewer|code-quality-reviewer>
task_id: <your-task-id>
status: pass|gaps|error
issues: <description>  (required when status=gaps or error)

Then include a blank line followed by your freeform review body.

IMPORTANT: Do NOT skip the headers. Do NOT embed them inside prose. They must be the very first lines of your message.

---
<original review prompt follows>
```

**Codex agents (via codex-cli):** When retrying a Codex agent, the retry preamble is added to the `prompt_content` field in the codex-cli spawn prompt. The codex-cli adapter will include it in the Codex prompt, and the adapter itself always emits v2 headers deterministically. If the adapter still fails (e.g., Codex returns empty output that the adapter can't normalize), the retry preamble won't help — escalate after the second attempt.

**Step 3 — Escalation after exhausting retries:**

After 2 failed attempts (original + 1 retry):

For workers:
1. Shut down the failed worker-N
2. Mark the task as blocked: `TaskUpdate({ taskId: "<task-N-id>", status: "pending", description: "BLOCKED: worker produced invalid results after retry" })`
3. Log: "worker-N exhausted retries for task N — marking task blocked"
4. Continue with other tasks (blocked task's dependents stay blocked)

For reviewers:
1. Shut down the failed reviewer
2. Spawn a replacement reviewer with a fresh prompt (no retry preamble — this is a fresh start, not a retry)
3. If the fresh reviewer also produces an invalid result, mark the task as blocked
4. Log: "reviewer-N exhausted retries for task N — spawning fresh replacement" or "— marking task blocked"

**Interaction with existing error handling:**

This retry protocol is separate from the existing worker/reviewer error handling (section "Error handling per task"):
- **Invalid result retry** (this section): Result arrives but can't be parsed → retry once with stricter instructions
- **Worker failure retry** (existing): Worker crashes, times out, or reports `status: error` → shut down, retry with fresh worker
- **Review loop cap** (existing): Reviewer rejects 3x → escalate

A single task can trigger both: an invalid result retry, then after the retried agent produces a valid `status: error`, the existing worker failure retry logic takes over. The retry counters are independent.
```

**Step 3:** Update the "Error handling per task" section (around lines 340-346) to reference the retry protocol. Replace the current section with:

```markdown
### Error handling per task

Current retry/escalation logic applies per-task:
- Worker produces invalid result → retry once with stricter instructions (section 5.4b)
- Worker fails (crash/timeout/error status) → shut down, retry with fresh `worker-N` (one retry)
- Reviewer produces invalid result → retry once with stricter instructions (section 5.4b)
- Reviewer rejects 3x → escalate, set status=blocked
- A blocked task does NOT block unrelated tasks — only its dependents stay blocked
- Invalid-result retry and failure retry are independent counters
```

**Step 4:** Verify the changes integrate properly.

Run: `grep -c "retry_tracker\|retry preamble\|RETRY CONTEXT\|stricter instructions\|escalat" skills/team-lead-init/SKILL.md`
Expected: Multiple occurrences (at least 8) showing the retry protocol is documented throughout.

---

### Task 2: Update executing-plans retry enforcement to match team-lead-init

**Files:**
- `skills/executing-plans/SKILL.md`

**Model:** opus

**review:** spec-only

**Depends on:** 1

Update the executing-plans skill's "Invalid result handling" and "Message Handling" sections with the same concrete retry protocol defined in Task 1.

**Step 1:** Read the current message handling and invalid result handling sections.

Run: `grep -n "Invalid result\|retry\|Message Handling" skills/executing-plans/SKILL.md`
Expected: Lines showing current abstract retry references (around lines 411-426).

**Step 2:** Replace the "Invalid result handling" paragraph in the Message Handling section (line 425-426) with a concrete retry subsection:

```markdown
### Invalid Result Retry Protocol

When a v2 message fails acceptance matrix validation or a message cannot be interpreted at all:

**Retry tracking:** Track retry attempts per agent (max 1 retry = 2 total attempts per agent).

**Retry flow:**
1. Shut down the agent that produced the invalid result
2. Spawn a replacement with the same name and an augmented prompt containing a retry preamble:

**Worker retry preamble:**
```
RETRY CONTEXT: Your previous run produced an invalid result that could not be processed.
You MUST include v2 structured headers as the FIRST lines of your completion message:
role: worker
task_id: <your-task-id>
status: pass|gaps|error
git_range: <base>..<head>  (required when status=pass)
issues: <description>  (required when status=gaps or error)
Then a blank line, then your freeform explanation.
```

**Reviewer retry preamble:**
```
RETRY CONTEXT: Your previous review produced an invalid result that could not be processed.
You MUST include v2 structured headers as the FIRST lines of your completion message:
role: <spec-reviewer|code-quality-reviewer>
task_id: <your-task-id>
status: pass|gaps|error
issues: <description>  (required when status=gaps or error)
Then a blank line, then your freeform review body.
```

3. If the replacement also produces an invalid result: mark the task as blocked and continue with other tasks.

**Does NOT apply to:** Valid results with `status=gaps` (normal remediation loop) or `status=error` (existing error handling).
```

**Step 3:** Update the "Infinite Loop Prevention" section (lines 429-435) to reference the retry protocol:

After the existing text "If unresolvable: Mark task blocked, continue with other tasks", add:

```markdown
**Invalid result loops:** If an agent produces an unparseable result, this is handled by the Invalid Result Retry Protocol (above), not the review loop counter. The two mechanisms are independent.
```

**Step 4:** Verify the changes.

Run: `grep -c "retry preamble\|RETRY CONTEXT\|Invalid Result Retry\|retry tracking" skills/executing-plans/SKILL.md`
Expected: Multiple occurrences (at least 4) showing the retry protocol is documented.

---

### Task 3: Add retry-awareness to codex-cli adapter skill

**Files:**
- `skills/codex-cli/SKILL.md`

**Model:** opus

**review:** spec-only

**Depends on:** none

Add a section to the codex-cli skill explaining how the adapter behaves when spawned as a retry (with stricter instructions prepended to prompt_content) and how the adapter's deterministic v2 emission interacts with the retry protocol.

**Step 1:** Read the current STEP 2 (Build Codex prompt) and Error Handling Summary sections.

Run: `grep -n "STEP 2\|Error Handling Summary\|retry\|stricter" skills/codex-cli/SKILL.md`
Expected: Lines showing current sections, with no explicit retry-awareness yet.

**Step 2:** Add a new section after "Failure Class Reference" (after line 273) and before "Error Handling Summary" (line 275):

```markdown
## Retry-Aware Behavior

When team-lead retries a Codex agent due to an invalid result, the retry preamble is included in the `prompt_content` field of the spawn prompt. The adapter handles this transparently:

1. **Prompt assembly:** The retry preamble becomes part of the prompt sent to Codex via `exec-codex`. No special handling is needed — the adapter assembles the full prompt from `prompt_content` as usual.

2. **v2 emission unchanged:** The adapter always emits v2 headers deterministically (STEP 5). The retry preamble targets the Codex model's behavior, not the adapter's normalization.

3. **When retry doesn't help:** If the underlying Codex failure is infrastructure-level (timeout, crash, empty output), the retry preamble won't change the outcome. The adapter normalizes the same failure class deterministically. Team-lead will see the same error category on both attempts and should escalate after the second failure.

4. **Detection hint:** If the `prompt_content` starts with `RETRY CONTEXT:`, this is a retry attempt. The adapter should log this fact in the freeform body of the v2 report: "Note: This was a retry attempt after a previous invalid result."
```

**Step 3:** Update the Red Flags section to mention retry awareness. Add to the "Always" list:

```markdown
- Note retry context in freeform body when prompt_content starts with "RETRY CONTEXT:"
```

**Step 4:** Verify the changes.

Run: `grep -c "retry\|RETRY CONTEXT\|retry preamble\|Retry-Aware" skills/codex-cli/SKILL.md`
Expected: Multiple occurrences (at least 5) showing retry awareness is documented.

---

## Phase Estimates

| Task | Estimated effort | Risk |
|------|-----------------|------|
| Task 1: Team-lead-init retry protocol | 15-20 min | Medium — largest change, must integrate with existing DAG scheduler flow |
| Task 2: Executing-plans retry enforcement | 10-15 min | Low — mirrors patterns from Task 1 |
| Task 3: Codex-cli retry awareness | 5-10 min | Low — small additive section |

**Total estimated:** 30-45 min
**Critical path:** Task 2 depends on Task 1 for consistency. Task 3 is independent.

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 300 |

Note: All changes are markdown (skill definitions), so function length is not directly applicable. The 300-line budget covers total new/modified lines across all skill files.

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
