# Project 2 Plan: Orchestration Launch and Control Plane (Post-Project-1)

## Status

Updated on 2026-02-12 after Project 1 completion.

## Context Update (What Changed Since Last Draft)

Project 1 is now complete, so Project 2 can assume:

- Canonical work graph exists in Convex (`projects`, `designs`, `tickets`, `workComments`).
- Launch input is canonical IDs, not markdown files (`designId` required, `ticketIds` optional).
- `tina-session init --design-id` path is available and should be the default orchestration bootstrap path.
- PM UI already exposes project-scoped design and ticket workflows; launch can now be integrated directly into that surface.

This removes migration/compatibility complexity and allows Project 2 to focus on control-plane correctness, action safety, and operator UX.

## Current Baseline (Code Reality)

- Orchestration persistence exists in `convex/orchestrations.ts` and `convex/schema.ts`.
- Operator control queue already exists as `inboundActions` with `actions.submitAction/claimAction/completeAction`.
- Daemon dispatch exists in `tina-daemon/src/actions.rs` for `approve_plan`, `reject_plan`, `pause`, `resume`, `retry`.
- `tina-session` already supports design-linked initialization via `init --design-id` in `tina-session/src/commands/init.rs`.
- Tina web currently has read surfaces for orchestrations but no full launch/control mutation UX.

## Target Outcomes for Project 2

1. Start orchestrations from Tina web against canonical designs/tickets.
2. Apply pre-launch policy (model routing, review policy, enabled phases, human gates) with a durable immutable snapshot.
3. Support safe runtime controls (`pause`, `resume`, `retry`) and then controlled reconfiguration for future/pending work.
4. Maintain a unified operator-grade audit trail for every control action and outcome.

## Phase 1: Control-Plane Contracts and Schema Foundation

### Goal

Establish the data contracts and schema needed for launch + runtime control actions with strict traceability and idempotency.

### Technical Work

Convex:

- Extend `orchestrations` in `convex/schema.ts` with launch metadata:
  - `policySnapshot` (stringified JSON)
  - `policySnapshotHash` (string)
  - `presetOrigin` (optional string)
  - `designOnly` (optional boolean)
  - `updatedAt` (string)
- Add `controlPlaneActions` table in `convex/schema.ts`:
  - `orchestrationId`, `actionType`, `payload`, `requestedBy`, `idempotencyKey`, `status`, `result`, `createdAt`, `completedAt`
  - indexes: `by_orchestration_created`, `by_status_created`, `by_idempotency`
- Extend `inboundActions` with optional linkage fields:
  - `controlActionId`
  - `idempotencyKey`

Contracts and shared generated types:

- Update `contracts/orchestration-core.contract.json` for any new orchestration fields that must be read across Convex/web/Rust.
- Regenerate shared artifacts with `scripts/generate-contracts.mjs`.

Control-plane backend entry points:

- Add `convex/controlPlane.ts`:
  - `startOrchestration`
  - `enqueueControlAction`
  - `listControlActions`
  - `getLatestPolicySnapshot`
- Keep `actions.ts` for queue primitives, but route UI-triggered control requests through `controlPlane.ts` so action log and queue writes are consistent.

Tests:

- Add `convex/controlPlane.test.ts` for:
  - idempotency behavior
  - action log + queue linkage
  - policy snapshot immutability
  - schema validation failures

### Exit Criteria

- Control actions are durable, idempotent, queryable, and linked to queue execution.
- Launch metadata is persisted on orchestration records.

## Phase 2: Launch From Tina Web (Design-First, Node-Explicit)

### Goal

Ship the actual start flow from web with full pre-configuration controls and preset shortcuts.

### Technical Work

Backend/API (`convex/controlPlane.ts`):

- Implement `startOrchestration` request validation:
  - `projectId` exists
  - `designId` exists and belongs to `projectId`
  - selected `ticketIds` belong to same project; warn-only if empty (`designOnly = true`)
  - target `nodeId` is online (required because `orchestrations.nodeId` is required)
