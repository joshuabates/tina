import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { createProject } from "./test_helpers";

describe("tickets", () => {
  describe("createTicket", () => {
    test("creates ticket with correct key format and allocates next number", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "TINA",
        repoPath: "/Users/joshua/Projects/tina",
      });

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Implement auth",
        description: "Add JWT authentication",
        priority: "high",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket).toBeDefined();
      expect(ticket?.ticketKey).toBe("TINA-1");
      expect(ticket?.title).toBe("Implement auth");
      expect(ticket?.description).toBe("Add JWT authentication");
      expect(ticket?.priority).toBe("high");
      expect(ticket?.status).toBe("todo");
      expect(ticket?.assignee).toBeUndefined();
      expect(ticket?.estimate).toBeUndefined();
      expect(ticket?.designId).toBeUndefined();
      expect(ticket?.closedAt).toBeUndefined();
    });

    test("allocates sequential keys for multiple tickets", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "PROJ",
        repoPath: "/Users/joshua/Projects/proj",
      });

      const ticket1Id = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task 1",
        description: "First task",
        priority: "medium",
      });

      const ticket2Id = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task 2",
        description: "Second task",
        priority: "medium",
      });

      const ticket1 = await t.query(api.tickets.getTicket, { ticketId: ticket1Id });
      const ticket2 = await t.query(api.tickets.getTicket, { ticketId: ticket2Id });

      expect(ticket1?.ticketKey).toBe("PROJ-1");
      expect(ticket2?.ticketKey).toBe("PROJ-2");
    });

    test("creates ticket with design reference", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "ARCH",
        repoPath: "/Users/joshua/Projects/arch",
      });

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "API Design",
        markdown: "# REST API",
      });

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        designId,
        title: "Implement endpoints",
        description: "Build API",
        priority: "high",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.designId).toBe(designId);
    });

    test("throws on non-existent designId", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);
      const fakeDesignId = (projectId as string).replace(
        "projects",
        "designs",
      ) as any;

      try {
        await t.mutation(api.tickets.createTicket, {
          projectId,
          designId: fakeDesignId,
          title: "Test",
          description: "Test",
          priority: "low",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Design not found");
      }
    });

    test("throws when design belongs to a different project", async () => {
      const t = convexTest(schema);
      const projectA = await createProject(t, {
        name: "PROJA",
        repoPath: "/Users/joshua/Projects/proja",
      });
      const projectB = await createProject(t, {
        name: "PROJB",
        repoPath: "/Users/joshua/Projects/projb",
      });

      const designFromB = await t.mutation(api.designs.createDesign, {
        projectId: projectB,
        title: "Design B",
        markdown: "# Design B",
      });

      await expect(
        t.mutation(api.tickets.createTicket, {
          projectId: projectA,
          designId: designFromB,
          title: "Cross project link",
          description: "Should be rejected",
          priority: "medium",
        }),
      ).rejects.toThrow("does not belong to project");
    });

    test("throws on missing project", async () => {
      const t = convexTest(schema);
      // Create a project to get a valid ID format
      const realProjectId = (await createProject(t)) as string;
      // Construct a non-existent projects ID by changing the numeric prefix
      // Format is like "10000;projectsX", so replace the number with a higher one
      const fakeProjectId = realProjectId.replace(/^\d+/, "999999999") as any;

      try {
        await t.mutation(api.tickets.createTicket, {
          projectId: fakeProjectId,
          title: "Test",
          description: "Test",
          priority: "low",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Project not found");
      }
    });
  });

  describe("getTicket", () => {
    test("returns null for non-existent ticket", async () => {
      const t = convexTest(schema);
      const fakeId = (await createProject(t)).replace("projects", "tickets");

      const ticket = await t.query(api.tickets.getTicket, { ticketId: fakeId as any });
      expect(ticket).toBeNull();
    });
  });

  describe("getTicketByKey", () => {
    test("looks up ticket by key", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "KEY",
        repoPath: "/Users/joshua/Projects/key",
      });

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Test ticket",
        description: "For lookup",
        priority: "low",
      });

      const ticket = await t.query(api.tickets.getTicketByKey, {
        ticketKey: "KEY-1",
      });

      expect(ticket?._id).toBe(ticketId);
      expect(ticket?.ticketKey).toBe("KEY-1");
    });

    test("returns null for non-existent key", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticket = await t.query(api.tickets.getTicketByKey, {
        ticketKey: "NONE-999",
      });

      expect(ticket).toBeNull();
    });
  });

  describe("listTickets", () => {
    test("lists all tickets for a project", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "LIST",
        repoPath: "/Users/joshua/Projects/list",
      });

      await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Ticket 1",
        description: "First",
        priority: "high",
      });

      await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Ticket 2",
        description: "Second",
        priority: "low",
      });

      const tickets = await t.query(api.tickets.listTickets, { projectId });
      expect(tickets).toHaveLength(2);
      expect(tickets.map((t: any) => t.title)).toEqual(
        expect.arrayContaining(["Ticket 1", "Ticket 2"]),
      );
    });

    test("filters by status", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "STAT",
        repoPath: "/Users/joshua/Projects/stat",
      });

      const ticket1Id = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Todo task",
        description: "Pending",
        priority: "medium",
      });

      const ticket2Id = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "In progress task",
        description: "Active",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId: ticket2Id,
        newStatus: "in_progress",
      });

      const todoTickets = await t.query(api.tickets.listTickets, {
        projectId,
        status: "todo",
      });

      const inProgressTickets = await t.query(api.tickets.listTickets, {
        projectId,
        status: "in_progress",
      });

      expect(todoTickets).toHaveLength(1);
      expect(todoTickets[0]?.title).toBe("Todo task");

      expect(inProgressTickets).toHaveLength(1);
      expect(inProgressTickets[0]?.title).toBe("In progress task");
    });

    test("filters by design", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "DSGN",
        repoPath: "/Users/joshua/Projects/dsgn",
      });

      const design1Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design A",
        markdown: "# Design A",
      });

      const design2Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design B",
        markdown: "# Design B",
      });

      await t.mutation(api.tickets.createTicket, {
        projectId,
        designId: design1Id,
        title: "Ticket for A",
        description: "Relates to A",
        priority: "medium",
      });

      await t.mutation(api.tickets.createTicket, {
        projectId,
        designId: design2Id,
        title: "Ticket for B",
        description: "Relates to B",
        priority: "medium",
      });

      await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Unrelated ticket",
        description: "No design",
        priority: "medium",
      });

      const ticketsForA = await t.query(api.tickets.listTickets, {
        projectId,
        designId: design1Id,
      });

      expect(ticketsForA).toHaveLength(1);
      expect(ticketsForA[0]?.title).toBe("Ticket for A");
    });

    test("design filter does not leak tickets from other projects", async () => {
      const t = convexTest(schema);
      const projectA = await createProject(t, {
        name: "LKA",
        repoPath: "/Users/joshua/Projects/lka",
      });
      const projectB = await createProject(t, {
        name: "LKB",
        repoPath: "/Users/joshua/Projects/lkb",
      });

      const designInB = await t.mutation(api.designs.createDesign, {
        projectId: projectB,
        title: "Project B design",
        markdown: "# B",
      });

      await t.mutation(api.tickets.createTicket, {
        projectId: projectB,
        designId: designInB,
        title: "Ticket in B",
        description: "Should stay in B",
        priority: "high",
      });

      const leaked = await t.query(api.tickets.listTickets, {
        projectId: projectA,
        designId: designInB,
      });

      expect(leaked).toHaveLength(0);
    });

    test("filters by assignee", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "ASGN",
        repoPath: "/Users/joshua/Projects/asgn",
      });

      const ticket1Id = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Alice's task",
        description: "For Alice",
        priority: "high",
        assignee: "alice",
      });

      const ticket2Id = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Bob's task",
        description: "For Bob",
        priority: "high",
        assignee: "bob",
      });

      const unassignedId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Unassigned",
        description: "No owner",
        priority: "medium",
      });

      const aliceTickets = await t.query(api.tickets.listTickets, {
        projectId,
        assignee: "alice",
      });

      expect(aliceTickets).toHaveLength(1);
      expect(aliceTickets[0]?.title).toBe("Alice's task");
    });

    test("returns empty array when no tickets exist", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "EMPTY",
        repoPath: "/Users/joshua/Projects/empty",
      });

      const tickets = await t.query(api.tickets.listTickets, { projectId });
      expect(tickets).toHaveLength(0);
    });

    test("isolates tickets by project", async () => {
      const t = convexTest(schema);
      const project1Id = await createProject(t, {
        name: "PROJ1",
        repoPath: "/Users/joshua/Projects/proj1",
      });

      const project2Id = await createProject(t, {
        name: "PROJ2",
        repoPath: "/Users/joshua/Projects/proj2",
      });

      await t.mutation(api.tickets.createTicket, {
        projectId: project1Id,
        title: "Proj1 ticket",
        description: "For project 1",
        priority: "high",
      });

      await t.mutation(api.tickets.createTicket, {
        projectId: project2Id,
        title: "Proj2 ticket",
        description: "For project 2",
        priority: "low",
      });

      const proj1Tickets = await t.query(api.tickets.listTickets, {
        projectId: project1Id,
      });

      const proj2Tickets = await t.query(api.tickets.listTickets, {
        projectId: project2Id,
      });

      expect(proj1Tickets).toHaveLength(1);
      expect(proj1Tickets[0]?.title).toBe("Proj1 ticket");

      expect(proj2Tickets).toHaveLength(1);
      expect(proj2Tickets[0]?.title).toBe("Proj2 ticket");
    });
  });

  describe("updateTicket", () => {
    test("updates title and description", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Original title",
        description: "Original description",
        priority: "low",
      });

      const beforeUpdate = await t.query(api.tickets.getTicket, { ticketId });
      const beforeTime = beforeUpdate?.updatedAt;

      // Small delay to ensure updatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      await t.mutation(api.tickets.updateTicket, {
        ticketId,
        title: "Updated title",
        description: "Updated description",
      });

      const afterUpdate = await t.query(api.tickets.getTicket, { ticketId });
      expect(afterUpdate?.title).toBe("Updated title");
      expect(afterUpdate?.description).toBe("Updated description");
      expect(afterUpdate?.updatedAt).not.toBe(beforeTime);
    });

    test("updates priority and assignee", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Desc",
        priority: "medium",
      });

      await t.mutation(api.tickets.updateTicket, {
        ticketId,
        priority: "urgent",
        assignee: "dev-team",
        estimate: "5d",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.priority).toBe("urgent");
      expect(ticket?.assignee).toBe("dev-team");
      expect(ticket?.estimate).toBe("5d");
    });

    test("partial updates only modify specified fields", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Original",
        description: "Desc",
        priority: "high",
        assignee: "alice",
      });

      await t.mutation(api.tickets.updateTicket, {
        ticketId,
        priority: "low",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.title).toBe("Original");
      expect(ticket?.assignee).toBe("alice");
      expect(ticket?.priority).toBe("low");
    });

    test("can unlink design with clearDesignId", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Linked design",
        markdown: "# Linked",
      });

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        designId,
        title: "Linked ticket",
        description: "Has design",
        priority: "medium",
      });

      await t.mutation(api.tickets.updateTicket, {
        ticketId,
        clearDesignId: true,
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.designId).toBeUndefined();
    });

    test("throws when update links design from another project", async () => {
      const t = convexTest(schema);
      const projectA = await createProject(t, {
        name: "UPA",
        repoPath: "/Users/joshua/Projects/upa",
      });
      const projectB = await createProject(t, {
        name: "UPB",
        repoPath: "/Users/joshua/Projects/upb",
      });

      const designFromB = await t.mutation(api.designs.createDesign, {
        projectId: projectB,
        title: "Design B",
        markdown: "# B",
      });

      const ticketInA = await t.mutation(api.tickets.createTicket, {
        projectId: projectA,
        title: "Ticket A",
        description: "In project A",
        priority: "low",
      });

      await expect(
        t.mutation(api.tickets.updateTicket, {
          ticketId: ticketInA,
          designId: designFromB,
        }),
      ).rejects.toThrow("does not belong to ticket project");
    });

    test("throws when both designId and clearDesignId are provided", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);
      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "# Design",
      });
      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Ticket",
        description: "Desc",
        priority: "medium",
      });

      await expect(
        t.mutation(api.tickets.updateTicket, {
          ticketId,
          designId,
          clearDesignId: true,
        }),
      ).rejects.toThrow("Cannot provide both designId and clearDesignId");
    });

    test("throws on missing ticket", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);
      const fakeTicketId = (projectId as string).replace(
        "projects",
        "tickets",
      ) as any;

      try {
        await t.mutation(api.tickets.updateTicket, {
          ticketId: fakeTicketId,
          title: "Updated",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Ticket not found");
      }
    });
  });

  describe("transitionTicket", () => {
    test("transitions todo -> in_progress", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_progress",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.status).toBe("in_progress");
    });

    test("transitions todo -> blocked", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "blocked",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.status).toBe("blocked");
    });

    test("transitions todo -> canceled", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "canceled",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.status).toBe("canceled");
      expect(ticket?.closedAt).toBeDefined();
    });

    test("transitions in_progress -> in_review", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_progress",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_review",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.status).toBe("in_review");
    });

    test("transitions in_review -> done and sets closedAt", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_progress",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_review",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "done",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.status).toBe("done");
      expect(ticket?.closedAt).toBeDefined();
    });

    test("transitions in_review -> in_progress (rework)", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_progress",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_review",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_progress",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.status).toBe("in_progress");
    });

    test("transitions done -> todo (reopen) and clears closedAt", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_progress",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_review",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "done",
      });

      const beforeReopen = await t.query(api.tickets.getTicket, { ticketId });
      expect(beforeReopen?.closedAt).toBeDefined();

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "todo",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.status).toBe("todo");
      expect(ticket?.closedAt).toBeUndefined();
    });

    test("transitions canceled -> todo (reopen)", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "canceled",
      });

      const canceled = await t.query(api.tickets.getTicket, { ticketId });
      expect(canceled?.closedAt).toBeDefined();

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "todo",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.status).toBe("todo");
      expect(ticket?.closedAt).toBeUndefined();
    });

    test("transitions in_progress -> blocked", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_progress",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "blocked",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.status).toBe("blocked");
    });

    test("transitions blocked -> in_progress", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "blocked",
      });

      await t.mutation(api.tickets.transitionTicket, {
        ticketId,
        newStatus: "in_progress",
      });

      const ticket = await t.query(api.tickets.getTicket, { ticketId });
      expect(ticket?.status).toBe("in_progress");
    });

    test("throws on missing ticket", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);
      const fakeTicketId = (projectId as string).replace(
        "projects",
        "tickets",
      ) as any;

      try {
        await t.mutation(api.tickets.transitionTicket, {
          ticketId: fakeTicketId,
          newStatus: "in_progress",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Ticket not found");
      }
    });

    test("rejects invalid transitions", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const ticketId = await t.mutation(api.tickets.createTicket, {
        projectId,
        title: "Task",
        description: "Work",
        priority: "medium",
      });

      // todo can't transition to done directly
      try {
        await t.mutation(api.tickets.transitionTicket, {
          ticketId,
          newStatus: "done",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Invalid status transition");
      }
    });
  });
});
