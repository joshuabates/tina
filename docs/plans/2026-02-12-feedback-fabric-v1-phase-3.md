# Feedback Fabric v1 — Phase 3: Agent/Client Wrappers + Integration Tests

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 867df20e8b1f684fb142e1b144e029de25076221

**Goal:** Expose feedback entry CRUD through Rust `tina-data` wrappers so that agents and CLI tools can create, resolve, reopen, list, and query blocking feedback. Add integration tests (Convex test harness) to verify the full feedback lifecycle across orchestration fixtures.

**Architecture:** Extend `tina-data` with a `FeedbackEntryRecord` type, arg-builder, extraction helpers, and `TinaConvexClient` methods that call the Convex `feedbackEntries:*` functions created in Phase 1. Integration tests go in `convex/feedbackEntries.test.ts` as a multi-entry orchestration fixture exercising the full lifecycle.

**Phase context:** Phase 1 added the `feedbackEntries` table to `convex/schema.ts` and created `convex/feedbackEntries.ts` with mutations (`createFeedbackEntry`, `resolveFeedbackEntry`, `reopenFeedbackEntry`) and queries (`listFeedbackEntriesByOrchestration`, `listFeedbackEntriesByTarget`, `getBlockingFeedbackSummary`). Phase 2 added the web UI components. Phase 3 wires the Rust data layer and validates the contract with integration tests.

**Depends on:** Phase 1 (schema + Convex API), Phase 2 (web panel — no code dependency, just ordering).

---

## Task 1: Add `FeedbackEntryRecord` and `FeedbackEntryResponse` types to `tina-data/src/types.rs`

**Files:**
- `tina-data/src/types.rs`

**Model:** opus

**review:** spec-only

**Depends on:** none

### Steps

1. Open `tina-data/src/types.rs` and add the following struct after `CommentRecord` (around line 297):

```rust
/// Input record for creating a feedback entry via Convex `feedbackEntries:createFeedbackEntry`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackEntryInput {
    pub orchestration_id: String,
    pub target_type: String,        // "task" | "commit"
    pub target_task_id: Option<String>,
    pub target_commit_sha: Option<String>,
    pub entry_type: String,         // "comment" | "suggestion" | "ask_for_change"
    pub body: String,
    pub author_type: String,        // "human" | "agent"
    pub author_name: String,
}

/// Response record as returned by Convex feedback entry queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackEntryRecord {
    pub id: String,
    pub orchestration_id: String,
    pub target_type: String,
    pub target_task_id: Option<String>,
    pub target_commit_sha: Option<String>,
    pub entry_type: String,
    pub body: String,
    pub author_type: String,
    pub author_name: String,
    pub status: String,             // "open" | "resolved"
    pub resolved_by: Option<String>,
    pub resolved_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Blocking feedback summary as returned by `feedbackEntries:getBlockingFeedbackSummary`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockingFeedbackSummary {
    pub total_blocking: u32,
    pub by_target_type: BlockingByTargetType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockingByTargetType {
    pub task: u32,
    pub commit: u32,
}
```

2. Verify types compile:

Run: `cargo check -p tina-data`
Expected: compilation succeeds with no errors.

---

## Task 2: Add `feedback_entry_to_args` arg-builder in `tina-data/src/convex_client.rs`

**Files:**
- `tina-data/src/convex_client.rs`

**Model:** opus

**review:** spec-only

**Depends on:** Task 1

### Steps

1. After the `comment_to_args` function (around line 286), add:

```rust
fn feedback_entry_input_to_args(entry: &FeedbackEntryInput) -> BTreeMap<String, Value> {
    let mut args = BTreeMap::new();
    args.insert("orchestrationId".into(), Value::from(entry.orchestration_id.as_str()));
    args.insert("targetType".into(), Value::from(entry.target_type.as_str()));
    if let Some(ref tid) = entry.target_task_id {
        args.insert("targetTaskId".into(), Value::from(tid.as_str()));
    }
    if let Some(ref sha) = entry.target_commit_sha {
        args.insert("targetCommitSha".into(), Value::from(sha.as_str()));
    }
    args.insert("entryType".into(), Value::from(entry.entry_type.as_str()));
    args.insert("body".into(), Value::from(entry.body.as_str()));
    args.insert("authorType".into(), Value::from(entry.author_type.as_str()));
    args.insert("authorName".into(), Value::from(entry.author_name.as_str()));
    args
}
```

