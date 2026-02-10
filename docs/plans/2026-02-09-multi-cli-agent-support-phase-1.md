# Phase 1: Routing/Config Primitives, exec-codex Command, Team-Member Upsert

Implements design steps 1-3 from `docs/plans/2026-02-09-multi-cli-agent-support-design.md`.

## Summary

Add `AgentCli` routing enum, `cli_for_model()` function, codex/routing config sections, `tina-session config cli-for-model` CLI command, `tina-session exec-codex` synchronous command with timeout and JSON envelope, and `ConvexWriter::upsert_team_member()` method.

## Tasks

### Task 1: Add routing types and `cli_for_model()` function

**Model:** opus

Create `tina-session/src/routing.rs` with:

- `AgentCli` enum (`Claude`, `Codex`) with `Display` impl (lowercase output: `"claude"`, `"codex"`).
- `CliRouting` config struct: `codex_exact: Vec<String>`, `codex_prefixes: Vec<String>` (with serde defaults matching design: `codex_exact = ["codex"]`, `codex_prefixes = ["gpt-", "o1-", "o3-", "o4-"]`).
- `cli_for_model(model: &str, routing: &CliRouting) -> AgentCli` function implementing exact match then prefix match, defaulting to `Claude`.
- Register module in `tina-session/src/lib.rs`.

Tests (in same file `#[cfg(test)]` module):
- `cli_for_model` returns `Codex` for exact match `"codex"`.
- `cli_for_model` returns `Codex` for prefix match `"gpt-5.3-codex"`.
- `cli_for_model` returns `Claude` for `"opus"` and `"haiku"`.
- `cli_for_model` returns `Claude` for empty routing lists.
- `cli_for_model` with custom exact list (e.g., `["my-model"]`).
- `AgentCli::Claude` displays as `"claude"`, `AgentCli::Codex` displays as `"codex"`.

### Task 2: Add codex config section to `TinaConfig`

**Model:** opus

Extend `tina-session/src/config.rs`:

- Add `CodexConfig` struct: `enabled: bool`, `binary: String`, `default_model: String`, `default_sandbox: String`, `timeout_secs: u64`, `max_output_bytes: usize`. All fields have defaults from design (`enabled = true`, `binary = "codex"`, `default_model = "gpt-5.3-codex"`, `default_sandbox = "workspace-write"`, `timeout_secs = 1800`, `max_output_bytes = 200_000`).
- Add `CliRouting` to `ConfigFile` (reuse struct from `routing.rs` or a separate serde-only copy in config).
- Add `codex: Option<CodexConfig>` and `cli_routing: Option<CliRouting>` fields to `ConfigFile` deserializer.
- Expose resolved `codex: CodexConfig` and `cli_routing: CliRouting` on `TinaConfig` (with defaults when absent from TOML).
- Keep backward compatibility: existing config files without `[codex]` or `[cli_routing]` sections parse without error (defaults used).

Tests:
- Parse config TOML with `[codex]` section, verify all fields.
- Parse config TOML without `[codex]` section, verify defaults.
- Parse config TOML with partial `[codex]` section (some fields present, rest default).
- Parse config TOML with `[cli_routing]` section, verify `codex_exact` and `codex_prefixes`.
- Parse config TOML without `[cli_routing]` section, verify defaults.

### Task 3: Add `config cli-for-model` CLI command

**Model:** opus

- Add `CliForModel` variant to `ConfigCommands` enum in `tina-session/src/main.rs` with `--model <model>` required arg and `--env` optional arg.
- Add handler in `tina-session/src/commands/config.rs`: `pub fn cli_for_model(model: &str, env: Option<&str>) -> anyhow::Result<u8>`.
  - Load config for env.
  - Resolve `"codex"` alias to `config.codex.default_model`.
  - Reject empty model string.
  - If `codex.enabled == false` and routing says Codex, print error to stderr, return exit 1.
  - Call `cli_for_model()` from routing module.
  - Print result to stdout (`"claude"` or `"codex"`).
  - Return exit 0.
- Wire up in `main.rs` `run()` match arm.

Tests:
- Integration test (assert_cmd): `tina-session config cli-for-model --model opus` prints `"claude"`.
- Integration test: `tina-session config cli-for-model --model gpt-5.3-codex` prints `"codex"`.
- Unit test for alias resolution (`"codex"` -> default model -> routes to Codex).
- Unit test for empty model string returns error.

### Task 4: Implement `exec-codex` synchronous command

**Model:** opus

Create `tina-session/src/commands/exec_codex.rs`:

