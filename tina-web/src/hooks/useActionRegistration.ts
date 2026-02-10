import { useEffect, useRef } from "react"
import { useServices } from "@/providers/RuntimeProvider"
import type { ActionDescriptor } from "@/services/action-registry"

export function useActionRegistration(action: ActionDescriptor) {
  const { actionRegistry } = useServices()
  const actionRef = useRef(action)

  // Update ref on each render so execute always uses latest closure
  actionRef.current = action

  useEffect(() => {
    // Create stable action descriptor with ref-based execute
    const stableAction: ActionDescriptor = {
      ...action,
      execute: (ctx) => actionRef.current.execute(ctx),
    }

    const cleanup = actionRegistry.register(stableAction)
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionRegistry, action.id, action.label, action.key, action.when])
}
