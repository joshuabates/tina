import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

describe("commits:recordCommit", () => {
  test("creates new commit index record", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const commitId = await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "1",
      sha: "abc123def456",
      shortSha: "abc123d",
      subject: "Add authentication module",
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
    expect(commit!.recordedAt).toBeTruthy();
  });

  test("allows shortSha to be omitted", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "1",
      sha: "abc999def000",
    });

    const commit = await t.query(api.commits.getCommit, {
      sha: "abc999def000",
    });

    expect(commit).not.toBeNull();
    expect(commit!.shortSha).toBeUndefined();
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
    });

    const id2 = await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "2",
      sha: "duplicate123",
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
    });

    await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "2",
      sha: "commit2",
      shortSha: "commit2",
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
    });

    await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "2",
      sha: "phase2-commit",
      shortSha: "phase2",
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
    });

    const commit = await t.query(api.commits.getCommit, {
      sha: "findme123",
    });

    expect(commit).not.toBeNull();
    expect(commit!.phaseNumber).toBe("1");
  });

  test("returns null for non-existent SHA", async () => {
    const t = convexTest(schema);

    const commit = await t.query(api.commits.getCommit, {
      sha: "nonexistent",
    });

    expect(commit).toBeNull();
  });
});
