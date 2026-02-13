import { describe, it, expect } from "vitest"
import {
  toStatusBadgeStatus,
  statusLabel,
  statusTextClass,
  statusBadgeClass,
  priorityLabel,
  priorityTextClass,
} from "../status-styles"

describe("status-styles", () => {
  describe("design statuses", () => {
    it("maps draft to a valid status with neutral styling", () => {
      const status = toStatusBadgeStatus("draft")
      expect(status).toBe("draft")
      expect(statusLabel(status)).toBe("Draft")
      expect(statusTextClass(status)).toContain("text-")
    })

    it("maps in_review to a valid status with info styling", () => {
      const status = toStatusBadgeStatus("in_review")
      expect(status).toBe("in_review")
      expect(statusLabel(status)).toBe("In Review")
    })

    it("maps approved to a valid status with success styling", () => {
      const status = toStatusBadgeStatus("approved")
      expect(status).toBe("approved")
      expect(statusLabel(status)).toBe("Approved")
      expect(statusTextClass(status)).toContain("complete")
    })

    it("maps archived to a valid status with muted styling", () => {
      const status = toStatusBadgeStatus("archived")
      expect(status).toBe("archived")
      expect(statusLabel(status)).toBe("Archived")
      expect(statusTextClass(status)).toContain("muted")
    })
  })

  describe("ticket statuses", () => {
    it("maps todo to a valid status with neutral styling", () => {
      const status = toStatusBadgeStatus("todo")
      expect(status).toBe("todo")
      expect(statusLabel(status)).toBe("Todo")
    })

    it("maps in_progress to an existing status", () => {
      const status = toStatusBadgeStatus("in_progress")
      expect(status).toBe("in_progress")
      expect(statusLabel(status)).toBe("In Progress")
    })

    it("maps in_review to a valid status", () => {
      const status = toStatusBadgeStatus("in_review")
      expect(status).toBe("in_review")
      expect(statusLabel(status)).toBe("In Review")
    })

    it("maps blocked to an existing status", () => {
      const status = toStatusBadgeStatus("blocked")
      expect(status).toBe("blocked")
      expect(statusLabel(status)).toBe("Blocked")
    })

    it("maps done to an existing status", () => {
      const status = toStatusBadgeStatus("done")
      expect(status).toBe("done")
      expect(statusLabel(status)).toBe("Done")
    })

    it("maps canceled to a valid status with muted styling", () => {
      const status = toStatusBadgeStatus("canceled")
      expect(status).toBe("canceled")
      expect(statusLabel(status)).toBe("Canceled")
      expect(statusTextClass(status)).toContain("muted")
    })
  })

  describe("toStatusBadgeStatus normalization", () => {
    it("normalizes hyphens to underscores", () => {
      expect(toStatusBadgeStatus("in-review")).toBe("in_review")
      expect(toStatusBadgeStatus("in-progress")).toBe("in_progress")
    })

    it("normalizes case", () => {
      expect(toStatusBadgeStatus("DRAFT")).toBe("draft")
      expect(toStatusBadgeStatus("In Review")).toBe("in_review")
    })

    it("falls back for unknown statuses", () => {
      const status = toStatusBadgeStatus("nonexistent")
      expect(statusLabel(status)).toBeTruthy()
    })
  })

  describe("review statuses", () => {
    it("maps open to a valid status with executing styling", () => {
      const status = toStatusBadgeStatus("open")
      expect(status).toBe("open")
      expect(statusLabel(status)).toBe("Open")
      expect(statusTextClass(status)).toContain("executing")
    })

    it("maps changes_requested to a valid status with warning styling", () => {
      const status = toStatusBadgeStatus("changes_requested")
      expect(status).toBe("changes_requested")
      expect(statusLabel(status)).toBe("Changes Requested")
      expect(statusTextClass(status)).toContain("warning")
    })

    it("maps superseded to a valid status with muted styling", () => {
      const status = toStatusBadgeStatus("superseded")
      expect(status).toBe("superseded")
      expect(statusLabel(status)).toBe("Superseded")
      expect(statusTextClass(status)).toContain("muted")
    })

    it("normalizes changes-requested with hyphens", () => {
      expect(toStatusBadgeStatus("changes-requested")).toBe("changes_requested")
    })
  })

  describe("all new statuses produce valid badge classes", () => {
    const pmStatuses = ["draft", "in_review", "approved", "archived", "todo", "canceled", "open", "changes_requested", "superseded"]

    for (const raw of pmStatuses) {
      it(`${raw} has non-empty badge class`, () => {
        const status = toStatusBadgeStatus(raw)
        expect(statusBadgeClass(status)).toBeTruthy()
      })
    }
  })

  describe("priorityLabel", () => {
    it("returns Low for low", () => {
      expect(priorityLabel("low")).toBe("Low")
    })

    it("returns Medium for medium", () => {
      expect(priorityLabel("medium")).toBe("Medium")
    })

    it("returns High for high", () => {
      expect(priorityLabel("high")).toBe("High")
    })

    it("returns Urgent for urgent", () => {
      expect(priorityLabel("urgent")).toBe("Urgent")
    })

    it("returns input for unknown priority", () => {
      expect(priorityLabel("unknown")).toBe("unknown")
    })
  })

  describe("priorityTextClass", () => {
    it("returns muted class for low priority", () => {
      expect(priorityTextClass("low")).toContain("muted")
    })

    it("returns neutral class for medium priority", () => {
      const cls = priorityTextClass("medium")
      expect(cls).toContain("text-")
    })

    it("returns warning class for high priority", () => {
      expect(priorityTextClass("high")).toContain("warning")
    })

    it("returns error/blocked class for urgent priority", () => {
      expect(priorityTextClass("urgent")).toContain("blocked")
    })

    it("returns fallback for unknown priority", () => {
      expect(priorityTextClass("unknown")).toContain("text-")
    })
  })
})