- Resolve policy snapshot:
  - Apply preset template (`strict|balanced|fast`) then explicit field overrides
  - Validate model names using routing compatibility expectations
- Persist in order:
  1. `controlPlaneActions` row (`start_orchestration`)
  2. queue row in `inboundActions`
  3. launch event in `orchestrationEvents`

Daemon dispatch (`tina-daemon/src/actions.rs`):

- Add `start_orchestration` action type.
- Extend payload struct to include:
  - `project_id`, `design_id`, `ticket_ids`, `node_id`
  - `feature`, `branch`, `total_phases`
  - launch policy fields required by `tina-session init`
- Dispatch sequence:
  - `tina-session init --feature ... --cwd ... --design-id ... --branch ... --total-phases ...`
  - apply review-policy flags from snapshot to init args
  - mark queue action complete/fail with structured result

Session layer (`tina-session`):

- Add a helper mapping from launch policy snapshot -> `init` flags for review-policy fields.
- Keep design source canonical (`--design-id`) and stop introducing markdown-only launch paths in new code.

Web UI (`tina-web`):

- Add `NodeListQuery` (from `api.nodes.listNodes`) in `tina-web/src/services/data/queryDefs.ts`.
- Add orchestration launch route (under PM shell) with:
  - full editable form
  - preset shortcut buttons that mutate the same form state
  - node selector
  - non-blocking ticket warning state (`designOnly`)
- Trigger `startOrchestration` mutation and show request/result states.

Tests:

- Web tests for form behavior, preset mutation, node requirement, and design-only warning.
- Integration test for successful end-to-end launch request creating both action-log and queue rows.

### Exit Criteria

- A user can start an orchestration from Tina web using canonical design inputs and an explicit target node.
- Launch writes a durable policy snapshot and queues exactly one start action.

## Phase 3: Runtime Operator Controls (Pause/Resume/Retry)

### Goal

Expose existing runtime controls safely through a first-class control plane with end-to-end auditability.

### Technical Work

Backend:

- Implement `enqueueControlAction` action types:
  - `pause`
  - `resume`
  - `retry`
- Require payload validation per type (`feature` required, `phase` required for pause/retry).
- Log every request and completion/failure in `controlPlaneActions`.

Daemon:

- Keep current command mapping logic but move to typed control-plane payload validation.
- Fix CLI argument construction to match long-form `tina-session` orchestrate contract:
  - `orchestrate advance --feature ... --phase ... --event ...`
  - `orchestrate next --feature ...`
- Ensure queue completion messages include deterministic failure reason codes.

Web:

- Add control buttons in orchestration status surface (`StatusSection`) wired to `enqueueControlAction`.
- Add action-in-progress states and disabled guards to avoid duplicate clicks.

Tests:

- Unit tests for typed payload decoding and CLI arg generation.
- Integration tests for queue claim/complete flow with pause/resume/retry action types.
- UI tests for button states and optimistic feedback.

### Exit Criteria

- Pause/resume/retry works from web and is fully traceable from request -> queue -> daemon result.

## Phase 4: Policy Reconfiguration for Future Work

### Goal

Allow safe model/review policy changes that affect only future work.

### Technical Work

Control-plane API:

- Add action types:
  - `orchestration_set_policy`
  - `orchestration_set_role_model`
- Validate policy updates against routing and allowed enum values.
- Record `targetRevision` in payload for optimistic concurrency.

Session/state:

- Add `tina-session` control commands to patch `SupervisorState.model_policy` and `SupervisorState.review_policy` in `tina-session/src/state/schema.rs` persisted through existing `save()` flow.
- Reuse `tina-session config cli-for-model` semantics for model validity checks.
- Guarantee no retroactive mutation of already completed phases/tasks.

Web:

- Add orchestration config panel for editing active policy.
- Show "applies to future actions only" guard text and revision conflict errors.

Tests:

