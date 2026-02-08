# Orchestration Control Plane Design

## Problem

Tina's orchestration flow is powerful but brittle: tasks are the primary source of truth, and the pipeline assumes a fixed validate → plan → execute → review loop. This makes it hard to:

- Change models or reviewers after tasks are created
- Skip phases or reviews for small work
- Edit unstarted task descriptions safely
- Add mid-flight tasks when new work emerges
- Attach structured comments/suggestions/ask-for-change to a task, commit, or code block
- Let agents trigger new work or escalate without manual rewiring

## Goals

- Make orchestration configurable at runtime by humans and agents.
- Make “what to do” (canonical tasks/designs/plans) separate from “how to execute” (Claude Code tasks).
- Allow dynamic edits: model changes, task edits, task insertions, review policy changes, and messaging.
- Provide structured review artifacts (comments/suggestions/ask-for-change) with traceability.
- Support human feedback gates at configurable points in the orchestration.
- Keep execution safe and resumable; avoid silent divergence.

## Non-Goals

- Replace current orchestration state machine in this phase.
- Change the Task tool or Claude Code task file format.

## Core Idea: Tina Entities as Canonical

Tina becomes the canonical store for all designs, plans, and tasks. Claude Code tasks become **execution handles** that reference Tina entities.

- Tina entity: the canonical “thing” (design, plan, task, review, comment).
- CC task: minimal wrapper with a title + `tina_ref` metadata.
- Executors resolve `tina_ref` to fetch the canonical task before running.

This makes editing and orchestration control safe and centralized while keeping compatibility with Claude Code’s Task system.

## Data Model

### Tina Entity

All entities share a common envelope and type-specific payload.

```
TinaEntity {
  id: string,
  type: "design" | "plan" | "task" | "review" | "comment" | "suggestion" | "ask_for_change",
  title: string,
  body: string,
  status: "draft" | "active" | "blocked" | "completed" | "superseded",
  created_at: string,
  updated_at: string,
  revision: number,
  links: [
    { rel: "parent" | "child" | "phase" | "depends_on" | "related", id: string }
  ],
  metadata: object
}
```

### Execution Handle (Claude Code Task)

CC task metadata stores a reference to the Tina entity:

```
metadata: {
  tina_ref: {
    id: "task_123",
    type: "task"
  },
  model: "haiku" | "opus",
  review_policy: "full" | "spec_only" | "none"
}
```

The executor validates the ref and resolves the entity before running.

## Execution Flow

1. Orchestrator creates canonical Tina tasks (entities) in Convex.
2. Orchestrator creates CC tasks as handles pointing at those entities.
3. Executor starts a CC task, resolves `tina_ref`, and pulls the canonical task body.
4. Executor always uses the current canonical task body from Convex.

## Control Plane Actions

These actions are applied to Tina entities and mirrored into CC tasks if needed.

- `task.edit` — update title/body/metadata for an unstarted task
- `task.set_model` — change model to haiku/opus for unstarted or pending work
- `task.assign` — reassign pending task to a different agent type
- `task.insert` — add a task and wire dependencies
- `task.skip` — mark step skipped with rationale
- `review.comment` / `review.suggest` / `review.ask_for_change`
- `orchestration.set_policy` — update review requirements or model preferences
- `orchestration.pause/resume/retry`
- `message.send` — send to orchestrator/team-lead/agent
- `gate.request` / `gate.approve` / `gate.reject` — human feedback gates

Each action appends to an event log and increments `revision` on affected entities.

## Orchestration Policy

A per-orchestration policy object drives dynamic decisions without rewiring the state machine.

```
policy: {
  models: { planner: "opus", executor: "haiku", reviewer: "opus" },
  review_policy: "full" | "spec_only" | "none",
  phases_enabled: [1, 2, 3],
  allow_dynamic_tasks: true,
  human_gates: ["plan", "review", "finalize"]
}
```

Policy can be changed during execution; the orchestrator applies it to future steps.

## Review Artifacts

Structured review artifacts become Tina entities linked to tasks or commits.

- `comment` — informational note
- `suggestion` — recommended change
- `ask_for_change` — blocking issue

Each has:

