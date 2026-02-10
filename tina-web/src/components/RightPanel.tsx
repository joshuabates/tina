import { ScrollArea } from "@/components/ui/scroll-area"
import { StatusSection } from "@/components/StatusSection"
import { TeamSection } from "@/components/TeamSection"
import { GitOpsSection } from "@/components/GitOpsSection"
import { ReviewSection } from "@/components/ReviewSection"
import type { OrchestrationDetail } from "@/schemas"

interface RightPanelProps {
  detail: OrchestrationDetail
}

export function RightPanel({ detail }: RightPanelProps) {
  return (
    <ScrollArea>
      <StatusSection detail={detail} />
      <TeamSection detail={detail} />
      <GitOpsSection detail={detail} />
      <ReviewSection detail={detail} />
    </ScrollArea>
  )
}
