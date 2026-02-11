# Phase 4: Orchestration Handoff Compatibility

## Goal

Update the orchestration pipeline so that `/tina:orchestrate` can accept a Convex `designId` instead of (or in addition to) a file path. The planner can resolve the latest design content from Convex via `tina-session work design resolve` before planning each phase. File-path compatibility is preserved as a temporary fallback during migration.

## Deliverables

1. `tina-session init` accepts `--design-id` alongside existing `--design-doc`
2. Convex `orchestrations` table gains optional `designId` field linking to `designs` table
3. `SupervisorState` gains optional `design_id` field
4. Orchestrate skill (`skills/orchestrate/SKILL.md`) supports `--design-id` invocation
5. Phase planner agent pulls latest design content from Convex when `design_id` is available
6. Tests for all new paths

## Sequencing

Steps are ordered so each builds on the previous and can be verified independently.

---

### Step 1: Add `designId` to Convex orchestrations schema

**Edit `convex/generated/orchestrationCore.ts`** to add an optional `designId` field:

```typescript
export const orchestrationCoreTableFields = {
  nodeId: v.id("nodes"),
  featureName: v.string(),
  designDocPath: v.string(),
  designId: v.optional(v.id("designs")),  // NEW: link to Convex design
  branch: v.string(),
  worktreePath: v.optional(v.string()),
  totalPhases: v.number(),
  currentPhase: v.number(),
  status: v.string(),
  startedAt: v.string(),
  completedAt: v.optional(v.string()),
  totalElapsedMins: v.optional(v.number()),
} as const;
```

**Edit `convex/orchestrations.ts`** `upsertOrchestration` mutation to accept and persist the new field:

- Add `designId: v.optional(v.id("designs"))` to `args`
- Include `designId` in the insert and patch paths (same as `projectId` — only set when provided)

**Verification:** `npx convex typecheck` passes. Existing orchestrations without `designId` remain valid.

---

### Step 2: Add `designId` to Rust data layer

**Edit `tina-data/src/generated/orchestration_core_fields.rs`** to add the new field:

```rust
pub struct OrchestrationRecord {
    pub project_id: Option<String>,
    pub node_id: String,
    pub feature_name: String,
    pub design_doc_path: String,
    pub design_id: Option<String>,  // NEW
    pub branch: String,
    pub worktree_path: Option<String>,
    pub total_phases: f64,
    pub current_phase: f64,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub total_elapsed_mins: Option<f64>,
}
```

**Edit `tina-data/src/convex_client.rs`:**

- Add `design_id: Option<String>` to `OrchestrationArgs` struct
- Include `designId` in the arg-builder for `upsertOrchestration` (only when `Some`)
- Extract `designId` in `extract_orchestration_from_obj`

**Verification:** `cargo test -p tina-data` passes. Existing tests updated to include `design_id: None`.

---

### Step 3: Add `design_id` to `SupervisorState`

**Edit `tina-session/src/state/schema.rs`:**

Add an optional `design_id` field to `SupervisorState`:

```rust
pub struct SupervisorState {
    pub version: u32,
    pub feature: String,
    pub design_doc: PathBuf,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub design_id: Option<String>,  // NEW: Convex design doc ID
    pub worktree_path: PathBuf,
    pub branch: String,
    pub total_phases: u32,
    pub current_phase: u32,
    pub status: OrchestrationStatus,
    pub orchestration_started_at: DateTime<Utc>,
    // ... existing fields
}
```

Update `SupervisorState::new()` to accept an optional `design_id` parameter. When `design_id` is provided, store it. The `design_doc` path field remains for backward compatibility (set to a placeholder like `"convex://<design_id>"` when only `design_id` is provided).

**Verification:** `cargo test -p tina-session` passes. Existing supervisor state JSON without `design_id` deserializes correctly (field is `None`).

---

### Step 4: Add `--design-id` to `tina-session init`

**Edit `tina-session/src/main.rs`** `Init` command:

Add a new optional argument:

```rust
Init {
    // ... existing args ...

    /// Path to design document (required unless --design-id is provided)
    #[arg(long)]
    design_doc: Option<PathBuf>,  // Changed from required to optional

    /// Convex design document ID (alternative to --design-doc)
    #[arg(long)]
    design_id: Option<String>,

    // ... rest of existing args ...
}
```

Validation: exactly one of `--design-doc` or `--design-id` must be provided. Both or neither is an error.

**Edit `tina-session/src/commands/init.rs`:**

Update `run()` signature to accept both options:

```rust
pub fn run(
    feature: &str,
    cwd: &Path,
    design_doc: Option<&Path>,
    design_id: Option<&str>,
    branch: &str,
    total_phases: u32,
    // ... existing policy args ...
) -> anyhow::Result<u8> {
```

