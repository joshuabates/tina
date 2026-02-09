import { describe, it, expect, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { Schema } from "effect"
import { useTypedQuery } from "../useTypedQuery"
import type { QueryDef } from "@/services/data/queryDefs"
import { QueryValidationError } from "@/services/errors"

// Mock convex/react
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}))

import { useQuery } from "convex/react"
const mockUseQuery = vi.mocked(useQuery)

describe("useTypedQuery", () => {
  const TestSchema = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  })

  const testQueryDef: QueryDef<{ id: string; name: string }> = {
    key: "test.query",
    query: "api.test.query" as any,
    args: Schema.Struct({}),
    schema: TestSchema,
  }

  it("returns loading state when useQuery returns undefined", () => {
    mockUseQuery.mockReturnValue(undefined)

    const { result } = renderHook(() => useTypedQuery(testQueryDef, {}))

    expect(result.current).toEqual({ status: "loading" })
  })

  it("returns success state with decoded data for valid response", () => {
    const validData = { id: "123", name: "Test" }
    mockUseQuery.mockReturnValue(validData)

    const { result } = renderHook(() => useTypedQuery(testQueryDef, {}))

    expect(result.current).toEqual({
      status: "success",
      data: validData,
    })
  })

  it("returns error state when decode fails", () => {
    const invalidData = { id: "123", name: 123 } // name should be string
    mockUseQuery.mockReturnValue(invalidData)

    const { result } = renderHook(() => useTypedQuery(testQueryDef, {}))

    expect(result.current.status).toBe("error")
    if (result.current.status === "error") {
      expect(result.current.error).toBeInstanceOf(QueryValidationError)
    }
  })

  it("includes query key in validation error", () => {
    const invalidData = { id: "123", name: 456 }
    mockUseQuery.mockReturnValue(invalidData)

    const { result } = renderHook(() => useTypedQuery(testQueryDef, {}))

    expect(result.current.status).toBe("error")
    if (result.current.status === "error") {
      const error = result.current.error
      expect(error).toBeInstanceOf(QueryValidationError)
      if (error instanceof QueryValidationError) {
        expect(error.query).toBe("test.query")
      }
    }
  })

  it("handles missing required fields", () => {
    const invalidData = { id: "123" } // missing name
    mockUseQuery.mockReturnValue(invalidData)

    const { result } = renderHook(() => useTypedQuery(testQueryDef, {}))

    expect(result.current.status).toBe("error")
    if (result.current.status === "error") {
      expect(result.current.error).toBeInstanceOf(QueryValidationError)
    }
  })

  it("handles completely invalid data", () => {
    mockUseQuery.mockReturnValue("not an object")

    const { result } = renderHook(() => useTypedQuery(testQueryDef, {}))

    expect(result.current.status).toBe("error")
    if (result.current.status === "error") {
      expect(result.current.error).toBeInstanceOf(QueryValidationError)
    }
  })

  it("handles null from useQuery", () => {
    mockUseQuery.mockReturnValue(null)

    const { result } = renderHook(() => useTypedQuery(testQueryDef, {}))

    expect(result.current.status).toBe("error")
    if (result.current.status === "error") {
      expect(result.current.error).toBeInstanceOf(QueryValidationError)
    }
  })

  it("works with array schemas", () => {
    const ArraySchema = Schema.Array(TestSchema)
    const arrayQueryDef: QueryDef<Array<{ id: string; name: string }>> = {
      key: "test.array.query",
      query: "api.test.arrayQuery" as any,
      args: Schema.Struct({}),
      schema: ArraySchema as any,
    }

    const validData = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]
    mockUseQuery.mockReturnValue(validData)

    const { result } = renderHook(() => useTypedQuery(arrayQueryDef, {}))

    expect(result.current).toEqual({
      status: "success",
      data: validData,
    })
  })

  it("handles invalid array data", () => {
    const ArraySchema = Schema.Array(TestSchema)
    const arrayQueryDef: QueryDef<Array<{ id: string; name: string }>> = {
      key: "test.array.query",
      query: "api.test.arrayQuery" as any,
      args: Schema.Struct({}),
      schema: ArraySchema as any,
    }

    const invalidData = [
      { id: "1", name: "Alice" },
      { id: "2", name: 123 }, // invalid name type
    ]
    mockUseQuery.mockReturnValue(invalidData)

    const { result } = renderHook(() => useTypedQuery(arrayQueryDef, {}))

    expect(result.current.status).toBe("error")
    if (result.current.status === "error") {
      expect(result.current.error).toBeInstanceOf(QueryValidationError)
    }
  })

  it("passes args to useQuery", () => {
    const queryDefWithArgs: QueryDef<
      { id: string; name: string },
      { userId: string }
    > = {
      key: "test.query.with.args",
      query: "api.test.queryWithArgs" as any,
      args: Schema.Struct({ userId: Schema.String }),
      schema: TestSchema,
    }

    const args = { userId: "user-123" }
    const validData = { id: "123", name: "Test" }
    mockUseQuery.mockReturnValue(validData)

    renderHook(() => useTypedQuery(queryDefWithArgs, args))

    expect(mockUseQuery).toHaveBeenCalledWith("api.test.queryWithArgs", args)
  })

  it("maintains referential stability for loading state", () => {
    mockUseQuery.mockReturnValue(undefined)

    const { result, rerender } = renderHook(() => useTypedQuery(testQueryDef, {}))

    const firstResult = result.current
    rerender()
    const secondResult = result.current

    // Both should be loading, but we don't guarantee same object reference
    expect(firstResult).toEqual({ status: "loading" })
    expect(secondResult).toEqual({ status: "loading" })
  })
})
