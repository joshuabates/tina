import { cn } from "@/lib/utils";
import { PhaseCard, type PhaseCardProps } from "./phase-card";

interface PhaseTimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  phases: Omit<PhaseCardProps, "className">[];
}

function PhaseTimeline({ phases, className, ...props }: PhaseTimelineProps) {
  return (
    <div className={cn("flex flex-col gap-5 relative py-4 px-3", className)} {...props}>
      {/* Vertical connecting line */}
      <div className="absolute left-[1.4rem] top-0 bottom-0 w-px bg-border/90" />
      {phases.map((phase) => (
        <PhaseCard key={phase.phaseNumber} {...phase} />
      ))}
    </div>
  );
}

export { PhaseTimeline };
export type { PhaseTimelineProps };
