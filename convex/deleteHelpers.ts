import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const ORCHESTRATION_CHILD_TABLES = [
  "inboundActions",
  "orchestrationEvents",
  "taskEvents",
  "teamMembers",
  "teams",
  "phases",
  "commits",
  "plans",
] as const;

const DELETE_BATCH_SIZE = 64;

interface DeleteStepResult {
  done: boolean;
  pendingTable?: string;
  deletedRows: number;
}

export async function deleteOrchestrationAssociationsStep(
  ctx: MutationCtx,
  orchestrationId: Id<"orchestrations">,
  featureName: string,
): Promise<DeleteStepResult> {
  for (const table of ORCHESTRATION_CHILD_TABLES) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_orchestration", (q) => q.eq("orchestrationId", orchestrationId))
      .take(DELETE_BATCH_SIZE);

    if (rows.length === 0) {
      continue;
    }

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    return {
      done: false,
      pendingTable: table,
      deletedRows: rows.length,
    };
  }

  const controlPlaneActions = await ctx.db
    .query("controlPlaneActions")
    .withIndex("by_orchestration_created", (q) =>
      q.eq("orchestrationId", orchestrationId),
    )
    .take(DELETE_BATCH_SIZE);

  if (controlPlaneActions.length > 0) {
    for (const action of controlPlaneActions) {
      await ctx.db.delete(action._id);
    }

    return {
      done: false,
      pendingTable: "controlPlaneActions",
      deletedRows: controlPlaneActions.length,
    };
  }

  const supervisorStates = await ctx.db
    .query("supervisorStates")
    .withIndex("by_feature", (q) => q.eq("featureName", featureName))
    .take(DELETE_BATCH_SIZE);

  if (supervisorStates.length > 0) {
    for (const state of supervisorStates) {
      await ctx.db.delete(state._id);
    }

    return {
      done: false,
      pendingTable: "supervisorStates",
      deletedRows: supervisorStates.length,
    };
  }

  return {
    done: true,
    deletedRows: 0,
  };
}
