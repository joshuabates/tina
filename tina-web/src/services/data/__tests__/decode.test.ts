import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import { decodeOrThrow } from "../decode"
import { QueryValidationError } from "../../errors"

describe("decode", () => {
  describe("decodeOrThrow", () => {
    const TestSchema = Schema.Struct({
      name: Schema.String,
      age: Schema.Number,
    })

    it("returns decoded value for valid data", () => {
      const validData = { name: "Alice", age: 30 }
      const result = decodeOrThrow("test.query", TestSchema, validData)

      expect(result).toEqual({ name: "Alice", age: 30 })
    })

    it("throws QueryValidationError for invalid data", () => {
      const invalidData = { name: "Bob", age: "not a number" }

      expect(() => {
        decodeOrThrow("test.query", TestSchema, invalidData)
      }).toThrow(QueryValidationError)
    })

    it("includes query key in error", () => {
      const invalidData = { name: "Charlie", age: "invalid" }

      try {
        decodeOrThrow("my.test.query", TestSchema, invalidData)
        expect.fail("Should have thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(QueryValidationError)
        if (error instanceof QueryValidationError) {
          expect(error.query).toBe("my.test.query")
        }
      }
    })

    it("includes formatted error message", () => {
      const invalidData = { name: 123, age: "not a number" }

      try {
        decodeOrThrow("test.query", TestSchema, invalidData)
        expect.fail("Should have thrown")
      } catch (error) {
        expect(error).toBeInstanceOf(QueryValidationError)
        if (error instanceof QueryValidationError) {
          expect(error.message).toBeDefined()
          expect(error.message.length).toBeGreaterThan(0)
        }
      }
    })

    it("handles missing required fields", () => {
      const invalidData = { name: "Dave" }

      expect(() => {
        decodeOrThrow("test.query", TestSchema, invalidData)
      }).toThrow(QueryValidationError)
    })

    it("handles completely invalid data", () => {
      const invalidData = "not an object"

      expect(() => {
        decodeOrThrow("test.query", TestSchema, invalidData)
      }).toThrow(QueryValidationError)
    })

    it("handles null and undefined", () => {
      expect(() => {
        decodeOrThrow("test.query", TestSchema, null)
      }).toThrow(QueryValidationError)

      expect(() => {
        decodeOrThrow("test.query", TestSchema, undefined)
      }).toThrow(QueryValidationError)
    })

    it("works with array schemas", () => {
      const ArraySchema = Schema.Array(TestSchema)
      const validData = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ]

      const result = decodeOrThrow("test.array.query", ArraySchema, validData)
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe("Alice")
    })

    it("throws for invalid array data", () => {
      const ArraySchema = Schema.Array(TestSchema)
      const invalidData = [{ name: "Alice", age: 30 }, { name: "Bob", age: "invalid" }]

      expect(() => {
        decodeOrThrow("test.array.query", ArraySchema, invalidData)
      }).toThrow(QueryValidationError)
    })
  })
})
