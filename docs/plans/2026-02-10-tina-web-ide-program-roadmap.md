# Tina Web -> Full IDE Program Roadmap (Self-Hosting First)

## Context

Current Tina web baseline already provides:
- Convex-backed monitoring for projects, orchestrations, phases, tasks, teams, commits, and plans
- Real-time read views and quicklook modals
- Existing control queue primitive (`inboundActions`) with daemon-side action dispatch

The target is still the full Tina IDE vision from `/Users/joshua/Projects/tina/docs/plans/2026-02-04-tina-ide-design.md`, but delivered through web-first increments.

## North Star

Tina is the single place to run the entire software loop:

Idea -> Story -> Design -> Ticket -> Orchestration -> Review -> Merge -> Follow-up

No mandatory context switch to raw files, ad-hoc scripts, or separate terminals for normal orchestration work.

## Prioritization Principle (Build Tina With Tina)

Prioritize features that increase Tina's ability to plan and improve itself:

1. Canonical work data in Convex (so agents and humans can operate on shared records)
2. Control plane actions from Tina UI (so execution is steerable mid-flight)
3. Mechanical review loop (so quality scales with agent throughput)
4. Deep operator surfaces (terminal/editor embedding) after control/review workflows are reliable

## Current Program Status (As of 2026-02-12)

- Project 1: complete
- Project 2: complete
- Project 3: not started (next)
- Project 4+: not started

## Program Breakdown (Large Projects)

## Project 1: Work Graph and Project Management Core

**Goal**
Move story/ticket/design management from repo markdown files into first-class Convex records, with full CRUD from both UI and agents.

**Includes**
- New entities: `stories`, `designs`, `tickets`, `ticketLinks`, `comments`
- Status workflows and ownership fields
- Agent-safe APIs for create/edit/close/reopen and linking artifacts
- Migration path from `docs/plans/*.md` into canonical design records
- UI surfaces: backlog board/list, story detail, design detail, ticket timeline

**Why first**
- Unlocks self-hosting: Tina can manage its own roadmap and work items.
- Becomes canonical source for downstream orchestration, feedback, and review linking.

**Exit criteria**
- A feature can be fully defined and managed in Tina without editing markdown files directly.
- Agents can reliably create/update/close tickets via tools against Convex.

## Project 2: Orchestration Launch and Control Plane v1

**Goal**
Start orchestrations from Tina and reconfigure them safely while running.

**Includes**
- "Start orchestration" flow from a selected design/ticket set
- Pre-configuration panel: model policy, review policy, enabled phases, gate policy
- Live reconfiguration controls: model changes, task insertion, task edits for unstarted tasks, pause/resume/retry
- Unified control-plane action log and audit trail
- Extend existing `inboundActions` types and daemon dispatch

**Design anchors**
- `/Users/joshua/Projects/tina/docs/plans/2026-02-08-orchestration-control-plane-design.md`
- `/Users/joshua/Projects/tina/docs/plans/2026-02-09-multi-cli-agent-support-design.md`

**Why second**
- Converts Tina from dashboard to operator cockpit.
- High leverage for self-hosting velocity: you can adapt orchestration without leaving Tina.

**Exit criteria**
- A user can launch, pause/resume, and reconfigure an orchestration entirely from Tina UI.
- Model routing changes (including Codex) apply to future pending work without manual file edits.

## Project 3: Feedback Fabric (Human + Agent)

**Goal**
Make feedback first-class, structured, attachable to running artifacts, and convertible into explicit follow-up execution.

**Includes**
- Artifact-linked feedback: freeform comments plus typed review artifacts (`comment`, `suggestion`, `ask_for_change`)
- Targets: ticket, design, plan, task, commit, code range, PR review item
- Follow-up generation workflow: blocking feedback creates remediation tasks in current phase
- Triage flow that decides informational vs blocking outcomes and escalates cross-phase/global issues
- Resolution loop linking feedback -> follow-up task -> completion status
- Activity stream + subscriptions for agents and humans

**Why third**
- Required before meaningful mechanical reviews and HITL gates.
- Enables consistent "give feedback while work runs" loop.
- De-risks Project 4 by establishing a reliable closure path for review findings before full review workbench/HITL expansion.

