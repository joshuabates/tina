import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OrchestrationDetail } from "../types";

export function useOrchestrationDetail(id: string) {
  const detail = useQuery(api.orchestrations.getOrchestrationDetail, {
    orchestrationId: id as Id<"orchestrations">,
  }) as OrchestrationDetail | null | undefined;

  return { detail: detail ?? null, loading: detail === undefined };
}
