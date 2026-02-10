import { useEffect } from "react"
import { useServices } from "@/providers/RuntimeProvider"
import type { ActionDescriptor } from "@/services/action-registry"

export function useActionRegistration(action: ActionDescriptor) {
  const { actionRegistry } = useServices()

  useEffect(() => {
    const cleanup = actionRegistry.register(action)
    return cleanup
  }, [actionRegistry, action])
}
