import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react"
import { createAppServices, type AppServices } from "@/services/runtime"

const ServicesContext = createContext<AppServices | null>(null)

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => createAppServices(), [])

  useEffect(() => {
    services.keyboardService.attach()
    return () => services.keyboardService.detach()
  }, [services])

  return (
    <ServicesContext.Provider value={services}>
      {children}
    </ServicesContext.Provider>
  )
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error("useServices must be used within RuntimeProvider")
  return services
}