- Add `ExecCodex` variant to `Commands` enum in `main.rs` with args: `--feature`, `--phase`, `--task-id`, `--prompt` (string or `@file`), `--cwd`, `--model` (optional), `--sandbox` (optional), `--timeout-secs` (optional), `--output` (optional path).
- Command handler `pub fn run(...)`:
  1. Load config, resolve model (`--model` or `config.codex.default_model`), validate routing returns `Codex`.
  2. If `codex.enabled == false`, fail with clear error.
  3. Generate `run_id`: `codex_{YYYYMMDD}_{random8}`.
  4. Resolve prompt: if starts with `@`, read file content.
  5. Connect to Convex, get orchestration by feature, emit `codex_run_started` event.
  6. Spawn codex binary as subprocess: `config.codex.binary`, passing `--model`, `--sandbox` (or `--full-auto`), prompt via stdin pipe, working dir = `--cwd`.
  7. Enforce timeout (`--timeout-secs` or `config.codex.timeout_secs`): kill process group on timeout.
  8. Capture stdout/stderr, truncate to `config.codex.max_output_bytes`.
  9. Emit terminal event (`codex_run_completed`, `codex_run_failed`, `codex_run_timed_out`) with detail JSON including `runId`, `taskId`, `model`, `exitCode`, `stdoutBytes`, `stderrBytes`.
  10. Upsert team member record for Codex actor (deterministic name: `codex-{role}-{phase}-{taskHash8}`).
  11. Write `--output` file if specified.
  12. Print JSON envelope to stdout: `run_id`, `status`, `model`, `exit_code`, `duration_secs`, `stdout`, `stderr`, `output_path`.
- Register module in `tina-session/src/commands/mod.rs`.

Tests:
- Unit test: `run_id` generation produces correct format.
- Unit test: prompt resolution from `@file`.
- Unit test: stdout/stderr truncation at `max_output_bytes`.
- Unit test: deterministic agent naming `codex-{role}-{phase}-{hash}`.
- Integration test with a fake codex binary script:
  - Success case (exit 0, produces stdout).
  - Failure case (exit 1).
  - Timeout case (binary sleeps longer than timeout).

### Task 5: Add `ConvexWriter::upsert_team_member()` method

**Model:** opus

Extend `tina-session/src/convex.rs`:

- Add `UpsertTeamMemberArgs` struct: `orchestration_id: String`, `phase_number: String`, `agent_name: String`, `agent_type: Option<String>`, `model: Option<String>`, `joined_at: Option<String>`, `recorded_at: String`.
- Add `pub async fn upsert_team_member(&mut self, args: &UpsertTeamMemberArgs) -> anyhow::Result<String>` method to `ConvexWriter`.
  - Build args `BTreeMap`, call `self.client.mutation("teamMembers:upsertTeamMember", args)`, extract string result.
- This method is called from `exec-codex` command (Task 4) to register the Codex actor as a team member.

Tests:
- Unit test: `UpsertTeamMemberArgs` struct construction and field access.
- (Integration testing against real Convex deferred to e2e harness in Phase 3.)

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max total implementation lines | 800 |
| Max function length | 50 lines |

## File Changes Summary

| File | Action |
|------|--------|
| `tina-session/src/lib.rs` | Add `pub mod routing;` |
| `tina-session/src/routing.rs` | **New** - `AgentCli`, `CliRouting`, `cli_for_model()` |
| `tina-session/src/config.rs` | Add `CodexConfig`, `CliRouting` fields to config structs, parsing |
| `tina-session/src/main.rs` | Add `ExecCodex` command, `CliForModel` config subcommand |
| `tina-session/src/commands/mod.rs` | Add `pub mod exec_codex;` |
| `tina-session/src/commands/config.rs` | Add `cli_for_model()` handler |
| `tina-session/src/commands/exec_codex.rs` | **New** - `exec-codex` command implementation |
| `tina-session/src/convex.rs` | Add `UpsertTeamMemberArgs`, `upsert_team_member()` |

## Dependencies

No new crate dependencies required. Existing dependencies cover all needs:
- `clap` for CLI args
- `serde`/`serde_json`/`toml` for serialization
- `tokio` for async/process spawning
- `chrono` for timestamps
- `convex` for Convex mutations

## Risks and Mitigations

- **Codex binary interface**: The exact CLI flags for the Codex binary may differ from what we assume (`--model`, `--full-auto`, prompt via stdin). Mitigated by making the binary invocation configurable and testing with a fake binary script.
- **Process group killing on timeout**: `libc::killpg` is already available as a dependency. Need careful PGID handling to avoid killing parent.
- **Config backward compat**: Optional sections with serde defaults ensure existing configs parse cleanly.
