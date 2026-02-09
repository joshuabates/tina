# TINA Orchestration Console Wireframe Handoff

## Purpose
This design set is a wireframe for an AI-agent-first IDE/control center focused on monitoring and interacting with TINA orchestrations.

Primary user:
- Operator/engineer supervising multiple orchestrations and phase teams.

Top jobs:
- Track orchestration progress and blockers.
- Review plans/code artifacts.
- Edit task details and provide feedback.
- Inspect git activity by phase.
- Open full terminal mode for agent interaction context.

## Scope Boundaries (Current)
In scope:
- Sidebar project navigation with active orchestrations and per-project `View all`.
- Phase/task workspace with phase rail + task list.
- Task quicklook modal for edits + feedback.
- Right rail with compact combined baseline/context + team status/task mapping.
- Phase review panel and git panel.
- Review workspace for code/design plan/phase plan.
- Full terminal screen mode.
- Orchestration settings modal.

Out of scope:
- Embedded neovim.
- Embedded terminal panes in workspace view.
- Dashboard landing page.
- Request queue handoff section.
- Task filter controls.
- Alert watch panel.
- Separate progress widget.

## Files To Edit
- `/Users/joshua/Projects/tina/designs/src/designSets/tina-orchestration-console/index.tsx`
- `/Users/joshua/Projects/tina/designs/src/designSets/tina-orchestration-console/data.ts`
- `/Users/joshua/Projects/tina/designs/src/designSets/tina-orchestration-console/meta.ts`

## Run
```bash
cd /Users/joshua/Projects/tina/designs
npm run dev
```

Build check:
```bash
npm run build
```

## IA And Screen Map
`Screen` states in `index.tsx`:
- `workspace`
- `project-history`
- `review`
- `terminal`

Navigation rules:
- Sidebar is primary navigation.
- Orchestration grouping is by project.
- Older runs are on per-project history page (`View all`), not global history.
- Orchestration switching is from sidebar/command palette concept, not a dedicated switcher widget.

## Current Layout Model
Workspace:
- Left: project/orchestration sidebar.
- Center: phase/task workspace (phase rail + task list).
- Right: compact combined baseline/context panel, phase review, git, terminal button.

Terminal mode:
- Full main content terminal view.
- Left nav remains.
- Terminal is currently read-oriented: no mode selector, no input textbox, no ask/send controls.

## Team Visibility Contract
In the combined baseline/context panel:
- `Orchestration team`: derived from all phase teams in the selected orchestration.
- `Current phase team`: from selected phase.
- Each member row must show:
  - derived status badge
  - associated tasks (task id + task status)

Member status derivation priority:
- `blocked` > `in_progress` > `todo` > `done` > `idle`

## Key Behavioral Contracts
- Task detail is not inline pane; it is `TaskQuicklookModal`.
- Orchestration config is not a right-rail widget; it is `OrchestrationConfigModal`.
- Phase review appears above git in right rail.
- Git panel is stacked sections: commits, diff summary, files.
- Review page is shared artifact model for human + agent review.

## Constraints For New Wireframe Variants
When creating additional options, preserve these unless explicitly changed:
- Project-first sidebar.
- Per-project history.
- Task quicklook modal pattern.
- Review workspace as PR-style artifact flow.
- Full-page terminal mode.
- Compact right-panel context that includes baseline and team/task status.

## Open Questions To Resolve In Future Iterations
- Final landing behavior beyond current-running-first.
- How older runs should be discoverable beyond per-project history.
- Final rubric shape for structured feedback.
- Which non-negotiable error/disconnected states need explicit UI treatment.
- How orchestration-level config and task-level overrides should coexist in detail.
