import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Orchestration } from "../types";

export function useProjectOrchestrations(projectId: Id<"projects">) {
  const data = useQuery(api.orchestrations.listByProject, { projectId });
  const orchestrations = (data ?? []) as Orchestration[];
  const loading = data === undefined;
  return { orchestrations, loading };
}
