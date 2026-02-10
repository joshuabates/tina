import { useMemo } from "react";
import { useQuery } from "convex/react";

type QueryArgs = Record<string, unknown>;

export interface QueryDef<TArgs extends QueryArgs, TResult> {
  readonly key: string;
  readonly query: unknown;
  readonly mapArgs?: (args: TArgs) => QueryArgs;
  readonly decode: (raw: unknown) => TResult;
}

export class QueryDecodeError extends Error {
  readonly queryKey: string;

  constructor(queryKey: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : "unknown cause";
    super(`${queryKey}: decode failed (${detail})`);
    this.name = "QueryDecodeError";
    this.queryKey = queryKey;
  }
}

/**
 * Review draft:
 * - Compatible with the current Convex package in this repo.
 * - Call sites never cast Convex data directly.
 * - Decode behavior is centralized in query definitions.
 */
export function useTypedQuery<TArgs extends QueryArgs, TResult>(
  definition: QueryDef<TArgs, TResult>,
  args: TArgs,
): TypedQueryState<TResult> {
  const queryArgs = definition.mapArgs ? definition.mapArgs(args) : args;
  const raw = useQuery(definition.query as never, queryArgs as never);

  return useMemo(() => {
    if (raw === undefined) {
      return { data: undefined, isLoading: true, error: null } as const;
    }

    try {
      return {
        data: definition.decode(raw),
        isLoading: false,
        error: null,
      } as const;
    } catch (cause) {
      return {
        data: undefined,
        isLoading: false,
        error: new QueryDecodeError(definition.key, cause),
      } as const;
    }
  }, [definition, raw]);
}

export interface TypedQueryState<TResult> {
  readonly data: TResult | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

/**
 * Optional adapter for boundary-style error handling.
 * Loading remains explicit; decode failures are thrown.
 */
export function useTypedQueryOrThrow<TArgs extends QueryArgs, TResult>(
  definition: QueryDef<TArgs, TResult>,
  args: TArgs,
): { data: TResult | undefined; isLoading: boolean } {
  const result = useTypedQuery(definition, args);
  if (result.error) {
    throw result.error;
  }
  return { data: result.data, isLoading: result.isLoading };
}

// Example usage:
// const orchestrationsQuery = {
//   key: "orchestrations.list",
//   query: api.orchestrations.listOrchestrations,
//   decode: decodeOrchestrationList,
// } satisfies QueryDef<{}, OrchestrationSummary[]>;
//
// const { data, isLoading } = useTypedQueryOrThrow(orchestrationsQuery, {});