When `--design-id` is provided instead of `--design-doc`:
1. Resolve design content from Convex: call `writer.get_design(design_id)` to validate it exists
2. Write the design markdown to a temp file in the worktree at `{worktree}/.claude/tina/design.md` so file-path-based agents can still read it
3. Use `"convex://{design_id}"` as the `design_doc_path` in `SupervisorState` (distinguishable from a real filesystem path)
4. Store `design_id` in `SupervisorState.design_id`
5. Pass `design_id` to `write_to_convex()` so the orchestration record links to the design

When `--design-doc` is provided (existing path):
1. Behavior unchanged
2. `design_id` is `None` in supervisor state and Convex

Update `write_to_convex()` to accept and forward `design_id`:

```rust
fn write_to_convex(
    feature: &str,
    worktree_path: &Path,
    design_doc: &Path,
    branch: &str,
    total_phases: u32,
    cwd: &Path,
    design_id: Option<&str>,  // NEW
) -> anyhow::Result<String> {
    // ...
    let orch = convex::OrchestrationArgs {
        // ... existing fields ...
        design_id: design_id.map(|id| id.to_string()),
    };
    // ...
}
```

Update the JSON output to include `design_id` when present:

```json
{
  "orchestration_id": "...",
  "team_id": "...",
  "worktree_path": "...",
  "feature": "...",
  "branch": "...",
  "design_doc": "...",
  "design_id": "...",
  "total_phases": 4
}
```

**Verification:** `cargo build -p tina-session` succeeds. `tina-session init --help` shows both `--design-doc` and `--design-id`.

---

### Step 5: Update orchestrate skill for `--design-id` support

**Edit `skills/orchestrate/SKILL.md`** STEP 1 (Parse invocation):

Update the invocation format to support `--design-id`:

```bash
# Invocation:
# /tina:orchestrate [--model <model>] [--feature <name>] <design-doc-path>
# /tina:orchestrate [--model <model>] [--feature <name>] --design-id <id>

DESIGN_DOC=""
DESIGN_ID=""

while [[ "$1" == --* ]]; do
    case "$1" in
        --model) MODEL_OVERRIDE="$2"; shift 2 ;;
        --feature) FEATURE_OVERRIDE="$2"; shift 2 ;;
        --design-id) DESIGN_ID="$2"; shift 2 ;;
        *) break ;;
    esac
done

# Remaining positional arg is the design doc path (if provided)
if [[ -n "$1" ]]; then
    DESIGN_DOC="$1"
fi

# Validate: exactly one of DESIGN_DOC or DESIGN_ID must be set
if [[ -z "$DESIGN_DOC" && -z "$DESIGN_ID" ]]; then
    echo "Error: Must provide either a design doc path or --design-id"
    exit 1
fi
if [[ -n "$DESIGN_DOC" && -n "$DESIGN_ID" ]]; then
    echo "Error: Cannot provide both a design doc path and --design-id"
    exit 1
fi
```

When `DESIGN_ID` is set:
1. Resolve design content: `tina-session work design resolve --design-id "$DESIGN_ID" --json`
2. Extract title, markdown, status from the JSON response
3. Derive `FEATURE_NAME` from the design title (slugified) if `--feature` not provided
4. Count `TOTAL_PHASES` from the resolved markdown content (same grep for `## Phase N`)
5. Write resolved markdown to a temp file for phase counting: `DESIGN_DOC_TEMP=$(mktemp)`
6. Check for `## Architectural Context` in the resolved markdown for pre-approval
7. Pass `--design-id` to `tina-session init` instead of `--design-doc`

When `DESIGN_DOC` is set (file path):
1. Behavior unchanged — pass `--design-doc` to `tina-session init`

Update STEP 1c (Initialize orchestration):

```bash
if [[ -n "$DESIGN_ID" ]]; then
    INIT_JSON=$(tina-session init \
      --feature "$FEATURE_NAME" \
      --cwd "$PWD" \
      --design-id "$DESIGN_ID" \
      --branch "tina/$FEATURE_NAME" \
      --total-phases "$TOTAL_PHASES")
else
    INIT_JSON=$(tina-session init \
      --feature "$FEATURE_NAME" \
      --cwd "$PWD" \
      --design-doc "$DESIGN_DOC" \
      --branch "tina/$FEATURE_NAME" \
      --total-phases "$TOTAL_PHASES")
fi
```

Update task metadata to include `design_id` when available:

```json
{
  "design_doc_path": "<path or convex://id>",
  "design_id": "<DESIGN_ID if set>",
  "worktree_path": "...",
  "team_id": "..."
}
```

**Verification:** Skill document parses correctly with both invocation formats.

---

### Step 6: Update phase planner agent for design resolution

