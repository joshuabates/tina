# Telemetry + Harness Debug Handoff (Git + Team Issues)

Date: 2026-02-11  
Owner: Tina orchestration team  
Status: Investigation handoff (no implementation in this doc)

## 1) What is actually true right now

1. The daemon currently writes Git commits to the `commits` table (`tina-daemon/src/sync.rs`, `sync_commits`), and emits telemetry events like `projection.write` with message `commit written`.
2. The right-panel Git UI is fed by `orchestrationEvents` filtered to `eventType` starting with `git_` (`tina-web/src/hooks/useOrchestrationEvents.ts`, `tina-web/src/services/data/events.ts`), not the `commits` table.
3. Team members are upserted only (`convex/teamMembers.ts`), not deleted. Removal is represented by an `agent_shutdown` event (`tina-daemon/src/sync.rs` -> `record_shutdown_event`) and UI status mapping (`tina-web/src/components/TeamSection.tsx`), not by removing rows from `teamMembers`.
4. If you still see high-frequency telemetry events with attrs containing `reason: "unchanged_cache"` and per-`task_id`, you are almost certainly running an older daemon build. Current source emits throttled batch skip events with `reason: "unchanged_cache_batch"` once per throttle window (`tina-daemon/src/sync.rs`).

## 2) Baseline debug workflow (telemetry-first)

1. Stop any background daemon:
```bash
cargo run --manifest-path tina-session/Cargo.toml -- daemon stop || true
```
2. Start daemon in foreground with explicit binary path (avoid stale binary selection):
```bash
RUST_LOG=info cargo run --manifest-path tina-session/Cargo.toml -- daemon run \
  --env dev \
  --daemon-bin /Users/joshua/Projects/tina/tina-daemon/target/debug/tina-daemon
```
3. In another terminal, run harness scenario (full + verify):
```bash
cargo run --manifest-path tina-harness/Cargo.toml -- run <scenario> --full --verify \
  --force-baseline \
  --scenarios-dir /Users/joshua/Projects/tina/tina-harness/scenarios \
  --test-project-dir /Users/joshua/Projects/tina/tina-harness/test-project \
  --work-dir /tmp/tina-harness
```
4. Capture orchestration ID from verify output (or query latest orchestration by feature prefix):
```bash
npx convex run orchestrations:listOrchestrations '{}'
```
5. Query projection state and telemetry side-by-side for the same orchestration ID.

## 3) Query cheat sheet

Set once:
```bash
ORCH_ID="<orchestration_id>"
```

Projection tables:
```bash
npx convex run orchestrations:getOrchestrationDetail "{\"orchestrationId\":\"$ORCH_ID\"}"
npx convex run commits:listCommits "{\"orchestrationId\":\"$ORCH_ID\"}"
npx convex run events:listEvents "{\"orchestrationId\":\"$ORCH_ID\",\"limit\":200}"
```

Telemetry tables:
```bash
npx convex run telemetry:listEvents "{\"orchestrationId\":\"$ORCH_ID\",\"source\":\"tina-daemon\",\"limit\":500}"
npx convex run telemetry:listSpans "{\"orchestrationId\":\"$ORCH_ID\",\"source\":\"tina-daemon\",\"limit\":200}"
```

High-signal filters (pipe through `jq` if desired):
1. `projection.write` + message `commit written`
2. `projection.skip` + attrs reason
3. `consistency.violation` from `tina-harness`

## 4) Git issue playbook (commits not visible in tina-web)

1. Verify commit projection exists:
```bash
cargo run --manifest-path tina-harness/Cargo.toml -- verify <feature> --min-commits 1
```
2. If verify passes but right-panel Git is empty, check `events:listEvents` output for `eventType` values beginning with `git_`.
3. If there are commits in `commits` but no `git_*` orchestration events, this is expected from current code paths:
   1. Data exists in `commits`.
   2. Right-panel Git section reads only `orchestrationEvents` `git_*`.
4. Current workaround: inspect commits from phase quicklook (`CommitListPanel`) or direct Convex query.

Interpretation rule:
1. `commits > 0` and `git_* events == 0` means UI data-source mismatch, not missing commit ingestion.

## 5) Team issue playbook (members not removed)

1. Verify team member rows and shutdown events together:
```bash
cargo run --manifest-path tina-harness/Cargo.toml -- verify <feature> \
  --min-team-members 1 \
  --min-shutdown-events 1
```
2. Inspect `teamMembers` from orchestration detail and `agent_shutdown` from events.
3. Expected current behavior:
   1. Team member rows remain in `teamMembers`.
   2. Removed members become `shutdown` in UI only if an `agent_shutdown` event is present.
4. If shutdown event is missing:
   1. Daemon likely missed the removal diff (for example restart/reset of in-memory cache).
   2. Reproduce with daemon running foreground the entire add/remove lifecycle.

Interpretation rule:
1. Member still listed with shutdown status is current design.
2. Member still listed as active/idle after removal plus no shutdown event indicates projection detection gap.

## 6) Telemetry flood triage

1. If logs show repeated `reason: "unchanged_cache"` per task every second, confirm daemon binary:
```bash
ls -l /Users/joshua/Projects/tina/tina-daemon/target/debug/tina-daemon
```
2. Force explicit daemon binary via `--daemon-bin` (do not rely on PATH sibling fallback).
3. Re-check telemetry attrs:
   1. New behavior: `reason: "unchanged_cache_batch"` with aggregate counts.
   2. Old behavior: per-task `reason: "unchanged_cache"` with `task_id`.

## 7) Harness gating recommendations (to stop regressions)

Add/strengthen scenario-level Convex assertions for orchestration reliability:
1. `min_commits >= 1`
2. `min_team_members >= 2` (or expected per scenario)
3. `min_shutdown_events >= 1` in scenarios with agent teardown
4. `min_phase_tasks >= 1` to ensure phase-level task projection is present

Keep these checks in `tina-harness` so regressions fail CI before UI smoke testing.

## 8) Known gaps to resolve in follow-up implementation

1. Align Git UI source with commit projection (either emit `git_*` orchestration events or switch right-panel Git section to `commits:listCommits`).
2. Decide desired semantics for removed team members:
   1. Historical roster with shutdown status (current).
   2. Active roster only (requires query/model change, likely add `leftAt` or active filter).
3. Upgrade telemetry timeline panel to use `telemetryEvents` instead of `orchestrationEvents` if the intent is true telemetry observability.