**Exit criteria**
- Feedback entered in Tina is visible in orchestration context and traceable to resolution.
- Blocking feedback can trigger explicit follow-up tasks with audit trace.
- Operators can see whether each blocking artifact is unresolved, in-progress, or resolved.

## Project 4: Mechanical Review Workbench (PR-Style + HITL)

**Goal**
Deliver a GitHub-PR-like review surface for both manual and agent-authored reviews.

**Includes**
- Diff and commit review UI with threaded comments and status markers
- Agent review ingestion and response tracking
- Review state machine: open, changes-requested, approved, superseded
- Configurable HITL gates at plan/review/finalize checkpoints
- Approval/rejection controls integrated with control plane

**Why fourth**
- High quality multiplier once feedback and control primitives exist.
- Reduces review bottleneck as orchestration throughput grows.

**Exit criteria**
- You can review an orchestration in Tina with clear unresolved/resolved issues.
- HITL gates can block progression until explicit approval.

## Project 5: Agent Console (Embedded Terminal to tmux Agents)

**Goal**
Interact with any running agent session directly from Tina web.

**Includes**
- Session directory (all live tmux-backed agents)
- Embedded terminal pane with attach/detach and reconnect behavior
- Per-agent quick actions (send message, checkpoint request, restart)
- Security and isolation guardrails for shell access

**Why fifth**
- Strong productivity boost, but not required to establish canonical PM/control/review loops.

**Exit criteria**
- Operators can connect to and interact with any running agent from Tina without external terminal windows.

## Project 6: Source Workspace (Code Browsing + Embedded Neovim)

**Goal**
Bring source-level participation into Tina after control/review workflows stabilize.

**Includes**
- File tree + code viewer + diff navigation
- Open-selection context sharing to agents
- Embedded Neovim surface (initially attach to remote nvim in tmux; full integration later)

**Why sixth**
- Valuable, but implementation risk and browser ergonomics are higher than earlier control-plane work.

**Exit criteria**
- You can inspect and edit source from Tina and tie edits directly to tickets/reviews.

## Project 7: Mobile Command Surface

**Goal**
Mobile experience focused on monitoring, triage, approvals, and short feedback loops.

**Includes**
- Responsive mobile layouts for orchestration/status/review queues
- Gate approvals, comments, task triage, and high-level control actions
- Notifications-oriented flow (not full coding surface)

**Why seventh**
- Important operationally, but should come after core control/review workflows are robust.

**Exit criteria**
- You can run oversight, approvals, and feedback from mobile without desktop access.

## Mapping of Requested Themes -> Projects

- Story/ticket/design project management -> Project 1
- Start orchestration from Tina -> Project 2
- Pre-configuration and live reconfiguration -> Project 2
- Feedback to running orchestration (freeform + edits + commit comments) -> Project 3
- Blocking feedback -> remediation follow-up tasks in active flow -> Project 3
- Mechanical review + PR-like UI + agent review response -> Project 4
- Embedded terminal to any agent -> Project 5
- Model controls across orchestration (including Codex) -> Project 2
- HITL for reviews -> Project 4
- Embedded neovim -> Project 6
- Mobile -> Project 7

## Remaining Execution Order (From Current State)

Project 1 and Project 2 are complete.

1. Project 3 (Feedback Fabric)
2. Project 4 (Mechanical Review Workbench + HITL)
3. Project 5 (Agent Console)
4. Project 6 (Source Workspace + Neovim)
5. Project 7 (Mobile Command Surface)

## Known Wall Risks

- Browser terminal + embedded Neovim complexity may become the first hard wall.
- Real-time diff/review at scale can stress query and indexing strategy.
- Mid-flight reconfiguration needs strict invariants to avoid orchestration divergence.

Mitigation: finish Projects 1-4 first so Tina remains valuable even if deep IDE embedding lands later.

## Next Planning Pass (Suggested)

For immediate execution planning, split Project 3 into detailed phases (feedback capture first, then triage/remediation wiring) with:
- schema changes
- API contracts
- UI routes/components
- daemon/session integration points
- agent/CLI integration points
- acceptance tests and rollout gating
