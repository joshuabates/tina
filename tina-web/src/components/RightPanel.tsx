import { ScrollArea } from "@/components/ui/scroll-area"
import { StatusSection } from "@/components/StatusSection"
import { TeamSection } from "@/components/TeamSection"
import { GitOpsSection } from "@/components/GitOpsSection"
import { ReviewSection } from "@/components/ReviewSection"
import type { OrchestrationDetail } from "@/schemas"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { EventListQuery } from "@/services/data/queryDefs"
import { toOrchestrationId } from "@/services/data/id"
import { isGitEvent, isPhaseReviewEvent } from "@/services/data/events"
import styles from "./RightPanel.module.scss"

interface RightPanelProps {
  detail: OrchestrationDetail
}

export function RightPanel({ detail }: RightPanelProps) {
  const eventsResult = useTypedQuery(EventListQuery, {
    orchestrationId: toOrchestrationId(detail._id),
  })

  if (eventsResult.status === "error") {
    throw eventsResult.error
  }

  const events = eventsResult.status === "success" ? eventsResult.data : []
  const gitEvents = events.filter(isGitEvent)
  const reviewEvents = events.filter(isPhaseReviewEvent)
  const isLoading = eventsResult.status === "loading"

  return (
    <ScrollArea
      role="complementary"
      aria-label="Orchestration details"
      className={styles.rightPanel}
    >
      <div className={styles.stack}>
        <StatusSection detail={detail} />
        <TeamSection detail={detail} />
        <GitOpsSection gitEvents={gitEvents} isLoading={isLoading} />
        <ReviewSection reviewEvents={reviewEvents} isLoading={isLoading} />
      </div>
    </ScrollArea>
  )
}
