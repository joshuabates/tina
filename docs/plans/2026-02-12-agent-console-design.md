# Agent Console: Embedded Terminal to tmux Agents

Date: 2026-02-12
Status: Draft
Owner: tina-web / tina-daemon
Roadmap ref: Project 5 in `docs/plans/2026-02-10-tina-web-ide-program-roadmap.md`

## 1. Goal

Interact with any running agent session directly from tina-web. Connect to orchestration agents in their tmux panes, or start new ad-hoc agent sessions for brainstorming, task discussion, plan refinement, and freeform work — all without leaving the browser.

## 2. Success Metrics

- Operator can connect to any active orchestration agent's tmux pane from tina-web with full read-write terminal access.
- Operator can start an ad-hoc Claude or Codex CLI session from tina-web with optional context seeding.
- Terminal sessions survive browser navigation, tab close, and reconnect with full state preservation.
- Terminal input latency is indistinguishable from a native terminal emulator for typical interactive use.

## 3. Architecture

### 3.1 Component overview

```
tina-web (xterm.js)  <->  WebSocket  <->  tina-daemon  <->  tmux pane
                                               |
                                            Convex
                                        (session registry)
```

Three components participate:

1. **tina-daemon** — gains an HTTP/WebSocket server. Manages the WebSocket-to-PTY bridge for terminal relay, and handles ad-hoc session lifecycle (create, kill). Binds to `127.0.0.1` only.
2. **Convex** — gains a `terminalSessions` table for ad-hoc sessions. The existing `teamMembers` table gains a `tmuxPaneId` field for orchestration agent targeting.
3. **tina-web** — gains xterm.js integration, a Sessions section in the left nav, a fullscreen terminal view, and contextual launch points throughout the UI.

### 3.2 Data flow

**Connecting to an orchestration agent:**
1. tina-web reads `teamMembers` from Convex, which includes `tmuxPaneId` (e.g., `%302`).
2. User clicks "Connect" on an agent row.
3. tina-web opens WebSocket to `ws://127.0.0.1:{port}/ws/terminal/%302`.
4. Daemon validates pane exists, spawns PTY running `tmux attach -t %302`, bridges bytes.
5. xterm.js renders terminal output. User types. Bidirectional.

**Starting an ad-hoc session:**
1. User clicks "Discuss Task" on a task card (or "New Session" in nav).
2. tina-web calls `POST /sessions` on the daemon with label, CLI choice, and optional context.
3. Daemon creates tmux session, launches CLI, seeds context, writes to Convex `terminalSessions`.
4. Daemon returns `{ sessionName, tmuxPaneId }`.
5. tina-web opens WebSocket to the returned pane ID. Same terminal view.

## 4. Convex Schema Changes

### 4.1 New table: `terminalSessions`

Tracks ad-hoc sessions only. Orchestration agents are already tracked via `teams` + `teamMembers`.

```
terminalSessions:
  sessionName: string            // tmux session name, e.g. "tina-adhoc-{short-uuid}"
  tmuxPaneId: string             // e.g. "%412"
  label: string                  // user-facing name, e.g. "Discuss: Add auth middleware"
  cli: string                    // "claude" | "codex"
  status: "active" | "ended"
  contextType?: string           // "task" | "plan" | "commit" | "design" | "freeform"
  contextId?: string             // Convex ID of the linked artifact
  contextSummary?: string        // short description seeded into the prompt
  createdAt: number
  endedAt?: number
```

### 4.2 Schema addition: `teamMembers.tmuxPaneId`

Add optional `tmuxPaneId` (string) to the `teamMembers` table. Synced from the team config JSON by tina-daemon. This is the globally-unique tmux pane identifier (e.g., `%302`) that Claude Code writes to `~/.claude/teams/{team-name}/config.json` on each member.

### 4.3 New query: `listTerminalTargets`

Unified query powering the left nav Sessions list. Returns everything connectable:

- All active team members with a non-empty `tmuxPaneId` (join `teamMembers` + `teams`).
- All active ad-hoc sessions from `terminalSessions`.

Returns:
```
{ id, label, tmuxSessionName, tmuxPaneId, type: "agent" | "adhoc", cli, context? }
```

## 5. tina-daemon: WebSocket Terminal Relay

### 5.1 Endpoint

```
GET /ws/terminal/{tmuxPaneId}
-> Upgrade to WebSocket
-> Bidirectional byte stream
```

The pane ID (e.g., `%302`) is tmux's globally-unique pane identifier. No session name needed for targeting.

### 5.2 Connection lifecycle

1. Client connects with a pane ID.
2. Daemon validates the pane exists: `tmux display-message -t {paneId} -p ''`.
3. Daemon disables tmux mouse mode for the pane: `tmux set -p -t {paneId} mouse off`.
4. Daemon spawns a PTY running `tmux attach -t {paneId}`.
5. Bytes flow: xterm.js <-> WebSocket <-> PTY <-> tmux pane.
6. On WebSocket close: PTY process is killed (detaches from tmux). Tmux pane stays alive.
7. On tmux pane exit: daemon sends WebSocket close frame.

### 5.3 Resize handling

xterm.js sends resize events (cols x rows) as binary WebSocket frames. The daemon forwards these to the PTY via `TIOCSWINSZ` ioctl. Text frames carry terminal data; binary frames carry control messages.

### 5.4 Concurrency

Each WebSocket connection gets its own PTY + tokio task. Multiple connections can be open simultaneously (across browser tabs or reconnection races). No artificial connection limit.

### 5.5 Rust crates

- `tokio-tungstenite` for WebSocket.
- `portable-pty` (or raw `openpty`/`forkpty`) for PTY management.
- These run on the same `tokio` runtime and HTTP listener as the daemon's planned HTTP endpoints.

## 6. tina-daemon: Ad-hoc Session Management

### 6.1 Create session

```
POST /sessions
{
  label: string,
  cli: "claude" | "codex",
  contextType?: "task" | "plan" | "commit" | "design" | "freeform",
  contextId?: string,
  contextSummary?: string
}

-> 201 { sessionName, tmuxPaneId }
```

Flow:
1. Create tmux session: `tmux new-session -d -s tina-adhoc-{short-uuid}`.
2. Resolve CLI binary via `tina-session config cli-for-model` or routing logic.
3. Launch CLI in the pane (e.g., `claude --dangerously-skip-permissions`).
4. Wait for CLI readiness (poll pane output for prompt, same pattern as `tina-session start`).
5. If context provided, send opening message seeded from context (see Section 6.2).
6. Write to Convex `terminalSessions` table.
7. Return session name and pane ID.

### 6.2 Context seeding by type

Each context type produces a different opening prompt sent to the CLI after it's ready:

- **Task**: task subject, description, status, and blockers.
- **Plan**: plan markdown content or summary.
- **Design**: design document content.
- **Commit**: commit diff summary and message.
- **Freeform**: no seed — blank session.

The prompt is sent via `tmux send-keys` to the pane.

### 6.3 End session

```
DELETE /sessions/{sessionName}

-> 204
```

Flow:
1. Kill tmux session: `tmux kill-session -t {sessionName}`.
2. Mark Convex record as `status: "ended"`, set `endedAt`.

## 7. tina-web: Terminal UI

### 7.1 Left nav Sessions section

A new "Sessions" section in the sidebar, below the existing orchestration list. Subscribes to `listTerminalTargets`.

```
Sessions
  * worker-2 (phase 1)           <- orchestration agent
  * spec-reviewer-1 (phase 1)    <- orchestration agent
  o Discuss: Add auth             <- ad-hoc
```

Active agents show a colored dot. Clicking a session switches the main content area to the fullscreen terminal view. A "New Session" button opens a quick dialog for label + CLI choice + optional context.