**Edit `agents/phase-planner.md`:**

Add a "Resolve Design Content" section before the existing "Read the Design Document" section:

```markdown
### Resolve Design Content

Before reading the design document, check if a `design_id` is available in task metadata.

If `design_id` is present:
1. Resolve the latest design content from Convex:
   ```bash
   DESIGN_JSON=$(tina-session work design resolve --design-id "$DESIGN_ID" --json)
   ```
2. Extract the markdown: `DESIGN_MARKDOWN=$(echo "$DESIGN_JSON" | jq -r '.markdown')`
3. Write to the worktree for reference:
   ```bash
   echo "$DESIGN_MARKDOWN" > "$WORKTREE_PATH/.claude/tina/design.md"
   ```
4. Use this content for phase planning

If `design_id` is not present:
- Fall back to reading `design_doc_path` from the filesystem (existing behavior)
```

This ensures the planner always gets the latest version of the design from Convex, rather than a potentially stale file copy.

**Edit `agents/design-validator.md`:**

Add the same resolution logic: if `design_id` is in task metadata, resolve from Convex via `tina-session work design resolve` instead of reading the file path directly.

**Edit `agents/phase-reviewer.md`:**

Same pattern: resolve design content from Convex when `design_id` is available, so the reviewer compares implementation against the latest design.

**Verification:** Agent definitions read correctly. No syntax errors in markdown.

---

### Step 7: Add tests for `--design-id` init path

**Edit `tina-session/src/commands/init.rs`** tests:

Add new test cases:

1. `test_init_with_design_id_validates_mutex` — providing both `--design-doc` and `--design-id` fails
2. `test_init_with_neither_design_option_fails` — providing neither fails
3. `test_init_with_design_id_creates_worktree` — providing `--design-id` creates worktree, writes design content to `{worktree}/.claude/tina/design.md`, stores `design_id` in supervisor state (requires Convex with a design already created)
4. `test_init_design_doc_backward_compatible` — existing `--design-doc` path still works as before

**Edit `tina-session/tests/work_cli.rs`** (or new test file):

Add CLI argument validation tests:

1. `init --design-doc X --design-id Y` fails with error about mutual exclusivity
2. `init` without either `--design-doc` or `--design-id` fails

**Add Convex test `convex/orchestrations.test.ts`:**

Test that `upsertOrchestration` with `designId`:
1. Creates orchestration linked to a design
2. Returns the orchestration with `designId` field populated
3. Works without `designId` (backward compatibility)

**Verification:** `cargo test -p tina-session` passes. `npm test -- convex/orchestrations.test.ts` passes.

---

### Step 8: Add `tina-session work design resolve-to-file` convenience command

**Edit `tina-session/src/commands/work/design.rs`:**

Add a `resolve_to_file` function that resolves a design from Convex and writes the markdown to a specified output path. This simplifies the agent workflow — instead of piping JSON through jq, agents can call:

```bash
tina-session work design resolve-to-file \
  --design-id "$DESIGN_ID" \
  --output "$WORKTREE_PATH/.claude/tina/design.md"
```

Implementation:
1. Fetch design via `writer.get_design(design_id)`
2. Write `design.markdown` to the `--output` path
3. In `--json` mode, output `{"ok": true, "designId": "...", "outputPath": "..."}`
4. In text mode, print `"Wrote design <key> to <path>"`

**Edit `tina-session/src/main.rs`:**

Add `ResolveToFile` variant to `DesignCommands`:

```rust
ResolveToFile {
    #[arg(long)]
    design_id: String,
    #[arg(long)]
    output: PathBuf,
    #[arg(long)]
    json: bool,
},
```

Wire up routing in the Work command handler.

**Verification:** `cargo build -p tina-session` succeeds. `tina-session work design resolve-to-file --help` works.

---

### Step 9: Update `tina-session/src/convex.rs` to forward `design_id`

**Edit `tina-session/src/convex.rs`:**

Update `OrchestrationArgs` (the tina-session wrapper) to include `design_id`:

```rust
pub struct OrchestrationArgs {
    pub node_id: String,
    pub project_id: Option<String>,
    pub feature_name: String,
    pub design_doc_path: String,
    pub design_id: Option<String>,  // NEW
    pub branch: String,
    pub worktree_path: Option<String>,
    pub total_phases: f64,
    pub current_phase: f64,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub total_elapsed_mins: Option<f64>,
}
```

Ensure `get_by_feature` returns `OrchestrationRecord` which now includes `design_id`.

**Verification:** `cargo check -p tina-session` compiles.

---

## File Inventory

### New files created
| File | Purpose |
|------|---------|
| `convex/orchestrations.test.ts` | Tests for `upsertOrchestration` with `designId` field |

