import { describe, it, expect, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { Schema } from "effect"
import { useTypedQuery } from "../useTypedQuery"
import type { QueryDef } from "@/services/data/queryDefs"
import { QueryValidationError } from "@/services/errors"

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}))

import { useQuery } from "convex/react"
const mockUseQuery = vi.mocked(useQuery)

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

const arrayQueryDef: QueryDef<Array<{ id: string; name: string }>> = {
  key: "test.array.query",
  query: "api.test.arrayQuery" as any,
  args: Schema.Struct({}),
  schema: Schema.Array(TestSchema) as any,
}

function runQuery<A, Args extends Record<string, unknown> = Record<string, unknown>>(
  data: unknown,
  queryDef: QueryDef<A, Args> = testQueryDef as unknown as QueryDef<A, Args>,
  args = {} as Args,
) {
  mockUseQuery.mockReturnValue(data as any)
  const { result } = renderHook(() => useTypedQuery(queryDef, args))
  return result.current
}

function expectValidationError(result: ReturnType<typeof runQuery>) {
  expect(result.status).toBe("error")
  if (result.status === "error") {
    expect(result.error).toBeInstanceOf(QueryValidationError)
  }
}

describe("useTypedQuery", () => {
  it("returns loading state when useQuery returns undefined", () => {
    expect(runQuery(undefined)).toEqual({ status: "loading" })
  })

  it("returns success state with decoded data for valid response", () => {
    const validData = { id: "123", name: "Test" }
    expect(runQuery(validData)).toEqual({ status: "success", data: validData })
  })

  it.each([
    { label: "invalid field type", data: { id: "123", name: 123 } },
    { label: "missing required fields", data: { id: "123" } },
    { label: "completely invalid shape", data: "not an object" },
    { label: "null", data: null },
  ])("returns QueryValidationError for $label", ({ data }) => {
    expectValidationError(runQuery(data))
  })

  it("includes query key in validation error", () => {
    const result = runQuery({ id: "123", name: 456 })

    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error).toBeInstanceOf(QueryValidationError)
      if (result.error instanceof QueryValidationError) {
        expect(result.error.query).toBe("test.query")
      }
    }
  })

  it("works with array schemas", () => {
    const validData = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]

    expect(runQuery(validData, arrayQueryDef)).toEqual({
      status: "success",
      data: validData,
    })
  })

  it("handles invalid array data", () => {
    expectValidationError(
      runQuery(
        [
          { id: "1", name: "Alice" },
          { id: "2", name: 123 },
        ],
        arrayQueryDef,
      ),
    )
  })

  it("passes args to useQuery", () => {
    const queryDefWithArgs: QueryDef<{ id: string; name: string }, { userId: string }> = {
      key: "test.query.with.args",
      query: "api.test.queryWithArgs" as any,
      args: Schema.Struct({ userId: Schema.String }),
      schema: TestSchema,
    }

    const args = { userId: "user-123" }
    runQuery({ id: "123", name: "Test" }, queryDefWithArgs, args)

    expect(mockUseQuery).toHaveBeenCalledWith("api.test.queryWithArgs", args)
  })

  it("returns error when args validation fails", () => {
    const queryDefWithArgs: QueryDef<{ id: string; name: string }, { userId: string }> = {
      key: "test.query.with.args",
      query: "api.test.queryWithArgs" as any,
      args: Schema.Struct({ userId: Schema.String }),
      schema: TestSchema,
    }

    const result = runQuery({ id: "123", name: "Test" }, queryDefWithArgs, {
      userId: 123 as unknown as string,
    })

    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error).toBeInstanceOf(QueryValidationError)
    }
  })

  it("maintains loading shape across rerenders", () => {
    mockUseQuery.mockReturnValue(undefined)

    const { result, rerender } = renderHook(() => useTypedQuery(testQueryDef, {}))
    const firstResult = result.current
    rerender()

    expect(firstResult).toEqual({ status: "loading" })
    expect(result.current).toEqual({ status: "loading" })
  })
})
