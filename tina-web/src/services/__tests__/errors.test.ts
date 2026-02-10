import { describe, it, expect } from "vitest"
import {
  QueryValidationError,
  NotFoundError,
  PermissionError,
  TransientDataError,
} from "../errors"

describe("errors", () => {
  describe("QueryValidationError", () => {
    it("constructs with query and message fields", () => {
      const error = new QueryValidationError({
        query: "orchestrations.list",
        message: "Invalid schema",
      })

      expect(error._tag).toBe("QueryValidationError")
      expect(error.query).toBe("orchestrations.list")
      expect(error.message).toBe("Invalid schema")
    })
  })

  describe("NotFoundError", () => {
    it("constructs with resource and id fields", () => {
      const error = new NotFoundError({
        resource: "orchestration",
        id: "abc123",
      })

      expect(error._tag).toBe("NotFoundError")
      expect(error.resource).toBe("orchestration")
      expect(error.id).toBe("abc123")
    })
  })

  describe("PermissionError", () => {
    it("constructs with message field", () => {
      const error = new PermissionError({
        message: "Access denied",
      })

      expect(error._tag).toBe("PermissionError")
      expect(error.message).toBe("Access denied")
    })
  })

  describe("TransientDataError", () => {
    it("constructs with query and message fields", () => {
      const error = new TransientDataError({
        query: "events.list",
        message: "Temporary connection issue",
      })

      expect(error._tag).toBe("TransientDataError")
      expect(error.query).toBe("events.list")
      expect(error.message).toBe("Temporary connection issue")
    })
  })
})
