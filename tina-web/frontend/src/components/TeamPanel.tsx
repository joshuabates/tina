import type { TeamMember } from "../types";

function shortenModel(model: string): string {
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model;
}

interface Props {
  members: TeamMember[];
}

export default function TeamPanel({ members }: Props) {
  // Group members by phase_number
  const grouped = new Map<string, TeamMember[]>();
  for (const member of members) {
    const existing = grouped.get(member.phase_number) ?? [];
    existing.push(member);
    grouped.set(member.phase_number, existing);
  }
  const phases = [...grouped.keys()].sort();

  return (
    <div data-testid="team-panel">
      <h3 className="text-sm font-semibold text-gray-400 mb-2">Team</h3>
      {members.length === 0 ? (
        <p className="text-gray-600 text-sm">No members</p>
      ) : (
        <div className="space-y-3">
          {phases.map((phase) => (
            <div key={phase}>
              {phases.length > 1 && (
                <p className="text-xs text-gray-500 mb-1">Phase {phase}</p>
              )}
              <ul className="space-y-1">
                {grouped.get(phase)!.map((member) => (
                  <li key={`${member.phase_number}-${member.agent_name}`} data-testid={`member-${member.agent_name}`} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{member.agent_name}</span>
                    {member.agent_type && (
                      <span className="text-gray-500">{member.agent_type}</span>
                    )}
                    {member.model && (
                      <span className="text-gray-600">{shortenModel(member.model)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
