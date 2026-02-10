import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

describe("commits:recordCommit", () => {
  test("creates new commit record with all fields", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const commitId = await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "1",
      sha: "abc123def456",
      shortSha: "abc123d",
      subject: "Add authentication module",
      author: "Jane Doe <jane@example.com>",
      timestamp: "2026-02-10T10:00:00Z",
      insertions: 150,
      deletions: 20,
    });

    expect(commitId).toBeTruthy();

    const commit = await t.query(api.commits.getCommit, {
      sha: "abc123def456",
    });

    expect(commit).not.toBeNull();
    expect(commit!.orchestrationId).toBe(orchestrationId);
    expect(commit!.phaseNumber).toBe("1");
    expect(commit!.sha).toBe("abc123def456");
    expect(commit!.shortSha).toBe("abc123d");
    expect(commit!.subject).toBe("Add authentication module");
    expect(commit!.author).toBe("Jane Doe <jane@example.com>");
    expect(commit!.timestamp).toBe("2026-02-10T10:00:00Z");
    expect(commit!.insertions).toBe(150);
    expect(commit!.deletions).toBe(20);
    expect(commit!.recordedAt).toBeTruthy();
  });

  test("returns existing ID when called with same SHA (deduplication)", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const id1 = await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "1",
      sha: "duplicate123",
      shortSha: "duplica",
      subject: "First commit",
      author: "Jane Doe <jane@example.com>",
      timestamp: "2026-02-10T10:00:00Z",
      insertions: 100,
      deletions: 10,
    });

    const id2 = await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "2",
      sha: "duplicate123",
      shortSha: "duplica",
      subject: "Second attempt",
      author: "Different Author <diff@example.com>",
      timestamp: "2026-02-10T11:00:00Z",
      insertions: 200,
      deletions: 20,
    });

    expect(id2).toBe(id1);

    const allCommits = await t.query(api.commits.listCommits, {
      orchestrationId,
    });

    expect(allCommits.filter((c) => c.sha === "duplicate123").length).toBe(1);
  });
});

describe("commits:listCommits", () => {
  test("returns all commits for orchestration when no phase filter", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "1",
      sha: "commit1",
      shortSha: "commit1",
      subject: "Phase 1 commit",
      author: "Jane Doe <jane@example.com>",
      timestamp: "2026-02-10T10:00:00Z",
      insertions: 100,
      deletions: 10,
    });

    await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "2",
      sha: "commit2",
      shortSha: "commit2",
      subject: "Phase 2 commit",
      author: "Jane Doe <jane@example.com>",
      timestamp: "2026-02-10T11:00:00Z",
      insertions: 50,
      deletions: 5,
    });

    const commits = await t.query(api.commits.listCommits, {
      orchestrationId,
    });

    expect(commits.length).toBe(2);
  });

  test("returns only phase-specific commits when phaseNumber provided", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "1",
      sha: "phase1-commit",
      shortSha: "phase1",
      subject: "Phase 1 commit",
      author: "Jane Doe <jane@example.com>",
      timestamp: "2026-02-10T10:00:00Z",
      insertions: 100,
      deletions: 10,
    });

    await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "2",
      sha: "phase2-commit",
      shortSha: "phase2",
      subject: "Phase 2 commit",
      author: "Jane Doe <jane@example.com>",
      timestamp: "2026-02-10T11:00:00Z",
      insertions: 50,
      deletions: 5,
    });

    const phase1Commits = await t.query(api.commits.listCommits, {
      orchestrationId,
      phaseNumber: "1",
    });

    expect(phase1Commits.length).toBe(1);
    expect(phase1Commits[0].sha).toBe("phase1-commit");
  });

  test("returns empty array for orchestration with no commits", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "empty-feature");

    const commits = await t.query(api.commits.listCommits, {
      orchestrationId,
    });

    expect(commits).toEqual([]);
  });
});

describe("commits:getCommit", () => {
  test("returns commit by SHA", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "1",
      sha: "findme123",
      shortSha: "findme1",
      subject: "Find this commit",
      author: "Jane Doe <jane@example.com>",
      timestamp: "2026-02-10T10:00:00Z",
      insertions: 75,
      deletions: 15,
    });

    const commit = await t.query(api.commits.getCommit, {
      sha: "findme123",
    });

    expect(commit).not.toBeNull();
    expect(commit!.subject).toBe("Find this commit");
  });

  test("returns null for non-existent SHA", async () => {
    const t = convexTest(schema);

    const commit = await t.query(api.commits.getCommit, {
      sha: "nonexistent",
    });

    expect(commit).toBeNull();
  });
});