```
metadata: { target: "task" | "plan" | "commit" | "code_range" | "pr", ref: "...", severity: "info" | "warn" | "block" }
```

## Storage (Convex Primary)

- All Tina entities, policies, and review artifacts live in Convex.
- Executors and UIs read canonical task content directly from Convex using `tina_ref`.
- No offline cache or local JSON store is required.

This keeps the canonical store centralized and consistent across devices.

## Feedback Triage Teammate (Per Phase Team)

Each phase team includes a dedicated triage teammate responsible for feedback on the **current phase only**. This teammate:

- Monitors review artifacts and human comments for the current phase.
- Decides whether feedback is informational or requires follow-up work.
- Creates follow-up tasks (Tina entities) and CC task handles **within the current phase**.
- Updates phase task dependencies to insert new work before phase completion.

If feedback affects future phases or global policy, the triage teammate escalates to the orchestrator via `message.send` or `orchestration.set_policy`.

This avoids editing in-progress tasks while keeping feedback responsive and phase-scoped.

## Feedback Flow (Tasks, Code, Commits, Plans, PRs)

1. Reviewer (agent or human) submits a `comment`, `suggestion`, or `ask_for_change` artifact targeting:
   - Task (`task:<id>`)
   - Plan (`plan:<id>`)
   - Commit (`commit:<sha>`)
   - Code range (`file:path#Lx-Ly`)
   - PR (`pr:<url or id>`)
2. Artifact is stored in Convex and linked to the target entity.
3. Phase triage teammate evaluates severity:
   - **Info/warn:** attach to task context and notify the implementer.
   - **Block (ask_for_change):** create a follow-up task entity and wire it into the current phase.
4. If feedback impacts future phases or global policy, triage escalates to orchestrator:
   - Orchestrator may insert a remediation phase or adjust policy before proceeding.
5. The follow-up task runs with the same execution flow (plan → execute → review if required).

This provides a consistent mechanism for feedback across tasks, code, commits, PRs, and plans.

## Human Feedback Gates

Some orchestrations must pause for explicit human input (e.g., after planning, before execution, or after review). This is controlled by `policy.human_gates`.

Mechanism:

1. When a gate is reached, orchestrator creates a `gate.request` entity and marks the orchestration as waiting.
2. UI presents the gate with context (plan, review results, diffs).
3. Human responds with `gate.approve` or `gate.reject`.
4. On approve: orchestration proceeds.
5. On reject: triage teammate creates follow-up tasks or changes policy, then orchestrator resumes after the remediation is complete.

Gates are explicit, logged, and allow configurable human oversight without ad‑hoc intervention.

## Consistency & Safety

- Each entity update increments `revision`.
- CC tasks store only the `tina_ref` and always fetch the current canonical task.
- Orchestrator never edits “in_progress” task bodies; instead it creates a follow-up task linked to the original.

## Integration Points

- `tina-session`: add CLI for entity CRUD + control plane actions.
- `tina-data`: provide Convex entity APIs + event log APIs.
- `team-lead-init`: resolve `tina_ref` before spawning workers.
- `orchestrate`: write canonical tasks and task handles with `tina_ref` metadata.
- `tina-web/tina-monitor`: read canonical entities for display and editing.

## Phases

### Phase 1: Convex Entity Store + CLI

- Create Convex schema for Tina entities, policies, and review artifacts.
- Add `tina-session entity create/get/update/list` backed by Convex.
- Add `tina-session task set-model/edit/skip` (updates entity + events).
- Executors resolve `tina_ref` for task content.

### Phase 2: Orchestrator Integration

- Orchestrator creates Tina tasks first, then CC task handles.
- Add policy object to supervisor state and load it when dispatching.
- Add human feedback gates where configured.

### Phase 3: Review Artifacts

- Add comment/suggestion/ask-for-change entities.
- Add CLI for reviewers to submit artifacts.
- Surface artifacts in tina-monitor.

### Phase 4: UI Controls

- UI to edit task content/model, add comments, and insert tasks.
- UI to change review policy and phase enablement.

## Open Questions

- Formalize a “feedback triage” teammate role to convert reviews into follow-up tasks.
