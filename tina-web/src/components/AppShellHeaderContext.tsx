import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type DependencyList,
  type ReactNode,
} from "react"

interface AppShellHeaderContextValue {
  setHeaderContent: (content: ReactNode | null) => void
}

const AppShellHeaderContext = createContext<AppShellHeaderContextValue | null>(null)

interface AppShellHeaderProviderProps {
  setHeaderContent: (content: ReactNode | null) => void
  children: ReactNode
}

export function AppShellHeaderProvider({
  setHeaderContent,
  children,
}: AppShellHeaderProviderProps) {
  const value = useMemo(
    () => ({ setHeaderContent }),
    [setHeaderContent],
  )

  return (
    <AppShellHeaderContext.Provider value={value}>
      {children}
    </AppShellHeaderContext.Provider>
  )
}

export function useAppShellHeader(
  content: ReactNode | null,
  deps: DependencyList = [],
) {
  const context = useContext(AppShellHeaderContext)

  useEffect(() => {
    if (!context) return
    context.setHeaderContent(content)
  }, [context, ...deps])

  useEffect(() => {
    if (!context) return

    return () => {
      context.setHeaderContent(null)
    }
  }, [context])
}
