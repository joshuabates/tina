# Project 2 Design: Orchestration Launch and Control Plane v1

## Status

Validated via brainstorming session on 2026-02-11.

## Objective

Deliver Project 2's first usable operator slice: launch orchestrations from Tina web with explicit pre-configuration, durable policy snapshots, and reliable daemon bootstrap dispatch. This v1 focuses on launch correctness and traceability, while intentionally deferring broad live reconfiguration controls to follow-on slices.

## Decisions Locked

- First deliverable: `Launch + pre-configuration panel`
- Configuration depth: full controls plus presets (`Strict`, `Balanced`, `Fast`)
- Interaction model: full form first, with "apply preset" shortcuts
- Launch eligibility: design-only is allowed (tickets optional)
- Dependency assumption: Project 1 canonical work graph is complete
- Recommended build strategy: control-plane-first contracts and invariants, then richer controls

## Deliverable Scope (v1)

In scope:
- Start orchestration from a canonical Convex design record
- Pre-configuration form with:
  - Per-role model selection (`planner`, `executor`, `reviewer`)
  - Review policy
  - Enabled phases
  - Human gate checkpoints
- Preset shortcuts that write into the same full form fields
- Durable launch writes:
  - Orchestration record with immutable `policySnapshot`
  - Launch audit/event row
  - Single daemon bootstrap action in `inboundActions`
- Reason-coded launch failures with operator-visible feedback

Out of scope for this v1:
- Mid-flight task mutation (`task.edit`, `task.insert`, etc.)
- Runtime pause/resume/retry UI controls
- Full feedback artifact fabric (comments/suggestions/ask-for-change)
- Review workbench and HITL review gating UX beyond launch-time gate configuration

## UX and Interaction Model

The launch page centers on a single full configuration form. Preset chips are available near the top and act as field-populating shortcuts, not a separate mode:

- `Strict`: maximum reviews, broad gate coverage, conservative model defaults
- `Balanced`: default general-purpose profile
- `Fast`: reduced review/gates for lower-latency execution

Choosing a preset updates form values in place; users can further edit any field before launch. Tina persists both:

- `policySnapshot`: fully resolved effective configuration
- `presetOrigin`: preset label or `custom`

Launch button behavior:
- Enabled when `designId` is valid and canonical
- If no tickets are selected, show non-blocking warning and persist `designOnly: true`

## Architecture and Data Flow

v1 uses existing Convex + daemon architecture and adds a launch service boundary:

1. UI submits `LaunchOrchestrationRequest`.
2. Backend normalizes preset + manual edits into resolved policy.
3. Backend validates policy and model routing compatibility.
4. Transactionally writes orchestration + launch event.
5. Enqueues one bootstrap action in `inboundActions`.

Core components:
- `LaunchForm`: client-side form state, preset application, inline validation display
- `PolicyNormalizer`: canonical policy resolution (aliases, defaults, normalization)
- `LaunchService`: ordered durable writes and typed error mapping
- `DispatchAdapter`: daemon bootstrap enqueue after successful writes

## API Contract (v1)

### Request

```ts
type LaunchOrchestrationRequest = {
  projectId: string;
  designId: string;
  ticketIds?: string[];
  preset?: "strict" | "balanced" | "fast";
  requestedPolicy: {
    models: {
      planner: string;
      executor: string;
      reviewer: string;
    };
    reviewPolicy: "full" | "spec_only" | "none";
    phasesEnabled: number[];
    humanGates: Array<"plan" | "review" | "finalize">;
  };
};
```

### Response

```ts
type LaunchOrchestrationResponse = {
  orchestrationId: string;
  status: "queued";
  policySnapshotHash: string;
  designOnly: boolean;
};
```

### Persisted Launch Metadata

- `policySnapshot`: resolved immutable policy object
- `presetOrigin`: `strict|balanced|fast|custom`
- `designOnly`: boolean
- `policySnapshotHash`: reproducibility and telemetry key

## Safety Invariants

- No launch without a canonical existing design record.
- Server-side validation is authoritative; UI validation is advisory only.
- Launch writes must be transactional from orchestration row through event row.
- Bootstrap action enqueue only occurs after durable launch writes succeed.
- Every failed launch attempt emits typed audit context with `reasonCode`.
- Model routing checks must honor `cli-for-model` and kill-switch constraints.

## Error Model

Recoverable reason codes:
- `STALE_FORM_REVISION`
- `POLICY_VALIDATION_FAILED`
- `TEMPORARY_WRITE_FAILURE`

Terminal reason codes:
- `DESIGN_NOT_FOUND`
- `MODEL_ROUTING_DISABLED`
- `SCHEMA_CONTRACT_MISMATCH`

Error responses should include:
- `reasonCode`
- user-facing message
- optional field errors for form mapping

## Test Strategy

Unit tests:
- Preset application and override precedence
- Policy normalization and alias resolution
- Validation edge cases (empty phases, invalid gates/models)

Integration tests:
- Launch transaction ordering and rollback semantics
- Exactly-once bootstrap action enqueue after successful writes
- Event payload correctness (`orchestration.started` + hash + origin)

Contract tests:
- API request/response decode boundaries
- Daemon bootstrap action payload compatibility

UI tests:
- Full-form-first rendering
- Preset shortcut field mutation
- Design-only warning behavior
- Button enable/disable states

End-to-end test:
- Select canonical design
- Apply preset, customize one model
- Launch
- Verify stored `policySnapshot` matches resolved form and single queue action exists

## Delivery Plan

Track 1: API and schema
- Add launch contract, policy snapshot persistence, and metadata fields
- Implement validation and normalization boundary

Track 2: Tina-web launch UI
- Full form implementation
- Preset shortcut controls
- Typed error and warning surfaces

Track 3: Dispatch integration
- Transactional launch writes
- Bootstrap enqueue via `inboundActions`
- Audit/event consistency checks

Track 4: Hardening and observability
- Reason-coded failures
- Policy hash metrics
- Launch success/failure dashboards

## Exit Criteria

- Operator can launch orchestration from Tina using a canonical design only flow.
- Full pre-config controls are editable, with preset shortcuts available.
- `policySnapshot` is immutable and matches resolved effective launch config.
- One start event and one bootstrap action are recorded per successful launch.
- Failures are typed, visible, and do not create orphan daemon work.

## Follow-On (Project 2.2+)

After launch v1 exits, extend the same control-plane foundation to:
- Runtime pause/resume/retry actions
- Pending-task reconfiguration (`task.set_model`, `task.edit` unstarted only)
- Dynamic task insertion with dependency wiring and audit traceability
