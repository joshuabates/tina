import { useCallback } from "react"
import { useServices } from "@/providers/RuntimeProvider"
import type { ActionContext } from "@/services/action-registry"

export function useAction(id: string) {
  const { actionRegistry } = useServices()
  const descriptor = actionRegistry.get(id)

  const execute = useCallback(
    (ctx?: Partial<ActionContext>) => {
      const action = actionRegistry.get(id)
      if (action) action.execute({ ...ctx } as ActionContext)
    },
    [actionRegistry, id]
  )

  return { descriptor, execute }
}
