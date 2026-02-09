# TINA Orchestration Console Decisions

Updated: 2026-02-09

## Locked Decisions

1. Interaction reference
- Decision: Use Linear-style interaction model as primary reference.
- Why: Strong fit for sidebar-first workflow and triage-oriented navigation.

2. Primary structure
- Decision: Hybrid IDE/control-center with project sidebar and orchestration workspaces.
- Why: Needs both operational monitoring and deep task/phase interaction.

3. Grouping and navigation
- Decision: Group orchestrations by project only.
- Why: Keeps navigation predictable.

4. History model
- Decision: Older runs via per-project history page (`View all`), not global history.
- Why: Aligns with project ownership.

5. Phase/task ergonomics
- Decision: Phase rail + tasks list in main area, with current phase selected by default.
- Why: Prioritizes active work and reduces context switching.

6. Task detail model
- Decision: Use quicklook modal for task detail/edit/feedback.
- Why: Avoids overloading main pane with detail content.

7. Git visibility
- Decision: Include commits, diff summary, and files changed (stacked).
- Why: Needed for phase-level execution awareness.

8. Review model
- Decision: Dedicated review page with PR-style workflow shared by humans and review agents.
- Why: Reviews are artifacts and must be first-class.

9. Config model
- Decision: Orchestration settings are a modal, not a persistent widget.
- Why: Reduces right-rail clutter and supports runtime edits cleanly.

10. Terminal model
- Decision: Full main-content terminal screen with left nav still visible.
- Why: Agent chat/terminal needs primary focus.

11. Terminal controls
- Decision: No mode switch, no input textbox, no ask/send controls in this wireframe.
- Why: Keep terminal interaction model minimal at this stage.

12. Right-rail ordering
- Decision: `Baseline + context` panel, then `Phase review`, then `Git`.
- Why: Puts decision/coordination context before implementation detail.

13. Combined context panel
- Decision: Merge baseline focus and orchestration context into one compact panel.
- Why: Avoid duplicate summary blocks.

14. Team visibility
- Decision: Show both orchestration team and current phase team with member status + associated tasks.
- Why: Team state must be inspectable without leaving workspace.

15. Removed sections
- Decision: No request queue handoff section, no task filters, no alert watch, no separate progress widget.
- Why: Reduce noise and keep wireframe focused on core orchestration flow.

## Active Assumptions
- Main default orchestration is selected from currently executing runs.
- Baseline remains a focusable reference inside the combined context panel.
- Review policy and model selectors are represented but not wired to backend actions.

## Open Decisions
1. Final long-term landing page (if/when dashboard returns).
2. Final feedback rubric fields and requiredness.
3. Terminal interaction semantics once input is reintroduced.
4. Exact ownership/escalation model when human and agent review disagree.
5. Future visualization for older orchestration discoverability beyond per-project view.

## Guardrails For New Agents
- Do not reintroduce removed sections unless explicitly requested.
- Do not move task detail from modal back into the main pane.
- Keep phase review above git.
- Keep config in modal form.
- Preserve dedicated review page and artifact vocabulary.
