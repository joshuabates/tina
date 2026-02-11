import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { createProject } from "./test_helpers";

describe("workComments", () => {
  describe("addComment", () => {
    test("adds a comment to a design and returns comment id", async () => {
      const t = convexTest(schema);

      const projectId = await createProject(t, {
        name: "comments-test-project",
        repoPath: "/Users/joshua/Projects/comments-test",
      });

      // Create a design
      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Test Design",
        markdown: "# Test",
      });

      // Add a comment
      const commentId = await t.mutation(api.workComments.addComment, {
        projectId,
        targetType: "design",
        targetId: designId,
        authorType: "human",
        authorName: "alice",
        body: "This design looks good",
      });

      expect(commentId).toBeDefined();

      // Verify the comment was saved
      const comments = await t.query(api.workComments.listComments, {
        targetType: "design",
        targetId: designId,
      });

      expect(comments).toHaveLength(1);
      expect(comments[0].authorName).toBe("alice");
      expect(comments[0].body).toBe("This design looks good");
      expect(comments[0].authorType).toBe("human");
    });

    test("adds a comment to a ticket and returns comment id", async () => {
      const t = convexTest(schema);

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

    test("throws when design does not exist", async () => {
      const t = convexTest(schema);

      const projectId = await createProject(t, {
        name: "comments-test-project-3",
        repoPath: "/Users/joshua/Projects/comments-test-3",
      });

      // Try to add a comment to non-existent design
      await expect(
        t.mutation(internal.workComments.addComment, {
          projectId,
          targetType: "design",
          targetId: "nonexistent-design-id",
          authorType: "human",
          authorName: "alice",
          body: "This should fail",
        }),
      ).rejects.toThrow();
    });

    test("throws when ticket does not exist", async () => {
      const t = convexTest(schema);

      const projectId = await createProject(t, {
        name: "comments-test-project-4",
        repoPath: "/Users/joshua/Projects/comments-test-4",
      });

      // Try to add a comment to non-existent ticket
      await expect(
        t.mutation(internal.workComments.addComment, {
          projectId,
          targetType: "ticket",
          targetId: "nonexistent-ticket-id",
          authorType: "human",
          authorName: "alice",
          body: "This should fail",
        }),
      ).rejects.toThrow();
    });
  });

  describe("listComments", () => {
    test("lists comments in chronological order", async () => {
      const t = convexTest(schema);

      const projectId = await createProject(t, {
        name: "comments-test-project-5",
        repoPath: "/Users/joshua/Projects/comments-test-5",
      });

      // Create a design
      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Test Design 2",
        markdown: "# Test",
      });

      // Add multiple comments
      await t.mutation(internal.workComments.addComment, {
        projectId,
        targetType: "design",
        targetId: designId,
        authorType: "human",
        authorName: "alice",
        body: "First comment",
      });

      await t.mutation(internal.workComments.addComment, {
        projectId,
        targetType: "design",
        targetId: designId,
        authorType: "human",
        authorName: "bob",
        body: "Second comment",
      });

      await t.mutation(internal.workComments.addComment, {
        projectId,
        targetType: "design",
        targetId: designId,
        authorType: "agent",
        authorName: "claude",
        body: "Third comment",
      });

      // List comments
      const comments = await t.query(api.workComments.listComments, {
        targetType: "design",
        targetId: designId,
      });

      expect(comments).toHaveLength(3);
      expect(comments[0].body).toBe("First comment");
      expect(comments[1].body).toBe("Second comment");
      expect(comments[2].body).toBe("Third comment");
    });

    test("returns empty list when no comments exist", async () => {
      const t = convexTest(schema);

      const projectId = await createProject(t, {
        name: "comments-test-project-6",
        repoPath: "/Users/joshua/Projects/comments-test-6",
      });

      // Create a design
      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Test Design 3",
        markdown: "# Test",
      });

      // List comments for empty design
      const comments = await t.query(api.workComments.listComments, {
        targetType: "design",
        targetId: designId,
      });

      expect(comments).toHaveLength(0);
    });

    test("lists only comments for the specified target", async () => {
      const t = convexTest(schema);

      const projectId = await createProject(t, {
        name: "comments-test-project-7",
        repoPath: "/Users/joshua/Projects/comments-test-7",
      });

      // Create two designs
      const design1Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design 1",
        markdown: "# Design 1",
      });

      const design2Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design 2",
        markdown: "# Design 2",
      });

      // Add comments to both
      await t.mutation(internal.workComments.addComment, {
        projectId,
        targetType: "design",
        targetId: design1Id,
        authorType: "human",
        authorName: "alice",
        body: "Comment for design 1",
      });

      await t.mutation(internal.workComments.addComment, {
        projectId,
        targetType: "design",
        targetId: design2Id,
        authorType: "human",
        authorName: "bob",
        body: "Comment for design 2",
      });

      // List comments for design1
      const design1Comments = await t.query(internal.workComments.listComments, {
        targetType: "design",
        targetId: design1Id,
      });

      expect(design1Comments).toHaveLength(1);
      expect(design1Comments[0].body).toBe("Comment for design 1");
      expect(design1Comments[0].authorName).toBe("alice");
    });

    test("lists comments for a ticket in chronological order", async () => {
      const t = convexTest(schema);

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
      await t.mutation(internal.workComments.addComment, {
        projectId,
        targetType: "ticket",
        targetId: ticketId,
        authorType: "human",
        authorName: "alice",
        body: "First comment",
      });

      await t.mutation(internal.workComments.addComment, {
        projectId,
        targetType: "ticket",
        targetId: ticketId,
        authorType: "human",
        authorName: "bob",
        body: "Second comment",
      });

      await t.mutation(internal.workComments.addComment, {
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
