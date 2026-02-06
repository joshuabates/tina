# tina-web

Web dashboard for monitoring Tina orchestrations. Axum backend + React frontend.

## Quick Start

From the project root:

```sh
mise run dev            # starts both backend and frontend
mise run dev:backend    # backend only (http://localhost:3100)
mise run dev:frontend   # frontend only (http://localhost:5173)
```

Or without mise:

```sh
# Terminal 1: backend
cargo run --manifest-path tina-web/Cargo.toml

# Terminal 2: frontend (with hot reload)
cd tina-web/frontend && npm install && npm run dev
```

The frontend dev server proxies API requests to the backend automatically.

### Production build

```sh
mise run build:frontend
```

This outputs to `frontend/dist/`. When the backend starts, it detects that directory and serves the frontend directly — no separate dev server needed.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `TINA_DATA_DIR` | Override the base data directory (`~/.claude/`) | `~/.claude/` |
| `RUST_LOG` | Control log verbosity (e.g. `info`, `debug`) | none |

## API

All endpoints are under `/api`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check (`{"status":"ok"}`) |
| GET | `/api/orchestrations` | List all discovered orchestrations |
| GET | `/api/orchestrations/{id}` | Get a single orchestration |
| GET | `/api/orchestrations/{id}/tasks` | Tasks for an orchestration |
| GET | `/api/orchestrations/{id}/team` | Team members for an orchestration |
| GET | `/api/orchestrations/{id}/phases` | Phase progress and task summary |

## WebSocket

Connect to `ws://localhost:3100/ws` to receive live updates. On connect, the server sends the current state immediately. Subsequent updates are pushed whenever watched files change.

Message format:

```json
{
  "type": "orchestrations_updated",
  "data": [...]
}
```

## How It Works

The backend watches `~/.claude/teams/` and `~/.claude/tasks/` for file changes. When a change is detected, it reloads orchestration data from the discovery pipeline (teams -> tina-sessions -> worktrees -> supervisor-state.json) and pushes updates to all connected WebSocket clients.
