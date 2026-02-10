import { useQuery } from "convex/react"
import type { FunctionReference } from "convex/server"
import type { QueryDef } from "@/services/data/queryDefs"
import { decodeOrThrow } from "@/services/data/decode"

export type TypedQueryResult<A> =
  | { status: "loading" }
  | { status: "success"; data: A }
  | { status: "error"; error: unknown }

export function useTypedQuery<A, Args extends Record<string, unknown>>(
  def: QueryDef<A, Args>,
  args: Args,
): TypedQueryResult<A> {
  const raw = useQuery(def.query as FunctionReference<"query">, args)

  if (raw === undefined) return { status: "loading" }

  try {
    const data = decodeOrThrow(def.key, def.schema, raw)
    return { status: "success", data }
  } catch (error) {
    return { status: "error", error }
  }
}
