import { useMemo } from "react"
import { Option } from "effect"
import { validateDesignForLaunch } from "@convex/designValidation"
import type { DesignSummary } from "@/schemas"

export function useDesignValidation(design: DesignSummary | undefined) {
  return useMemo(() => {
    if (!design) return { valid: false, errors: ["No design selected"] }
    const requiredMarkers = Option.getOrUndefined(design.requiredMarkers)
    const completedMarkers = Option.getOrUndefined(design.completedMarkers)
    return validateDesignForLaunch({
      requiredMarkers: requiredMarkers ? [...requiredMarkers] : undefined,
      completedMarkers: completedMarkers ? [...completedMarkers] : undefined,
      phaseCount: Option.getOrUndefined(design.phaseCount),
      phaseStructureValid: Option.getOrUndefined(design.phaseStructureValid),
    })
  }, [design])
}
