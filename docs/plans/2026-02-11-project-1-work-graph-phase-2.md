# Phase 2: `tina-session work` CLI

## Goal

Add a `work` subcommand family to `tina-session` that wraps all PM Convex functions (designs, tickets, comments) behind a CLI interface with stable `--json` output. At the end of this phase, an agent or human can create, read, update, and transition designs and tickets, add and list comments, and resolve a design's content — all through `tina-session work ...` commands without direct Convex access.

## Deliverables

1. `tina-session work` subcommand group in `main.rs` with routing to command handlers
2. `tina-data` PM client methods — Rust wrappers for calling the Convex PM functions (`designs:*`, `tickets:*`, `workComments:*`)
3. `tina-session` work command handlers with `--json` output mode
4. `tina-session::convex` PM wrapper methods on `ConvexWriter`
5. Integration tests for CLI workflows using `assert_cmd`

## Sequencing

Steps are ordered so each builds on the previous and can be verified independently.

---

### Step 1: Add PM Convex client methods to `tina-data`

**Edit `tina-data/src/convex_client.rs`** to add methods for the PM Convex functions. The Convex functions are public mutations/queries in `designs.ts` and `tickets.ts`, and internal mutations/queries in `workComments.ts`.

**Note on workComments**: The `addComment` and `listComments` functions are `internalMutation`/`internalQuery`. The Convex Rust SDK cannot call internal functions directly. These must be changed to public `mutation`/`query` in `convex/workComments.ts` before the CLI can call them.

New methods on `TinaConvexClient`:

```rust
// --- Designs ---

pub async fn create_design(
    &mut self,
    project_id: &str,
    title: &str,
    markdown: &str,
) -> Result<String>
// Calls designs:createDesign, returns design ID

pub async fn get_design(&mut self, design_id: &str) -> Result<Option<DesignRecord>>
// Calls designs:getDesign, returns design record or None

pub async fn get_design_by_key(&mut self, design_key: &str) -> Result<Option<DesignRecord>>
// Calls designs:getDesignByKey, returns design record or None

pub async fn list_designs(
    &mut self,
    project_id: &str,
    status: Option<&str>,
) -> Result<Vec<DesignRecord>>
// Calls designs:listDesigns, returns list of designs

pub async fn update_design(
    &mut self,
    design_id: &str,
    title: Option<&str>,
    markdown: Option<&str>,
) -> Result<String>
// Calls designs:updateDesign, returns design ID

pub async fn transition_design(
    &mut self,
    design_id: &str,
    new_status: &str,
) -> Result<String>
// Calls designs:transitionDesign, returns design ID

// --- Tickets ---

pub async fn create_ticket(
    &mut self,
    project_id: &str,
    title: &str,
    description: &str,
    priority: &str,
    design_id: Option<&str>,
    assignee: Option<&str>,
    estimate: Option<&str>,
) -> Result<String>
// Calls tickets:createTicket, returns ticket ID

pub async fn get_ticket(&mut self, ticket_id: &str) -> Result<Option<TicketRecord>>
// Calls tickets:getTicket, returns ticket record or None

pub async fn get_ticket_by_key(&mut self, ticket_key: &str) -> Result<Option<TicketRecord>>
// Calls tickets:getTicketByKey, returns ticket record or None

pub async fn list_tickets(
    &mut self,
    project_id: &str,
    status: Option<&str>,
    design_id: Option<&str>,
    assignee: Option<&str>,
) -> Result<Vec<TicketRecord>>
// Calls tickets:listTickets, returns list of tickets

pub async fn update_ticket(
    &mut self,
    ticket_id: &str,
    title: Option<&str>,
    description: Option<&str>,
    priority: Option<&str>,
    design_id: Option<&str>,
    assignee: Option<&str>,
    estimate: Option<&str>,
) -> Result<String>
// Calls tickets:updateTicket, returns ticket ID

pub async fn transition_ticket(
    &mut self,
    ticket_id: &str,
    new_status: &str,
) -> Result<String>
// Calls tickets:transitionTicket, returns ticket ID

// --- Comments ---

pub async fn add_comment(
    &mut self,
    project_id: &str,
    target_type: &str,
    target_id: &str,
    author_type: &str,
    author_name: &str,
    body: &str,
) -> Result<String>
// Calls workComments:addComment, returns comment ID

pub async fn list_comments(
    &mut self,
    target_type: &str,
    target_id: &str,
) -> Result<Vec<CommentRecord>>
// Calls workComments:listComments, returns list of comments
```

