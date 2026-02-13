# Tina Orchestration Triage Playbook

Follow this after collecting a snapshot bundle.

## 1) Launch Fails or Never Starts

Check:
- `controlPlane:listControlActions` for `start_orchestration` and `start_execution`.
- `timeline:getUnifiedTimeline` for failed completion entries and reason codes.
- `tina-session daemon status` and foreground daemon logs.

Likely boundaries:
- Control action validation error.
- Daemon dispatch failure (`cli_spawn_failed`, `cli_exit_non_zero`, payload errors).
- No online node or stale daemon binary.

Next check:
- Run daemon in foreground with explicit `--daemon-bin` and reproduce once.

## 2) Phase Stalls Mid-Execution

Check:
- `tasks:getCurrentTasks` for stuck `in_progress` or blocked tasks.
- `timeline:getUnifiedTimeline` ordering around the stall timestamp.
- `tina-session capture --feature <feature> --phase <phase> --lines 200`.
- `tmux list-panes` to verify worker sessions are alive.

Likely boundaries:
- Worker session dead/hung.
- Task revision/policy conflict in control actions.
- Missing phase transition event from daemon/session flow.

Next check:
- Compare tmux pane output against timeline timestamps to identify the last successful boundary crossing.

## 3) Team Status Looks Wrong

Check:
- `orchestrations:getOrchestrationDetail` (`teamMembers` field).
- `events:listEvents` filtered to `agent_shutdown`.
- Team config in `~/.claude/teams/<feature>-orchestration/config.json`.

Likely boundaries:
- Expected design behavior (historical members retained, shutdown represented by event).
- Missing shutdown projection event.
- Team config diff not observed due daemon restart/cache reset.

Next check:
- Reproduce member add/remove with daemon running in foreground continuously.

## 4) Commits or Plans Missing in UI

Check:
- `commits:listCommits` and `plans:listPlans`.
- `events:listEvents` for UI-facing event projections.
- Telemetry `projection.write` and `projection.skip`.

Likely boundaries:
- Projection write gap.
- UI data-source mismatch (data exists but wrong query path in UI component).

Next check:
- Confirm data presence directly in Convex first, then validate UI query wiring.

## 5) Control Action Failed with Generic Error

Check:
- `controlPlane:listControlActions` result payload.
- `timeline:getUnifiedTimeline` reason code.
- `telemetry:listEvents` around the same window.

Likely boundaries:
- Invalid payload/action type.
- Node dispatch command failure.
- Action queued but never claimed/completed.

Next check:
- Validate payload schema against `convex/controlPlane.ts` action validators before retrying.

## 6) Generic In-Process Agent Prompts Instead of Tina Agent Behavior

Check:
- Lead debug log for:
  - `handleSpawnInProcess ... found=false`
  - `SystemPrompt ... path=simple`
- `.claude/settings.local.json` for `teammateMode`.

Likely boundary:
- Spawn fallback to in-process generic prompts.

Next check:
- Set `teammateMode` to `tmux`, restart flow, and verify signatures disappear.
