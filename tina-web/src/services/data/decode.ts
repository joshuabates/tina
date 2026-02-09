import { Schema, Either, ParseResult } from "effect"
import { QueryValidationError } from "../errors"

export function decodeOrThrow<A>(queryKey: string, schema: Schema.Schema<A>, raw: unknown): A {
  const result = Schema.decodeUnknownEither(schema)(raw)
  if (Either.isRight(result)) return result.right
  throw new QueryValidationError({
    query: queryKey,
    message: ParseResult.TreeFormatter.formatErrorSync(result.left),
  })
}