2. Verify:

Run: `cargo check -p tina-data`
Expected: compilation succeeds.

---

## Task 3: Add extraction helpers for feedback entry and blocking summary

**Files:**
- `tina-data/src/convex_client.rs`

**Model:** opus

**review:** spec-only

**Depends on:** Task 1

### Steps

1. After the `extract_comment_list` function (around line 982), add extraction helpers:

```rust
fn extract_feedback_entry_from_obj(obj: &BTreeMap<String, Value>) -> FeedbackEntryRecord {
    FeedbackEntryRecord {
        id: value_as_id(obj, "_id"),
        orchestration_id: value_as_id(obj, "orchestrationId"),
        target_type: value_as_str(obj, "targetType"),
        target_task_id: value_as_opt_str(obj, "targetTaskId"),
        target_commit_sha: value_as_opt_str(obj, "targetCommitSha"),
        entry_type: value_as_str(obj, "entryType"),
        body: value_as_str(obj, "body"),
        author_type: value_as_str(obj, "authorType"),
        author_name: value_as_str(obj, "authorName"),
        status: value_as_str(obj, "status"),
        resolved_by: value_as_opt_str(obj, "resolvedBy"),
        resolved_at: value_as_opt_str(obj, "resolvedAt"),
        created_at: value_as_str(obj, "createdAt"),
        updated_at: value_as_str(obj, "updatedAt"),
    }
}

fn extract_feedback_entry_list(result: FunctionResult) -> Result<Vec<FeedbackEntryRecord>> {
    match result {
        FunctionResult::Value(Value::Array(items)) => {
            let mut entries = Vec::new();
            for item in items {
                if let Value::Object(obj) = item {
                    entries.push(extract_feedback_entry_from_obj(&obj));
                }
            }
            Ok(entries)
        }
        FunctionResult::Value(Value::Null) => Ok(vec![]),
        FunctionResult::Value(other) => {
            bail!("expected array for feedback entry list, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}

fn extract_blocking_feedback_summary(result: FunctionResult) -> Result<BlockingFeedbackSummary> {
    match result {
        FunctionResult::Value(Value::Object(obj)) => {
            let total = value_as_u32(&obj, "totalBlocking");
            let by_target = match obj.get("byTargetType") {
                Some(Value::Object(tt)) => BlockingByTargetType {
                    task: value_as_u32(tt, "task"),
                    commit: value_as_u32(tt, "commit"),
                },
                _ => BlockingByTargetType { task: 0, commit: 0 },
            };
            Ok(BlockingFeedbackSummary {
                total_blocking: total,
                by_target_type: by_target,
            })
        }
        FunctionResult::Value(other) => {
            bail!("expected object for blocking summary, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => bail!("Convex error: {:?}", err),
    }
}
```

2. Verify:

Run: `cargo check -p tina-data`
Expected: compilation succeeds.

---

## Task 4: Add `TinaConvexClient` methods for feedback entry CRUD

**Files:**
- `tina-data/src/convex_client.rs`

**Model:** opus

**review:** full

**Depends on:** Task 2, Task 3

### Steps

1. Inside the `impl TinaConvexClient` block (after `list_comments` around line 1545), add:

```rust
    // --- Feedback entry methods ---

    /// Create a feedback entry for an orchestration target.
    pub async fn create_feedback_entry(
        &mut self,
        entry: &FeedbackEntryInput,
    ) -> Result<String> {
        let args = feedback_entry_input_to_args(entry);
        let result = self
            .client
            .mutation("feedbackEntries:createFeedbackEntry", args)
            .await?;
        extract_id(result)
    }

    /// Resolve a feedback entry.
    pub async fn resolve_feedback_entry(
        &mut self,
        entry_id: &str,
        resolved_by: &str,
    ) -> Result<()> {
        let mut args = BTreeMap::new();
        args.insert("entryId".into(), Value::from(entry_id));
        args.insert("resolvedBy".into(), Value::from(resolved_by));
        let result = self
            .client
            .mutation("feedbackEntries:resolveFeedbackEntry", args)
            .await?;
        extract_unit(result)
    }

    /// Reopen a previously resolved feedback entry.
    pub async fn reopen_feedback_entry(&mut self, entry_id: &str) -> Result<()> {
        let mut args = BTreeMap::new();
        args.insert("entryId".into(), Value::from(entry_id));
        let result = self
            .client
            .mutation("feedbackEntries:reopenFeedbackEntry", args)
            .await?;
        extract_unit(result)
    }

    /// List feedback entries for an orchestration, with optional filters.
    pub async fn list_feedback_entries(
        &mut self,
        orchestration_id: &str,
        target_type: Option<&str>,
        entry_type: Option<&str>,
        status: Option<&str>,
    ) -> Result<Vec<FeedbackEntryRecord>> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        if let Some(tt) = target_type {
            args.insert("targetType".into(), Value::from(tt));
        }
        if let Some(et) = entry_type {
            args.insert("entryType".into(), Value::from(et));
        }
        if let Some(s) = status {
            args.insert("status".into(), Value::from(s));
        }
        let result = self
            .client
            .query("feedbackEntries:listFeedbackEntriesByOrchestration", args)
            .await?;
        extract_feedback_entry_list(result)
    }

    /// List feedback entries for a specific target.
    pub async fn list_feedback_entries_by_target(
        &mut self,
        orchestration_id: &str,
        target_type: &str,
        target_ref: &str,
    ) -> Result<Vec<FeedbackEntryRecord>> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        args.insert("targetType".into(), Value::from(target_type));
        args.insert("targetRef".into(), Value::from(target_ref));
        let result = self
            .client
            .query("feedbackEntries:listFeedbackEntriesByTarget", args)
            .await?;
        extract_feedback_entry_list(result)
    }

    /// Get blocking feedback summary for an orchestration.
    pub async fn get_blocking_feedback_summary(
        &mut self,
        orchestration_id: &str,
    ) -> Result<BlockingFeedbackSummary> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        let result = self
            .client
            .query("feedbackEntries:getBlockingFeedbackSummary", args)
            .await?;
        extract_blocking_feedback_summary(result)
    }
```

2. Verify:

Run: `cargo check -p tina-data`
Expected: compilation succeeds.

---

## Task 5: Export new types from `tina-data/src/lib.rs`

**Files:**
- `tina-data/src/lib.rs`

**Model:** haiku

**review:** spec-only

**Depends on:** Task 1

### Steps

1. The types are already re-exported via `pub use types::*;` at `tina-data/src/lib.rs:18`. Verify the new types are accessible from outside the crate.

Run: `cargo check -p tina-data`
Expected: compilation succeeds. `FeedbackEntryInput`, `FeedbackEntryRecord`, `BlockingFeedbackSummary`, and `BlockingByTargetType` are publicly accessible.

2. Add the `feedback_entry_input_to_args` function to the public re-exports in `lib.rs` (after `phase_to_args` on line 16):

```rust
pub use convex_client::feedback_entry_input_to_args;
```

Wait — check whether `feedback_entry_input_to_args` is `pub` or private. Since the existing pattern uses `pub fn` for arg-builders that need external access (like `orchestration_to_args`) and plain `fn` for internal-only ones, decide based on whether tina-daemon or tina-session would call it directly.

For feedback entries, agents call through `TinaConvexClient` methods (not building args manually). So keep `feedback_entry_input_to_args` as private `fn` (not `pub`). No `lib.rs` change needed beyond confirming type re-exports work.

Run: `cargo check -p tina-data`
Expected: compilation succeeds.

---

## Task 6: Add unit tests for `feedback_entry_input_to_args` in `tina-data/src/convex_client.rs`

**Files:**
- `tina-data/src/convex_client.rs`

**Model:** opus

**review:** full

**Depends on:** Task 2

### Steps

1. Add tests to the existing `#[cfg(test)] mod tests` block at the bottom of `convex_client.rs`:

```rust
    #[test]
    fn test_feedback_entry_input_to_args_task_target() {
        let entry = FeedbackEntryInput {
            orchestration_id: "orch-123".to_string(),
            target_type: "task".to_string(),
            target_task_id: Some("5".to_string()),
            target_commit_sha: None,
            entry_type: "ask_for_change".to_string(),
            body: "Please add error handling".to_string(),
            author_type: "human".to_string(),
            author_name: "joshua".to_string(),
        };

        let args = feedback_entry_input_to_args(&entry);

        assert_eq!(args.get("orchestrationId"), Some(&Value::from("orch-123")));
        assert_eq!(args.get("targetType"), Some(&Value::from("task")));
        assert_eq!(args.get("targetTaskId"), Some(&Value::from("5")));
        assert!(args.get("targetCommitSha").is_none());
        assert_eq!(args.get("entryType"), Some(&Value::from("ask_for_change")));
        assert_eq!(args.get("body"), Some(&Value::from("Please add error handling")));
        assert_eq!(args.get("authorType"), Some(&Value::from("human")));
        assert_eq!(args.get("authorName"), Some(&Value::from("joshua")));
        assert_eq!(args.len(), 7);
    }

    #[test]
    fn test_feedback_entry_input_to_args_commit_target() {
        let entry = FeedbackEntryInput {
            orchestration_id: "orch-456".to_string(),
            target_type: "commit".to_string(),
            target_task_id: None,
            target_commit_sha: Some("abc123def".to_string()),
            entry_type: "suggestion".to_string(),
            body: "Consider using a constant here".to_string(),
            author_type: "agent".to_string(),
            author_name: "code-reviewer".to_string(),
        };

        let args = feedback_entry_input_to_args(&entry);

        assert_eq!(args.get("orchestrationId"), Some(&Value::from("orch-456")));
        assert_eq!(args.get("targetType"), Some(&Value::from("commit")));
        assert!(args.get("targetTaskId").is_none());
        assert_eq!(args.get("targetCommitSha"), Some(&Value::from("abc123def")));
        assert_eq!(args.get("entryType"), Some(&Value::from("suggestion")));
        assert_eq!(args.get("authorType"), Some(&Value::from("agent")));
        assert_eq!(args.get("authorName"), Some(&Value::from("code-reviewer")));
        assert_eq!(args.len(), 7);
    }
```

2. Run tests:

Run: `cargo test -p tina-data -- test_feedback_entry_input_to_args`
Expected: 2 tests pass.

---

## Task 7: Add Convex integration test fixture helpers in `convex/test_helpers.ts`

**Files:**
- `convex/test_helpers.ts`

**Model:** opus

**review:** spec-only

**Depends on:** none

### Steps

1. Add feedback entry fixture helpers to `convex/test_helpers.ts` after the `createProject` function:

```typescript
interface CreateFeedbackEntryOptions {
  orchestrationId: string;
  targetType: "task" | "commit";
  targetTaskId?: string;
  targetCommitSha?: string;
  entryType?: "comment" | "suggestion" | "ask_for_change";
  body?: string;
  authorType?: "human" | "agent";
  authorName?: string;
}

export async function createFeedbackEntry(
  t: ConvexHarness,
  options: CreateFeedbackEntryOptions,
) {
  const args: Record<string, unknown> = {
    orchestrationId: options.orchestrationId as any,
    targetType: options.targetType,
    entryType: options.entryType ?? "comment",
    body: options.body ?? "Test feedback entry",
    authorType: options.authorType ?? "human",
    authorName: options.authorName ?? "test-user",
  };

  if (options.targetTaskId !== undefined) {
    args.targetTaskId = options.targetTaskId;
  }
  if (options.targetCommitSha !== undefined) {
    args.targetCommitSha = options.targetCommitSha;
  }

  return await t.mutation(api.feedbackEntries.createFeedbackEntry, args as any);
}
```

2. Verify helpers type-check:

Run: `npx tsc --noEmit`
Expected: no type errors (this depends on Phase 1's `convex/feedbackEntries.ts` existing).

---

## Task 8: Create `convex/feedbackEntries.test.ts` integration tests

**Files:**
- `convex/feedbackEntries.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 7

### Steps

1. Create `convex/feedbackEntries.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import {
  createNode,
  createOrchestration,
  createFeatureFixture,
  createFeedbackEntry,
} from "./test_helpers";

describe("feedbackEntries", () => {
  describe("createFeedbackEntry", () => {
    it("creates a comment on a task target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      // Record a task event so the task target exists
      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "1",
        subject: "Test task",
        status: "pending",
        recordedAt: "2026-02-12T10:00:00Z",
      });

      const entryId = await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Looks good",
        authorType: "human",
        authorName: "joshua",
      });

      expect(entryId).toBeTruthy();
    });

    it("creates a suggestion on a commit target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      // Record a commit so the target exists
      await t.mutation(api.commits.recordCommit, {
        orchestrationId,
        phaseNumber: "1",
        sha: "abc123def456",
        shortSha: "abc123d",
        subject: "feat: add feature",
        author: "joshua",
        timestamp: "2026-02-12T10:00:00Z",
        insertions: 50,
        deletions: 10,
      });

      const entryId = await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "commit",
        targetCommitSha: "abc123def456",
        entryType: "suggestion",
        body: "Consider extracting this into a helper",
      });

      expect(entryId).toBeTruthy();
    });

    it("creates an ask_for_change entry", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "2",
        subject: "Another task",
        status: "completed",
        recordedAt: "2026-02-12T10:00:00Z",
      });

      const entryId = await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "2",
        entryType: "ask_for_change",
        body: "Missing error handling",
        authorType: "human",
        authorName: "reviewer",
      });

      expect(entryId).toBeTruthy();
    });

    it("rejects entry with invalid task target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await expect(
        createFeedbackEntry(t, {
          orchestrationId: orchestrationId as string,
          targetType: "task",
          targetTaskId: "nonexistent",
          body: "This should fail",
        }),
      ).rejects.toThrow();
    });

    it("rejects entry with invalid commit target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await expect(
        createFeedbackEntry(t, {
          orchestrationId: orchestrationId as string,
          targetType: "commit",
          targetCommitSha: "nonexistent-sha",
          body: "This should fail",
        }),
      ).rejects.toThrow();
    });
  });

  describe("resolveFeedbackEntry", () => {
    it("resolves an open entry", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "1",
        subject: "Task",
        status: "pending",
        recordedAt: "2026-02-12T10:00:00Z",
      });

      const entryId = await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "ask_for_change",
        body: "Fix this",
      });

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "developer",
      });

      const entries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId },
      );

      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe("resolved");
      expect(entries[0].resolvedBy).toBe("developer");
      expect(entries[0].resolvedAt).toBeTruthy();
    });

    it("rejects resolving an already-resolved entry", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "1",
        subject: "Task",
        status: "pending",
        recordedAt: "2026-02-12T10:00:00Z",
      });

      const entryId = await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Note",
      });

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "dev",
      });

      await expect(
        t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
          entryId: entryId as any,
          resolvedBy: "dev2",
        }),
      ).rejects.toThrow();
    });
  });

  describe("reopenFeedbackEntry", () => {
    it("reopens a resolved entry", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "1",
        subject: "Task",
        status: "pending",
        recordedAt: "2026-02-12T10:00:00Z",
      });

      const entryId = await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "ask_for_change",
        body: "Needs fix",
      });

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "dev",
      });

      await t.mutation(api.feedbackEntries.reopenFeedbackEntry, {
        entryId: entryId as any,
      });

      const entries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId },
      );

      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe("open");
      expect(entries[0].resolvedBy).toBeUndefined();
      expect(entries[0].resolvedAt).toBeUndefined();
    });

    it("rejects reopening an already-open entry", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "1",
        subject: "Task",
        status: "pending",
        recordedAt: "2026-02-12T10:00:00Z",
      });

      const entryId = await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Note",
      });

      await expect(
        t.mutation(api.feedbackEntries.reopenFeedbackEntry, {
          entryId: entryId as any,
        }),
      ).rejects.toThrow();
    });
  });

  describe("listFeedbackEntriesByOrchestration", () => {
    it("lists all entries for an orchestration", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "1",
        subject: "Task",
        status: "pending",
        recordedAt: "2026-02-12T10:00:00Z",
      });

      await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "First",
      });
      await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "suggestion",
        body: "Second",
      });

      const entries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId },
      );

      expect(entries).toHaveLength(2);
    });

    it("filters by status", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "1",
        subject: "Task",
        status: "pending",
        recordedAt: "2026-02-12T10:00:00Z",
      });

      const entryId = await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Will resolve",
      });

      await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Stays open",
      });

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "dev",
      });

      const openEntries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId, status: "open" as any },
      );

      expect(openEntries).toHaveLength(1);
      expect(openEntries[0].body).toBe("Stays open");
    });
  });

  describe("listFeedbackEntriesByTarget", () => {
    it("lists entries for a specific task target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "1",
        subject: "Task 1",
        status: "pending",
        recordedAt: "2026-02-12T10:00:00Z",
      });
      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "2",
        subject: "Task 2",
        status: "pending",
        recordedAt: "2026-02-12T10:01:00Z",
      });

      await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        body: "On task 1",
      });
      await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "2",
        body: "On task 2",
      });

      const entries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByTarget,
        {
          orchestrationId,
          targetType: "task",
          targetRef: "1",
        },
      );

      expect(entries).toHaveLength(1);
      expect(entries[0].body).toBe("On task 1");
    });
  });

  describe("getBlockingFeedbackSummary", () => {
    it("counts open ask_for_change entries as blocking", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "1",
        subject: "Task",
        status: "pending",
        recordedAt: "2026-02-12T10:00:00Z",
      });

      await t.mutation(api.commits.recordCommit, {
        orchestrationId,
        phaseNumber: "1",
        sha: "abc123",
        shortSha: "abc1",
        subject: "feat: x",
        author: "dev",
        timestamp: "2026-02-12T10:00:00Z",
        insertions: 10,
        deletions: 0,
      });

      // Create blocking entries
      await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "ask_for_change",
        body: "Blocking on task",
      });

      await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "commit",
        targetCommitSha: "abc123",
        entryType: "ask_for_change",
        body: "Blocking on commit",
      });

      // Create non-blocking entry (comment, not ask_for_change)
      await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Just a note",
      });

      const summary = await t.query(
        api.feedbackEntries.getBlockingFeedbackSummary,
        { orchestrationId },
      );

      expect(summary.totalBlocking).toBe(2);
      expect(summary.byTargetType.task).toBe(1);
      expect(summary.byTargetType.commit).toBe(1);
    });

    it("returns zero when no blocking entries exist", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      const summary = await t.query(
        api.feedbackEntries.getBlockingFeedbackSummary,
        { orchestrationId },
      );

      expect(summary.totalBlocking).toBe(0);
      expect(summary.byTargetType.task).toBe(0);
      expect(summary.byTargetType.commit).toBe(0);
    });

    it("excludes resolved ask_for_change from blocking count", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "test-feature");

      await t.mutation(api.tasks.recordTaskEvent, {
        orchestrationId,
        taskId: "1",
        subject: "Task",
        status: "pending",
        recordedAt: "2026-02-12T10:00:00Z",
      });

      const entryId = await createFeedbackEntry(t, {
        orchestrationId: orchestrationId as string,
        targetType: "task",
        targetTaskId: "1",
        entryType: "ask_for_change",
        body: "Will be resolved",
      });

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "dev",
      });

      const summary = await t.query(
        api.feedbackEntries.getBlockingFeedbackSummary,
        { orchestrationId },
      );

      expect(summary.totalBlocking).toBe(0);
    });
  });
});
```

2. Run tests:

Run: `npm test -- --run convex/feedbackEntries.test.ts`
Expected: all tests pass (depends on Phase 1 `convex/feedbackEntries.ts` existing).

---

## Task 9: Run full test suite to verify no regressions

**Files:**
- (none — verification only)

**Model:** haiku

**review:** spec-only

**Depends on:** Task 4, Task 6, Task 8

### Steps

1. Run Rust tests for tina-data:

Run: `cargo test -p tina-data`
Expected: all tests pass including the new feedback arg-builder tests.

2. Run Convex tests:

Run: `npm test -- --run`
Expected: all tests pass including feedbackEntries integration tests.

3. Run cargo check across the workspace:

Run: `cargo check -p tina-data -p tina-session -p tina-daemon`
Expected: all crates compile without errors.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 500 |

---

## Phase Estimates

| Task | Estimate |
|------|----------|
| Task 1: FeedbackEntryRecord types | 3 min |
| Task 2: feedback_entry_input_to_args | 2 min |
| Task 3: Extraction helpers | 4 min |
| Task 4: TinaConvexClient methods | 5 min |
| Task 5: Verify lib.rs exports | 1 min |
| Task 6: Unit tests for arg-builder | 3 min |
| Task 7: Test fixture helpers | 2 min |
| Task 8: Integration tests | 5 min |
| Task 9: Full test suite verification | 3 min |
| **Total** | **~28 min** |

---

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
