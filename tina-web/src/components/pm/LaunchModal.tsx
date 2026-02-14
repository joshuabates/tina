import { useState } from "react"
import { useMutation } from "convex/react"
import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { useSpecValidation } from "@/hooks/useSpecValidation"
import { SpecListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { generateIdempotencyKey, kebabCase } from "@/lib/utils"
import { PRESETS } from "@convex/policyPresets"
import type { PolicySnapshot } from "@convex/policyPresets"
import { FormDialog } from "../FormDialog"
import { PolicyEditor } from "./PolicyEditor"
import type { Id } from "@convex/_generated/dataModel"
import formStyles from "../FormDialog.module.scss"
import styles from "./LaunchModal.module.scss"

interface LaunchModalProps {
  projectId: string
  onClose: () => void
}

export function LaunchModal({ projectId, onClose }: LaunchModalProps) {
  const [selectedSpecId, setSelectedSpecId] = useState<string>("")
  const [featureName, setFeatureName] = useState<string>("")
  const [policy, setPolicy] = useState<PolicySnapshot>(() => structuredClone(PRESETS.balanced))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ orchestrationId: string } | null>(null)

  const specsResult = useTypedQuery(SpecListQuery, {
    projectId,
    status: undefined,
  })

  const launch = useMutation(api.controlPlane.launchOrchestration)

  const branchName = featureName ? `tina/${kebabCase(featureName)}` : ""

  const specs = specsResult.status === "success" ? specsResult.data : []
  const selectedSpec = specs.find((d) => d._id === selectedSpecId)
  const validation = useSpecValidation(selectedSpec)

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

    if (!selectedSpecId) {
      setError("Please select a spec")
      setSubmitting(false)
      return
    }

    if (!validation.valid) {
      setError("Spec validation must pass before launching")
      setSubmitting(false)
      return
    }

    try {
      const idempotencyKey = generateIdempotencyKey()
      const { orchestrationId } = await launch({
        projectId: projectId as Id<"projects">,
        specId: selectedSpecId as Id<"specs">,
        feature: featureName.trim(),
        branch: branchName.trim(),
        policySnapshot: policy,
        requestedBy: "web-ui",
        idempotencyKey,
      })
      setResult({ orchestrationId: orchestrationId as string })
      setFeatureName("")
      setPolicy(structuredClone(PRESETS.balanced))
      setSelectedSpecId("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch orchestration")
    } finally {
      setSubmitting(false)
    }
  }

  const isLoading = isAnyQueryLoading(specsResult)
  const queryError = firstQueryError(specsResult)

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
          <label className={formStyles.formLabel} htmlFor="spec-select">
            Spec
          </label>
          <select
            id="spec-select"
            className={formStyles.formInput}
            value={selectedSpecId}
            onChange={(e) => setSelectedSpecId(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Select a spec</option>
            {specs.map((spec) => (
              <option key={spec._id} value={spec._id}>
                {spec.title}
              </option>
            ))}
          </select>
        </div>

        {selectedSpec && (
          <div className={`${styles.validationStatus} ${validation.valid ? styles.statusReady : styles.statusNotReady}`}>
            <span>{validation.valid ? "Ready for launch" : "Not ready for launch"}</span>
            {!validation.valid && validation.errors.map((err, i) => (
              <div key={i} className={styles.statusDetail}>{err}</div>
            ))}
            {validation.valid && Option.isSome(selectedSpec.phaseCount) && (
              <div className={styles.statusDetail}>
                {Option.getOrUndefined(selectedSpec.phaseCount)} phase{Option.getOrUndefined(selectedSpec.phaseCount) !== 1 ? "s" : ""} detected
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
            disabled={!featureName.trim() || !selectedSpecId || !validation.valid || submitting || isLoading}
          >
            {submitting ? "Launching..." : "Launch"}
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
