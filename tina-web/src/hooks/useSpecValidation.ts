import { useMemo } from "react"
import { Option } from "effect"
import { validateSpecForLaunch } from "@convex/specValidation"
import type { SpecSummary } from "@/schemas"

export function useSpecValidation(spec: SpecSummary | undefined) {
  return useMemo(() => {
    if (!spec) return { valid: false, errors: ["No spec selected"] }
    const requiredMarkers = Option.getOrUndefined(spec.requiredMarkers)
    const completedMarkers = Option.getOrUndefined(spec.completedMarkers)
    return validateSpecForLaunch({
      requiredMarkers: requiredMarkers ? [...requiredMarkers] : undefined,
      completedMarkers: completedMarkers ? [...completedMarkers] : undefined,
      phaseCount: Option.getOrUndefined(spec.phaseCount),
      phaseStructureValid: Option.getOrUndefined(spec.phaseStructureValid),
    })
  }, [spec])
}
