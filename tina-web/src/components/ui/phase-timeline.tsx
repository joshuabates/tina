import { cn } from "@/lib/utils";
import { PhaseCard, type PhaseCardProps } from "./phase-card";

interface PhaseTimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  phases: Omit<PhaseCardProps, "className">[];
}

function PhaseTimeline({ phases, className, ...props }: PhaseTimelineProps) {
  return (
    <div className={cn("flex flex-col gap-8 relative py-6 px-4", className)} {...props}>
      {/* Vertical connecting line */}
      <div className="absolute left-[1.75rem] top-0 bottom-0 w-px bg-border" />
      {phases.map((phase) => (
        <PhaseCard key={phase.phaseNumber} {...phase} />
      ))}
    </div>
  );
}

export { PhaseTimeline };
export type { PhaseTimelineProps };