**New types in `tina-data/src/types.rs`:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignRecord {
    pub id: String,
    pub project_id: String,
    pub design_key: String,
    pub title: String,
    pub markdown: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketRecord {
    pub id: String,
    pub project_id: String,
    pub design_id: Option<String>,
    pub ticket_key: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub assignee: Option<String>,
    pub estimate: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentRecord {
    pub id: String,
    pub project_id: String,
    pub target_type: String,
    pub target_id: String,
    pub author_type: String,
    pub author_name: String,
    pub body: String,
    pub created_at: String,
    pub edited_at: Option<String>,
}
```

Add arg-building helper functions following the existing pattern (e.g. `design_create_to_args`, `ticket_create_to_args`, etc.) and extraction helpers (`extract_design_from_obj`, `extract_ticket_from_obj`, `extract_comment_from_obj`).

**Verification:** `cargo test -p tina-data` passes. Add unit tests for new arg-building functions following the existing pattern.

---

### Step 2: Change `workComments.ts` from internal to public functions

**Edit `convex/workComments.ts`:**
- Change `internalMutation` to `mutation` for `addComment`
- Change `internalQuery` to `query` for `listComments`
- Update imports accordingly

**Verification:** `npm test -- convex/workComments.test.ts` passes. The test file should be updated if it uses `internal` helpers for calling these functions.

---

### Step 3: Add `ConvexWriter` PM methods

**Edit `tina-session/src/convex.rs`** to add PM methods on `ConvexWriter`, wrapping the new `TinaConvexClient` methods. Follow the existing pattern (thin delegation).

```rust
// --- Designs ---
pub async fn create_design(&mut self, project_id: &str, title: &str, markdown: &str) -> anyhow::Result<String>
pub async fn get_design(&mut self, design_id: &str) -> anyhow::Result<Option<DesignRecord>>
pub async fn get_design_by_key(&mut self, design_key: &str) -> anyhow::Result<Option<DesignRecord>>
pub async fn list_designs(&mut self, project_id: &str, status: Option<&str>) -> anyhow::Result<Vec<DesignRecord>>
pub async fn update_design(&mut self, design_id: &str, title: Option<&str>, markdown: Option<&str>) -> anyhow::Result<String>
pub async fn transition_design(&mut self, design_id: &str, new_status: &str) -> anyhow::Result<String>

// --- Tickets ---
pub async fn create_ticket(&mut self, ...) -> anyhow::Result<String>
pub async fn get_ticket(&mut self, ticket_id: &str) -> anyhow::Result<Option<TicketRecord>>
pub async fn get_ticket_by_key(&mut self, ticket_key: &str) -> anyhow::Result<Option<TicketRecord>>
pub async fn list_tickets(&mut self, ...) -> anyhow::Result<Vec<TicketRecord>>
pub async fn update_ticket(&mut self, ...) -> anyhow::Result<String>
pub async fn transition_ticket(&mut self, ticket_id: &str, new_status: &str) -> anyhow::Result<String>

// --- Comments ---
pub async fn add_comment(&mut self, ...) -> anyhow::Result<String>
pub async fn list_comments(&mut self, target_type: &str, target_id: &str) -> anyhow::Result<Vec<CommentRecord>>
```

Also re-export the new record types from `convex.rs` for command handlers to use:
```rust
pub use tina_data::{DesignRecord, TicketRecord, CommentRecord};
```

**Verification:** `cargo check -p tina-session` compiles.

---

### Step 4: Add `Work` subcommand group to CLI

**Edit `tina-session/src/main.rs`:**

Add `Work` variant to `Commands` enum and `WorkCommands` subcommand enum. Add `DesignCommands`, `TicketCommands`, and `CommentCommands` as nested subcommands.

```rust
Commands::Work {
    #[command(subcommand)]
    command: WorkCommands,
},

enum WorkCommands {
    Design {
        #[command(subcommand)]
        command: DesignCommands,
    },
    Ticket {
        #[command(subcommand)]
        command: TicketCommands,
    },
    Comment {
        #[command(subcommand)]
        command: CommentCommands,
    },
}

enum DesignCommands {
    Create {
        #[arg(long)] project_id: String,
        #[arg(long)] title: String,
        #[arg(long)] markdown: Option<String>,
        #[arg(long)] markdown_file: Option<PathBuf>,
        #[arg(long)] json: bool,
    },
    Get {
        #[arg(long)] id: Option<String>,
        #[arg(long)] key: Option<String>,
        #[arg(long)] json: bool,
    },
    List {
        #[arg(long)] project_id: String,
        #[arg(long)] status: Option<String>,
        #[arg(long)] json: bool,
    },
    Update {
        #[arg(long)] id: String,
        #[arg(long)] title: Option<String>,
        #[arg(long)] markdown: Option<String>,
        #[arg(long)] markdown_file: Option<PathBuf>,
        #[arg(long)] json: bool,
    },
    Transition {
        #[arg(long)] id: String,
        #[arg(long)] status: String,
        #[arg(long)] json: bool,
    },
    Resolve {
        #[arg(long)] design_id: String,
        #[arg(long)] json: bool,
    },
}

enum TicketCommands {
    Create {
        #[arg(long)] project_id: String,
        #[arg(long)] title: String,
        #[arg(long)] description: String,
        #[arg(long, default_value = "medium")] priority: String,
        #[arg(long)] design_id: Option<String>,
        #[arg(long)] assignee: Option<String>,
        #[arg(long)] estimate: Option<String>,
        #[arg(long)] json: bool,
    },
    Get {
        #[arg(long)] id: Option<String>,
        #[arg(long)] key: Option<String>,
        #[arg(long)] json: bool,
    },
    List {
        #[arg(long)] project_id: String,
        #[arg(long)] status: Option<String>,
        #[arg(long)] design_id: Option<String>,
        #[arg(long)] assignee: Option<String>,
        #[arg(long)] json: bool,
    },
    Update {
        #[arg(long)] id: String,
        #[arg(long)] title: Option<String>,
        #[arg(long)] description: Option<String>,
        #[arg(long)] priority: Option<String>,
        #[arg(long)] design_id: Option<String>,
        #[arg(long)] assignee: Option<String>,
        #[arg(long)] estimate: Option<String>,
        #[arg(long)] json: bool,
    },
    Transition {
        #[arg(long)] id: String,
        #[arg(long)] status: String,
        #[arg(long)] json: bool,
    },
}

enum CommentCommands {
    Add {
        #[arg(long)] project_id: String,
        #[arg(long)] target_type: String,  // "design" | "ticket"
        #[arg(long)] target_id: String,
        #[arg(long)] author_type: String,  // "human" | "agent"
        #[arg(long)] author_name: String,
        #[arg(long)] body: String,
        #[arg(long)] json: bool,
    },
    List {
        #[arg(long)] target_type: String,
        #[arg(long)] target_id: String,
        #[arg(long)] json: bool,
    },
}
```

The `design resolve` command fetches a design by ID and outputs its markdown content (or full record in JSON mode). This is the read-path for the orchestration planner to pull latest design content.

The `--markdown-file` flag on `design create` and `design update` reads markdown from a file path instead of inline. Mutually exclusive with `--markdown`.

**Verification:** `cargo check -p tina-session` compiles.

---

### Step 5: Implement work command handlers

**Create `tina-session/src/commands/work.rs`:**

Add `pub mod work;` to `tina-session/src/commands/mod.rs`.

Implement handler functions for each subcommand. All handlers follow this pattern:

```rust
pub fn design_create(
    project_id: &str,
    title: &str,
    markdown: &str,
    json: bool,
) -> anyhow::Result<u8> {
    let design_id = convex::run_convex(|mut writer| async move {
        writer.create_design(project_id, title, markdown).await
    })?;

    if json {
        println!("{}", serde_json::json!({
            "ok": true,
            "designId": design_id,
        }));
    } else {
        println!("Created design: {}", design_id);
    }
    Ok(0)
}
```

**JSON output contract** (all commands output a JSON object when `--json` is passed):

Success envelope:
```json
{ "ok": true, ...fields }
```

Error envelope (printed to stderr, non-zero exit):
```json
{ "ok": false, "error": "message" }
```

Specific field contracts per command:

| Command | JSON fields |
|---------|-------------|
| `design create` | `designId` |
| `design get` | full design record fields (`id`, `designKey`, `title`, `markdown`, `status`, `createdAt`, `updatedAt`, `archivedAt`) |
| `design list` | `designs` (array of design records) |
| `design update` | `designId` |
| `design transition` | `designId` |
| `design resolve` | `designId`, `designKey`, `title`, `markdown`, `status` |
| `ticket create` | `ticketId` |
| `ticket get` | full ticket record fields |
| `ticket list` | `tickets` (array of ticket records) |
| `ticket update` | `ticketId` |
| `ticket transition` | `ticketId` |
| `comment add` | `commentId` |
| `comment list` | `comments` (array of comment records) |

For `design get` and `ticket get`, require exactly one of `--id` or `--key` (error if both or neither provided).

For `design create`/`design update` with `--markdown-file`, read the file content into the markdown string before calling Convex.

The `design resolve` command is a convenience alias: fetch design by ID, output just the fields needed for orchestration (`designId`, `designKey`, `title`, `markdown`, `status`).

**Verification:** `cargo check -p tina-session` compiles.

---

### Step 6: Wire up main.rs routing

**Edit `tina-session/src/main.rs`** to route `Commands::Work` to the handler functions in `commands::work`.

Example routing:
```rust
Commands::Work { command } => match command {
    WorkCommands::Design { command } => match command {
        DesignCommands::Create { project_id, title, markdown, markdown_file, json } => {
            let md = resolve_markdown(markdown, markdown_file)?;
            commands::work::design_create(&project_id, &title, &md, json)
        }
        // ... other design commands
    },
    WorkCommands::Ticket { command } => match command {
        // ... ticket commands
    },
    WorkCommands::Comment { command } => match command {
        // ... comment commands
    },
},
```

Add a `resolve_markdown` helper at the top of `main.rs`:
```rust
fn resolve_markdown(
    inline: Option<String>,
    file: Option<PathBuf>,
) -> anyhow::Result<String> {
    match (inline, file) {
        (Some(_), Some(_)) => anyhow::bail!("Cannot specify both --markdown and --markdown-file"),
        (Some(md), None) => Ok(md),
        (None, Some(path)) => Ok(std::fs::read_to_string(&path)?),
        (None, None) => anyhow::bail!("Must specify either --markdown or --markdown-file"),
    }
}
```

**Verification:** `cargo build -p tina-session` succeeds. `tina-session work --help` shows the subcommand group.

---

### Step 7: Add `--json` error envelope handling

**Edit `tina-session/src/main.rs`** to support JSON error output globally when a `work` command fails.

Update the `run()` function to catch errors from `work` commands and format them as JSON when the `--json` flag was used. The simplest approach: wrap the work command dispatch in a helper that catches errors and reformats as JSON.

```rust
fn run_work_command(command: WorkCommands) -> anyhow::Result<u8> {
    // Extract json flag from the specific subcommand
    let json_mode = extract_json_flag(&command);
    match dispatch_work_command(command) {
        Ok(code) => Ok(code),
        Err(e) if json_mode => {
            eprintln!("{}", serde_json::json!({
                "ok": false,
                "error": format!("{:#}", e),
            }));
            Ok(1)
        }
        Err(e) => Err(e),
    }
}
```

**Verification:** Build succeeds. Calling a work command with invalid args and `--json` outputs a JSON error envelope to stderr with exit code 1.

---

### Step 8: Write integration tests

**Create `tina-session/tests/work_cli.rs`** using `assert_cmd` and `predicates` (already in dev-dependencies).

These tests verify that the CLI parses arguments and produces correct output structure. They do NOT call real Convex — they verify:

1. `--help` output for `tina-session work`, `tina-session work design`, `tina-session work ticket`, `tina-session work comment`
2. Argument validation: `design get` without `--id` or `--key` errors
3. Argument validation: `design get` with both `--id` and `--key` errors
4. Argument validation: `design create` without `--markdown` or `--markdown-file` errors
5. Argument validation: `design create` with both `--markdown` and `--markdown-file` errors
6. `--markdown-file` with non-existent file produces an error
7. Priority default for `ticket create` (verify `--help` shows default "medium")

Since these are argument-parsing and validation tests (not integration tests against Convex), they can run without a Convex connection.

```rust
use assert_cmd::Command;
use predicates::prelude::*;

#[test]
fn work_help() {
    Command::cargo_bin("tina-session")
        .unwrap()
        .args(["work", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("design"))
        .stdout(predicate::str::contains("ticket"))
        .stdout(predicate::str::contains("comment"));
}

#[test]
fn design_get_requires_id_or_key() {
    Command::cargo_bin("tina-session")
        .unwrap()
        .args(["work", "design", "get", "--json"])
        .assert()
        .failure();
}
```

**Verification:** `cargo test -p tina-session -- work_cli` passes.

---

### Step 9: Add tina-data unit tests for PM arg builders

**Edit `tina-data/src/convex_client.rs`** tests module to add unit tests for the new arg-building functions, following the existing pattern (e.g. `test_orchestration_to_args_all_fields`).

Test cases:
- `test_design_create_args` — all fields present
- `test_design_update_args_partial` — only title provided
- `test_ticket_create_args_all_fields` — includes optional fields
- `test_ticket_create_args_minimal` — no optional fields
- `test_comment_add_args` — all fields
- Extraction tests for `extract_design_from_obj`, `extract_ticket_from_obj`, `extract_comment_from_obj`

**Verification:** `cargo test -p tina-data` passes.

---

## File Inventory

### New files created
| File | Purpose |
|------|---------|
| `tina-session/src/commands/work.rs` | Work CLI command handlers (design/ticket/comment subcommands) |
| `tina-session/tests/work_cli.rs` | Integration tests for CLI argument parsing and validation |

### Files modified
| File | Change |
|------|--------|
| `tina-data/src/types.rs` | Add `DesignRecord`, `TicketRecord`, `CommentRecord` types |
| `tina-data/src/convex_client.rs` | Add PM Convex client methods + arg builders + extraction helpers + tests |
| `tina-data/src/lib.rs` | Re-export new PM record types |
| `tina-session/src/convex.rs` | Add PM methods on `ConvexWriter` + re-export PM types |
| `tina-session/src/commands/mod.rs` | Add `pub mod work;` |
| `tina-session/src/main.rs` | Add `Work` subcommand group, `WorkCommands`/`DesignCommands`/`TicketCommands`/`CommentCommands` enums, routing, `resolve_markdown` helper, JSON error envelope |
| `convex/workComments.ts` | Change `internalMutation`/`internalQuery` to public `mutation`/`query` |

### Files unchanged
| File | Reason |
|------|--------|
| `convex/designs.ts` | Already uses public mutation/query |
| `convex/tickets.ts` | Already uses public mutation/query |
| `convex/projectCounters.ts` | Internal module, no CLI exposure needed |
| All existing tests | No changes to existing functionality |

## Design Decisions

1. **Nested subcommands (`work design create`):** Mirrors the design doc's command contract (`tina-session work design create|get|list|update|transition`). Three levels deep is acceptable because `clap` handles it well and the tab completion is natural.

2. **`--json` flag per command, not global:** Each subcommand has its own `--json` flag. This matches the design doc requirement for "stable output mode for machine clients" and avoids needing a global state flag. The JSON error envelope is only triggered when `--json` was explicitly passed.

3. **`--markdown-file` instead of stdin:** Agents writing markdown into a CLI argument would be unwieldy for large documents. `--markdown-file` lets the agent write markdown to a temp file first, then pass the path. This is more reliable for automation.

4. **`design resolve` as a convenience command:** The design doc specifies `tina-session work design resolve --design-id <id>`. This is implemented as a read-only command that fetches the design and outputs the fields needed for orchestration handoff (id, key, title, markdown, status). Simpler than `get` because it doesn't require choosing between `--id` and `--key`.

5. **Public workComments functions:** The original Phase 1 implementation used `internalMutation`/`internalQuery` for workComments. The Convex Rust SDK can only call public functions. Changing them to public is safe because Convex authentication protects the deployment boundary — the comment validation (target exists) is still enforced server-side.

6. **No project resolution by name:** Commands accept `--project-id` (Convex doc ID), not project name. The caller must already know the project ID (from `tina-session init` or Convex). This avoids ambiguity and keeps the CLI simple.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Convex SDK can't call internal functions | Step 2 changes workComments to public; verified by existing tests passing |
| Large markdown content in CLI args | `--markdown-file` flag reads from file; inline `--markdown` still works for short content |
| JSON output format drift between commands | Centralized serde_json serialization of typed records; integration tests verify structure |
| Missing project ID for new users | Clear error message; future phases could add `work project list` convenience command |

## Acceptance Criteria

1. `cargo build -p tina-session` — builds without errors or warnings
2. `cargo test -p tina-session` — all tests pass including new work_cli tests
3. `cargo test -p tina-data` — all tests pass including new PM arg builder tests
4. `npm test -- convex/workComments.test.ts` — passes after public function change
5. `tina-session work --help` — shows design, ticket, comment subcommands
6. `tina-session work design --help` — shows create, get, list, update, transition, resolve subcommands
7. All commands accept `--json` flag and output structured JSON when used
8. Error envelope: failed commands with `--json` output `{"ok": false, "error": "..."}` to stderr
9. `design resolve --design-id X --json` outputs design content suitable for orchestration handoff
10. No changes to existing orchestration CLI commands or behavior