### Files modified
| File | Change |
|------|--------|
| `convex/generated/orchestrationCore.ts` | Add optional `designId` field |
| `convex/orchestrations.ts` | Accept and persist `designId` in `upsertOrchestration` |
| `tina-data/src/generated/orchestration_core_fields.rs` | Add `design_id: Option<String>` |
| `tina-data/src/convex_client.rs` | Add `design_id` to args builder and extraction |
| `tina-session/src/state/schema.rs` | Add optional `design_id` to `SupervisorState` |
| `tina-session/src/main.rs` | Add `--design-id` to `Init`, add `ResolveToFile` to `DesignCommands`, update routing |
| `tina-session/src/commands/init.rs` | Support `--design-id` path (resolve from Convex, write to worktree, forward to Convex) |
| `tina-session/src/convex.rs` | Add `design_id` to `OrchestrationArgs` |
| `tina-session/src/commands/work/design.rs` | Add `resolve_to_file` function |
| `skills/orchestrate/SKILL.md` | Support `--design-id` invocation, resolve design from Convex |
| `agents/phase-planner.md` | Add design resolution from Convex when `design_id` available |
| `agents/design-validator.md` | Add design resolution from Convex when `design_id` available |
| `agents/phase-reviewer.md` | Add design resolution from Convex when `design_id` available |

### Files unchanged
| File | Reason |
|------|--------|
| `convex/designs.ts` | No changes to existing design CRUD functions |
| `convex/schema.ts` | Schema imports `orchestrationCoreTableFields` which includes the new field |
| All tina-web files | Frontend is unaffected by orchestration handoff changes |
| `tina-session/src/commands/work/ticket.rs` | No ticket changes needed |
| `tina-session/src/commands/work/comment.rs` | No comment changes needed |

## Design Decisions

1. **`convex://` prefix for design_doc path:** When `--design-id` is used, `SupervisorState.design_doc` is set to `"convex://<design_id>"`. This distinguishes Convex-backed designs from filesystem paths without breaking the required `PathBuf` type. Agents checking whether to resolve from Convex look for this prefix.

2. **Write design to worktree as a side effect:** Even with Convex-backed designs, the resolved markdown is written to `{worktree}/.claude/tina/design.md`. This ensures file-reading agents that haven't been updated yet can still find the design content. It also provides an offline snapshot.

3. **`resolve-to-file` convenience command:** Rather than requiring agents to parse JSON output and extract markdown via `jq`, a dedicated command writes the design directly to a file. This is more reliable in shell scripts and reduces the chance of encoding errors with large markdown content.

4. **Optional field, not replacement:** `designId` is added as optional on orchestrations, not replacing `designDocPath`. This ensures backward compatibility — existing orchestrations without a Convex design continue to work. The design doc specifies "temporary dual orchestration input" for this reason.

5. **Planner pulls latest on each phase:** Rather than pushing design updates to running orchestrations, the planner resolves the latest design from Convex before each phase plan. This matches the design doc decision: "No automatic design propagation into running orchestration; planner manually pulls latest design before phase planning."

6. **No status gate for orchestrating a design:** Per design doc: "No status gate for orchestrating a design in Project 1." A design in any status can be orchestrated. The validator may warn about non-approved designs, but won't block.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Design modified mid-orchestration | Planner resolves latest content per-phase, so changes are picked up. Reviewer compares against same latest version. |
| Convex unavailable during init | If `--design-id` is used and Convex is unreachable, init fails with a clear error (unlike file path which always works locally) |
| Large design markdown in Convex response | `resolve-to-file` writes directly to disk, avoiding shell variable size limits |
| Stale local design file in worktree | Planner always re-resolves from Convex; local file is a convenience snapshot only |
| Generated file edits | `orchestrationCore.ts` and `orchestration_core_fields.rs` are generated but must be edited for this feature. Add comments noting the schema change. |

## Acceptance Criteria

1. `cargo build -p tina-session` — builds without errors
2. `cargo test -p tina-session` — all tests pass including new init tests
3. `cargo test -p tina-data` — all tests pass with updated `OrchestrationArgs`
4. `npm test -- convex/orchestrations.test.ts` — passes with `designId` field tests
5. `tina-session init --design-id X --cwd Y --feature Z --branch B --total-phases N` — creates worktree and orchestration linked to design
6. `tina-session init --design-doc X --cwd Y --feature Z --branch B --total-phases N` — continues to work as before
7. `tina-session work design resolve-to-file --design-id X --output Y` — writes design markdown to file
8. Orchestrate skill accepts both `/tina:orchestrate design.md` and `/tina:orchestrate --design-id X`
9. Phase planner resolves latest design from Convex when `design_id` is in task metadata
10. No regressions to existing orchestration flows using file paths
