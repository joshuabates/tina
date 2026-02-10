import { ScrollArea } from "@/components/ui/scroll-area"
import { StatusSection } from "@/components/StatusSection"
import { TeamSection } from "@/components/TeamSection"
import { GitOpsSection } from "@/components/GitOpsSection"
import { ReviewSection } from "@/components/ReviewSection"
import { PanelSection } from "@/components/Panel"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { EventListQuery } from "@/services/data/queryDefs"
import { toOrchestrationId } from "@/services/data/id"
import type { OrchestrationDetail } from "@/schemas"

interface RightPanelProps {
  detail: OrchestrationDetail
}

export function RightPanel({ detail }: RightPanelProps) {
  // Fetch events for GitOpsSection
  const eventsResult = useTypedQuery(EventListQuery, {
    orchestrationId: toOrchestrationId(detail._id),
  })

  const events = eventsResult.status === "success" ? eventsResult.data : []

  return (
    <ScrollArea>
      <StatusSection detail={detail} />
      <TeamSection detail={detail} />
      <PanelSection label="GitOps">
        <GitOpsSection events={events} />
      </PanelSection>
      <ReviewSection detail={detail} />
    </ScrollArea>
  )
}
