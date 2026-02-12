import { useState, useMemo } from "react"
import { useMutation } from "convex/react"
import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { generateIdempotencyKey, kebabCase } from "@/lib/utils"
import { validateDesignForLaunch } from "@convex/designValidation"
import { PRESETS } from "@convex/policyPresets"
import type { PolicySnapshot } from "@convex/policyPresets"
import type { DesignSummary } from "@/schemas"
import { FormDialog } from "../FormDialog"
import { PolicyEditor } from "./PolicyEditor"
import type { Id } from "@convex/_generated/dataModel"
import formStyles from "../FormDialog.module.scss"
import styles from "./LaunchModal.module.scss"

function useDesignValidation(design: DesignSummary | undefined) {
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

interface LaunchModalProps {
  projectId: string
  onClose: () => void
}

export function LaunchModal({ projectId, onClose }: LaunchModalProps) {
  const [selectedDesignId, setSelectedDesignId] = useState<string>("")
  const [featureName, setFeatureName] = useState<string>("")
  const [policy, setPolicy] = useState<PolicySnapshot>(() => structuredClone(PRESETS.balanced))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ orchestrationId: string } | null>(null)

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId,
    status: undefined,
  })

  const launch = useMutation(api.controlPlane.launchOrchestration)

  const branchName = featureName ? `tina/${kebabCase(featureName)}` : ""

  const designs = designsResult.status === "success" ? designsResult.data : []
  const selectedDesign = designs.find((d) => d._id === selectedDesignId)
  const validation = useDesignValidation(selectedDesign)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    setSubmitting(true)

    if (!featureName.trim()) {
      setError("Feature name is required")
      setSubmitting(false)
      return
    }

    if (!selectedDesignId) {
      setError("Please select a design")
      setSubmitting(false)
      return
    }

    if (!validation.valid) {
      setError("Design validation must pass before launching")
      setSubmitting(false)
      return
    }

    try {
      const idempotencyKey = generateIdempotencyKey()
      const { orchestrationId } = await launch({
        projectId: projectId as Id<"projects">,
        designId: selectedDesignId as Id<"designs">,
        feature: featureName.trim(),
        branch: branchName.trim(),
        policySnapshot: policy,
        requestedBy: "web-ui",
        idempotencyKey,
      })
      setResult({ orchestrationId: orchestrationId as string })
      setFeatureName("")
      setPolicy(structuredClone(PRESETS.balanced))
      setSelectedDesignId("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch orchestration")
    } finally {
      setSubmitting(false)
    }
  }

  const isLoading = isAnyQueryLoading(designsResult)
  const queryError = firstQueryError(designsResult)

  return (
    <FormDialog title="Launch Orchestration" onClose={onClose} maxWidth={560}>
      {result && (
        <div className={styles.successBanner}>
          Orchestration launched: <code>{result.orchestrationId}</code>
        </div>
      )}

      {queryError != null && <div className={formStyles.errorMessage}>Failed to load data</div>}
      {error && <div className={formStyles.errorMessage}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className={formStyles.formField}>
          <label className={formStyles.formLabel} htmlFor="design-select">
            Design
          </label>
          <select
            id="design-select"
            className={formStyles.formInput}
            value={selectedDesignId}
            onChange={(e) => setSelectedDesignId(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Select a design</option>
            {designs.map((design) => (
              <option key={design._id} value={design._id}>
                {design.title}
              </option>
            ))}
          </select>
        </div>

        {selectedDesign && (
          <div className={`${styles.validationStatus} ${validation.valid ? styles.statusReady : styles.statusNotReady}`}>
            <span>{validation.valid ? "Ready for launch" : "Not ready for launch"}</span>
            {!validation.valid && validation.errors.map((err, i) => (
              <div key={i} className={styles.statusDetail}>{err}</div>
            ))}
            {validation.valid && Option.isSome(selectedDesign.phaseCount) && (
              <div className={styles.statusDetail}>
                {Option.getOrUndefined(selectedDesign.phaseCount)} phase{Option.getOrUndefined(selectedDesign.phaseCount) !== 1 ? "s" : ""} detected
              </div>
            )}
          </div>
        )}

        <div className={formStyles.formField}>
          <label className={formStyles.formLabel} htmlFor="feature-name">
            Feature Name
          </label>
          <input
            id="feature-name"
            className={formStyles.formInput}
            type="text"
            value={featureName}
            onChange={(e) => setFeatureName(e.target.value)}
            placeholder="e.g., Dark Mode Support"
            autoFocus
          />
          {branchName && <span className={styles.hint}>Branch: {branchName}</span>}
        </div>

        <PolicyEditor value={policy} onChange={setPolicy} />

        <div className={formStyles.formActions}>
          <button
            type="button"
            className={formStyles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={formStyles.submitButton}
            disabled={!featureName.trim() || !selectedDesignId || !validation.valid || submitting || isLoading}
          >
            {submitting ? "Launching..." : "Launch"}
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
