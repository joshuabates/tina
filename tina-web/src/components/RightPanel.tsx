import { ScrollArea } from "@/components/ui/scroll-area"
import { StatusSection } from "@/components/StatusSection"
import { TeamSection } from "@/components/TeamSection"
import { GitOpsSection } from "@/components/GitOpsSection"
import { ReviewSection } from "@/components/ReviewSection"
import { ActionTimeline } from "@/components/ActionTimeline"
import type { OrchestrationDetail } from "@/schemas"
import { useOrchestrationEvents } from "@/hooks/useOrchestrationEvents"
import styles from "./RightPanel.module.scss"

interface RightPanelProps {
  detail: OrchestrationDetail
}

export function RightPanel({ detail }: RightPanelProps) {
  const events = useOrchestrationEvents(detail._id)

  if (events.status === "error") {
    throw events.error
  }

  return (
    <ScrollArea
      role="complementary"
      aria-label="Orchestration details"
      className={styles.rightPanel}
    >
      <div className={styles.stack}>
        <StatusSection detail={detail} />
        <TeamSection detail={detail} />
        <GitOpsSection gitEvents={events.gitEvents} isLoading={events.isLoading} />
        <ReviewSection reviewEvents={events.reviewEvents} isLoading={events.isLoading} />
        <ActionTimeline orchestrationId={detail._id} />
      </div>
    </ScrollArea>
  )
}
