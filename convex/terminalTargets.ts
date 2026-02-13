import { query } from "./_generated/server";

interface TerminalTarget {
  id: string;
  label: string;
  tmuxSessionName: string;
  tmuxPaneId: string;
  type: "agent" | "adhoc";
  cli: string;
  context?: { type: string; id: string; summary: string };
}

export const listTerminalTargets = query({
  args: {},
  handler: async (ctx): Promise<TerminalTarget[]> => {
    const targets: TerminalTarget[] = [];

    // 1. Fetch all team members with a non-empty tmuxPaneId
    const allMembers = await ctx.db.query("teamMembers").collect();
    for (const member of allMembers) {
      if (!member.tmuxPaneId) continue;

      // Find the team for this member's orchestration + phase
      const team = await ctx.db
        .query("teams")
        .withIndex("by_orchestration", (q) =>
          q.eq("orchestrationId", member.orchestrationId),
        )
        .first();

      if (!team) continue;

      // Check orchestration is still active
      const orchestration = await ctx.db.get(member.orchestrationId);
      if (!orchestration || orchestration.status === "complete") continue;

      targets.push({
        id: `agent:${member._id}`,
        label: member.agentName,
        tmuxSessionName: team.tmuxSessionName ?? team.teamName,
        tmuxPaneId: member.tmuxPaneId,
        type: "agent",
        cli: "claude",
      });
    }

    // 2. Fetch all active ad-hoc terminal sessions
    const activeSessions = await ctx.db
      .query("terminalSessions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    for (const session of activeSessions) {
      const target: TerminalTarget = {
        id: `adhoc:${session._id}`,
        label: session.label,
        tmuxSessionName: session.sessionName,
        tmuxPaneId: session.tmuxPaneId,
        type: "adhoc",
        cli: session.cli,
      };

      if (session.contextType && session.contextId && session.contextSummary) {
        target.context = {
          type: session.contextType,
          id: session.contextId,
          summary: session.contextSummary,
        };
      }

      targets.push(target);
    }

    return targets;
  },
});
