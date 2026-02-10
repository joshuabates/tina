import type { TypedQueryResult } from "@/hooks/useTypedQuery"

type AnyQueryResult = TypedQueryResult<unknown>

export function isAnyQueryLoading(...results: readonly AnyQueryResult[]): boolean {
  return results.some((result) => result.status === "loading")
}

export function firstQueryError(
  ...results: readonly AnyQueryResult[]
): unknown | undefined {
  const errorResult = results.find(
    (result): result is Extract<AnyQueryResult, { status: "error" }> =>
      result.status === "error",
  )
  return errorResult?.error
}

export function matchQueryResult<A, R>(
  result: TypedQueryResult<A>,
  branches: {
    loading: () => R
    error: (error: unknown) => R
    success: (data: A) => R
  },
): R {
  switch (result.status) {
    case "loading":
      return branches.loading()
    case "error":
      return branches.error(result.error)
    case "success":
      return branches.success(result.data)
  }
}
