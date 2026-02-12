import { useState } from "react"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignListQuery, NodeListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { generateIdempotencyKey } from "@/lib/utils"
import { FormDialog } from "../FormDialog"
import type { Id } from "@convex/_generated/dataModel"
import formStyles from "../FormDialog.module.scss"
import styles from "./LaunchModal.module.scss"

type PolicyPreset = "balanced" | "strict" | "fast"

function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

interface LaunchModalProps {
  projectId: string
  onClose: () => void
}

export function LaunchModal({ projectId, onClose }: LaunchModalProps) {
  const [selectedDesignId, setSelectedDesignId] = useState<string>("")
  const [selectedNodeId, setSelectedNodeId] = useState<string>("")
  const [featureName, setFeatureName] = useState<string>("")
  const [totalPhases, setTotalPhases] = useState<string>("3")
  const [selectedPreset, setSelectedPreset] = useState<PolicyPreset>("balanced")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ orchestrationId: string } | null>(null)

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId,
    status: undefined,
  })
  const nodesResult = useTypedQuery(NodeListQuery, {})

  const launch = useMutation(api.controlPlane.launchOrchestration)

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
        projectId: projectId as Id<"projects">,
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

  const isLoading = isAnyQueryLoading(designsResult, nodesResult)
  const queryError = firstQueryError(designsResult, nodesResult)

  const designs = designsResult.status === "success" ? designsResult.data : []
  const allNodes = nodesResult.status === "success" ? nodesResult.data : []
  const onlineNodes = allNodes.filter((n) => n.status === "online")

  const presets: PolicyPreset[] = ["balanced", "strict", "fast"]

  return (
    <FormDialog title="Launch Orchestration" onClose={onClose} maxWidth={520}>
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

        <div className={formStyles.formField}>
          <label className={formStyles.formLabel} htmlFor="node-select">
            Node
          </label>
          <select
            id="node-select"
            className={formStyles.formInput}
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Select a node</option>
            {onlineNodes.map((node) => (
              <option key={node._id} value={node._id}>
                {node.name} ({node.os})
              </option>
            ))}
          </select>
        </div>

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

        <div className={formStyles.formField}>
          <label className={formStyles.formLabel} htmlFor="total-phases">
            Total Phases
          </label>
          <input
            id="total-phases"
            className={formStyles.formInput}
            type="number"
            min="1"
            max="10"
            value={totalPhases}
            onChange={(e) => setTotalPhases(e.target.value)}
          />
        </div>

        <div className={formStyles.formField}>
          <label className={formStyles.formLabel}>Policy Preset</label>
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
            disabled={!featureName.trim() || !selectedDesignId || !selectedNodeId || submitting || isLoading}
          >
            {submitting ? "Launching..." : "Launch"}
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
