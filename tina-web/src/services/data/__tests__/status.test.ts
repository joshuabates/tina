import { describe, it, expect } from "vitest"
import {
  OrchestrationStatus,
  PhaseStatus,
  TaskStatus,
  normalizeStatus,
  statusColor,
} from "../status"

describe("status constants", () => {
  describe("OrchestrationStatus", () => {
    it("has Planning constant", () => {
      expect(OrchestrationStatus.Planning).toBe("planning")
    })

    it("has Executing constant", () => {
      expect(OrchestrationStatus.Executing).toBe("executing")
    })

    it("has Reviewing constant", () => {
      expect(OrchestrationStatus.Reviewing).toBe("reviewing")
    })

    it("has Complete constant", () => {
      expect(OrchestrationStatus.Complete).toBe("complete")
    })

    it("has Blocked constant", () => {
      expect(OrchestrationStatus.Blocked).toBe("blocked")
    })
  })

  describe("PhaseStatus", () => {
    it("has Pending constant", () => {
      expect(PhaseStatus.Pending).toBe("pending")
    })

    it("has Planning constant", () => {
      expect(PhaseStatus.Planning).toBe("planning")
    })

    it("has Executing constant", () => {
      expect(PhaseStatus.Executing).toBe("executing")
    })

    it("has Reviewing constant", () => {
      expect(PhaseStatus.Reviewing).toBe("reviewing")
    })

    it("has Complete constant", () => {
      expect(PhaseStatus.Complete).toBe("complete")
    })

    it("has Failed constant", () => {
      expect(PhaseStatus.Failed).toBe("failed")
    })
  })

  describe("TaskStatus", () => {
    it("has Pending constant", () => {
      expect(TaskStatus.Pending).toBe("pending")
    })

    it("has InProgress constant", () => {
      expect(TaskStatus.InProgress).toBe("in_progress")
    })

    it("has Completed constant", () => {
      expect(TaskStatus.Completed).toBe("completed")
    })

    it("has Blocked constant", () => {
      expect(TaskStatus.Blocked).toBe("blocked")
    })
  })
})

describe("normalizeStatus", () => {
  it("capitalizes first letter and lowercases rest", () => {
    expect(normalizeStatus("executing")).toBe("Executing")
    expect(normalizeStatus("EXECUTING")).toBe("Executing")
    expect(normalizeStatus("complete")).toBe("Complete")
    expect(normalizeStatus("COMPLETE")).toBe("Complete")
  })

  it("handles single character strings", () => {
    expect(normalizeStatus("a")).toBe("A")
  })

  it("handles empty strings", () => {
    expect(normalizeStatus("")).toBe("")
  })
})

describe("statusColor", () => {
  it("returns correct color for executing status", () => {
    expect(statusColor("executing")).toBe("text-status-active")
    expect(statusColor("Executing")).toBe("text-status-active")
    expect(statusColor("EXECUTING")).toBe("text-status-active")
  })

  it("returns correct color for complete status", () => {
    expect(statusColor("complete")).toBe("text-status-complete")
    expect(statusColor("Complete")).toBe("text-status-complete")
  })

  it("returns correct color for blocked status", () => {
    expect(statusColor("blocked")).toBe("text-status-blocked")
    expect(statusColor("Blocked")).toBe("text-status-blocked")
  })

  it("returns correct color for reviewing status", () => {
    expect(statusColor("reviewing")).toBe("text-status-review")
    expect(statusColor("Reviewing")).toBe("text-status-review")
  })

  it("returns default color for unknown status", () => {
    expect(statusColor("planning")).toBe("text-muted-foreground")
    expect(statusColor("unknown")).toBe("text-muted-foreground")
    expect(statusColor("")).toBe("text-muted-foreground")
  })
})