- State mutation tests for policy patch commands.
- Integration tests confirming updated model policy impacts subsequent `next_action` results but not completed work.

### Exit Criteria

- Operators can change model/review policy mid-flight with revision-safe behavior and no silent divergence.

## Phase 5: Pending Task Reconfiguration (Edit/Insert/Model Override)

### Goal

Support safe task-level reconfiguration for pending/unstarted work.

### Technical Work

Data model:

- Add canonical execution task table (e.g. `executionTasks`) in Convex to avoid editing ambiguous projections in `taskEvents`.
- Keep `taskEvents` append-only as history/projection.
- Include `revision`, `status`, `phaseNumber`, `model`, and dependency metadata for safe edits.

Control-plane actions:

- Add:
  - `task_edit`
  - `task_insert`
  - `task_set_model`
- Enforce invariants:
  - reject edits for `in_progress`/completed tasks
  - require revision match
  - insertion must declare dependency wiring

Daemon/session:

- Add typed dispatch handlers for new task action types.
- Add corresponding `tina-session` commands to mutate canonical task state and emit events.

Web:

- Add pending-task editor surface and insert-task workflow from orchestration view.
- Show plan diff: original queue vs inserted/edited queue.

Tests:

- Convex tests for revision conflict, invalid state edits, and dependency integrity.
- End-to-end test: insert remediation task before a pending task and confirm orchestrator consumes new order.

### Exit Criteria

- Operators can edit/insert pending tasks safely with revision checks and complete audit trace.

## Phase 6: Unified Action Timeline, Hardening, and Rollout

### Goal

Make control plane production-ready with observability, gating, and staged rollout.

### Technical Work

- Add read model/query that merges `controlPlaneActions`, `orchestrationEvents`, and action completion signals into one operator timeline.
- Introduce reason-code taxonomy for launch/control failures.
- Add dashboards/queries for:
  - launch success rate
  - median action latency (queued -> completed)
  - failure distribution by action type
- Gate rollout with config flag(s), enabling launch first, then runtime controls, then task reconfiguration.

Tests and validation:

- Regression suite across all existing orchestration flows.
- Harness scenarios for:
  - launch from design-only
  - pause/resume/retry
  - policy reconfiguration
  - pending task insert/edit

### Exit Criteria

- Control-plane features are measurable, observable, and can be rolled back safely by feature flag.

## Success Metrics

**Goal:** All 4 target outcomes demonstrable in harness test scenarios (launch from web, pause/resume/retry, policy reconfiguration, task edit/insert).

**Baseline command:**
```bash
mise run test:web     # Current web test coverage
npm test              # Current Convex function test coverage
```

**Progress command:** (run after each phase)
```bash
mise run test:web     # Web tests for new UI surfaces
npm test              # Convex function tests for control-plane APIs
```

**Target:**
- Phase 1: Schema + controlPlane.ts functions tested (≥90% coverage of new functions)
- Phase 2: E2E launch test from web UI → daemon → tina-session init
- Phase 3: E2E pause/resume/retry tests with action log verification
- Phase 4: Policy reconfiguration tests with immutability guarantees
- Phase 5: Task edit/insert tests with revision conflict detection
- Phase 6: Full harness scenario for launch-to-completion with all controls exercised

**ROI threshold:** Operator can launch, control, and reconfigure orchestrations entirely from web UI, with full audit trail. Manual CLI invocations for launch/control eliminated.

## Architectural Context

