import { describe, it, expect } from "vitest"
import { OrchestrationStatus, PhaseStatus, TaskStatus } from "../status"

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