### 7.2 Fullscreen terminal view

When a session is selected, the main content area is fully replaced by the terminal view. The left nav remains visible for session switching.

Components:
- **Header bar**: session label, agent type/model badge, CLI indicator, "End Session" button (ad-hoc only), "Disconnect" button (returns to dashboard).
- **Terminal canvas**: xterm.js filling all remaining height.

Lifecycle:
- On mount: open WebSocket to `/ws/terminal/{tmuxPaneId}`, attach via xterm.js attach addon.
- On unmount (navigate away): close WebSocket. Tmux pane stays alive.
- On revisit: new WebSocket. Tmux replays current pane state on attach — no lost context.

### 7.3 xterm.js configuration

- Renderer: `WebglAddon` (GPU-accelerated).
- Auto-resize: `FitAddon` tracks container size changes.
- Scrollback: 5000 lines (xterm.js buffer, in addition to tmux's own scrollback).
- Mouse mode: disabled on tmux side (see Section 5.2). xterm.js handles scrollback (mouse wheel), text selection (click-drag), and copy (Cmd+C / Ctrl+C outside of running process) natively in the browser.
- Theme: match tina-web dark mode palette.

### 7.4 Dependencies

```
xterm, @xterm/addon-attach, @xterm/addon-fit, @xterm/addon-webgl
```

## 8. Contextual Launch Points

Shortcut buttons placed throughout the existing UI. Each creates an ad-hoc session pre-seeded with context, then navigates to the terminal view. One click — no intermediate dialogs.

| Location | Action | Context seeded |
|----------|--------|----------------|
| Task card (TaskListPanel) | "Discuss" | Task subject, description, status |
| Plan view (QuickLook) | "Refine Plan" | Plan markdown content |
| Design view | "Discuss Design" | Design document content |
| Commit view | "Review Commit" | Commit diff and message |
| Team member row (TeamSection) | "Connect" | None (connects to existing pane, not ad-hoc) |
| Phase header | "Connect to Lead" | None (connects to lead's existing pane) |
| Nav Sessions section | "New Session" | Dialog for label, CLI choice, optional context |

"Connect" and "Connect to Lead" are different — they open the terminal view connected to an existing orchestration agent's tmux pane, not a new session.

## 9. Session Lifecycle

### 9.1 States

- **Active**: tmux pane exists, CLI process running. Full read-write terminal.
- **Exited**: tmux pane exists but CLI has exited (shell prompt or "Pane is dead"). Still connectable for viewing final output and scrollback.
- **Ended**: tmux pane killed. Not connectable. Removed from nav.

### 9.2 Reconnection

Navigating away closes the WebSocket but the tmux pane stays alive. Coming back opens a fresh WebSocket. tmux replays current pane content on attach — full screen state preserved. Closing the browser entirely is the same: on next visit, all active sessions appear in the nav, fully reconnectable.

### 9.3 Ending sessions

- **Ad-hoc**: "End Session" button in terminal header. Calls `DELETE /sessions/{name}`. Daemon kills tmux session, marks Convex record ended.
- **Orchestration agents**: no kill button. Lifecycle managed by the orchestration. When the team lead shuts an agent down, the daemon detects the pane exit on next sync and updates the Convex record.

### 9.4 Daemon crash recovery

On restart, the daemon reconciles state:
1. Query all tmux panes: `tmux list-panes -a -F "#{pane_id} #{pane_dead}"`.
2. Compare against Convex records (both `terminalSessions` and `teamMembers`).
3. Mark sessions whose panes no longer exist as ended.

## 10. Security & Isolation

**Local-only.** Daemon HTTP/WebSocket server binds to `127.0.0.1`. Terminal relay is localhost-to-localhost. Same trust model as running `tmux attach` in your terminal.

**No authentication for v1.** Single-user, local-only. No tokens or session cookies. If the daemon is ever exposed over a network (remote dev, cloud VM), token-based auth would be added at that point.

**No command filtering.** Read-write means full terminal access. Matches existing `tina-session attach` behavior — just accessible from the browser instead of a separate terminal.

**CORS.** Daemon sets CORS headers restricting WebSocket/HTTP origins to localhost (tina-web dev server and production build).

## 11. Implementation Phases

### Phase 1: Daemon WebSocket relay + Convex schema

- Add `tmuxPaneId` to `teamMembers` Convex schema and daemon sync.
- Add `terminalSessions` table to Convex schema.
- Add `listTerminalTargets` query.
- Add HTTP/WebSocket server to tina-daemon on the planned HTTP listener.
- Implement `/ws/terminal/{paneId}` endpoint with PTY bridge.
- Implement `POST /sessions` and `DELETE /sessions/{name}` for ad-hoc lifecycle.
- Implement daemon crash recovery reconciliation.

### Phase 2: tina-web terminal view

- Add xterm.js dependencies.
- Build `TerminalView` component (fullscreen, header bar, xterm.js canvas).
- Build WebSocket connection hook (`useTerminal`).
- Add Sessions section to left nav with `listTerminalTargets` subscription.
- Add "New Session" dialog.
- Wire nav session clicks to terminal view.

### Phase 3: Contextual launch points

- Add "Connect" button to team member rows and phase headers.
- Add "Discuss" button to task cards.
- Add "Refine Plan" button to plan views.
- Add "Discuss Design" button to design views.
- Add "Review Commit" button to commit views.
- Context seeding prompt templates for each type.

## 12. Risks

**Browser terminal fidelity.** xterm.js is mature and powers VS Code, but edge cases with TUI applications (curses, vim, tmux-in-tmux) may surface. Mitigation: tmux mouse off avoids the most common conflict; remaining issues are cosmetic.

**PTY management complexity.** Spawning and managing PTY processes in Rust is less ergonomic than Node.js. Mitigation: `portable-pty` crate handles cross-platform PTY creation; tokio handles async I/O.

**Stale sessions.** If the daemon crashes or the browser disconnects uncleanly, WebSocket connections leak. Mitigation: PTY processes are children of the daemon — they die with it. Daemon restart reconciliation cleans up Convex state.

**Codex interactive sessions.** Currently Codex agents run as one-shot turns, not persistent tmux panes. The terminal infra is CLI-agnostic — if Codex agents move to persistent tmux panes in the future, they become connectable with zero terminal-side changes. This is a separate orchestration model decision.

## Architectural Context

### Patterns to follow

- **Daemon event loop**: `tina-daemon/src/main.rs:158-358` — `tokio::select!` multiplexing watchers, Convex subscription, and signals. The HTTP/WebSocket server should be spawned as another task in this loop, same pattern as `heartbeat::spawn_heartbeat`.
- **Background task lifecycle**: `tina-daemon/src/heartbeat.rs:42-63` — `tokio::spawn` + `CancellationToken` + `JoinHandle`. Each WebSocket PTY bridge should follow this pattern.
- **Pane-ID tmux targeting**: `tina-monitor/src/tmux/capture.rs:35-49` — `pane_exists()` validates a pane via `tmux display-message -t {paneId}`. Reuse this exact pattern for WebSocket connection validation.
- **CLI readiness polling**: `tina-session/src/claude/ready.rs:1-53` — polls pane output for prompt characters. Reuse for ad-hoc session startup.
- **Convex table definition**: `convex/schema.ts:105-119` — `teamMembers` table pattern with `defineTable()`, validators, and composite indexes. Follow for `terminalSessions`.
- **Convex upsert mutation**: `convex/teamMembers.ts:1-37` — query by composite index, `patch` or `insert`. Follow for `terminalSessions` mutations.
- **Convex join query**: `convex/teams.ts:45-70` — `listActiveTeams` manually joins via `ctx.db.get()` and filters. Follow for `listTerminalTargets`.
- **Rust record + args serializer**: `tina-data/src/types.rs:55-65` (TeamMemberRecord) and `tina-data/src/convex_client.rs:144-169` (team_member_to_args). Follow for `TerminalSessionRecord`.
- **Daemon sync with cache**: `tina-daemon/src/sync.rs:131-246` — `sync_team_members` reads filesystem, builds records, uses `SyncCache` to skip unchanged. Extend to sync `tmuxPaneId`.
- **Sidebar rendering**: `tina-web/src/components/Sidebar.tsx:37-50` — multiple `useTypedQuery` calls, `SidebarNav` > `SidebarItem` hierarchy. Add Sessions section following same pattern.
- **Route structure**: `tina-web/src/App.tsx:1-21` — layout routes with `<Outlet />`. Add `/terminal/:paneId` route under AppShell.
- **Selection + URL sync**: `tina-web/src/services/selection-service.ts:1-106` — external store + `useSyncExternalStore` + URL params. Terminal view can use route params directly (no need to extend selection service).
- **Error boundaries**: `tina-web/src/components/DataErrorBoundary.tsx:1-142` — wrap `TerminalView` in `DataErrorBoundary` for connection failures.
- **Keyboard modal scope**: `tina-web/src/services/keyboard-service.ts:1-132` — `setModalScope()` blocks global keyboard dispatch. Use this when terminal is focused so keystrokes go to xterm.js, not the app.

### Code to reuse

- `tina-monitor/src/tmux/capture.rs` — `pane_exists()` and `capture_pane_content()` by pane ID. Extract or duplicate in daemon.
- `tina-session/src/tmux/session.rs` — `create_session()`, `kill_session()`, `session_exists()`, `list_sessions()` for ad-hoc lifecycle.
- `tina-session/src/tmux/send.rs` — `send_keys()` and `send_keys_raw()` for context seeding.
- `tina-session/src/claude/ready.rs` — `wait_for_ready()` for polling CLI startup.
- `tina-data/src/convex_client.rs` — `TinaConvexClient` methods and `extract_*` response parsers.
- `tina-web/src/hooks/useTypedQuery.ts` — typed Convex subscription hook.
- `tina-web/src/lib/query-state.ts` — `matchQueryResult`, `isAnyQueryLoading` helpers.
- `tina-web/src/components/ui/sidebar-item.tsx` — `SidebarItem` for session list entries.
- `tina-web/src/hooks/useFocusTrap.ts` — may be useful if terminal view needs focus management.

### Anti-patterns

- Don't add `axum` as a separate dependency if the mechanical review workbench design (`docs/plans/2026-02-12-mechanical-review-workbench-design.md`) also plans axum in tina-daemon. Coordinate: one shared HTTP server, one port, one axum Router with both sets of routes.
- Don't use synchronous `std::process::Command` for tmux calls from async context — use `tokio::task::spawn_blocking` as in `tina-daemon/src/actions.rs:88-159`.
- Don't extend the selection service for terminal state — use route params (`/terminal/:paneId`) instead. The selection service tracks orchestration/phase; terminal is a different navigation context.
- Don't capture keyboard events globally when terminal is focused — use `keyboardService.setModalScope("terminal")` to prevent the keyboard service from intercepting keystrokes meant for xterm.js.

### Integration

- **Entry (daemon)**: HTTP/WebSocket server spawned as task in `tina-daemon/src/main.rs` event loop, alongside heartbeat and watcher.
- **Entry (web)**: New route `/terminal/:paneId` in `tina-web/src/App.tsx` under the AppShell layout route.
- **Connects to**: `tina-daemon/src/sync.rs` (tmuxPaneId sync), `convex/schema.ts` (new table + field), `tina-web/src/components/Sidebar.tsx` (sessions section), `tina-web/src/components/TeamSection.tsx` (connect buttons).
- **Shared with**: Mechanical Review Workbench design — both add HTTP endpoints to tina-daemon. Must share the same axum server instance and port configuration.