**Patterns to follow:**
- Convex mutation/query pattern: `convex/actions.ts:3-73` (submitAction, claimAction, completeAction with v.args validation)
- Daemon action dispatch: `tina-daemon/src/actions.rs:18-164` (dispatch_action flow: claim → execute → complete)
- CLI args builder: `tina-daemon/src/actions.rs:91-164` (build_cli_args switch with typed ActionPayload)
- Test pattern: `convex/orchestrations.test.ts:0-60` (convexTest + test_helpers for fixture setup)
- Web UI mutation pattern: `tina-web/src/components/pm/DesignDetailPage.tsx:121-177` (useMutation with loading states)
- Schema with indexes: `convex/schema.ts:112-124` (inboundActions table with by_node_status, by_orchestration indexes)
- Validation args: `convex/orchestrations.ts:15-30` (v.string(), v.id(), v.optional() for mutation args)
- Error handling: `tina-daemon/src/actions.rs:79-84` (anyhow::bail! with context)
- Node listing: `convex/nodes.ts:56-67` (listNodes query with heartbeat-based status)

**Code to reuse:**
- `convex/actions.ts:3-73` - Queue primitives (submitAction, claimAction, completeAction) for control-plane actions
- `tina-daemon/src/actions.rs:10-16` - ActionPayload struct for typed daemon dispatch
- `convex/test_helpers.ts:41-127` - createNode, createProject, createOrchestration test helpers
- `tina-session/src/state/schema.rs:248-412` - ModelPolicy (249-302) and ReviewPolicy (369-412) structs
- `tina-session/src/state/schema.rs:424-449` - SupervisorState with model_policy (445) and review_policy (448) fields
- `tina-session/src/commands/init.rs:29-99` - Existing --design-id path for canonical launch
- `tina-web/src/components/ui/status-badge.tsx` - StatusBadge component for control action status display
- `convex/nodes.ts:56-67` - listNodes query pattern for node selector data
- `contracts/orchestration-core.contract.json` - Contract format for shared Convex/Rust types
- `scripts/generate-contracts.mjs` - Contract generation script (run after schema changes)

**Integration:**
- Entry: New launch form in tina-web (under PM shell, next to design detail page)
- Backend flow: Web UI → `convex/controlPlane.ts:startOrchestration` → writes `controlPlaneActions` + `inboundActions` → daemon polls queue → `tina-daemon/src/actions.rs:dispatch_action` → `tina-session init --design-id`
- Existing tables: `inboundActions` queue + `orchestrations` record already support design-linked launches
- Node requirement: `orchestrations.nodeId` is required (not optional), so launch form must include node selector using `api.nodes.listNodes`
- Policy storage: SupervisorState already has `model_policy` and `review_policy` fields - serialize to JSON for Convex `policySnapshot`

**Anti-patterns:**
- Don't introduce markdown-only launch paths - designs must come from `designs` table (`projectId` + `designId` required)
- Don't skip idempotency keys in `controlPlaneActions` - every action must be idempotent (use `by_idempotency` index)
- Don't mutate `policySnapshot` after orchestration starts - snapshot is immutable, only future work can be reconfigured
- Don't write raw action queue rows from web - route through `controlPlane.ts` to ensure action-log + queue consistency
- Don't use `ctx.db.insert` without validating args - always use `v.string()`, `v.id()`, `v.optional()` in mutation args

**New patterns to establish:**
- Policy preset templates (strict/balanced/fast) - no existing preset system, define in TypeScript constants or Convex config
- `controlPlaneActions` table as durable action log linked to queue via `controlActionId` foreign key
- Revision-based optimistic concurrency for policy updates (targetRevision field in payload)
- Hash-based policy snapshot immutability (serialize policy → JSON → hash → store both in orchestration record)

## Risks and Mitigations

- Risk: command contract drift between daemon and `tina-session`.
  - Mitigation: typed payloads + CLI arg contract tests in daemon and session CI.
- Risk: queue/action-log divergence.
  - Mitigation: write action log and queue records in one backend transaction boundary.
- Risk: mid-flight edits causing orchestration divergence.
  - Mitigation: revision checks + strict immutable history + no in-progress task body edits.

## Final Acceptance Criteria for Project 2

- Launch, pause/resume/retry, policy changes, and pending-task reconfiguration are all operable from Tina web.
- Every control action is durably logged, attributable, and replay-auditable.
- Canonical PM entities from Project 1 are the only source of orchestration launch context.
