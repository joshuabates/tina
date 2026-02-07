import { useState } from "react";
import type { OrchestrationEvent } from "../types";

function eventDotClass(eventType: string): string {
  switch (eventType) {
    case "phase_completed":
      return "bg-green-500";
    case "error":
      return "bg-red-500";
    case "retry":
      return "bg-yellow-500";
    case "phase_started":
      return "bg-cyan-500";
    default:
      return "bg-gray-500";
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

interface DetailProps {
  detail: string;
}

function DetailSection({ detail }: DetailProps) {
  const [expanded, setExpanded] = useState(false);

  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    formatted = detail;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gray-500 hover:text-gray-300 mt-1"
      >
        {expanded ? "Hide detail" : "Show detail"}
      </button>
      {expanded && (
        <pre className="text-xs bg-gray-800 rounded p-2 mt-1 text-gray-400 overflow-x-auto">
          {formatted}
        </pre>
      )}
    </div>
  );
}

interface Props {
  events: OrchestrationEvent[];
}

export default function EventTimeline({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500">No events recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="flex gap-3 items-start">
          <div className="mt-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${eventDotClass(event.event_type)}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-300">{event.summary}</span>
              <span className="text-xs text-gray-600">{formatTime(event.recorded_at)}</span>
            </div>
            <div className="text-xs text-gray-500">
              {event.source}
              {event.phase_number && <span className="ml-2">phase {event.phase_number}</span>}
            </div>
            {event.detail && <DetailSection detail={event.detail} />}
          </div>
        </div>
      ))}
    </div>
  );
}
