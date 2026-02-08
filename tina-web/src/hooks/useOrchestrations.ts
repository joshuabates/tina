import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Orchestration } from "../types";

export function useOrchestrations() {
  const orchestrations = (useQuery(api.orchestrations.listOrchestrations) ?? []) as Orchestration[];
  return { orchestrations };
}
