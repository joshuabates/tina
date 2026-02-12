import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useMutation } from "convex/react"
import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { generateIdempotencyKey } from "@/lib/utils"
import { PRESETS } from "@convex/policyPresets"
import type { PolicySnapshot } from "@convex/policyPresets"
import type { Id } from "@convex/_generated/dataModel"
import type { DesignSummary } from "@/schemas"
import { PolicyEditor } from "./PolicyEditor"
import styles from "./LaunchOrchestrationPage.module.scss"

function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

function isDesignReady(design: DesignSummary): boolean {
  const required = Option.getOrElse(design.requiredMarkers, () => [] as string[])
  const completed = Option.getOrElse(design.completedMarkers, () => [] as string[])
  const phaseCount = Option.getOrElse(design.phaseCount, () => 0)
  const phaseStructureValid = Option.getOrElse(design.phaseStructureValid, () => false)

  if (required.length === 0) return false
  const allComplete = required.every((m) => completed.includes(m))
  return allComplete && phaseStructureValid && phaseCount >= 1
}

export function LaunchOrchestrationPage() {
  const [searchParams] = useSearchParams()
  const projectIdParam = searchParams.get("project") || null

  const [selectedDesignId, setSelectedDesignId] = useState<string>("")
  const [featureName, setFeatureName] = useState<string>("")
  const [policySnapshot, setPolicySnapshot] = useState<PolicySnapshot>(
    () => structuredClone(PRESETS.balanced),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ orchestrationId: string } | null>(null)

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId: projectIdParam as string,
    status: undefined,
  })

  const launch = useMutation(api.controlPlane.launchOrchestration)

  if (!projectIdParam) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Launch Orchestration</h2>
        <div className={styles.hint}>Select a project from the sidebar</div>
      </div>
    )
  }

  if (isAnyQueryLoading(designsResult)) {
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

  const queryError = firstQueryError(designsResult)
  if (queryError) {
    throw queryError
  }

  if (designsResult.status !== "success") {
    return null
  }

  const designs = designsResult.data
  const selectedDesign = designs.find((d) => d._id === selectedDesignId)
  const designReady = selectedDesign ? isDesignReady(selectedDesign) : false

  const branchName = featureName ? `tina/${kebabCase(featureName)}` : ""

  const canSubmit =
    featureName.trim().length > 0 &&
    selectedDesignId.length > 0 &&
    designReady &&
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

    if (!selectedDesignId) {
      setError("Please select a design")
      setSubmitting(false)
      return
    }

    try {
      const idempotencyKey = generateIdempotencyKey()
      const { orchestrationId } = await launch({
        projectId: projectIdParam as Id<"projects">,
        designId: selectedDesignId as Id<"designs">,
        feature: featureName.trim(),
        branch: branchName.trim(),
        policySnapshot,
        requestedBy: "web-ui",
        idempotencyKey,
      })
      setResult({ orchestrationId: orchestrationId as string })
      setFeatureName("")
      setPolicySnapshot(structuredClone(PRESETS.balanced))
      setSelectedDesignId("")
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
          <label className={styles.formLabel} htmlFor="design-select">
            Design
          </label>
          <select
            id="design-select"
            className={styles.formInput}
            value={selectedDesignId}
            onChange={(e) => setSelectedDesignId(e.target.value)}
          >
            <option value="">Select a design</option>
            {designs.map((design) => (
              <option key={design._id} value={design._id}>
                {design.title}
              </option>
            ))}
          </select>
          {selectedDesign && !designReady && (
            <span className={styles.hint}>
              Design validation incomplete — check markers and phase structure
            </span>
          )}
        </div>

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
