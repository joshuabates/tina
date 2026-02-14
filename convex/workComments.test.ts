import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
import { createProject } from "./test_helpers";

describe("workComments", () => {
  describe("addComment", () => {
    test("adds a comment to a spec and returns comment id", async () => {
      const t = convexTest(schema, modules);

      const projectId = await createProject(t, {
        name: "comments-test-project",
        repoPath: "/Users/joshua/Projects/comments-test",
      });

      // Create a spec
      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Test Spec",
        markdown: "# Test",
      });

      // Add a comment
      const commentId = await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "spec",
        targetId: specId,
        authorType: "human",
        authorName: "alice",
        body: "This spec looks good",
      });

      expect(commentId).toBeDefined();

      // Verify the comment was saved
      const comments = await t.query(api.workComments.listComments, {
        targetType: "spec",
        targetId: specId,
      });

      expect(comments).toHaveLength(1);
      expect(comments[0].authorName).toBe("alice");
      expect(comments[0].body).toBe("This spec looks good");
      expect(comments[0].authorType).toBe("human");
    });

    test("adds a comment to a ticket and returns comment id", async () => {
      const t = convexTest(schema, modules);

      const projectId = await createProject(t, {
        name: "comments-test-project-2",
        repoPath: "/Users/joshua/Projects/comments-test-2",
      });

      // Create a ticket
      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Test Ticket",
        description: "Test description",
        priority: "high",
      });

      // Add a comment
      const commentId = await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "ticket",
        targetId: ticketId,
        authorType: "agent",
        authorName: "claude",
        body: "Starting work on this",
      });

      expect(commentId).toBeDefined();

      // Verify the comment was saved
      const comments = await t.query(api.workComments.listComments, {
        targetType: "ticket",
        targetId: ticketId,
      });

      expect(comments).toHaveLength(1);
      expect(comments[0].authorName).toBe("claude");
      expect(comments[0].body).toBe("Starting work on this");
      expect(comments[0].authorType).toBe("agent");
    });

    test("throws when spec does not exist", async () => {
      const t = convexTest(schema, modules);

      const projectId = await createProject(t, {
        name: "comments-test-project-3",
        repoPath: "/Users/joshua/Projects/comments-test-3",
      });

      // Try to add a comment to non-existent spec
      await expect(
        t.mutation(api.workComments.addComment, {
          projectId,
          targetType: "spec",
          targetId: "nonexistent-spec-id",
          authorType: "human",
          authorName: "alice",
          body: "This should fail",
        }),
      ).rejects.toThrow();
    });

    test("throws when ticket does not exist", async () => {
      const t = convexTest(schema, modules);

      const projectId = await createProject(t, {
        name: "comments-test-project-4",
        repoPath: "/Users/joshua/Projects/comments-test-4",
      });

      // Try to add a comment to non-existent ticket
      await expect(
        t.mutation(api.workComments.addComment, {
          projectId,
          targetType: "ticket",
          targetId: "nonexistent-ticket-id",
          authorType: "human",
          authorName: "alice",
          body: "This should fail",
        }),
      ).rejects.toThrow();
    });

    test("throws when projectId does not match spec project", async () => {
      const t = convexTest(schema, modules);

      const projectA = await createProject(t, {
        name: "comments-proj-a",
        repoPath: "/Users/joshua/Projects/comments-proj-a",
      });
      const projectB = await createProject(t, {
        name: "comments-proj-b",
        repoPath: "/Users/joshua/Projects/comments-proj-b",
      });

      const specId = await t.mutation(api.specs.createSpec, {
        projectId: projectA,
        title: "Spec A",
        markdown: "# A",
      });

      await expect(
        t.mutation(api.workComments.addComment, {
          projectId: projectB,
          targetType: "spec",
          targetId: specId,
          authorType: "human",
          authorName: "alice",
          body: "Wrong project",
        }),
      ).rejects.toThrow("Project mismatch");
    });

    test("throws when projectId does not match ticket project", async () => {
      const t = convexTest(schema, modules);

      const projectA = await createProject(t, {
        name: "comments-ticket-a",
        repoPath: "/Users/joshua/Projects/comments-ticket-a",
      });
      const projectB = await createProject(t, {
        name: "comments-ticket-b",
        repoPath: "/Users/joshua/Projects/comments-ticket-b",
      });

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId: projectA,
        title: "Ticket A",
        description: "Owned by A",
        priority: "medium",
      });

      await expect(
        t.mutation(api.workComments.addComment, {
          projectId: projectB,
          targetType: "ticket",
          targetId: ticketId,
          authorType: "agent",
          authorName: "bot",
          body: "Wrong project",
        }),
      ).rejects.toThrow("Project mismatch");
    });
  });

  describe("listComments", () => {
    test("lists comments in chronological order", async () => {
      const t = convexTest(schema, modules);

      const projectId = await createProject(t, {
        name: "comments-test-project-5",
        repoPath: "/Users/joshua/Projects/comments-test-5",
      });

      // Create a spec
      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Test Spec 2",
        markdown: "# Test",
      });

      // Add multiple comments
      await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "spec",
        targetId: specId,
        authorType: "human",
        authorName: "alice",
        body: "First comment",
      });

      await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "spec",
        targetId: specId,
        authorType: "human",
        authorName: "bob",
        body: "Second comment",
      });

      await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "spec",
        targetId: specId,
        authorType: "agent",
        authorName: "claude",
        body: "Third comment",
      });

      // List comments
      const comments = await t.query(api.workComments.listComments, {
        targetType: "spec",
        targetId: specId,
      });

      expect(comments).toHaveLength(3);
      expect(comments[0].body).toBe("First comment");
      expect(comments[1].body).toBe("Second comment");
      expect(comments[2].body).toBe("Third comment");
    });

    test("returns empty list when no comments exist", async () => {
      const t = convexTest(schema, modules);

      const projectId = await createProject(t, {
        name: "comments-test-project-6",
        repoPath: "/Users/joshua/Projects/comments-test-6",
      });

      // Create a spec
      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Test Spec 3",
        markdown: "# Test",
      });

      // List comments for empty spec
      const comments = await t.query(api.workComments.listComments, {
        targetType: "spec",
        targetId: specId,
      });

      expect(comments).toHaveLength(0);
    });

    test("lists only comments for the specified target", async () => {
      const t = convexTest(schema, modules);

      const projectId = await createProject(t, {
        name: "comments-test-project-7",
        repoPath: "/Users/joshua/Projects/comments-test-7",
      });

      // Create two specs
      const spec1Id = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec 1",
        markdown: "# Design 1",
      });

      const spec2Id = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec 2",
        markdown: "# Design 2",
      });

      // Add comments to both
      await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "spec",
        targetId: spec1Id,
        authorType: "human",
        authorName: "alice",
        body: "Comment for spec 1",
      });

      await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "spec",
        targetId: spec2Id,
        authorType: "human",
        authorName: "bob",
        body: "Comment for spec 2",
      });

      // List comments for spec1
      const design1Comments = await t.query(api.workComments.listComments, {
        targetType: "spec",
        targetId: spec1Id,
      });

      expect(design1Comments).toHaveLength(1);
      expect(design1Comments[0].body).toBe("Comment for spec 1");
      expect(design1Comments[0].authorName).toBe("alice");
    });

    test("lists comments for a ticket in chronological order", async () => {
      const t = convexTest(schema, modules);

      const projectId = await createProject(t, {
        name: "comments-test-project-8",
        repoPath: "/Users/joshua/Projects/comments-test-8",
      });

      // Create a ticket
      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Test Ticket",
        description: "For comments",
        priority: "medium",
      });

      // Add multiple comments
      await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "ticket",
        targetId: ticketId,
        authorType: "human",
        authorName: "alice",
        body: "First comment",
      });

      await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "ticket",
        targetId: ticketId,
        authorType: "human",
        authorName: "bob",
        body: "Second comment",
      });

      await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "ticket",
        targetId: ticketId,
        authorType: "agent",
        authorName: "claude",
        body: "Third comment",
      });

      // List comments
      const comments = await t.query(api.workComments.listComments, {
        targetType: "ticket",
        targetId: ticketId,
      });

      expect(comments).toHaveLength(3);
      expect(comments[0].body).toBe("First comment");
      expect(comments[1].body).toBe("Second comment");
      expect(comments[2].body).toBe("Third comment");
    });
  });
});
