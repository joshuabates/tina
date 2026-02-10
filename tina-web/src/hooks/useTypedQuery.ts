import { useQuery } from "convex/react"
import type { FunctionReference } from "convex/server"
import type { QueryDef } from "@/services/data/queryDefs"
import { decodeOrThrow } from "@/services/data/decode"
import type { QueryValidationError } from "@/services/errors"

export type TypedQueryResult<A> =
  | { status: "loading" }
  | { status: "success"; data: A }
  | { status: "error"; error: unknown }

export function useTypedQuery<A, Args extends Record<string, unknown>>(
  def: QueryDef<A, Args>,
  args: Args,
): TypedQueryResult<A> {
  let parsedArgs: Args | null = null
  let argsError: QueryValidationError | null = null

  try {
    parsedArgs = decodeOrThrow(`${def.key}.args`, def.args, args)
  } catch (error) {
    argsError = error as QueryValidationError
  }

  const raw = useQuery(
    def.query as FunctionReference<"query">,
    parsedArgs ?? "skip",
  )

  if (argsError) {
    return { status: "error", error: argsError }
  }

  if (raw === undefined) return { status: "loading" }

  try {
    const data = decodeOrThrow(def.key, def.schema, raw)
    return { status: "success", data }
  } catch (error) {
    return { status: "error", error }
  }
}
