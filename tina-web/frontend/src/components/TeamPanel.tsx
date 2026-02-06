import type { Agent } from "../types";

function shortenModel(model: string): string {
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model;
}

interface Props {
  members: Agent[];
}

export default function TeamPanel({ members }: Props) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 mb-2">Team</h3>
      {members.length === 0 ? (
        <p className="text-gray-600 text-sm">No members</p>
      ) : (
        <ul className="space-y-1">
          {members.map((member) => (
            <li key={member.agentId} className="flex items-center gap-2 text-sm">
              <span className={member.tmuxPaneId ? "text-green-400" : "text-gray-600"}>
                {member.tmuxPaneId ? "\u25cf" : "\u25cb"}
              </span>
              <span className="font-medium">{member.name}</span>
              {member.agentType && (
                <span className="text-gray-500">{member.agentType}</span>
              )}
              <span className="text-gray-600">{shortenModel(member.model)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
