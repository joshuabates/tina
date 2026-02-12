import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignListQuery, NodeListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { generateIdempotencyKey } from "@/lib/utils"
import type { Id } from "@convex/_generated/dataModel"
import styles from "./LaunchOrchestrationPage.module.scss"

type PolicyPreset = "balanced" | "strict" | "fast"

function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

export function LaunchOrchestrationPage() {
  const [searchParams] = useSearchParams()
  const projectIdParam = searchParams.get("project") || null

  const [selectedDesignId, setSelectedDesignId] = useState<string>("")
  const [selectedNodeId, setSelectedNodeId] = useState<string>("")
  const [featureName, setFeatureName] = useState<string>("")
  const [totalPhases, setTotalPhases] = useState<string>("3")
  const [selectedPreset, setSelectedPreset] = useState<PolicyPreset>("balanced")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ orchestrationId: string } | null>(null)

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId: projectIdParam as string,
    status: undefined,
  })
  const nodesResult = useTypedQuery(NodeListQuery, {})

  const launch = useMutation(api.controlPlane.launchOrchestration)

  if (!projectIdParam) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Launch Orchestration</h2>
        <div className={styles.hint}>Select a project from the sidebar</div>
      </div>
    )
  }

  if (isAnyQueryLoading(designsResult, nodesResult)) {
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

  const queryError = firstQueryError(designsResult, nodesResult)
  if (queryError) {
    throw queryError
  }

  if (designsResult.status !== "success" || nodesResult.status !== "success") {
    return null
  }

  const designs = designsResult.data
  const allNodes = nodesResult.data
  const onlineNodes = allNodes.filter((n) => n.status === "online")

  const branchName = featureName ? `tina/${kebabCase(featureName)}` : ""

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

    if (!selectedDesignId || !selectedNodeId) {
      setError("Please select a design and node")
      setSubmitting(false)
      return
    }

    if (!totalPhases || Number(totalPhases) < 1) {
      setError("Total phases must be at least 1")
      setSubmitting(false)
      return
    }

    try {
      const idempotencyKey = generateIdempotencyKey()
      const { orchestrationId } = await launch({
        projectId: projectIdParam as Id<"projects">,
        designId: selectedDesignId as Id<"designs">,
        nodeId: selectedNodeId as Id<"nodes">,
        feature: featureName.trim(),
        branch: branchName.trim(),
        totalPhases: Number(totalPhases),
        policyPreset: selectedPreset,
        requestedBy: "web-ui",
        idempotencyKey,
      })
      setResult({ orchestrationId: orchestrationId as string })
      setFeatureName("")
      setTotalPhases("3")
      setSelectedPreset("balanced")
      setSelectedDesignId("")
      setSelectedNodeId("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch orchestration")
    } finally {
      setSubmitting(false)
    }
  }

  const presets: PolicyPreset[] = ["balanced", "strict", "fast"]

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
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="node-select">
            Node
          </label>
          <select
            id="node-select"
            className={styles.formInput}
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
          >
            <option value="">Select a node</option>
            {onlineNodes.map((node) => (
              <option key={node._id} value={node._id}>
                {node.name} ({node.os})
              </option>
            ))}
          </select>
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
          <label className={styles.formLabel} htmlFor="total-phases">
            Total Phases
          </label>
          <input
            id="total-phases"
            className={styles.formInput}
            type="number"
            min="1"
            max="10"
            value={totalPhases}
            onChange={(e) => setTotalPhases(e.target.value)}
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Policy Preset</label>
          <div className={styles.presetButtons}>
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.presetButton} ${selectedPreset === preset ? styles.active : ""}`}
                onClick={() => setSelectedPreset(preset)}
              >
                {preset.charAt(0).toUpperCase() + preset.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.actionButton} ${styles.primary}`}
            disabled={!featureName.trim() || !selectedDesignId || !selectedNodeId || submitting}
          >
            {submitting ? "Launching..." : "Launch"}
          </button>
        </div>
      </form>
    </div>
  )
}
