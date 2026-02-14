import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type DependencyList,
  type ReactNode,
} from "react"

interface PlanHeaderActionsContextValue {
  setHeaderActions: (content: ReactNode | null) => void
}

const PlanHeaderActionsContext = createContext<PlanHeaderActionsContextValue | null>(null)

interface PlanHeaderActionsProviderProps {
  setHeaderActions: (content: ReactNode | null) => void
  children: ReactNode
}

export function PlanHeaderActionsProvider({
  setHeaderActions,
  children,
}: PlanHeaderActionsProviderProps) {
  const value = useMemo(
    () => ({ setHeaderActions }),
    [setHeaderActions],
  )

  return (
    <PlanHeaderActionsContext.Provider value={value}>
      {children}
    </PlanHeaderActionsContext.Provider>
  )
}

export function usePlanHeaderActions(
  content: ReactNode | null,
  deps: DependencyList = [],
) {
  const context = useContext(PlanHeaderActionsContext)

  useEffect(() => {
    if (!context) return
    context.setHeaderActions(content)
  }, [context, ...deps])

  useEffect(() => {
    if (!context) return

    return () => {
      context.setHeaderActions(null)
    }
  }, [context])
}
