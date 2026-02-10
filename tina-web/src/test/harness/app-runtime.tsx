import type { ReactNode } from "react"
import type { TypedQueryResult } from "@/hooks/useTypedQuery"
import { queryStateFor, querySuccess, type QueryStateMap } from "@/test/builders/query"
import { renderWithRuntime } from "./render"

type TypedQueryMock = {
  mockImplementation: (
    implementation: (
      def: { key: string },
      args?: Record<string, unknown>,
    ) => TypedQueryResult<unknown>,
  ) => void
}

interface AppRuntimeQueryOptions {
  states?: Partial<QueryStateMap>
  detailResults?: Record<string, TypedQueryResult<unknown>>
  detailFallback?: TypedQueryResult<unknown>
}

interface RenderWithAppRuntimeOptions extends AppRuntimeQueryOptions {
  mockUseTypedQuery: TypedQueryMock
  route?: string
}

const ORCHESTRATION_DETAIL_KEY = "orchestrations.detail"

export function installAppRuntimeQueryMock(
  mockUseTypedQuery: TypedQueryMock,
  options: AppRuntimeQueryOptions = {},
) {
  const states = Object.fromEntries(
    Object.entries(options.states ?? {}).filter(
      (entry): entry is [string, TypedQueryResult<unknown>] =>
        entry[1] !== undefined,
    ),
  ) as QueryStateMap
  const detailResults = options.detailResults ?? {}
  const detailFallback = options.detailFallback ?? querySuccess(null)

  mockUseTypedQuery.mockImplementation((def, args = {}) => {
    if (def.key === ORCHESTRATION_DETAIL_KEY) {
      const orchestrationId =
        typeof args.orchestrationId === "string" ? args.orchestrationId : ""
      return detailResults[orchestrationId] ?? detailFallback
    }

    return queryStateFor(def.key, states)
  })
}

export function renderWithAppRuntime(
  ui: ReactNode,
  options: RenderWithAppRuntimeOptions,
) {
  installAppRuntimeQueryMock(options.mockUseTypedQuery, options)
  return renderWithRuntime(ui, options.route ?? "/")
}
