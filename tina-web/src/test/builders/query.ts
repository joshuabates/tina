import type { TypedQueryResult } from "@/hooks/useTypedQuery"

export function queryLoading<A>(): TypedQueryResult<A> {
  return { status: "loading" }
}

export function querySuccess<A>(data: A): TypedQueryResult<A> {
  return { status: "success", data }
}

export function queryError<A>(error: unknown): TypedQueryResult<A> {
  return { status: "error", error }
}

export type QueryStateMap = Readonly<Record<string, TypedQueryResult<unknown>>>

export function queryStateFor<A>(
  key: string,
  map: QueryStateMap,
): TypedQueryResult<A> {
  const state = map[key] as TypedQueryResult<A> | undefined
  return state ?? queryLoading<A>()
}
