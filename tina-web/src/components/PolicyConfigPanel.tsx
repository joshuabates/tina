import { useState, useCallback } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { generateIdempotencyKey } from "@/lib/utils"
import { MODEL_OPTIONS, controlSelectClass } from "@/lib/control-plane-styles"
import { StatPanel } from "@/components/ui/stat-panel"
import { MonoText } from "@/components/ui/mono-text"

const ROLES = ["validator", "planner", "executor", "reviewer"] as const

interface PolicyConfigPanelProps {
  orchestrationId: string
  nodeId: string
  featureName: string
}

export function PolicyConfigPanel({ orchestrationId, nodeId, featureName }: PolicyConfigPanelProps) {
  const activePolicy = useQuery(api.controlPlane.getActivePolicy, {
    orchestrationId: orchestrationId as Id<"orchestrations">,
  })

  const enqueueAction = useMutation(api.controlPlane.enqueueControlAction)
  const [pendingRole, setPendingRole] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleRoleModelChange = useCallback(
    async (role: string, newModel: string) => {
      if (!activePolicy) return
      setPendingRole(role)
      setError(null)
      setSuccess(null)

      try {
        await enqueueAction({
          orchestrationId: orchestrationId as Id<"orchestrations">,
          nodeId: nodeId as Id<"nodes">,
          actionType: "orchestration_set_role_model",
          payload: JSON.stringify({
            feature: featureName,
            targetRevision: activePolicy.policyRevision,
            role,
            model: newModel,
          }),
          requestedBy: "web-ui",
          idempotencyKey: generateIdempotencyKey(),
        })
        setSuccess(`${role} → ${newModel}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed")
      } finally {
        setPendingRole(null)
      }
    },
    [activePolicy, enqueueAction, orchestrationId, nodeId, featureName],
  )

  if (!activePolicy) {
    return (
      <StatPanel title="Policy">
        <MonoText className="text-[8px] text-muted-foreground">Loading...</MonoText>
      </StatPanel>
    )
  }

  const modelPolicy = activePolicy.modelPolicy ?? {}

  return (
    <StatPanel title="Policy">
      <div className="space-y-2">
        <MonoText className="text-[7px] text-muted-foreground/70 uppercase tracking-wider">
          Applies to future actions only
        </MonoText>

        {error && (
          <div className="text-[7px] text-status-blocked truncate" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="text-[7px] text-emerald-400 truncate" role="status">
            Updated: {success}
          </div>
        )}

        <div className="space-y-1.5">
          {ROLES.map((role) => (
            <div key={role} className="flex items-center justify-between gap-2">
              <MonoText className="text-[8px] text-muted-foreground capitalize w-16">
                {role}
              </MonoText>
              <select
                className={controlSelectClass}
                value={modelPolicy[role] ?? "opus"}
                onChange={(e) => handleRoleModelChange(role, e.target.value)}
                disabled={pendingRole !== null}
                data-testid={`policy-model-${role}`}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {pendingRole && (
          <MonoText className="text-[7px] text-muted-foreground animate-pulse">
            Updating {pendingRole}...
          </MonoText>
        )}

        {activePolicy.presetOrigin && (
          <MonoText className="text-[7px] text-muted-foreground/50">
            Base preset: {activePolicy.presetOrigin}
          </MonoText>
        )}
      </div>
    </StatPanel>
  )
}
