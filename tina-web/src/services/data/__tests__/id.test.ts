import { describe, it, expect } from "vitest"
import { toOrchestrationId, toProjectId } from "../id"
import { NotFoundError } from "../../errors"

describe("id helpers", () => {
  describe("toOrchestrationId", () => {
    it("returns ID for valid string", () => {
      const id = toOrchestrationId("j123abc")
      expect(id).toBe("j123abc")
    })

    it("throws NotFoundError for undefined", () => {
      expect(() => toOrchestrationId(undefined)).toThrow(NotFoundError)
    })

    it("throws NotFoundError for empty string", () => {
      expect(() => toOrchestrationId("")).toThrow(NotFoundError)
    })

    it("includes resource and id in error", () => {
      try {
        toOrchestrationId(undefined)
        expect.fail("Should have thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError)
        if (error instanceof NotFoundError) {
          expect(error.resource).toBe("orchestration")
          expect(error.id).toBe("")
        }
      }
    })
  })

  describe("toProjectId", () => {
    it("returns ID for valid string", () => {
      const id = toProjectId("k456def")
      expect(id).toBe("k456def")
    })

    it("throws NotFoundError for undefined", () => {
      expect(() => toProjectId(undefined)).toThrow(NotFoundError)
    })

    it("throws NotFoundError for empty string", () => {
      expect(() => toProjectId("")).toThrow(NotFoundError)
    })

    it("includes resource and id in error", () => {
      try {
        toProjectId(undefined)
        expect.fail("Should have thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError)
        if (error instanceof NotFoundError) {
          expect(error.resource).toBe("project")
          expect(error.id).toBe("")
        }
      }
    })
  })
})
