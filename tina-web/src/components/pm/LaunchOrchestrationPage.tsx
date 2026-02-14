import { useState } from "react"
import { useSearchParams } from "react-router-dom"
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
import type { Id } from "@convex/_generated/dataModel"
import { PolicyEditor } from "./PolicyEditor"
import styles from "./LaunchOrchestrationPage.module.scss"

export function LaunchOrchestrationPage() {
  const [searchParams] = useSearchParams()
  const projectIdParam = searchParams.get("project") || null

  const [selectedSpecId, setSelectedSpecId] = useState<string>("")
  const [featureName, setFeatureName] = useState<string>("")
  const [policySnapshot, setPolicySnapshot] = useState<PolicySnapshot>(
    () => structuredClone(PRESETS.balanced),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ orchestrationId: string } | null>(null)

  const specsResult = useTypedQuery(SpecListQuery, {
    projectId: projectIdParam as string,
    status: undefined,
  })

  const launch = useMutation(api.controlPlane.launchOrchestration)

  const specs = specsResult.status === "success" ? specsResult.data : []
  const selectedSpec = specs.find((d) => d._id === selectedSpecId)
  const validation = useSpecValidation(selectedSpec)

  if (!projectIdParam) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Launch Orchestration</h2>
        <div className={styles.hint}>Select a project from the sidebar</div>
      </div>
    )
  }

  if (isAnyQueryLoading(specsResult)) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Launch Orchestration</h2>
        <div className={styles.loading} data-testid="launch-orchestration-loading">
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(specsResult)
  if (queryError) {
    throw queryError
  }

  if (specsResult.status !== "success") {
    return null
  }

  const branchName = featureName ? `tina/${kebabCase(featureName)}` : ""

  const canSubmit =
    featureName.trim().length > 0 &&
    selectedSpecId.length > 0 &&
    validation.valid &&
    !submitting

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
        projectId: projectIdParam as Id<"projects">,
        specId: selectedSpecId as Id<"specs">,
        feature: featureName.trim(),
        branch: branchName.trim(),
        policySnapshot,
        requestedBy: "web-ui",
        idempotencyKey,
      })
      setResult({ orchestrationId: orchestrationId as string })
      setFeatureName("")
      setPolicySnapshot(structuredClone(PRESETS.balanced))
      setSelectedSpecId("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch orchestration")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page} data-testid="launch-orchestration-page">
      <h2 className={styles.title}>Launch Orchestration</h2>

      {result && (
        <div className={styles.successBanner}>
          Orchestration launched: <code>{result.orchestrationId}</code>
        </div>
      )}

      {error && <div className={styles.errorMessage}>{error}</div>}

      <form className={styles.form} data-testid="launch-form" onSubmit={handleSubmit}>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="spec-select">
            Spec
          </label>
          <select
            id="spec-select"
            className={styles.formInput}
            value={selectedSpecId}
            onChange={(e) => setSelectedSpecId(e.target.value)}
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

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="feature-name">
            Feature Name
          </label>
          <input
            id="feature-name"
            className={styles.formInput}
            type="text"
            value={featureName}
            onChange={(e) => setFeatureName(e.target.value)}
            placeholder="e.g., Dark Mode Support"
            autoFocus
          />
          {branchName && <span className={styles.hint}>Branch: {branchName}</span>}
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Policy</label>
          <PolicyEditor value={policySnapshot} onChange={setPolicySnapshot} />
        </div>

        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.actionButton} ${styles.primary}`}
            disabled={!canSubmit}
          >
            {submitting ? "Launching..." : "Launch"}
          </button>
        </div>
      </form>
    </div>
  )
}
