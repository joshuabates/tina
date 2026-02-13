# Tina Orchestration Query Cookbook

Use this when you need manual investigation beyond the snapshot script.

## 1) Resolve Scope

```bash
FEATURE="<feature-name>"
LIMIT=200
```

Resolve orchestration id:

```bash
npx convex run orchestrations:getByFeature "{\"featureName\":\"$FEATURE\"}"
```

Set:

```bash
ORCH_ID="<orchestration-id>"
```

## 2) Convex Control + Projection Queries

Orchestration shape:

```bash
npx convex run orchestrations:getOrchestrationDetail "{\"orchestrationId\":\"$ORCH_ID\"}"
```

Unified timeline (control actions + events):

```bash
npx convex run timeline:getUnifiedTimeline "{\"orchestrationId\":\"$ORCH_ID\",\"limit\":$LIMIT}"
```

Control action history:

```bash
npx convex run controlPlane:listControlActions "{\"orchestrationId\":\"$ORCH_ID\",\"limit\":$LIMIT}"
```

Events (all and shutdown-only):

```bash
npx convex run events:listEvents "{\"orchestrationId\":\"$ORCH_ID\",\"limit\":$LIMIT}"
npx convex run events:listEvents "{\"orchestrationId\":\"$ORCH_ID\",\"eventType\":\"agent_shutdown\",\"limit\":$LIMIT}"
```

Task/commit/plan projections:

```bash
npx convex run tasks:getCurrentTasks "{\"orchestrationId\":\"$ORCH_ID\"}"
npx convex run commits:listCommits "{\"orchestrationId\":\"$ORCH_ID\"}"
npx convex run plans:listPlans "{\"orchestrationId\":\"$ORCH_ID\"}"
```

## 3) Convex Telemetry Queries

Daemon telemetry events/spans:

```bash
npx convex run telemetry:listEvents "{\"orchestrationId\":\"$ORCH_ID\",\"source\":\"tina-daemon\",\"limit\":$LIMIT}"
npx convex run telemetry:listSpans "{\"orchestrationId\":\"$ORCH_ID\",\"source\":\"tina-daemon\",\"limit\":$LIMIT}"
```

High-signal telemetry filters to inspect:
- `projection.write` events for successful writes.
- `projection.skip` events for skipped syncs.
- Dispatch failures with `error_code` fields.

## 4) tina-session / tina-daemon Runtime Commands

Configuration and daemon state:

```bash
tina-session config show --env "${TINA_ENV:-prod}"
tina-session daemon status
```

Foreground daemon run with explicit binary path:

```bash
RUST_LOG=info cargo run --manifest-path tina-session/Cargo.toml -- daemon run \
  --env "${TINA_ENV:-prod}" \
  --daemon-bin "$PWD/tina-daemon/target/debug/tina-daemon"
```

Restart daemon with explicit binary:

```bash
cargo run --manifest-path tina-session/Cargo.toml -- daemon stop || true
cargo run --manifest-path tina-session/Cargo.toml -- daemon start \
  --env "${TINA_ENV:-prod}" \
  --daemon-bin "$PWD/tina-daemon/target/debug/tina-daemon"
```

## 5) tmux Inspection Commands

List sessions and panes:

```bash
tmux list-sessions
tmux list-panes -a -F "#{session_name}:#{window_index}.#{pane_index} #{pane_current_command}"
```

Capture output from a phase session:

```bash
tina-session capture --feature "$FEATURE" --phase "<phase>" --lines 200
```

Attach live:

```bash
tina-session attach --feature "$FEATURE" --phase "<phase>"
```

## 6) Local Log Locations

Team config:

```bash
cat "$HOME/.claude/teams/${FEATURE}-orchestration/config.json"
```

Lead debug log (from `leadSessionId` in team config):

```bash
cat "$HOME/.claude/debug/<leadSessionId>.txt"
```
