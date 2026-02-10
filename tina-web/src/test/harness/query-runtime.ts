import type { TypedQueryResult } from "@/hooks/useTypedQuery"
import type { QueryStateMap } from "@/test/builders/query"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"

type TypedQueryMock = {
  mockImplementation: (
    implementation: (
      def: { key: string },
      args?: Record<string, unknown>,
    ) => TypedQueryResult<unknown>,
  ) => void
}

export function installQueryStates(
  mockUseTypedQuery: TypedQueryMock,
  defaults: QueryStateMap,
  overrides: Partial<QueryStateMap> = {},
) {
  installAppRuntimeQueryMock(mockUseTypedQuery, {
    states: {
      ...defaults,
      ...overrides,
    },
  })
}
